import { eq, and } from 'drizzle-orm';
import { db } from '@/db';
import {
  pmsConnections,
  pmsClinicianMappings,
  pmsAppointmentTypes,
  pmsSyncLog,
  runSheets,
  runSheetAppointments,
  runSheetClinicians,
} from '@/db/schema';
import type {
  PMSConnection,
  UnifiedAppointment,
  SyncResult,
  SyncType,
  PMSAdapter,
} from '../types';
import { TokenManager } from './token-manager';
import { DataMapper } from './data-mapper';

/**
 * Orchestrates the sync process between PMS and run sheet
 */
export class SyncOrchestrator {
  private dataMapper: DataMapper;

  constructor(
    private tokenManager: TokenManager
  ) {
    this.dataMapper = new DataMapper();
  }

  /**
   * Main sync function - syncs today's appointments
   */
  async syncTodayRunSheet(
    connectionId: string,
    adapter: PMSAdapter
  ): Promise<SyncResult> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.syncAppointmentsForDate(connectionId, today, adapter);
  }

  /**
   * Sync appointments for a specific date
   */
  async syncAppointmentsForDate(
    connectionId: string,
    date: Date,
    adapter: PMSAdapter
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: Array<{ message: string; details?: unknown }> = [];

    // Initialize result
    const result: SyncResult = {
      success: false,
      syncType: 'incremental',
      appointmentsFetched: 0,
      appointmentsCreated: 0,
      appointmentsUpdated: 0,
      appointmentsSkipped: 0,
      errors: [],
      durationMs: 0,
    };

    // Log sync start
    const syncLogEntry = await this.createSyncLogEntry(connectionId, 'incremental');

    try {
      // Get connection
      const connections = await db
        .select()
        .from(pmsConnections)
        .where(eq(pmsConnections.id, connectionId))
        .limit(1);

      const connection = connections[0];
      if (!connection) {
        throw new Error(`Connection not found: ${connectionId}`);
      }

      // Validate connection
      await this.tokenManager.refreshIfNeeded(connection as PMSConnection, adapter);

      // Get or create run sheet
      const runSheetId = await this.getOrCreateRunSheet(date);

      // Get clinician mappings for this connection
      const clinicianMappingsData = await db
        .select()
        .from(pmsClinicianMappings)
        .where(
          and(
            eq(pmsClinicianMappings.pmsConnectionId, connectionId),
            eq(pmsClinicianMappings.syncEnabled, true)
          )
        );

      const clinicianMap = new Map(
        clinicianMappingsData.map(m => [m.pmsPractitionerId, m])
      );

      // Get telehealth appointment type IDs
      const telehealthTypes = await db
        .select()
        .from(pmsAppointmentTypes)
        .where(
          and(
            eq(pmsAppointmentTypes.pmsConnectionId, connectionId),
            eq(pmsAppointmentTypes.isTelehealth, true)
          )
        );

      const telehealthTypeIds = new Set(telehealthTypes.map(t => t.pmsTypeId));

      // Prepare fetch options
      const dateEnd = new Date(date);
      dateEnd.setHours(23, 59, 59, 999);

      const fetchOptions = {
        dateFrom: date,
        dateTo: dateEnd,
        telehealthOnly: connection.syncTelehealthOnly,
        includePatients: true,
        includePractitioners: true,
      };

      // Fetch appointments from PMS
      const allAppointments: UnifiedAppointment[] = [];
      for await (const batch of adapter.fetchAppointments(
        connection as PMSConnection,
        fetchOptions
      )) {
        // Mark telehealth based on our configured types
        const processedBatch = batch.map(appt => ({
          ...appt,
          isTelehealth: appt.isTelehealth || telehealthTypeIds.has(appt.appointmentTypeId ?? ''),
        }));

        allAppointments.push(...processedBatch);
        result.appointmentsFetched += batch.length;
      }

      // Filter to telehealth only if configured
      const appointmentsToSync = connection.syncTelehealthOnly
        ? allAppointments.filter(a => a.isTelehealth)
        : allAppointments;

      // Persist appointments
      const persistResult = await this.persistAppointments(
        runSheetId,
        appointmentsToSync,
        connection as PMSConnection,
        clinicianMap
      );

      result.appointmentsCreated = persistResult.created;
      result.appointmentsUpdated = persistResult.updated;
      result.appointmentsSkipped = persistResult.skipped;
      result.success = true;

      // Update connection last sync
      await db
        .update(pmsConnections)
        .set({
          lastSyncAt: new Date(),
          lastSyncStatus: 'success',
          lastSyncError: null,
          updatedAt: new Date(),
        })
        .where(eq(pmsConnections.id, connectionId));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push({ message: errorMessage, details: error });

      // Update connection with error
      await db
        .update(pmsConnections)
        .set({
          lastSyncAt: new Date(),
          lastSyncStatus: 'failed',
          lastSyncError: errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(pmsConnections.id, connectionId));
    }

    // Calculate duration
    result.durationMs = Date.now() - startTime;
    result.errors = errors;
    result.success = errors.length === 0;

    // Update sync log
    await this.completeSyncLogEntry(
      syncLogEntry.id,
      result
    );

    return result;
  }

  /**
   * Upsert appointments to run sheet
   */
  private async persistAppointments(
    runSheetId: string,
    appointments: UnifiedAppointment[],
    connection: PMSConnection,
    clinicianMap: Map<string, { runSheetClinicianId: string | null; pmsPractitionerName: string | null }>
  ): Promise<{ created: number; updated: number; skipped: number }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const appointment of appointments) {
      try {
        // Get clinician mapping
        const clinicianMapping = clinicianMap.get(appointment.practitioner.pmsPractitionerId);

        // Auto-create clinician if needed and mapping doesn't exist
        let finalClinicianId: string | null = clinicianMapping?.runSheetClinicianId ?? null;

        if (!clinicianMapping) {
          // Create clinician and mapping
          const newClinician = await this.autoCreateClinician(
            appointment.practitioner.fullName,
            connection.id,
            appointment.practitioner.pmsPractitionerId
          );
          finalClinicianId = newClinician.clinicianId;
        }

        // Check if appointment already exists
        const existing = await db
          .select()
          .from(runSheetAppointments)
          .where(
            and(
              eq(runSheetAppointments.pmsConnectionId, connection.id),
              eq(runSheetAppointments.pmsAppointmentId, appointment.pmsAppointmentId)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          // Update existing
          if (this.dataMapper.appointmentHasChanged(existing[0], appointment)) {
            const mappedData = this.dataMapper.mapToRunSheetAppointment(
              appointment,
              runSheetId,
              finalClinicianId ? { runSheetClinicianId: finalClinicianId } : null
            );

            await db
              .update(runSheetAppointments)
              .set({
                ...mappedData,
                updatedAt: new Date(),
              })
              .where(eq(runSheetAppointments.id, existing[0].id));

            updated++;
          } else {
            // Just update sync timestamp
            await db
              .update(runSheetAppointments)
              .set({
                pmsLastSyncedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(runSheetAppointments.id, existing[0].id));

            skipped++;
          }
        } else {
          // Create new
          const mappedData = this.dataMapper.mapToRunSheetAppointment(
            appointment,
            runSheetId,
            finalClinicianId ? { runSheetClinicianId: finalClinicianId } : null
          );

          await db.insert(runSheetAppointments).values(mappedData);
          created++;
        }
      } catch (error) {
        console.error(`Error persisting appointment ${appointment.pmsAppointmentId}:`, error);
        skipped++;
      }
    }

    return { created, updated, skipped };
  }

  /**
   * Auto-create a clinician from PMS data
   */
  private async autoCreateClinician(
    name: string,
    connectionId: string,
    pmsPractitionerId: string
  ): Promise<{ clinicianId: string }> {
    // Create run sheet clinician
    const [newClinician] = await db
      .insert(runSheetClinicians)
      .values({ name })
      .returning({ id: runSheetClinicians.id });

    // Create mapping
    await db.insert(pmsClinicianMappings).values({
      pmsConnectionId: connectionId,
      pmsPractitionerId,
      pmsPractitionerName: name,
      runSheetClinicianId: newClinician.id,
      syncEnabled: true,
      autoCreated: true,
    });

    return { clinicianId: newClinician.id };
  }

  /**
   * Get or create run sheet for date
   */
  private async getOrCreateRunSheet(date: Date): Promise<string> {
    const dateStr = this.dataMapper.formatDate(date);

    // Check if run sheet exists
    const existing = await db
      .select()
      .from(runSheets)
      .where(eq(runSheets.date, dateStr))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].id;
    }

    // Create new run sheet
    const [newSheet] = await db
      .insert(runSheets)
      .values({
        date: dateStr,
        status: 'draft',
      })
      .returning({ id: runSheets.id });

    return newSheet.id;
  }

  /**
   * Create sync log entry
   */
  private async createSyncLogEntry(
    connectionId: string,
    syncType: SyncType
  ): Promise<{ id: string }> {
    const [entry] = await db
      .insert(pmsSyncLog)
      .values({
        pmsConnectionId: connectionId,
        syncType,
        startedAt: new Date(),
        status: 'running',
      })
      .returning({ id: pmsSyncLog.id });

    return entry;
  }

  /**
   * Complete sync log entry
   */
  private async completeSyncLogEntry(
    logId: string,
    result: SyncResult
  ): Promise<void> {
    await db
      .update(pmsSyncLog)
      .set({
        completedAt: new Date(),
        status: result.success ? 'success' : (result.errors.length > 0 ? 'partial' : 'failed'),
        appointmentsFetched: result.appointmentsFetched,
        appointmentsCreated: result.appointmentsCreated,
        appointmentsUpdated: result.appointmentsUpdated,
        appointmentsSkipped: result.appointmentsSkipped,
        errorMessage: result.errors.length > 0 ? result.errors[0].message : null,
        errorDetails: result.errors.length > 0 ? result.errors : null,
      })
      .where(eq(pmsSyncLog.id, logId));
  }

  /**
   * Get sync history for a connection
   */
  async getSyncHistory(
    connectionId: string,
    limit: number = 10
  ): Promise<Array<{
    id: string;
    syncType: string;
    startedAt: Date;
    completedAt: Date | null;
    status: string;
    appointmentsFetched: number;
    appointmentsCreated: number;
    appointmentsUpdated: number;
    appointmentsSkipped: number;
    errorMessage: string | null;
  }>> {
    const entries = await db
      .select()
      .from(pmsSyncLog)
      .where(eq(pmsSyncLog.pmsConnectionId, connectionId))
      .orderBy(pmsSyncLog.startedAt)
      .limit(limit);

    return entries.map(e => ({
      id: e.id,
      syncType: e.syncType,
      startedAt: e.startedAt,
      completedAt: e.completedAt,
      status: e.status,
      appointmentsFetched: e.appointmentsFetched,
      appointmentsCreated: e.appointmentsCreated,
      appointmentsUpdated: e.appointmentsUpdated,
      appointmentsSkipped: e.appointmentsSkipped,
      errorMessage: e.errorMessage,
    }));
  }
}
