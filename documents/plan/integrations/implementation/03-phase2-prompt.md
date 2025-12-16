# Phase 2 Implementation Prompt

Use this prompt to implement Phase 2 of the PMS integration - API Endpoints.

---

## Prompt

```
I need you to implement Phase 2 of the PMS (Practice Management System) integration for the Coviu run sheet application. This phase builds all the API endpoints for managing PMS connections, practitioner mappings, appointment types, and syncing.

## Prerequisites

Phase 1 must be completed first. You should have:
- Database schema with `pms_connections`, `pms_clinician_mappings`, `pms_appointment_types`, `pms_sync_log` tables
- Extended `run_sheet_appointments` table
- All types in `src/lib/pms/types.ts`
- Core services in `src/lib/pms/core/`
- Stubbed Gentu adapter in `src/lib/pms/adapters/gentu/`

## Context

Key files to reference:
- `src/db/schema.ts` - Database schema
- `src/lib/pms/` - PMS abstraction layer from Phase 1
- `src/app/api/` - Existing API route patterns
- `documents/plan/integrations/pms-abstraction-layer-plan.md` - Full architecture plan

## API Endpoints to Implement

### 2.1 Connection Management

#### `GET /api/pms/connections`

List all PMS connections.

**Response:**
```json
{
  "connections": [
    {
      "id": "uuid",
      "pmsType": "gentu",
      "displayName": "Smith Medical Centre",
      "syncEnabled": true,
      "lastSyncAt": "2024-12-16T10:00:00Z",
      "lastSyncStatus": "success",
      "createdAt": "2024-12-01T00:00:00Z"
    }
  ]
}
```

#### `POST /api/pms/connections`

Create a new PMS connection (initial step before pairing).

**Request:**
```json
{
  "pmsType": "gentu",
  "displayName": "My Practice"  // Optional, can be updated after pairing
}
```

**Response:**
```json
{
  "id": "uuid",
  "pmsType": "gentu",
  "displayName": "My Practice",
  "syncEnabled": false,
  "createdAt": "2024-12-16T00:00:00Z"
}
```

#### `GET /api/pms/connections/[id]`

Get connection details including sync history.

**Response:**
```json
{
  "connection": {
    "id": "uuid",
    "pmsType": "gentu",
    "displayName": "Smith Medical Centre",
    "tenantId": "uuid",
    "syncEnabled": true,
    "syncFrequencyMinutes": 15,
    "syncTelehealthOnly": true,
    "lastSyncAt": "2024-12-16T10:00:00Z",
    "lastSyncStatus": "success",
    "createdAt": "2024-12-01T00:00:00Z",
    "updatedAt": "2024-12-16T10:00:00Z"
  },
  "recentSyncs": [
    {
      "id": "uuid",
      "syncType": "manual",
      "status": "success",
      "appointmentsFetched": 12,
      "appointmentsCreated": 8,
      "appointmentsUpdated": 4,
      "startedAt": "2024-12-16T10:00:00Z",
      "completedAt": "2024-12-16T10:00:15Z"
    }
  ]
}
```

#### `PATCH /api/pms/connections/[id]`

Update connection settings.

**Request:**
```json
{
  "displayName": "Updated Name",
  "syncEnabled": true,
  "syncFrequencyMinutes": 30,
  "syncTelehealthOnly": true
}
```

**Response:** Updated connection object.

#### `DELETE /api/pms/connections/[id]`

Delete a PMS connection and all related mappings.

**Response:**
```json
{
  "success": true,
  "message": "Connection deleted"
}
```


### 2.2 Gentu Pairing

#### `POST /api/pms/connections/[id]/pair`

Consume a Gentu pairing code to complete connection setup.

**Request:**
```json
{
  "pairingCode": "ABCD1234"
}
```

**Response (success):**
```json
{
  "success": true,
  "tenantId": "uuid",
  "tenantName": "Smith Medical Centre",
  "timezone": "Australia/Melbourne"
}
```

**Response (error):**
```json
{
  "success": false,
  "error": "Invalid pairing code"
}
```

**Implementation notes:**
1. Get the Gentu adapter
2. Call `consumePairingCode(appId, pairingCode)`
3. On success, call `fetchTenantDetails(tenantId)`
4. Update the connection with `tenantId` and `displayName` (from tenantName)
5. Return tenant details


### 2.3 Practitioner Mapping

#### `GET /api/pms/connections/[id]/practitioners`

List practitioners from the PMS with their current mappings.

**Response:**
```json
{
  "practitioners": [
    {
      "id": "prac-001",
      "name": {
        "family": "Smith",
        "given": "John",
        "prefix": "Dr"
      },
      "fullName": "Dr John Smith",
      "active": true,
      "shownInAppointmentBook": true,
      "mapping": {
        "id": "mapping-uuid",
        "runSheetClinicianId": "clinician-uuid",
        "runSheetClinicianName": "Dr Smith",
        "syncEnabled": true
      }
    },
    {
      "id": "prac-002",
      "name": {
        "family": "Jones",
        "given": "Sarah",
        "prefix": "Dr"
      },
      "fullName": "Dr Sarah Jones",
      "active": true,
      "shownInAppointmentBook": true,
      "mapping": null  // Not mapped yet
    }
  ],
  "runSheetClinicians": [
    {
      "id": "clinician-uuid",
      "name": "Dr Smith"
    },
    {
      "id": "clinician-uuid-2",
      "name": "Dr Jones"
    }
  ]
}
```

**Implementation notes:**
1. Get the adapter and fetch practitioners from PMS
2. Load existing mappings from `pms_clinician_mappings`
3. Load all run sheet clinicians for dropdown options
4. Join the data together


#### `POST /api/pms/connections/[id]/practitioners`

Create or update practitioner mappings.

**Request:**
```json
{
  "mappings": [
    {
      "pmsPractitionerId": "prac-001",
      "pmsPractitionerName": "Dr John Smith",
      "runSheetClinicianId": "clinician-uuid",  // null to skip, "new" to create
      "syncEnabled": true
    },
    {
      "pmsPractitionerId": "prac-002",
      "pmsPractitionerName": "Dr Sarah Jones",
      "runSheetClinicianId": "new",  // Create new clinician
      "newClinicianName": "Dr S Jones",  // Name for new clinician
      "syncEnabled": true
    },
    {
      "pmsPractitionerId": "prac-003",
      "pmsPractitionerName": "Dr Michael Williams",
      "runSheetClinicianId": null,  // Don't sync this practitioner
      "syncEnabled": false
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "mappingsCreated": 2,
  "mappingsUpdated": 1,
  "cliniciansCreated": 1
}
```

**Implementation notes:**
1. For each mapping:
   - If `runSheetClinicianId` is "new", create a new run sheet clinician first
   - Upsert the mapping in `pms_clinician_mappings`
2. Return summary of changes


### 2.4 Appointment Types

#### `GET /api/pms/connections/[id]/appointment-types`

List appointment types from the PMS with telehealth configuration.

**Response:**
```json
{
  "appointmentTypes": [
    {
      "id": "type-001",
      "pmsTypeId": "type-001",
      "name": "Telehealth Consultation",
      "durationMinutes": 30,
      "colour": "#4CAF50",
      "isTelehealth": true,
      "syncEnabled": true
    },
    {
      "id": "type-002",
      "pmsTypeId": "type-002",
      "name": "Video Follow-up",
      "durationMinutes": 15,
      "colour": "#2196F3",
      "isTelehealth": true,
      "syncEnabled": true
    },
    {
      "id": "type-003",
      "pmsTypeId": "type-003",
      "name": "Standard Consultation",
      "durationMinutes": 30,
      "colour": "#9E9E9E",
      "isTelehealth": false,
      "syncEnabled": true
    }
  ],
  "requiresTelehealthConfig": true  // true for Gentu, false for Medirecords/Halaxy
}
```

**Implementation notes:**
1. Fetch appointment types from PMS via adapter
2. Load existing config from `pms_appointment_types`
3. Merge: use DB config if exists, otherwise use PMS data with defaults
4. `requiresTelehealthConfig` is true for Gentu (user must select), false for others (auto-detected)


#### `PATCH /api/pms/connections/[id]/appointment-types`

Update telehealth flags for appointment types.

**Request:**
```json
{
  "appointmentTypes": [
    {
      "pmsTypeId": "type-001",
      "isTelehealth": true,
      "syncEnabled": true
    },
    {
      "pmsTypeId": "type-002",
      "isTelehealth": true,
      "syncEnabled": true
    },
    {
      "pmsTypeId": "type-003",
      "isTelehealth": false,
      "syncEnabled": true
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "updated": 3
}
```

**Implementation notes:**
1. Upsert each appointment type in `pms_appointment_types`
2. Include `pmsTypeName`, `defaultDurationMinutes`, `colour` from PMS data if creating


### 2.5 Sync Operations

#### `POST /api/pms/connections/[id]/sync`

Trigger a manual sync for today's appointments.

**Request (optional):**
```json
{
  "date": "2024-12-16"  // Optional, defaults to today
}
```

**Response:**
```json
{
  "success": true,
  "syncId": "uuid",
  "result": {
    "appointmentsFetched": 12,
    "appointmentsCreated": 8,
    "appointmentsUpdated": 4,
    "appointmentsSkipped": 0,
    "durationMs": 1500
  }
}
```

**Implementation notes:**
1. Get connection and validate it's configured
2. Use `SyncOrchestrator.syncAppointmentsForDate()`
3. Return the sync result


#### `GET /api/pms/connections/[id]/sync`

Get sync history for a connection.

**Query params:**
- `limit` - Number of records (default 10, max 100)

**Response:**
```json
{
  "syncs": [
    {
      "id": "uuid",
      "syncType": "manual",
      "status": "success",
      "appointmentsFetched": 12,
      "appointmentsCreated": 8,
      "appointmentsUpdated": 4,
      "appointmentsSkipped": 0,
      "errorMessage": null,
      "startedAt": "2024-12-16T10:00:00Z",
      "completedAt": "2024-12-16T10:00:15Z"
    }
  ],
  "nextSyncAt": "2024-12-16T10:15:00Z"  // Based on sync frequency
}
```


### 2.6 Connection Health Check

#### `POST /api/pms/connections/[id]/test`

Test the connection health.

**Response (success):**
```json
{
  "healthy": true,
  "message": "Connection successful",
  "latencyMs": 150,
  "details": {
    "tenantName": "Smith Medical Centre",
    "practitionerCount": 5,
    "appointmentTypeCount": 8
  }
}
```

**Response (failure):**
```json
{
  "healthy": false,
  "message": "Authentication failed",
  "error": "Invalid or expired token"
}
```

**Implementation notes:**
1. Call adapter's `healthCheck()`
2. If healthy, also fetch practitioner and appointment type counts
3. Return detailed status


## File Structure

Create the following files:

```
src/app/api/pms/
├── connections/
│   ├── route.ts                    # GET (list), POST (create)
│   └── [id]/
│       ├── route.ts                # GET, PATCH, DELETE
│       ├── pair/
│       │   └── route.ts            # POST (Gentu pairing)
│       ├── practitioners/
│       │   └── route.ts            # GET, POST
│       ├── appointment-types/
│       │   └── route.ts            # GET, PATCH
│       ├── sync/
│       │   └── route.ts            # GET, POST
│       └── test/
│           └── route.ts            # POST
```


## Implementation Guidelines

### Error Handling

Use consistent error responses:

```typescript
// 400 Bad Request
return NextResponse.json(
  { error: 'Invalid request', details: 'Missing required field: pmsType' },
  { status: 400 }
);

// 404 Not Found
return NextResponse.json(
  { error: 'Connection not found' },
  { status: 404 }
);

// 500 Internal Server Error
return NextResponse.json(
  { error: 'Sync failed', details: error.message },
  { status: 500 }
);
```

### Validation

Use Zod for request validation (follow existing patterns in codebase):

```typescript
import { z } from 'zod';

const createConnectionSchema = z.object({
  pmsType: z.enum(['gentu', 'medirecords', 'halaxy']),
  displayName: z.string().optional(),
});

const pairingSchema = z.object({
  pairingCode: z.string().min(1).max(20),
});

const practitionerMappingSchema = z.object({
  mappings: z.array(z.object({
    pmsPractitionerId: z.string(),
    pmsPractitionerName: z.string(),
    runSheetClinicianId: z.string().nullable(),
    newClinicianName: z.string().optional(),
    syncEnabled: z.boolean(),
  })),
});
```

### Database Queries

Use Drizzle ORM (follow existing patterns):

```typescript
import { db } from '@/db';
import { pmsConnections, pmsClinianMappings } from '@/db/schema';
import { eq } from 'drizzle-orm';

// Get connection
const connection = await db.query.pmsConnections.findFirst({
  where: eq(pmsConnections.id, connectionId),
});

// Insert
await db.insert(pmsConnections).values({ ... });

// Update
await db.update(pmsConnections)
  .set({ displayName: 'New Name', updatedAt: new Date() })
  .where(eq(pmsConnections.id, connectionId));

// Delete
await db.delete(pmsConnections)
  .where(eq(pmsConnections.id, connectionId));
```

### Getting the Adapter

```typescript
import { getAdapter, PMSConnection } from '@/lib/pms';

// In your route handler
const adapter = getAdapter(connection.pmsType);
const practitioners = await adapter.fetchPractitioners(connection);
```


## Example Route Implementation

Here's a complete example for `GET /api/pms/connections`:

```typescript
// src/app/api/pms/connections/route.ts

import { NextResponse } from 'next/server';
import { db } from '@/db';
import { pmsConnections } from '@/db/schema';

export async function GET() {
  try {
    const connections = await db.query.pmsConnections.findMany({
      orderBy: (connections, { desc }) => [desc(connections.createdAt)],
    });

    return NextResponse.json({
      connections: connections.map(c => ({
        id: c.id,
        pmsType: c.pmsType,
        displayName: c.displayName,
        syncEnabled: c.syncEnabled,
        lastSyncAt: c.lastSyncAt,
        lastSyncStatus: c.lastSyncStatus,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch connections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch connections' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate
    const parsed = createConnectionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { pmsType, displayName } = parsed.data;

    // Create connection
    const [connection] = await db.insert(pmsConnections)
      .values({
        pmsType,
        displayName: displayName || `New ${pmsType} connection`,
        syncEnabled: false,  // Disabled until pairing complete
      })
      .returning();

    return NextResponse.json(connection, { status: 201 });
  } catch (error) {
    console.error('Failed to create connection:', error);
    return NextResponse.json(
      { error: 'Failed to create connection' },
      { status: 500 }
    );
  }
}
```


## Deliverables Checklist

After completing all tasks, you should have:

- [ ] `src/app/api/pms/connections/route.ts` - GET, POST
- [ ] `src/app/api/pms/connections/[id]/route.ts` - GET, PATCH, DELETE
- [ ] `src/app/api/pms/connections/[id]/pair/route.ts` - POST
- [ ] `src/app/api/pms/connections/[id]/practitioners/route.ts` - GET, POST
- [ ] `src/app/api/pms/connections/[id]/appointment-types/route.ts` - GET, PATCH
- [ ] `src/app/api/pms/connections/[id]/sync/route.ts` - GET, POST
- [ ] `src/app/api/pms/connections/[id]/test/route.ts` - POST

All endpoints should:
- Use proper error handling
- Validate inputs with Zod
- Follow existing code patterns
- Work with the stubbed Gentu adapter (mock data)


## Testing

After implementation, test with curl or your API client:

```bash
# Create a connection
curl -X POST http://localhost:3000/api/pms/connections \
  -H "Content-Type: application/json" \
  -d '{"pmsType": "gentu", "displayName": "Test Practice"}'

# List connections
curl http://localhost:3000/api/pms/connections

# Pair (will use mock data)
curl -X POST http://localhost:3000/api/pms/connections/{id}/pair \
  -H "Content-Type: application/json" \
  -d '{"pairingCode": "TEST1234"}'

# Get practitioners
curl http://localhost:3000/api/pms/connections/{id}/practitioners

# Trigger sync
curl -X POST http://localhost:3000/api/pms/connections/{id}/sync
```
```
