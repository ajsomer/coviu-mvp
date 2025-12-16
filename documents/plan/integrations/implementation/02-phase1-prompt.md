# Phase 1 Implementation Prompt

Use this prompt to implement Phase 1 of the PMS integration.

---

## Prompt

```
I need you to implement Phase 1 of the PMS (Practice Management System) integration for the Coviu run sheet application. This phase builds the foundation: database schema, TypeScript types, core services, and a stubbed Gentu adapter.

## Context

We're building an abstraction layer that syncs appointment data from external PMS systems (starting with Gentu/Magentus) into our run sheet. The run sheet displays today's telehealth appointments grouped by clinician.

Key files to reference:
- `src/db/schema.ts` - Existing database schema (uses Drizzle ORM)
- `src/components/run-sheet/` - Existing run sheet components
- `documents/plan/integrations/pms-abstraction-layer-plan.md` - Full architecture plan
- `documents/plan/integrations/gentu-magentus-api.md` - Gentu API documentation
- `documents/plan/integrations/implementation/01-implementation-plan.md` - Implementation plan

## Task 1: Database Schema

Create Drizzle schema definitions and migrations for the following tables:

### 1.1 `pms_connections` table

Stores PMS connection configuration for each practice.

```typescript
{
  id: uuid, primary key
  pmsType: varchar(50), not null  // 'gentu' | 'medirecords' | 'halaxy'
  displayName: varchar(255), not null  // Practice name for display

  // PMS-specific identifiers (only one will be populated based on pmsType)
  tenantId: varchar(255)  // Gentu: tenantId from pairing
  practiceId: varchar(255)  // Medirecords: practice GUID
  organizationId: varchar(255)  // Halaxy: organization reference

  // OAuth credentials
  accessToken: text
  refreshToken: text
  tokenExpiresAt: timestamp with time zone

  // Sync configuration
  syncEnabled: boolean, default true
  syncFrequencyMinutes: integer, default 15
  lastSyncAt: timestamp with time zone
  lastSyncStatus: varchar(50)  // 'success' | 'partial' | 'failed'
  lastSyncError: text

  // Filtering
  syncTelehealthOnly: boolean, default true

  createdAt: timestamp with time zone, default now()
  updatedAt: timestamp with time zone, default now()
}
```

### 1.2 `pms_clinician_mappings` table

Maps PMS practitioners to run sheet clinicians (columns).

```typescript
{
  id: uuid, primary key
  pmsConnectionId: uuid, foreign key to pms_connections, on delete cascade

  // External PMS identifiers
  pmsPractitionerId: varchar(255), not null
  pmsPractitionerName: varchar(255)

  // Internal mapping
  runSheetClinicianId: uuid, foreign key to run_sheet_clinicians

  // Config
  syncEnabled: boolean, default true
  autoCreated: boolean, default false

  createdAt: timestamp with time zone, default now()
  updatedAt: timestamp with time zone, default now()

  // Unique constraint on (pmsConnectionId, pmsPractitionerId)
}
```

### 1.3 `pms_appointment_types` table

Caches appointment types from PMS and stores telehealth configuration.

```typescript
{
  id: uuid, primary key
  pmsConnectionId: uuid, foreign key to pms_connections, on delete cascade

  // External PMS identifiers
  pmsTypeId: varchar(255), not null
  pmsTypeName: varchar(255), not null

  // Cached metadata
  defaultDurationMinutes: integer
  colour: varchar(20)

  // User configuration
  isTelehealth: boolean, default false  // User marks which types are telehealth
  syncEnabled: boolean, default true

  createdAt: timestamp with time zone, default now()
  updatedAt: timestamp with time zone, default now()

  // Unique constraint on (pmsConnectionId, pmsTypeId)
}
```

### 1.4 `pms_sync_log` table

Audit trail of sync operations.

```typescript
{
  id: uuid, primary key
  pmsConnectionId: uuid, foreign key to pms_connections, on delete cascade

  syncType: varchar(50), not null  // 'full' | 'incremental' | 'manual'
  startedAt: timestamp with time zone, not null
  completedAt: timestamp with time zone

  status: varchar(50), not null  // 'running' | 'success' | 'partial' | 'failed'
  appointmentsFetched: integer, default 0
  appointmentsCreated: integer, default 0
  appointmentsUpdated: integer, default 0
  appointmentsSkipped: integer, default 0

  errorMessage: text
  errorDetails: jsonb

  createdAt: timestamp with time zone, default now()
}
```

### 1.5 Extend `run_sheet_appointments` table

Add these columns to the existing table:

```typescript
{
  pmsConnectionId: uuid, foreign key to pms_connections
  pmsAppointmentId: varchar(255)
  pmsLastSyncedAt: timestamp with time zone
  isTelehealth: boolean, default false
  appointmentStatus: varchar(50)  // 'booked' | 'confirmed' | 'cancelled' etc.
  appointmentDurationMinutes: integer
  patientDob: date
  patientEmail: varchar(255)
}

// Add unique index on (pmsConnectionId, pmsAppointmentId) where pmsAppointmentId is not null
```

### Instructions:
1. Add all table definitions to `src/db/schema.ts`
2. Create appropriate enums for status fields
3. Run `npm run db:generate` to create the migration
4. Run `npm run db:push` to apply to database


## Task 2: TypeScript Types

Create the shared types for the PMS abstraction layer.

### 2.1 Create `src/lib/pms/types.ts`

```typescript
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
```

### 2.2 Create `src/lib/pms/adapters/gentu/types.ts`

```typescript
// Gentu-specific types based on their API

export interface GentuTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  issued_at: string;
  application_name: string;
  api_product_list: string;
  developer_email: string;
  status: 'approved';
}

export interface GentuPairingResponse {
  message: string;
  tenantId: string;
}

export interface GentuTenant {
  tenantId: string;
  tenantNumber: string | null;
  tenantName: string | null;
  timezone: string | null;
}

export interface GentuAppointment {
  id: string;
  startAt: string;  // ISO 8601 with offset
  endAt: string | null;
  status: string | null;
  minutesDuration: number | null;
  comment: string | null;
  description: string | null;
  participant: GentuParticipant[];
  appointmentType: {
    reference: string | null;
  };
  extension: GentuExtension[];
}

export interface GentuParticipant {
  referenceType: 'patient' | 'provider' | 'location' | 'health_care_service';
  referenceId: string;
  arrivedAt?: string;
}

export interface GentuExtension {
  system: string;
  valueDateTime?: string;
  valueBoolean?: boolean;
}

export interface GentuPatient {
  id: string;
  name: {
    family: string;
    given: string | null;
    prefix: string | null;
  };
  birthDate: string | null;
  gender: 'female' | 'male' | 'unspecified' | null;
  address: GentuAddress[] | null;
  contact: GentuContact[];
  identifier: GentuIdentifier[];
  deceased: { date?: string } | null;
  occupation: string | null;
  indigenousStatus: 'aboriginal' | 'torres_strait_islander' | 'both' | 'neither' | 'declined' | null;
  extension: unknown[];
}

export interface GentuAddress {
  city: string | null;
  line: string[];
  postalCode: string | null;
  state: 'ACT' | 'NSW' | 'NT' | 'QLD' | 'SA' | 'TAS' | 'VIC' | 'WA' | null;
  use: 'home' | 'work';
  type: 'postal' | 'physical' | 'both';
}

export interface GentuContact {
  system: 'email' | 'fax' | 'phone';
  use: string;
  rank: number | null;
  value: string | null;
}

export interface GentuIdentifier {
  type: string;
  system: string;
  value?: string | null;
}

export interface GentuPractitioner {
  id: string;
  name: {
    family: string | null;
    given: string | null;
    prefix: string | null;
  };
  contact: GentuContact[];
  active: boolean;
  shownInAppointmentBook: boolean;
}

export interface GentuAppointmentType {
  id: string;
  text: string;
  duration: number | null;
  colour: string | null;
  onlineBookable: boolean;
}

export interface GentuAppointmentsResponse {
  appointments: GentuAppointment[];
  pagination: {
    next: string | null;
    limit: number;
  };
  patients?: GentuPatient[];
  practitioners?: GentuPractitioner[];
  referrals?: unknown[];
}
```


## Task 3: Core Services

### 3.1 Create `src/lib/pms/core/retry-handler.ts`

Implement exponential backoff retry logic:

```typescript
export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatusCodes: number[];
  onRetry?: (attempt: number, error: Error) => void;
}

export const defaultRetryOptions: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  // Implement retry logic with exponential backoff
  // Calculate delay: min(baseDelayMs * 2^attempt, maxDelayMs)
  // Add jitter to prevent thundering herd
}
```

### 3.2 Create `src/lib/pms/core/rate-limiter.ts`

Implement per-PMS rate limiting:

```typescript
interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
}

const rateLimits: Record<PMSType, RateLimitConfig> = {
  gentu: { requestsPerMinute: 60, requestsPerHour: 1000 },
  medirecords: { requestsPerMinute: 60, requestsPerHour: 1000 },
  halaxy: { requestsPerMinute: 60, requestsPerHour: 1000 },
};

export class RateLimiter {
  async acquire(pmsType: PMSType): Promise<void>;
  release(pmsType: PMSType): void;
  async handleRateLimitResponse(pmsType: PMSType, retryAfter?: number): Promise<void>;
}
```

### 3.3 Create `src/lib/pms/core/token-manager.ts`

Manage OAuth tokens:

```typescript
export class TokenManager {
  // Store tokens in database
  async storeTokens(
    connectionId: string,
    tokens: { accessToken: string; refreshToken?: string; expiresAt: Date }
  ): Promise<void>;

  // Get valid token, refreshing if needed
  async getValidToken(connectionId: string): Promise<string>;

  // Check if token is expired (with 5 min buffer)
  isTokenExpired(connection: PMSConnection): boolean;

  // Proactive refresh before expiry
  async refreshIfNeeded(connection: PMSConnection, adapter: PMSAdapter): Promise<void>;
}
```

### 3.4 Create `src/lib/pms/core/http-client.ts`

HTTP client wrapper with retry and rate limiting:

```typescript
export class PMSHttpClient {
  constructor(
    private pmsType: PMSType,
    private rateLimiter: RateLimiter
  ) {}

  async request<T>(
    url: string,
    options: RequestInit & { token?: string }
  ): Promise<T>;
}
```

### 3.5 Create `src/lib/pms/core/data-mapper.ts`

Map unified appointments to run sheet:

```typescript
export class DataMapper {
  // Map UnifiedAppointment to run_sheet_appointments row
  mapToRunSheetAppointment(
    appointment: UnifiedAppointment,
    runSheetId: string,
    clinicianMapping: { runSheetClinicianId: string } | null
  ): Partial<RunSheetAppointment>;

  // Combine first/last name
  formatPatientName(firstName?: string, lastName?: string): string;

  // Extract phone from contacts
  extractPhone(contacts: Array<{ system: string; value: string }>): string | null;

  // Format time for run sheet (HH:MM)
  formatAppointmentTime(date: Date): string;
}
```

### 3.6 Create `src/lib/pms/core/sync-orchestrator.ts`

Coordinate the sync process:

```typescript
export class SyncOrchestrator {
  constructor(
    private db: Database,
    private tokenManager: TokenManager
  ) {}

  // Main sync function
  async syncTodayRunSheet(connectionId: string): Promise<SyncResult>;

  // Sync for specific date
  async syncAppointmentsForDate(
    connectionId: string,
    date: Date
  ): Promise<SyncResult>;

  // Upsert appointments to run sheet
  private async persistAppointments(
    runSheetId: string,
    appointments: UnifiedAppointment[],
    connection: PMSConnection
  ): Promise<{ created: number; updated: number; skipped: number }>;

  // Get or create run sheet for date
  private async getOrCreateRunSheet(date: Date): Promise<string>;

  // Log sync operation
  private async logSync(
    connectionId: string,
    syncType: SyncType,
    result: SyncResult
  ): Promise<void>;
}
```


## Task 4: Gentu Adapter (Stubbed)

### 4.1 Create `src/lib/pms/adapters/gentu/mock-data.ts`

```typescript
import { GentuPractitioner, GentuAppointmentType, GentuAppointment, GentuPatient, GentuTenant } from './types';

export const mockTenant: GentuTenant = {
  tenantId: '3aef91c0-ff22-47e6-942d-182cb65cbf20',
  tenantNumber: '12345',
  tenantName: 'Smith Medical Centre',
  timezone: 'Australia/Melbourne',
};

export const mockPractitioners: GentuPractitioner[] = [
  {
    id: 'prac-001',
    name: { family: 'Smith', given: 'John', prefix: 'Dr' },
    contact: [
      { system: 'email', use: 'work', rank: 1, value: 'john.smith@clinic.com' },
      { system: 'phone', use: 'work', rank: 2, value: '0400000001' },
    ],
    active: true,
    shownInAppointmentBook: true,
  },
  {
    id: 'prac-002',
    name: { family: 'Jones', given: 'Sarah', prefix: 'Dr' },
    contact: [
      { system: 'email', use: 'work', rank: 1, value: 'sarah.jones@clinic.com' },
    ],
    active: true,
    shownInAppointmentBook: true,
  },
  {
    id: 'prac-003',
    name: { family: 'Williams', given: 'Michael', prefix: 'Dr' },
    contact: [],
    active: false,
    shownInAppointmentBook: false,
  },
];

export const mockAppointmentTypes: GentuAppointmentType[] = [
  { id: 'type-001', text: 'Telehealth Consultation', duration: 30, colour: '#4CAF50', onlineBookable: true },
  { id: 'type-002', text: 'Video Follow-up', duration: 15, colour: '#2196F3', onlineBookable: true },
  { id: 'type-003', text: 'Standard Consultation', duration: 30, colour: '#9E9E9E', onlineBookable: false },
  { id: 'type-004', text: 'New Patient', duration: 45, colour: '#FF9800', onlineBookable: false },
  { id: 'type-005', text: 'Procedure', duration: 60, colour: '#F44336', onlineBookable: false },
];

export const mockPatients: GentuPatient[] = [
  {
    id: 'patient-001',
    name: { family: 'Brown', given: 'Alice', prefix: 'Ms' },
    birthDate: '1985-03-15',
    gender: 'female',
    address: null,
    contact: [
      { system: 'phone', use: 'mobile', rank: 1, value: '0412345678' },
      { system: 'email', use: 'home', rank: 2, value: 'alice.brown@email.com' },
    ],
    identifier: [],
    deceased: null,
    occupation: null,
    indigenousStatus: null,
    extension: [],
  },
  {
    id: 'patient-002',
    name: { family: 'Davis', given: 'Robert', prefix: 'Mr' },
    birthDate: '1972-08-22',
    gender: 'male',
    address: null,
    contact: [
      { system: 'phone', use: 'mobile', rank: 1, value: '0423456789' },
    ],
    identifier: [],
    deceased: null,
    occupation: null,
    indigenousStatus: null,
    extension: [],
  },
];

// Generate mock appointments for today
export function generateMockAppointments(date: Date): GentuAppointment[] {
  const dateStr = date.toISOString().split('T')[0];

  return [
    {
      id: 'appt-001',
      startAt: `${dateStr}T09:00:00.000+10:00`,
      endAt: `${dateStr}T09:30:00.000+10:00`,
      status: 'booked',
      minutesDuration: 30,
      comment: null,
      description: 'Telehealth follow-up',
      participant: [
        { referenceType: 'patient', referenceId: 'patient-001' },
        { referenceType: 'provider', referenceId: 'prac-001' },
      ],
      appointmentType: { reference: 'type-001' },
      extension: [],
    },
    {
      id: 'appt-002',
      startAt: `${dateStr}T09:30:00.000+10:00`,
      endAt: `${dateStr}T09:45:00.000+10:00`,
      status: 'confirmed',
      minutesDuration: 15,
      comment: null,
      description: 'Quick video check-in',
      participant: [
        { referenceType: 'patient', referenceId: 'patient-002' },
        { referenceType: 'provider', referenceId: 'prac-001' },
      ],
      appointmentType: { reference: 'type-002' },
      extension: [],
    },
    {
      id: 'appt-003',
      startAt: `${dateStr}T10:00:00.000+10:00`,
      endAt: `${dateStr}T10:30:00.000+10:00`,
      status: 'booked',
      minutesDuration: 30,
      comment: null,
      description: 'In-person consultation',
      participant: [
        { referenceType: 'patient', referenceId: 'patient-001' },
        { referenceType: 'provider', referenceId: 'prac-002' },
      ],
      appointmentType: { reference: 'type-003' },  // Not telehealth
      extension: [],
    },
    {
      id: 'appt-004',
      startAt: `${dateStr}T11:00:00.000+10:00`,
      endAt: `${dateStr}T11:30:00.000+10:00`,
      status: 'booked',
      minutesDuration: 30,
      comment: null,
      description: 'Telehealth consultation',
      participant: [
        { referenceType: 'patient', referenceId: 'patient-002' },
        { referenceType: 'provider', referenceId: 'prac-002' },
      ],
      appointmentType: { reference: 'type-001' },
      extension: [],
    },
  ];
}
```

### 4.2 Create `src/lib/pms/adapters/gentu/index.ts`

```typescript
import {
  PMSAdapter,
  PMSConnection,
  AuthResult,
  FetchOptions,
  UnifiedAppointment,
  PMSPractitioner,
  PMSAppointmentType,
  HealthCheckResult,
} from '../../types';
import {
  GentuAppointment,
  GentuPatient,
  GentuPractitioner,
  GentuAppointmentType,
  GentuTenant,
  GentuAppointmentsResponse,
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

  async authenticate(connection: PMSConnection): Promise<AuthResult> {
    if (this.useMockData) {
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

  async fetchTenantDetails(tenantId: string): Promise<GentuTenant> {
    if (this.useMockData) {
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
      // Get telehealth type IDs from database (for now, hardcode mock)
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
      return mockAppointmentTypes.map(t => ({
        id: t.id,
        name: t.text,
        durationMinutes: t.duration || undefined,
        colour: t.colour || undefined,
      }));
    }

    // Real implementation:
    // GET /v1/tenants/{tenantId}/appointment-types
    throw new Error('Real appointment types fetch not implemented yet');
  }

  async healthCheck(connection: PMSConnection): Promise<HealthCheckResult> {
    if (this.useMockData) {
      return {
        healthy: true,
        message: 'Mock connection healthy',
        latencyMs: 50,
      };
    }

    // Real implementation:
    // GET /v1/tenants/{tenantId}/status
    throw new Error('Real health check not implemented yet');
  }

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
      timezone: 'Australia/Melbourne', // Would come from tenant details

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
    };

    return statusMap[status.toLowerCase()] || 'booked';
  }
}
```

### 4.3 Create `src/lib/pms/adapters/index.ts`

```typescript
import { PMSAdapter, PMSType } from '../types';
import { GentuAdapter } from './gentu';

const adapters: Record<PMSType, () => PMSAdapter> = {
  gentu: () => new GentuAdapter(),
  medirecords: () => { throw new Error('Medirecords adapter not implemented yet'); },
  halaxy: () => { throw new Error('Halaxy adapter not implemented yet'); },
};

export function getAdapter(pmsType: PMSType): PMSAdapter {
  const factory = adapters[pmsType];
  if (!factory) {
    throw new Error(`Unknown PMS type: ${pmsType}`);
  }
  return factory();
}

export { GentuAdapter };
```

### 4.4 Create `src/lib/pms/index.ts`

```typescript
// Public exports
export * from './types';
export { getAdapter, GentuAdapter } from './adapters';
export { TokenManager } from './core/token-manager';
export { RateLimiter } from './core/rate-limiter';
export { withRetry, defaultRetryOptions } from './core/retry-handler';
export { SyncOrchestrator } from './core/sync-orchestrator';
export { DataMapper } from './core/data-mapper';
```


## Deliverables Checklist

After completing all tasks, you should have:

- [ ] Database schema updated in `src/db/schema.ts`
- [ ] Migration generated and applied
- [ ] `src/lib/pms/types.ts` - Shared types
- [ ] `src/lib/pms/adapters/gentu/types.ts` - Gentu-specific types
- [ ] `src/lib/pms/adapters/gentu/mock-data.ts` - Mock data
- [ ] `src/lib/pms/adapters/gentu/index.ts` - Stubbed Gentu adapter
- [ ] `src/lib/pms/adapters/index.ts` - Adapter factory
- [ ] `src/lib/pms/core/retry-handler.ts` - Retry logic
- [ ] `src/lib/pms/core/rate-limiter.ts` - Rate limiting
- [ ] `src/lib/pms/core/token-manager.ts` - Token management
- [ ] `src/lib/pms/core/http-client.ts` - HTTP client
- [ ] `src/lib/pms/core/data-mapper.ts` - Data mapping
- [ ] `src/lib/pms/core/sync-orchestrator.ts` - Sync coordination
- [ ] `src/lib/pms/index.ts` - Public exports

## Important Notes

1. Use the existing Drizzle ORM patterns from `src/db/schema.ts`
2. Follow the existing code style in the codebase
3. The mock data allows UI development without API access
4. All core services should be fully functional (not stubbed)
5. The Gentu adapter should work with mock data for testing
```
