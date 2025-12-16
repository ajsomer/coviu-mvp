# PMS Integration Implementation Plan

## Phase 1: Foundation (Can Start Now)

This phase builds the shared infrastructure that all PMS integrations will use.

---

### 1.1 Database Schema

**Goal:** Create all tables and migrations for PMS integration.

**Tasks:**

- [ ] Create migration file for `pms_connections` table
  ```sql
  - id, pms_type, display_name
  - tenant_id, practice_id, organization_id (PMS-specific identifiers)
  - access_token, refresh_token, token_expires_at (encrypted)
  - sync_enabled, sync_frequency_minutes, last_sync_at, last_sync_status, last_sync_error
  - created_at, updated_at
  ```

- [ ] Create migration file for `pms_clinician_mappings` table
  ```sql
  - id, pms_connection_id
  - pms_practitioner_id, pms_practitioner_name
  - run_sheet_clinician_id
  - sync_enabled, auto_created
  - created_at, updated_at
  ```

- [ ] Create migration file for `pms_appointment_types` table
  ```sql
  - id, pms_connection_id
  - pms_type_id, pms_type_name
  - default_duration_minutes, colour
  - is_telehealth, sync_enabled
  - created_at, updated_at
  ```

- [ ] Create migration file for `pms_sync_log` table
  ```sql
  - id, pms_connection_id
  - sync_type, started_at, completed_at
  - status, appointments_fetched, appointments_created, appointments_updated, appointments_skipped
  - error_message, error_details
  - created_at
  ```

- [ ] Extend `run_sheet_appointments` table
  ```sql
  - pms_connection_id
  - pms_appointment_id
  - pms_last_synced_at
  - is_telehealth
  - appointment_status
  - appointment_duration_minutes
  - patient_dob
  - patient_email
  ```

- [ ] Update Drizzle schema (`src/db/schema.ts`)
- [ ] Run migrations and verify in Drizzle Studio

**Estimated Effort:** 1-2 days

---

### 1.2 TypeScript Types & Interfaces

**Goal:** Define all shared types for the PMS abstraction layer.

**Tasks:**

- [ ] Create `src/lib/pms/types.ts` with:
  ```typescript
  // PMS Types
  type PMSType = 'gentu' | 'medirecords' | 'halaxy';

  // Connection types
  interface PMSConnection { ... }

  // Unified models
  interface UnifiedAppointment { ... }
  interface PMSPractitioner { ... }
  interface PMSAppointmentType { ... }

  // Adapter interface
  interface PMSAdapter { ... }

  // Auth types
  interface AuthResult { ... }

  // Sync types
  interface SyncResult { ... }
  interface FetchOptions { ... }
  ```

- [ ] Create Gentu-specific types in `src/lib/pms/adapters/gentu/types.ts`
  ```typescript
  interface GentuAppointment { ... }
  interface GentuPatient { ... }
  interface GentuPractitioner { ... }
  interface GentuAppointmentType { ... }
  interface GentuTenant { ... }
  ```

**Estimated Effort:** 0.5 days

---

### 1.3 Core Services

**Goal:** Build shared services used by all adapters.

#### Token Manager

- [ ] Create `src/lib/pms/core/token-manager.ts`
  - Store tokens securely (encrypted in DB)
  - Get valid token (auto-refresh if expired)
  - Check token expiry
  - Handle 401 responses

#### Rate Limiter

- [ ] Create `src/lib/pms/core/rate-limiter.ts`
  - Per-PMS rate limit configuration
  - Request throttling
  - Handle 429 responses

#### Retry Handler

- [ ] Create `src/lib/pms/core/retry-handler.ts`
  - Exponential backoff
  - Configurable retry attempts
  - Retryable error codes (408, 429, 500, 502, 503, 504)

#### HTTP Client

- [ ] Create `src/lib/pms/core/http-client.ts`
  - Wrapper around fetch with retry + rate limiting
  - Automatic token injection
  - Error handling

**Estimated Effort:** 2-3 days

---

### 1.4 Gentu Adapter (Stubbed)

**Goal:** Build the Gentu adapter with mock data so UI can be developed.

**Tasks:**

- [ ] Create `src/lib/pms/adapters/gentu/index.ts`
  - Implement `PMSAdapter` interface
  - All methods return mock data initially

- [ ] Create `src/lib/pms/adapters/gentu/mock-data.ts`
  - Sample practitioners (3-5)
  - Sample appointment types (5-6, including telehealth ones)
  - Sample appointments for today
  - Sample tenant details

- [ ] Implement adapter methods (stubbed):
  ```typescript
  authenticate() // Return mock token
  consumePairingCode() // Return mock tenantId
  fetchTenantDetails() // Return mock tenant
  fetchPractitioners() // Return mock practitioners
  fetchAppointmentTypes() // Return mock types
  fetchAppointments() // Return mock appointments
  healthCheck() // Return success
  ```

- [ ] Create `src/lib/pms/adapters/index.ts` (adapter factory)
  ```typescript
  function getAdapter(pmsType: PMSType): PMSAdapter
  ```

**Estimated Effort:** 1-2 days

---

### 1.5 Sync Orchestrator

**Goal:** Build the logic that coordinates syncing appointments to the run sheet.

**Tasks:**

- [ ] Create `src/lib/pms/core/sync-orchestrator.ts`
  - `syncTodayRunSheet(connectionId)` - main sync function
  - `syncAppointmentsForDate(connectionId, date)` - sync specific date
  - `persistAppointments(runSheetId, appointments)` - upsert logic
  - Conflict resolution (PMS data vs manual edits)
  - Logging to `pms_sync_log`

- [ ] Create `src/lib/pms/core/data-mapper.ts`
  - Map `UnifiedAppointment` to `run_sheet_appointments` row
  - Handle clinician mapping lookup
  - Handle telehealth filtering

**Estimated Effort:** 2 days

---

## Phase 2: API Endpoints

**Goal:** Create all API routes for PMS management.

### 2.1 Connection Management

- [ ] `GET /api/pms/connections` - List all connections
- [ ] `POST /api/pms/connections` - Create new connection
- [ ] `GET /api/pms/connections/[id]` - Get connection details
- [ ] `PATCH /api/pms/connections/[id]` - Update connection
- [ ] `DELETE /api/pms/connections/[id]` - Delete connection

### 2.2 Gentu Pairing

- [ ] `POST /api/pms/connections/[id]/pair` - Consume pairing code

### 2.3 Practitioner Mapping

- [ ] `GET /api/pms/connections/[id]/practitioners` - List PMS practitioners
- [ ] `POST /api/pms/connections/[id]/practitioners` - Save clinician mappings

### 2.4 Appointment Types

- [ ] `GET /api/pms/connections/[id]/appointment-types` - List types with config
- [ ] `PATCH /api/pms/connections/[id]/appointment-types` - Update telehealth flags

### 2.5 Sync

- [ ] `POST /api/pms/connections/[id]/sync` - Trigger manual sync
- [ ] `GET /api/pms/connections/[id]/sync` - Get sync status/history

### 2.6 Health Check

- [ ] `POST /api/pms/connections/[id]/test` - Test connection

**Estimated Effort:** 2-3 days

---

## Phase 3: UI Components

**Goal:** Build the settings page and setup wizard.

### 3.1 Settings Page

- [ ] Create `src/app/(dashboard)/settings/integrations/page.tsx`
  - List connected PMS
  - Connection status cards
  - "Add Integration" button

### 3.2 Connection Card Component

- [ ] Create `src/components/pms/PMSConnectionCard.tsx`
  - Show PMS type, practice name, status
  - Last sync time and status
  - Sync now button
  - Settings/disconnect actions

### 3.3 Setup Wizard

- [ ] Create `src/components/pms/PMSSetupWizard.tsx`
  - Multi-step wizard container
  - Progress indicator

- [ ] Step 1: PMS Selection
  - Radio buttons for Gentu/Medirecords/Halaxy

- [ ] Step 2: Connection (Gentu)
  - Pairing code input field
  - Instructions for getting code from Gentu Marketplace
  - Validation and error handling

- [ ] Step 3: Practitioner Mapping
  - Table showing PMS practitioners
  - Dropdown for each: existing clinician / create new / don't sync
  - Auto-suggest based on name similarity

- [ ] Step 4: Telehealth Types (Gentu only)
  - Checkbox list of appointment types
  - "Select which types are telehealth consultations"

- [ ] Step 5: Confirmation
  - Summary of configuration
  - Test connection button
  - Save & Start Sync button

### 3.4 Sync Status Components

- [ ] Create `src/components/pms/SyncStatusBadge.tsx`
  - Success/partial/failed/syncing states

- [ ] Create `src/components/pms/SyncHistoryTable.tsx`
  - Recent sync operations with stats

### 3.5 Run Sheet Integration

- [ ] Update `RunSheetSidebar.tsx`
  - Show PMS sync status
  - "Sync Now" button
  - Indicate which appointments are from PMS

- [ ] Update `AppointmentCard.tsx`
  - Visual indicator for PMS-sourced appointments
  - Show if manually edited after sync

**Estimated Effort:** 4-5 days

---

## Phase 4: Gentu Adapter (Live)

**Goal:** Replace mock data with real Gentu API calls (requires API access).

### 4.1 Authentication

- [ ] Implement real OAuth token acquisition
- [ ] Test token refresh flow
- [ ] Secure credential storage

### 4.2 Pairing Flow

- [ ] Implement real pairing code consumption
- [ ] Fetch and store tenant details
- [ ] Handle pairing errors

### 4.3 Data Fetching

- [ ] Implement real `fetchPractitioners()`
- [ ] Implement real `fetchAppointmentTypes()`
- [ ] Implement real `fetchAppointments()` with pagination

### 4.4 Testing

- [ ] Test with sandbox tenant
- [ ] Test pagination with large datasets
- [ ] Test error handling (invalid token, rate limits)
- [ ] Test timezone handling

**Estimated Effort:** 3-4 days (after API access)

---

## Phase 5: Scheduled Sync

**Goal:** Implement automatic background sync every 15 minutes.

- [ ] Create sync cron job / scheduled task
- [ ] Handle multiple connections
- [ ] Error alerting
- [ ] Sync conflict resolution

**Estimated Effort:** 1-2 days

---

## Summary

| Phase | Description | Can Start Now? | Effort |
|-------|-------------|----------------|--------|
| 1 | Foundation (DB, types, core services, stubbed adapter) | ✅ Yes | 6-9 days |
| 2 | API Endpoints | ✅ Yes | 2-3 days |
| 3 | UI Components | ✅ Yes | 4-5 days |
| 4 | Gentu Adapter (Live) | ❌ Needs API access | 3-4 days |
| 5 | Scheduled Sync | ✅ Yes (logic) | 1-2 days |

**Total (without API access):** 13-19 days (~3-4 weeks)
**Total (with API access):** 16-23 days (~4-5 weeks)

---

## File Structure

```
src/
├── lib/
│   └── pms/
│       ├── index.ts                    # Public exports
│       ├── types.ts                    # Shared types
│       │
│       ├── adapters/
│       │   ├── index.ts                # Adapter factory
│       │   └── gentu/
│       │       ├── index.ts            # Gentu adapter
│       │       ├── types.ts            # Gentu-specific types
│       │       └── mock-data.ts        # Mock data for development
│       │
│       └── core/
│           ├── token-manager.ts
│           ├── rate-limiter.ts
│           ├── retry-handler.ts
│           ├── http-client.ts
│           ├── sync-orchestrator.ts
│           └── data-mapper.ts
│
├── app/
│   └── api/
│       └── pms/
│           ├── connections/
│           │   ├── route.ts
│           │   └── [id]/
│           │       ├── route.ts
│           │       ├── pair/route.ts
│           │       ├── sync/route.ts
│           │       ├── practitioners/route.ts
│           │       ├── appointment-types/route.ts
│           │       └── test/route.ts
│           └── sync/route.ts
│
└── components/
    └── pms/
        ├── PMSConnectionCard.tsx
        ├── PMSSetupWizard.tsx
        ├── PractitionerMappingTable.tsx
        ├── TelehealthTypeSelector.tsx
        ├── SyncStatusBadge.tsx
        └── SyncHistoryTable.tsx
```

---

## Next Steps

1. Start with **Phase 1.1: Database Schema**
2. Then **Phase 1.2: TypeScript Types**
3. Continue sequentially through phases

Ready to begin?
