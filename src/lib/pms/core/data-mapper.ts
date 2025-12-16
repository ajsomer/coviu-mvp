import type { UnifiedAppointment } from '../types';
import type { NewRunSheetAppointment } from '@/db/schema';

/**
 * Maps unified appointments to run sheet appointments
 */
export class DataMapper {
  /**
   * Map UnifiedAppointment to run_sheet_appointments row
   */
  mapToRunSheetAppointment(
    appointment: UnifiedAppointment,
    runSheetId: string,
    clinicianMapping: { runSheetClinicianId: string } | null
  ): Omit<NewRunSheetAppointment, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      runSheetId,
      screenshotId: null, // Not from screenshot
      clinicianId: clinicianMapping?.runSheetClinicianId ?? null,
      patientName: this.formatPatientName(
        appointment.patient.firstName,
        appointment.patient.lastName
      ),
      patientPhone: appointment.patient.phone ?? null,
      appointmentTime: this.formatAppointmentTime(appointment.startTime),
      appointmentType: appointment.appointmentTypeName,
      confidence: 1.0, // 100% confidence for PMS data
      isManualEntry: false,

      // PMS fields
      pmsConnectionId: appointment.pmsConnectionId,
      pmsAppointmentId: appointment.pmsAppointmentId,
      pmsLastSyncedAt: appointment.fetchedAt,
      isTelehealth: appointment.isTelehealth,
      appointmentStatus: appointment.status,
      appointmentDurationMinutes: appointment.durationMinutes,
      patientDob: appointment.patient.dateOfBirth
        ? this.formatDate(appointment.patient.dateOfBirth)
        : null,
      patientEmail: appointment.patient.email ?? null,
    };
  }

  /**
   * Combine first/last name into full name
   */
  formatPatientName(firstName?: string, lastName?: string): string {
    const parts = [firstName, lastName].filter(Boolean);
    return parts.join(' ') || 'Unknown Patient';
  }

  /**
   * Extract phone from contacts array
   */
  extractPhone(
    contacts: Array<{ system: string; value: string; use?: string }>
  ): string | null {
    // Prioritize mobile, then work, then home
    const priorities = ['mobile', 'work', 'home'];

    for (const priority of priorities) {
      const contact = contacts.find(
        c => c.system === 'phone' && c.value && c.use === priority
      );
      if (contact) {
        return contact.value;
      }
    }

    // Fallback to any phone
    const anyPhone = contacts.find(c => c.system === 'phone' && c.value);
    return anyPhone?.value ?? null;
  }

  /**
   * Extract email from contacts array
   */
  extractEmail(
    contacts: Array<{ system: string; value: string }>
  ): string | null {
    const email = contacts.find(c => c.system === 'email' && c.value);
    return email?.value ?? null;
  }

  /**
   * Format time for run sheet (HH:MM)
   */
  formatAppointmentTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Format date as YYYY-MM-DD string
   */
  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Parse date string to Date object
   */
  parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  /**
   * Compare two appointments to see if they've changed
   */
  appointmentHasChanged(
    existing: {
      patientName?: string | null;
      patientPhone?: string | null;
      appointmentTime?: string | null;
      appointmentType?: string | null;
      appointmentStatus?: string | null;
      isTelehealth?: boolean | null;
    },
    updated: UnifiedAppointment
  ): boolean {
    const updatedName = this.formatPatientName(
      updated.patient.firstName,
      updated.patient.lastName
    );
    const updatedTime = this.formatAppointmentTime(updated.startTime);

    // Check if any key fields have changed
    if (existing.patientName !== updatedName) return true;
    if (existing.patientPhone !== (updated.patient.phone ?? null)) return true;
    if (existing.appointmentTime !== updatedTime) return true;
    if (existing.appointmentType !== updated.appointmentTypeName) return true;
    if (existing.appointmentStatus !== updated.status) return true;
    if (existing.isTelehealth !== updated.isTelehealth) return true;

    return false;
  }

  /**
   * Get changes between existing and updated appointment
   */
  getAppointmentChanges(
    existing: Record<string, unknown>,
    updated: UnifiedAppointment
  ): Record<string, { old: unknown; new: unknown }> {
    const changes: Record<string, { old: unknown; new: unknown }> = {};

    const updatedName = this.formatPatientName(
      updated.patient.firstName,
      updated.patient.lastName
    );
    const updatedTime = this.formatAppointmentTime(updated.startTime);

    if (existing.patientName !== updatedName) {
      changes.patientName = { old: existing.patientName, new: updatedName };
    }
    if (existing.patientPhone !== (updated.patient.phone ?? null)) {
      changes.patientPhone = { old: existing.patientPhone, new: updated.patient.phone ?? null };
    }
    if (existing.appointmentTime !== updatedTime) {
      changes.appointmentTime = { old: existing.appointmentTime, new: updatedTime };
    }
    if (existing.appointmentType !== updated.appointmentTypeName) {
      changes.appointmentType = { old: existing.appointmentType, new: updated.appointmentTypeName };
    }
    if (existing.appointmentStatus !== updated.status) {
      changes.appointmentStatus = { old: existing.appointmentStatus, new: updated.status };
    }
    if (existing.isTelehealth !== updated.isTelehealth) {
      changes.isTelehealth = { old: existing.isTelehealth, new: updated.isTelehealth };
    }

    return changes;
  }
}
