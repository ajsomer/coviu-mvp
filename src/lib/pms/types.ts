// PMS type enum
export type PMSType = 'gentu' | 'medirecords' | 'halaxy';

// Sync status
export type SyncStatus = 'success' | 'partial' | 'failed' | 'running';
export type SyncType = 'full' | 'incremental' | 'manual';

// Appointment status (unified across PMS)
export type AppointmentStatus =
  | 'booked'
  | 'confirmed'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

// Connection from database
export interface PMSConnection {
  id: string;
  pmsType: PMSType;
  displayName: string;
  tenantId?: string;
  practiceId?: string;
  organizationId?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  syncEnabled: boolean;
  syncFrequencyMinutes: number;
  lastSyncAt?: Date;
  lastSyncStatus?: SyncStatus;
  lastSyncError?: string;
  syncTelehealthOnly: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Unified appointment model - output from all adapters
export interface UnifiedAppointment {
  // Source identification
  pmsType: PMSType;
  pmsAppointmentId: string;
  pmsConnectionId: string;

  // Temporal data
  startTime: Date;
  endTime: Date | null;
  durationMinutes: number | null;
  timezone: string;

  // Classification
  isTelehealth: boolean;
  appointmentTypeName: string;
  appointmentTypeId?: string;
  status: AppointmentStatus | null;

  // Patient
  patient: {
    pmsPatientId: string;
    fullName: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    dateOfBirth?: Date;
  };

  // Practitioner
  practitioner: {
    pmsPractitionerId: string;
    fullName: string;
    firstName?: string;
    lastName?: string;
  };

  // Metadata
  notes?: string;
  fetchedAt: Date;
  rawData: Record<string, unknown>;
}

// Practitioner from PMS
export interface PMSPractitioner {
  id: string;
  name: {
    family: string;
    given?: string;
    prefix?: string;
  };
  fullName: string;
  active: boolean;
  shownInAppointmentBook?: boolean;
  contact?: Array<{
    system: 'email' | 'phone' | 'fax';
    value: string;
  }>;
}

// Appointment type from PMS
export interface PMSAppointmentType {
  id: string;
  name: string;
  durationMinutes?: number;
  colour?: string;
  isTelehealthAutoDetected?: boolean;
}

// Fetch options for appointments
export interface FetchOptions {
  dateFrom: Date;
  dateTo: Date;
  practitionerIds?: string[];
  telehealthOnly?: boolean;
  includePatients?: boolean;
  includePractitioners?: boolean;
  includeReferrals?: boolean;
  limit?: number;
}

// Auth result
export interface AuthResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  tenantId?: string;
  error?: string;
}

// Health check result
export interface HealthCheckResult {
  healthy: boolean;
  message: string;
  latencyMs?: number;
}

// Sync result
export interface SyncResult {
  success: boolean;
  syncType: SyncType;
  appointmentsFetched: number;
  appointmentsCreated: number;
  appointmentsUpdated: number;
  appointmentsSkipped: number;
  errors: Array<{ message: string; details?: unknown }>;
  durationMs: number;
}

// Adapter interface - all PMS adapters implement this
export interface PMSAdapter {
  readonly pmsType: PMSType;

  // Authentication
  authenticate(connection: PMSConnection): Promise<AuthResult>;
  refreshToken(connection: PMSConnection): Promise<AuthResult>;
  validateConnection(connection: PMSConnection): Promise<boolean>;

  // Data fetching
  fetchAppointments(
    connection: PMSConnection,
    options: FetchOptions
  ): AsyncGenerator<UnifiedAppointment[], void, unknown>;

  fetchPractitioners(connection: PMSConnection): Promise<PMSPractitioner[]>;

  fetchAppointmentTypes(connection: PMSConnection): Promise<PMSAppointmentType[]>;

  // Optional
  fetchPatient?(connection: PMSConnection, patientId: string): Promise<unknown>;

  // Health check
  healthCheck(connection: PMSConnection): Promise<HealthCheckResult>;
}
