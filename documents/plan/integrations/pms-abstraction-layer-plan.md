# PMS Abstraction Layer Plan

## Run Sheet Integration with Practice Management Systems

**Version:** 1.0
**Date:** December 2025

---

## Executive Summary

This document outlines the technical plan for building an abstraction layer that populates the Coviu run sheet with appointment data from multiple Practice Management Systems (PMS). The initial scope covers three PMS integrations: Gentu (Magentus), Medirecords, and Halaxy.

The goal is to replace or supplement the current OCR-based screenshot parsing workflow with direct PMS synchronisation, providing higher accuracy, real-time data, and reduced manual effort.

---

## Technical Approach

### Development Stack

| Component | Technology |
|-----------|------------|
| Language | Node.js (TypeScript) |
| Data Storage | PostgreSQL (existing Neon database) |
| HTTP Client | Axios or fetch with retry logic |
| Code Structure | Separate adapters per PMS, shared core for common logic |
| Framework | Next.js API routes (existing infrastructure) |

### Architecture Rationale

The prototype uses a **layered adapter pattern** to isolate PMS-specific complexity from shared integration logic. Each PMS adapter handles authentication, API calls, pagination, and data transformation for its specific platform, outputting a unified appointment model regardless of source.

This approach contains the "weirdness" of each API (Magentus's cursor pagination, Medirecords' duration codes, Halaxy's FHIR references) within dedicated adapters while allowing approximately **60% of the codebase** (token management, retry logic, rate limiting, error handling, and storage) to be shared.

The unified model normalises appointments into a consistent schema with explicit timezone handling and a direct `is_telehealth` flag, meaning any downstream consumer (UI, reports, Coviu waiting area) works identically regardless of which PMS the data originated from.

**Key Design Decision:** Telehealth identification logic lives **inside each adapter**, not in the shared abstraction layer. Each PMS identifies telehealth differently:

| PMS | Telehealth Identification | User Config Required |
|-----|---------------------------|---------------------|
| Gentu | User-customizable appointment types (no built-in flag) | Yes - user selects which types are telehealth |
| Medirecords | Built-in `telehealth` flag + `telehealthLinkForProvider` fields | No - auto-detected |
| Halaxy | Built-in `location-type: "telehealth"` | No - auto-detected |

Each adapter resolves this internally and returns `isTelehealth: boolean` in the unified model.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Run Sheet UI                                │
│         (RunSheetSidebar, AppointmentCard, etc.)                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Run Sheet API Layer                            │
│              /api/run-sheet/* (existing endpoints)                  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
        ┌───────────────────┐       ┌───────────────────┐
        │  OCR Pipeline     │       │  PMS Sync Service │
        │  (existing)       │       │  (new)            │
        └───────────────────┘       └───────────────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     PMS Abstraction Layer                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Core Services                             │   │
│  │  • Token Manager (OAuth refresh, secure storage)            │   │
│  │  • Rate Limiter (per-PMS throttling)                        │   │
│  │  • Retry Handler (exponential backoff)                      │   │
│  │  • Sync Orchestrator (scheduling, conflict resolution)      │   │
│  │  • Data Mapper (unified model transformation)               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                │                                    │
│         ┌──────────────────────┼──────────────────────┐            │
│         ▼                      ▼                      ▼            │
│  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐       │
│  │   Gentu     │       │ Medirecords │       │   Halaxy    │       │
│  │   Adapter   │       │   Adapter   │       │   Adapter   │       │
│  └─────────────┘       └─────────────┘       └─────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
          │                      │                      │
          ▼                      ▼                      ▼
   Magentus API          Medirecords API          Halaxy API
```

---

## Database Schema Extensions

### New Tables

#### `pms_connections` - Practice PMS Configuration

```sql
CREATE TABLE pms_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Connection identification
  pms_type VARCHAR(50) NOT NULL, -- 'gentu' | 'medirecords' | 'halaxy'
  display_name VARCHAR(255) NOT NULL, -- User-friendly name

  -- PMS-specific identifiers
  tenant_id VARCHAR(255), -- Gentu: tenantId from pairing
  practice_id VARCHAR(255), -- Medirecords: practice GUID
  organization_id VARCHAR(255), -- Halaxy: organization reference

  -- OAuth credentials (encrypted)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,

  -- Sync configuration
  sync_enabled BOOLEAN DEFAULT true,
  sync_frequency_minutes INTEGER DEFAULT 15,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_sync_status VARCHAR(50), -- 'success' | 'partial' | 'failed'
  last_sync_error TEXT,

  -- Filtering preferences
  sync_telehealth_only BOOLEAN DEFAULT true,
  -- Note: Practitioner sync config is in pms_clinician_mappings table
  -- Note: Telehealth type config is in pms_appointment_types table

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pms_connections_type ON pms_connections(pms_type);
CREATE INDEX idx_pms_connections_sync ON pms_connections(sync_enabled, last_sync_at);
```

#### `pms_clinician_mappings` - Map PMS Practitioners to Run Sheet Clinicians

This table maps practitioners from the PMS to clinicians (columns) in the run sheet. This mapping is essential because:
- Names may not match exactly ("Dr. John Smith" in PMS vs "Dr Smith" in run sheet)
- Run sheet clinicians may have been created from OCR or manual entry
- Users need control over which PMS practitioners appear on their run sheet

```sql
CREATE TABLE pms_clinician_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Connection reference
  pms_connection_id UUID NOT NULL REFERENCES pms_connections(id) ON DELETE CASCADE,

  -- External PMS identifiers
  pms_practitioner_id VARCHAR(255) NOT NULL,
  pms_practitioner_name VARCHAR(255),

  -- Internal mapping to run sheet clinician (column)
  run_sheet_clinician_id UUID REFERENCES run_sheet_clinicians(id),

  -- Sync preferences for this practitioner
  sync_enabled BOOLEAN DEFAULT true, -- User can disable sync for specific practitioners

  -- Auto-create flag (true if clinician was auto-created during setup)
  auto_created BOOLEAN DEFAULT false,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(pms_connection_id, pms_practitioner_id)
);

CREATE INDEX idx_pms_clinician_mappings_connection ON pms_clinician_mappings(pms_connection_id);
CREATE INDEX idx_pms_clinician_mappings_clinician ON pms_clinician_mappings(run_sheet_clinician_id);
```

#### `pms_appointment_types` - Cache and Configure Appointment Types

This table caches appointment types from the PMS and stores user configuration (e.g., which types are telehealth for Gentu).

```sql
CREATE TABLE pms_appointment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Connection reference
  pms_connection_id UUID NOT NULL REFERENCES pms_connections(id) ON DELETE CASCADE,

  -- External PMS identifiers
  pms_type_id VARCHAR(255) NOT NULL,
  pms_type_name VARCHAR(255) NOT NULL,

  -- Cached metadata from PMS
  default_duration_minutes INTEGER,
  colour VARCHAR(20), -- Hex colour code

  -- User configuration
  is_telehealth BOOLEAN DEFAULT false, -- User marks which types are telehealth (required for Gentu)
  sync_enabled BOOLEAN DEFAULT true,   -- User can exclude certain appointment types

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(pms_connection_id, pms_type_id)
);

CREATE INDEX idx_pms_appointment_types_connection ON pms_appointment_types(pms_connection_id);
CREATE INDEX idx_pms_appointment_types_telehealth ON pms_appointment_types(pms_connection_id, is_telehealth) WHERE is_telehealth = true;
```

#### `pms_sync_log` - Audit Trail for Sync Operations

```sql
CREATE TABLE pms_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  pms_connection_id UUID NOT NULL REFERENCES pms_connections(id) ON DELETE CASCADE,

  -- Sync metadata
  sync_type VARCHAR(50) NOT NULL, -- 'full' | 'incremental' | 'manual'
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Results
  status VARCHAR(50) NOT NULL, -- 'running' | 'success' | 'partial' | 'failed'
  appointments_fetched INTEGER DEFAULT 0,
  appointments_created INTEGER DEFAULT 0,
  appointments_updated INTEGER DEFAULT 0,
  appointments_skipped INTEGER DEFAULT 0,

  -- Error tracking
  error_message TEXT,
  error_details JSONB,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pms_sync_log_connection ON pms_sync_log(pms_connection_id, started_at DESC);
```

### Schema Modifications

#### Extend `run_sheet_appointments` Table

```sql
ALTER TABLE run_sheet_appointments ADD COLUMN IF NOT EXISTS
  pms_connection_id UUID REFERENCES pms_connections(id);

ALTER TABLE run_sheet_appointments ADD COLUMN IF NOT EXISTS
  pms_appointment_id VARCHAR(255);

ALTER TABLE run_sheet_appointments ADD COLUMN IF NOT EXISTS
  pms_last_synced_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE run_sheet_appointments ADD COLUMN IF NOT EXISTS
  is_telehealth BOOLEAN DEFAULT false;

ALTER TABLE run_sheet_appointments ADD COLUMN IF NOT EXISTS
  appointment_status VARCHAR(50); -- PMS status (booked, confirmed, etc.)

ALTER TABLE run_sheet_appointments ADD COLUMN IF NOT EXISTS
  appointment_duration_minutes INTEGER;

ALTER TABLE run_sheet_appointments ADD COLUMN IF NOT EXISTS
  patient_dob DATE;

ALTER TABLE run_sheet_appointments ADD COLUMN IF NOT EXISTS
  patient_email VARCHAR(255);

-- Composite index for PMS sync lookups
CREATE UNIQUE INDEX idx_appointments_pms_unique
  ON run_sheet_appointments(pms_connection_id, pms_appointment_id)
  WHERE pms_appointment_id IS NOT NULL;
```

#### Extend `run_sheet_clinicians` Table

```sql
ALTER TABLE run_sheet_clinicians ADD COLUMN IF NOT EXISTS
  pms_practitioner_id VARCHAR(255);

ALTER TABLE run_sheet_clinicians ADD COLUMN IF NOT EXISTS
  pms_connection_id UUID REFERENCES pms_connections(id);
```

---

## Unified Appointment Model

The abstraction layer transforms PMS-specific appointment data into a unified model:

```typescript
interface UnifiedAppointment {
  // Source identification
  pmsType: 'gentu' | 'medirecords' | 'halaxy';
  pmsAppointmentId: string;
  pmsConnectionId: string;

  // Temporal data (always in UTC, with original timezone preserved)
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  timezone: string; // IANA timezone (e.g., 'Australia/Melbourne')

  // Appointment classification
  isTelehealth: boolean;
  appointmentTypeName: string;
  appointmentTypeId?: string;
  status: AppointmentStatus;

  // Patient information
  patient: {
    pmsPatientId: string;
    fullName: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    dateOfBirth?: Date;
  };

  // Practitioner information
  practitioner: {
    pmsPractitionerId: string;
    fullName: string;
    firstName?: string;
    lastName?: string;
  };

  // Additional metadata
  notes?: string;
  referralId?: string;

  // Sync metadata
  fetchedAt: Date;
  rawData: Record<string, unknown>; // Original PMS response for debugging
}

type AppointmentStatus =
  | 'booked'
  | 'confirmed'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';
```

---

## Adapter Interface

Each PMS adapter implements a common interface:

```typescript
interface PMSAdapter {
  // Identification
  readonly pmsType: 'gentu' | 'medirecords' | 'halaxy';

  // Authentication
  authenticate(connection: PMSConnection): Promise<AuthResult>;
  refreshToken(connection: PMSConnection): Promise<AuthResult>;
  validateConnection(connection: PMSConnection): Promise<boolean>;

  // Data fetching
  fetchAppointments(
    connection: PMSConnection,
    options: FetchOptions
  ): AsyncGenerator<UnifiedAppointment[], void, unknown>;

  fetchPractitioners(
    connection: PMSConnection
  ): Promise<PMSPractitioner[]>;

  fetchAppointmentTypes(
    connection: PMSConnection
  ): Promise<PMSAppointmentType[]>;

  // Optional: Patient lookup (not available on all PMS)
  fetchPatient?(
    connection: PMSConnection,
    patientId: string
  ): Promise<PMSPatient | null>;

  // Health check
  healthCheck(connection: PMSConnection): Promise<HealthCheckResult>;
}

interface PMSPractitioner {
  id: string;
  name: { family: string; given?: string; prefix?: string };
  active: boolean;
  shownInAppointmentBook?: boolean; // Gentu-specific
  contact?: Array<{ system: string; value: string }>;
}

interface PMSAppointmentType {
  id: string;
  name: string;
  durationMinutes?: number;
  colour?: string;
  isTelehealthAutoDetected?: boolean; // true for Medirecords/Halaxy if auto-detected
}

interface FetchOptions {
  dateFrom: Date;
  dateTo: Date;
  practitionerIds?: string[];  // Required for Gentu (must iterate over each)
  telehealthOnly?: boolean;
  includePatients?: boolean;
  includePractitioners?: boolean;
  includeReferrals?: boolean;  // Gentu supports this
  limit?: number;              // Gentu: 5-100, Medirecords: default 20
}

interface AuthResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  tenantId?: string; // Gentu-specific
  error?: string;
}
```

---

## Adapter Implementations

### Gentu (Magentus) Adapter

```typescript
// src/lib/pms/adapters/gentu-adapter.ts

class GentuAdapter implements PMSAdapter {
  readonly pmsType = 'gentu' as const;

  private readonly baseUrl = 'https://api.pm.magentus.com/v1';
  private readonly tokenUrl = 'https://api.pm.magentus.com/v1/oauth2/token';

  async authenticate(connection: PMSConnection): Promise<AuthResult> {
    // OAuth 2.0 client credentials flow with Basic auth header
    // POST to tokenUrl with grant_type=client_credentials
    // Basic auth: base64(CLIENT_ID:CLIENT_SECRET)
    // Returns: { access_token, expires_in: 3599, token_type: "Bearer" }
  }

  async consumePairingCode(
    appId: string,
    pairingCode: string
  ): Promise<{ tenantId: string }> {
    // PUT /v1/apps/{appId}/pairing/{pairingCode}
    // Returns: { message: "Successfully consumed pairing code.", tenantId: "uuid" }
  }

  async fetchTenantDetails(
    tenantId: string
  ): Promise<{ tenantId: string; tenantName: string; timezone: string }> {
    // GET /v1/tenants/{tenantId}
    // Returns: { tenantId, tenantNumber, tenantName, timezone }
    // Called once during setup to get practice name for display
  }

  async *fetchAppointments(
    connection: PMSConnection,
    options: FetchOptions
  ): AsyncGenerator<UnifiedAppointment[]> {
    // GET /v1/tenants/{tenantId}/appointments
    // Required params: fromDate, toDate, practitionerId, limit (5-100)
    // Optional: cursor (UUID), include (patients,practitioners,referrals)
    // IMPORTANT: fromDate/toDate must be URI encoded (contains + for timezone)
    // Response: { appointments[], pagination: { next, limit }, patients[], practitioners[], referrals[] }

    let cursor: string | null = null;
    do {
      const response = await this.fetchAppointmentPage(connection, options, cursor);
      yield this.mapAppointmentBatch(response);
      cursor = response.pagination.next;
    } while (cursor);
  }

  private mapToUnified(
    gentuAppt: GentuAppointment,
    patients: GentuPatient[],
    practitioners: GentuPractitioner[]
  ): UnifiedAppointment {
    // Extract patient from participant[] where referenceType === 'patient'
    // Extract provider from participant[] where referenceType === 'provider'
    // Use referenceId to lookup full objects from included arrays
    // startAt/endAt already ISO 8601 with offset - parse directly
    // minutesDuration available directly (can be null)
  }

  async fetchAppointmentTypes(
    connection: PMSConnection
  ): Promise<GentuAppointmentType[]> {
    // GET /v1/tenants/{tenantId}/appointment-types
    // Returns: [{ id, text, duration, colour, onlineBookable }]
    // No pagination - returns all types
  }

  private isTelehealth(
    appointment: GentuAppointment,
    telehealthTypeIds: Set<string>  // From pms_appointment_types where is_telehealth = true
  ): boolean {
    // Gentu has no built-in telehealth flag - appointment types are user-customizable
    // User configures which types are telehealth via setup wizard (stored in pms_appointment_types)
    // appointment.appointmentType.reference contains the type ID
    const typeId = appointment.appointmentType.reference;
    return typeId ? telehealthTypeIds.has(typeId) : false;
  }
}
```

**Gentu-Specific Considerations:**
- **Authentication:** Basic auth header with client credentials, tokens expire in ~1 hour (3599s)
- **Pairing:** Practice-wide (not per-practitioner), user generates code in Gentu Marketplace
- **Pagination:** Cursor-based with UUID cursor, limit 5-100
- **Required params:** `practitionerId` is required - must iterate over all practitioners to get all appointments
- **Date encoding:** `fromDate`/`toDate` must be URI encoded (e.g., `+10:00` becomes `%2B10%3A00`)
- **Include param:** Use `include=patients,practitioners,referrals` to reduce N+1 queries
- **Duration:** Directly available as `minutesDuration` (nullable)
- **Participant model:** Array with `referenceType` (patient/provider/location/health_care_service) and `referenceId`

**Sync Flow for Gentu:**
```typescript
async function syncGentuAppointments(connection: PMSConnection, date: Date) {
  // 1. Fetch all practitioners (no pagination)
  const practitioners = await adapter.fetchPractitioners(connection);

  // 2. Filter to active practitioners shown in appointment book
  const activePractitioners = practitioners.filter(
    p => p.active && p.shownInAppointmentBook
  );

  // 3. For each practitioner, fetch their appointments
  for (const practitioner of activePractitioners) {
    const appointments = adapter.fetchAppointments(connection, {
      dateFrom: startOfDay(date),
      dateTo: endOfDay(date),
      practitionerIds: [practitioner.id],
      includePatients: true,
      includePractitioners: true,
      limit: 100
    });

    for await (const batch of appointments) {
      await persistAppointments(batch);
    }
  }
}
```

### Medirecords Adapter

```typescript
// src/lib/pms/adapters/medirecords-adapter.ts

class MedirecordsAdapter implements PMSAdapter {
  readonly pmsType = 'medirecords' as const;

  private readonly baseUrl = 'https://api.medirecords.com';

  // Duration code cache
  private durationCodeMap: Map<number, number> = new Map();

  async *fetchAppointments(
    connection: PMSConnection,
    options: FetchOptions
  ): AsyncGenerator<UnifiedAppointment[]> {
    // Page-based pagination (page=0, size=100)
    // GET /v1/practices/{practice_id}/appointments
    // Filter by appointmentDateRangeStart/End
    // Check telehealthLinkForProvider for telehealth
  }

  private async resolveDurationCode(code: number): Promise<number> {
    // Fetch from /code-system/appointment-Interval-Code if not cached
    // Cache indefinitely (codes don't change)
  }

  private mapToUnified(mrAppt: MedirecordsAppointment): UnifiedAppointment {
    // scheduleTime lacks timezone - assume practice timezone
    // Status codes 2-8 map to unified status
    // telehealthLinkForProvider indicates telehealth
  }

  private isTelehealth(appointment: MedirecordsAppointment): boolean {
    // Check telehealthLinkForProvider or telehealthLinkForPatient
    // Also check appointment type's telehealth flag
    return !!(
      appointment.telehealthLinkForProvider ||
      appointment.telehealthLinkForPatient
    );
  }
}
```

**Medirecords-Specific Considerations:**
- Page-based pagination (0-indexed)
- Duration requires code lookup (cache aggressively)
- Schedule time lacks timezone offset (need practice timezone)
- Existing Coviu links in `telehealthLinkForProvider/Patient`
- Rich status workflow (7 states)

### Halaxy Adapter

```typescript
// src/lib/pms/adapters/halaxy-adapter.ts

class HalaxyAdapter implements PMSAdapter {
  readonly pmsType = 'halaxy' as const;

  private readonly baseUrl = 'https://au-api.halaxy.com';

  // Reference resolution cache
  private healthcareServiceCache: Map<string, HealthcareService> = new Map();

  async *fetchAppointments(
    connection: PMSConnection,
    options: FetchOptions
  ): AsyncGenerator<UnifiedAppointment[]> {
    // GET /main/Appointment with date filters
    // Resolve FHIR-style references for patient/practitioner
    // Check supportingInformation for location-type
  }

  private async resolveReference(
    connection: PMSConnection,
    reference: string
  ): Promise<unknown> {
    // Parse reference: "/main/Patient/123" -> GET /main/Patient/123
    // Cache frequently accessed resources
  }

  private mapToUnified(halaxyAppt: HalaxyAppointment): UnifiedAppointment {
    // Extract from participant[] array with FHIR references
    // Duration from minutesDuration (direct)
    // start/end in ISO 8601 format
  }

  private isTelehealth(appointment: HalaxyAppointment): boolean {
    // Check supportingInformation for location-type: "telehealth"
    const locationInfo = appointment.supportingInformation?.find(
      info => info.type === 'location-type'
    );
    return locationInfo?.value === 'telehealth';
  }
}
```

**Halaxy-Specific Considerations:**
- FHIR-style references require resolution
- Native `location-type: "telehealth"` flag
- Duration directly available as `minutesDuration`
- Practitioner IDs have prefixes (PR-, EP-)
- May need HealthcareService lookup for appointment type names

---

## Core Services

### Token Manager

```typescript
// src/lib/pms/core/token-manager.ts

class TokenManager {
  // Secure token storage (encrypted in database)
  async storeTokens(
    connectionId: string,
    tokens: { accessToken: string; refreshToken?: string; expiresAt: Date }
  ): Promise<void>;

  // Get valid token (auto-refresh if expired)
  async getValidToken(connectionId: string): Promise<string>;

  // Check if refresh needed
  isTokenExpired(connection: PMSConnection): boolean;

  // Proactive refresh (before expiry)
  async refreshIfNeeded(connection: PMSConnection): Promise<void>;
}
```

### Rate Limiter

```typescript
// src/lib/pms/core/rate-limiter.ts

class RateLimiter {
  // Per-PMS rate limit configuration
  private limits: Map<string, RateLimitConfig> = new Map([
    ['gentu', { requestsPerMinute: 60, requestsPerHour: 1000 }],
    ['medirecords', { requestsPerMinute: 60, requestsPerHour: 1000 }],
    ['halaxy', { requestsPerMinute: 60, requestsPerHour: 1000 }],
  ]);

  // Wait if needed before making request
  async acquire(pmsType: string): Promise<void>;

  // Release after request completes
  release(pmsType: string): void;

  // Handle 429 responses
  async handleRateLimitResponse(
    pmsType: string,
    retryAfter?: number
  ): Promise<void>;
}
```

### Retry Handler

```typescript
// src/lib/pms/core/retry-handler.ts

class RetryHandler {
  async withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions
  ): Promise<T>;
}

interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: number[]; // HTTP status codes
  onRetry?: (attempt: number, error: Error) => void;
}

// Default configuration
const defaultRetryOptions: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableErrors: [408, 429, 500, 502, 503, 504],
};
```

### Sync Orchestrator

```typescript
// src/lib/pms/core/sync-orchestrator.ts

class SyncOrchestrator {
  // Full sync for a date range
  async syncAppointments(
    connectionId: string,
    dateFrom: Date,
    dateTo: Date
  ): Promise<SyncResult>;

  // Incremental sync (changes since last sync)
  async incrementalSync(connectionId: string): Promise<SyncResult>;

  // Sync for today's run sheet
  async syncTodayRunSheet(connectionId: string): Promise<SyncResult>;

  // Handle conflicts (PMS data vs manual edits)
  private resolveConflict(
    existing: RunSheetAppointment,
    incoming: UnifiedAppointment
  ): RunSheetAppointment;

  // Map and persist appointments
  private async persistAppointments(
    runSheetId: string,
    appointments: UnifiedAppointment[],
    connection: PMSConnection
  ): Promise<PersistResult>;
}

interface SyncResult {
  success: boolean;
  appointmentsFetched: number;
  appointmentsCreated: number;
  appointmentsUpdated: number;
  appointmentsSkipped: number;
  errors: SyncError[];
  duration: number;
}
```

---

## API Endpoints

### New Endpoints for PMS Management

```typescript
// /api/pms/connections
GET    - List all PMS connections
POST   - Create new PMS connection

// /api/pms/connections/[id]
GET    - Get connection details
PATCH  - Update connection settings
DELETE - Remove connection

// /api/pms/connections/[id]/pair
POST   - Initiate pairing (Gentu pairing code)

// /api/pms/connections/[id]/sync
POST   - Trigger manual sync
GET    - Get sync status/history

// /api/pms/connections/[id]/practitioners
GET    - List practitioners from PMS
POST   - Create/update clinician mappings

// /api/pms/connections/[id]/appointment-types
GET    - List appointment types from PMS (with telehealth config)
PATCH  - Update telehealth flags for appointment types

// /api/pms/connections/[id]/test
POST   - Test connection health
```

### Modified Run Sheet Endpoints

```typescript
// /api/run-sheet
GET - Extended to include PMS sync status
     ?include=pms_status returns sync info

// /api/run-sheet/sync
POST - Trigger PMS sync for today's run sheet
GET  - Get sync status for current run sheet

// /api/run-sheet/appointments
GET - Extended response includes:
     - pms_connection_id
     - pms_appointment_id
     - pms_last_synced_at
     - source: 'ocr' | 'manual' | 'pms'
```

---

## Data Flow

### Initial Setup Flow

The setup wizard guides users through connecting their PMS and configuring the integration:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 1: Select PMS                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  ○ Gentu (Magentus)                                                        │
│  ○ Medirecords                                                             │
│  ○ Halaxy                                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 2: Connect (varies by PMS)                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ Gentu:       Enter pairing code from Gentu Marketplace                     │
│ Medirecords: OAuth login flow                                              │
│ Halaxy:      OAuth login flow (TBD)                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 3: Map Practitioners → Run Sheet Clinicians                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ PMS Practitioner          →    Run Sheet Clinician (Column)                │
│ ─────────────────────────────────────────────────────────────              │
│ Dr. John Smith            →    [Select or Create ▼]                        │
│ Dr. Jane Doe              →    [Select or Create ▼]                        │
│ Dr. Michael Brown         →    [Don't sync ▼]                              │
│                                                                            │
│ Options for each:                                                          │
│   • Match to existing run sheet clinician                                  │
│   • Create new clinician with this name                                    │
│   • Don't sync (exclude this practitioner)                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 4: Configure Telehealth Types (Gentu only)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ Which appointment types are telehealth consultations?                      │
│                                                                            │
│ ☑ Telehealth Consultation (30 min)                                        │
│ ☑ Video Follow-up (15 min)                                                │
│ ☐ Standard Consultation (30 min)                                          │
│ ☐ New Patient (45 min)                                                    │
│ ☐ Procedure (60 min)                                                      │
│                                                                            │
│ Note: Medirecords and Halaxy auto-detect telehealth appointments           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ Step 5: Confirm & Sync                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Summary:                                                                   │
│   • Connected to: Dr Smith's Practice (Gentu)                              │
│   • Syncing 3 practitioners                                                │
│   • 2 telehealth appointment types selected                                │
│   • Sync frequency: Every 15 minutes                                       │
│                                                                            │
│ [Test Connection]  [Save & Start Sync]                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Step Details:**

1. **Select PMS:** User chooses which practice management system they use
2. **Connect:** Authentication varies by PMS:
   - Gentu: User enters 8-character pairing code from Gentu Marketplace
     - After pairing, fetch tenant details to get practice name for display
     - Store `tenantName` in `pms_connections.display_name`
   - Medirecords: OAuth flow redirects to Medirecords login
   - Halaxy: OAuth flow (details TBD)
3. **Map Practitioners:** Critical step - users match PMS practitioners to run sheet columns
   - System fetches practitioners from PMS
   - User maps each to existing clinician OR creates new one OR excludes
   - Names may differ ("Dr. John Smith" vs "Dr Smith")
4. **Configure Telehealth Types (Gentu only):**
   - Gentu has no built-in telehealth flag
   - User must select which appointment types represent telehealth
   - Medirecords/Halaxy skip this step (auto-detection)
5. **Confirm & Sync:** Review settings and initiate first sync

### Sync Flow

```
1. Scheduled job triggers OR manual sync requested
2. SyncOrchestrator.syncTodayRunSheet(connectionId)
3. TokenManager ensures valid access token
4. Adapter.fetchAppointments() yields batches
   - For each batch:
     a. Transform to UnifiedAppointment[]
     b. Filter by telehealth if configured
     c. Match practitioners to clinician mappings
5. For each appointment:
   a. Check if exists (by pms_appointment_id)
   b. If exists: update if changed (respect manual edits)
   c. If new: create run_sheet_appointment
6. Log sync results to pms_sync_log
7. Update connection.last_sync_at
8. Emit events for UI updates (optional WebSocket)
```

### Conflict Resolution Strategy

```
Priority order for field values:
1. Manual edits (isManualEntry = true, edited after sync)
2. PMS data (source of truth for unedited fields)
3. OCR data (fallback if no PMS data)

Fields that prefer manual edits:
- patientPhone (user may have corrected)
- appointmentTime (user may have adjusted)
- notes (additive - merge PMS notes with manual notes)

Fields that prefer PMS data:
- patientName
- appointmentStatus
- appointmentDuration
- is_telehealth
```

---

## File Structure

```
src/
├── lib/
│   └── pms/
│       ├── index.ts                    # Public exports
│       ├── types.ts                    # Shared types and interfaces
│       │
│       ├── adapters/
│       │   ├── index.ts                # Adapter factory
│       │   ├── base-adapter.ts         # Abstract base class
│       │   ├── gentu-adapter.ts        # Magentus/Gentu implementation
│       │   ├── medirecords-adapter.ts  # Medirecords implementation
│       │   └── halaxy-adapter.ts       # Halaxy implementation
│       │
│       ├── core/
│       │   ├── token-manager.ts        # OAuth token management
│       │   ├── rate-limiter.ts         # Request throttling
│       │   ├── retry-handler.ts        # Retry with backoff
│       │   ├── sync-orchestrator.ts    # Sync coordination
│       │   └── data-mapper.ts          # Unified model mapping
│       │
│       └── utils/
│           ├── timezone.ts             # Timezone handling
│           ├── phone-normalizer.ts     # Phone number formatting
│           └── name-parser.ts          # Name parsing utilities
│
├── app/
│   └── api/
│       └── pms/
│           ├── connections/
│           │   ├── route.ts            # GET, POST
│           │   └── [id]/
│           │       ├── route.ts        # GET, PATCH, DELETE
│           │       ├── pair/
│           │       │   └── route.ts    # POST (Gentu pairing)
│           │       ├── sync/
│           │       │   └── route.ts    # GET, POST
│           │       ├── practitioners/
│           │       │   └── route.ts    # GET, POST
│           │       └── test/
│           │           └── route.ts    # POST
│           └── sync/
│               └── route.ts            # Global sync status
│
├── components/
│   └── pms/
│       ├── PMSConnectionCard.tsx       # Connection status display
│       ├── PMSSetupWizard.tsx          # Setup flow
│       ├── PractitionerMappingTable.tsx # Map PMS → clinicians
│       ├── SyncStatusBadge.tsx         # Sync status indicator
│       └── PMSSettingsPanel.tsx        # Configuration panel
│
└── db/
    └── schema.ts                       # Extended with PMS tables
```

---

## Implementation Phases

### Phase 1: Foundation (5-7 days)

**Scope:**
- Database schema extensions
- Core services (TokenManager, RetryHandler, RateLimiter)
- Base adapter interface and factory
- Basic API endpoints for connections

**Deliverables:**
- [ ] Database migrations for new tables
- [ ] `src/lib/pms/types.ts` with all interfaces
- [ ] `src/lib/pms/core/*` implementations
- [ ] `src/lib/pms/adapters/base-adapter.ts`
- [ ] `/api/pms/connections` CRUD endpoints

### Phase 2: First Adapter - Gentu (5-7 days)

**Scope:**
- Complete Gentu adapter implementation
- Pairing code flow
- Appointment sync with pagination
- Practitioner fetching

**Deliverables:**
- [ ] `src/lib/pms/adapters/gentu-adapter.ts`
- [ ] Pairing endpoint and UI
- [ ] Integration tests with mock data
- [ ] Sync orchestration for Gentu

### Phase 3: Second Adapter - Medirecords (4-6 days)

**Scope:**
- Medirecords adapter implementation
- Duration code resolution
- Existing Coviu link handling

**Deliverables:**
- [ ] `src/lib/pms/adapters/medirecords-adapter.ts`
- [ ] Duration code caching
- [ ] Telehealth link detection
- [ ] Integration tests

### Phase 4: Third Adapter - Halaxy (5-7 days)

**Scope:**
- Halaxy adapter implementation
- FHIR reference resolution
- Location type filtering

**Deliverables:**
- [ ] `src/lib/pms/adapters/halaxy-adapter.ts`
- [ ] Reference resolution with caching
- [ ] Integration tests

### Phase 5: UI & Polish (4-5 days)

**Scope:**
- PMS settings UI
- Setup wizard
- Practitioner mapping interface
- Sync status indicators
- Run sheet integration

**Deliverables:**
- [ ] `src/components/pms/*` components
- [ ] Settings page integration
- [ ] Run sheet UI updates (source indicator, sync button)
- [ ] Error handling and user feedback

### Phase 6: Testing & Documentation (3-4 days)

**Scope:**
- End-to-end testing
- Documentation
- Error scenarios

**Deliverables:**
- [ ] Integration test suite
- [ ] API documentation
- [ ] Troubleshooting guide
- [ ] Runbook for common issues

---

## Effort Summary

| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | Foundation | 5-7 days |
| 2 | Gentu Adapter | 5-7 days |
| 3 | Medirecords Adapter | 4-6 days |
| 4 | Halaxy Adapter | 5-7 days |
| 5 | UI & Polish | 4-5 days |
| 6 | Testing & Documentation | 3-4 days |
| **Total** | | **26-36 days** |

**With buffer for unknowns: 6-8 weeks**

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Undocumented rate limits | High | Medium | Build in conservative defaults, handle 429s gracefully |
| OAuth token expiry variations | Medium | Medium | Proactive refresh, handle 401 with retry |
| API changes during development | Low | High | Version lock adapters, monitor changelogs |
| Incomplete API documentation | High | Medium | Build discovery into dev phase, contact support |
| Timezone edge cases | Medium | Medium | Comprehensive timezone testing, store original + UTC |
| Large appointment volumes | Medium | Medium | Pagination, incremental sync, background processing |

---

## Success Criteria

1. **Functional:** All three PMS adapters successfully sync telehealth appointments
2. **Accurate:** >99% of telehealth appointments appear correctly on run sheet
3. **Timely:** Sync completes within 2 minutes for a typical day's appointments
4. **Reliable:** <1% sync failure rate under normal conditions
5. **Recoverable:** Failed syncs can be retried without data loss or duplication
6. **Maintainable:** Adding a new PMS adapter requires <5 days of effort

---

## Future Considerations

### Not in Scope (Potential Future Work)

- **Two-way sync:** Writing data back to PMS
- **Real-time webhooks:** When PMS vendors support them
- **Multi-practice:** Single connection managing multiple practices
- **Billing integration:** Reading/writing invoice data
- **Patient portal:** Direct patient data access
- **Appointment booking:** Creating appointments via API

### Architectural Decisions for Future Flexibility

- Adapter interface designed for optional write methods
- Webhook handler interface defined but not implemented
- Event emission hooks for future real-time features
- Unified model extensible for additional fields
