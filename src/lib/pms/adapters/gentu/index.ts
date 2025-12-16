import type {
  PMSAdapter,
  PMSConnection,
  AuthResult,
  FetchOptions,
  UnifiedAppointment,
  PMSPractitioner,
  PMSAppointmentType,
  HealthCheckResult,
} from '../../types';
import type {
  GentuAppointment,
  GentuPatient,
  GentuPractitioner,
  GentuAppointmentType as GentuAppointmentTypeResponse,
  GentuTenant,
} from './types';
import {
  mockTenant,
  mockPractitioners,
  mockAppointmentTypes,
  mockPatients,
  generateMockAppointments,
} from './mock-data';

export class GentuAdapter implements PMSAdapter {
  readonly pmsType = 'gentu' as const;

  private readonly baseUrl = 'https://api.pm.magentus.com/v1';
  private readonly tokenUrl = 'https://api.pm.magentus.com/v1/oauth2/token';

  // For now, use mock data. Will be replaced with real API calls.
  private useMockData = true;

  /**
   * Enable/disable mock data mode
   */
  setMockMode(useMock: boolean): void {
    this.useMockData = useMock;
  }

  async authenticate(connection: PMSConnection): Promise<AuthResult> {
    if (this.useMockData) {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 200));

      return {
        success: true,
        accessToken: 'mock-token-12345',
        expiresAt: new Date(Date.now() + 3599 * 1000),
      };
    }

    // Real implementation:
    // POST to tokenUrl with Basic auth header
    // Body: grant_type=client_credentials
    throw new Error('Real authentication not implemented yet');
  }

  async refreshToken(connection: PMSConnection): Promise<AuthResult> {
    // Gentu uses client credentials, so just re-authenticate
    return this.authenticate(connection);
  }

  async validateConnection(connection: PMSConnection): Promise<boolean> {
    try {
      const result = await this.healthCheck(connection);
      return result.healthy;
    } catch {
      return false;
    }
  }

  /**
   * Consume a pairing code to get tenant ID
   */
  async consumePairingCode(
    appId: string,
    pairingCode: string
  ): Promise<{ tenantId: string }> {
    if (this.useMockData) {
      // Simulate pairing delay
      await new Promise(resolve => setTimeout(resolve, 500));
      return { tenantId: mockTenant.tenantId };
    }

    // Real implementation:
    // PUT /v1/apps/{appId}/pairing/{pairingCode}
    throw new Error('Real pairing not implemented yet');
  }

  /**
   * Fetch tenant details
   */
  async fetchTenantDetails(tenantId: string): Promise<GentuTenant> {
    if (this.useMockData) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return mockTenant;
    }

    // Real implementation:
    // GET /v1/tenants/{tenantId}
    throw new Error('Real tenant fetch not implemented yet');
  }

  async *fetchAppointments(
    connection: PMSConnection,
    options: FetchOptions
  ): AsyncGenerator<UnifiedAppointment[], void, unknown> {
    if (this.useMockData) {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 300));

      // Get telehealth type IDs (in real impl, would come from database)
      const telehealthTypeIds = new Set(['type-001', 'type-002']);

      const appointments = generateMockAppointments(options.dateFrom);
      const patients = mockPatients;
      const practitioners = mockPractitioners;

      const unified = appointments
        .filter(appt => {
          // Filter by practitioner if specified
          if (options.practitionerIds?.length) {
            const providerParticipant = appt.participant.find(p => p.referenceType === 'provider');
            if (!providerParticipant || !options.practitionerIds.includes(providerParticipant.referenceId)) {
              return false;
            }
          }
          return true;
        })
        .map(appt => this.mapToUnified(appt, patients, practitioners, telehealthTypeIds, connection));

      yield unified;
      return;
    }

    // Real implementation would:
    // 1. For each practitioner, fetch appointments with pagination
    // 2. Use cursor for pagination
    // 3. Yield batches as they come in
    throw new Error('Real appointment fetch not implemented yet');
  }

  async fetchPractitioners(connection: PMSConnection): Promise<PMSPractitioner[]> {
    if (this.useMockData) {
      await new Promise(resolve => setTimeout(resolve, 150));

      return mockPractitioners.map(p => ({
        id: p.id,
        name: {
          family: p.name.family || '',
          given: p.name.given || undefined,
          prefix: p.name.prefix || undefined,
        },
        fullName: [p.name.prefix, p.name.given, p.name.family].filter(Boolean).join(' '),
        active: p.active,
        shownInAppointmentBook: p.shownInAppointmentBook,
        contact: p.contact
          .filter(c => c.value)
          .map(c => ({
            system: c.system as 'email' | 'phone' | 'fax',
            value: c.value!,
          })),
      }));
    }

    // Real implementation:
    // GET /v1/tenants/{tenantId}/practitioners
    throw new Error('Real practitioner fetch not implemented yet');
  }

  async fetchAppointmentTypes(connection: PMSConnection): Promise<PMSAppointmentType[]> {
    if (this.useMockData) {
      await new Promise(resolve => setTimeout(resolve, 100));

      return mockAppointmentTypes.map(t => ({
        id: t.id,
        name: t.text,
        durationMinutes: t.duration || undefined,
        colour: t.colour || undefined,
        // Auto-detect telehealth based on name patterns
        isTelehealthAutoDetected: this.isTelehealthAppointmentType(t.text),
      }));
    }

    // Real implementation:
    // GET /v1/tenants/{tenantId}/appointment-types
    throw new Error('Real appointment types fetch not implemented yet');
  }

  async healthCheck(connection: PMSConnection): Promise<HealthCheckResult> {
    if (this.useMockData) {
      const start = Date.now();
      await new Promise(resolve => setTimeout(resolve, 50));

      return {
        healthy: true,
        message: 'Mock connection healthy',
        latencyMs: Date.now() - start,
      };
    }

    // Real implementation:
    // GET /v1/tenants/{tenantId}/status or simple endpoint
    throw new Error('Real health check not implemented yet');
  }

  /**
   * Check if appointment type name suggests telehealth
   */
  private isTelehealthAppointmentType(name: string): boolean {
    const telehealthKeywords = [
      'telehealth',
      'video',
      'phone',
      'remote',
      'virtual',
      'online',
      'telemedicine',
    ];

    const lowerName = name.toLowerCase();
    return telehealthKeywords.some(keyword => lowerName.includes(keyword));
  }

  /**
   * Map Gentu appointment to unified format
   */
  private mapToUnified(
    appointment: GentuAppointment,
    patients: GentuPatient[],
    practitioners: GentuPractitioner[],
    telehealthTypeIds: Set<string>,
    connection: PMSConnection
  ): UnifiedAppointment {
    // Find patient and provider from participants
    const patientParticipant = appointment.participant.find(p => p.referenceType === 'patient');
    const providerParticipant = appointment.participant.find(p => p.referenceType === 'provider');

    const patient = patients.find(p => p.id === patientParticipant?.referenceId);
    const practitioner = practitioners.find(p => p.id === providerParticipant?.referenceId);

    // Extract phone from patient contacts
    const phone = patient?.contact.find(c => c.system === 'phone')?.value || undefined;
    const email = patient?.contact.find(c => c.system === 'email')?.value || undefined;

    // Check if telehealth based on appointment type
    const isTelehealth = appointment.appointmentType.reference
      ? telehealthTypeIds.has(appointment.appointmentType.reference)
      : false;

    // Find appointment type name
    const appointmentType = mockAppointmentTypes.find(
      t => t.id === appointment.appointmentType.reference
    );

    return {
      pmsType: 'gentu',
      pmsAppointmentId: appointment.id,
      pmsConnectionId: connection.id,

      startTime: new Date(appointment.startAt),
      endTime: appointment.endAt ? new Date(appointment.endAt) : null,
      durationMinutes: appointment.minutesDuration,
      timezone: mockTenant.timezone || 'Australia/Melbourne',

      isTelehealth,
      appointmentTypeName: appointmentType?.text || 'Unknown',
      appointmentTypeId: appointment.appointmentType.reference || undefined,
      status: this.mapStatus(appointment.status),

      patient: {
        pmsPatientId: patient?.id || patientParticipant?.referenceId || 'unknown',
        fullName: patient
          ? [patient.name.given, patient.name.family].filter(Boolean).join(' ')
          : 'Unknown Patient',
        firstName: patient?.name.given || undefined,
        lastName: patient?.name.family || undefined,
        phone,
        email,
        dateOfBirth: patient?.birthDate ? new Date(patient.birthDate) : undefined,
      },

      practitioner: {
        pmsPractitionerId: practitioner?.id || providerParticipant?.referenceId || 'unknown',
        fullName: practitioner
          ? [practitioner.name.prefix, practitioner.name.given, practitioner.name.family].filter(Boolean).join(' ')
          : 'Unknown Practitioner',
        firstName: practitioner?.name.given || undefined,
        lastName: practitioner?.name.family || undefined,
      },

      notes: appointment.comment || appointment.description || undefined,
      fetchedAt: new Date(),
      rawData: appointment as unknown as Record<string, unknown>,
    };
  }

  /**
   * Map Gentu status to unified status
   */
  private mapStatus(status: string | null): UnifiedAppointment['status'] {
    if (!status) return null;

    const statusMap: Record<string, UnifiedAppointment['status']> = {
      'booked': 'booked',
      'confirmed': 'confirmed',
      'arrived': 'arrived',
      'in_progress': 'in_progress',
      'completed': 'completed',
      'cancelled': 'cancelled',
      'no_show': 'no_show',
      // Gentu-specific status mappings
      'pending': 'booked',
      'checked_in': 'arrived',
      'in_room': 'in_progress',
      'done': 'completed',
      'dna': 'no_show',
    };

    return statusMap[status.toLowerCase()] || 'booked';
  }
}

// Export types for convenience
export type { GentuTenant } from './types';
