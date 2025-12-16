# Gentu: Magentus Healthcare API

## Technical Specification Review

- **API Version**: 1.0.0
- **Specification Format**: OpenAPI 3.0.0
- **Base URL**: `https://api.pm.magentus.com/v1`
- **Review Date**: December 2025

---

## Overview

The Magentus Healthcare API provides programmatic access to practice management data for Gentu, Magentus's cloud-based practice management platform for medical specialists. The API follows RESTful design principles and uses OAuth 2.0 for authentication.

This document provides a technical review of the API specification, covering authentication, available resources, data models, and implementation considerations.

---

## Authentication

### OAuth 2.0 Client Credentials Flow

The API uses OAuth 2.0 with the client credentials grant flow. Access tokens are obtained from:

```
https://api.pm.magentus.com/v1/oauth2/token
```

**Token Request:**
```bash
curl -X POST \
  --user {CLIENT_ID}:{CLIENT_SECRET} \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  https://api.pm.magentus.com/v1/oauth2/token
```

**Token Response:**
```json
{
  "token_type": "Bearer",
  "access_token": "[BEARER_TOKEN]",
  "expires_in": 3599,
  "issued_at": "1712298412485",
  "application_name": "[YOUR_APP_ID]",
  "api_product_list": "[HealthcareAPI]",
  "developer.email": "your.email@example.com",
  "status": "approved"
}
```

All API endpoints require a valid bearer token in the Authorization header:
```
Authorization: Bearer [BEARER_TOKEN]
```

**Token Expiry:** Tokens expire in approximately 1 hour (`expires_in: 3599` seconds). Implement proactive refresh or handle 401 responses to refresh expired tokens.

### Tenant Pairing Mechanism

Practice authorisation uses a pairing code system:

1. **User generates code:** Practice staff navigate to the Marketplace in Gentu and click "Add to Gentu" on your app listing
2. **User enters code:** The pairing code is entered into your application's settings/configuration UI
3. **Application consumes code:** Your app calls the pairing endpoint to complete the handshake

```
PUT /v1/apps/{appId}/pairing/{pairingCode}
```

**Successful Response:**
```json
{
  "message": "Successfully consumed pairing code.",
  "tenantId": "3aef91c0-ff22-47e6-942d-182cb65cbf20"
}
```

Upon successful pairing, the endpoint returns the `tenantId` (UUID) which identifies the practice for all subsequent API calls.

**Important Notes:**
- Pairing works at **practice-wide level**, not per-practitioner
- Only one pairing per practice/tenant is supported
- If your product has separate accounts per practitioner, you may need practice-level configuration
- Unpaired tenants won't appear in `GET /tenants`; previously paired but deactivated tenants show as `disabled`

---

## API Resources

The API exposes the following resource categories:

| Resource | Description |
|----------|-------------|
| Tenants | Practice/organisation management and access control |
| Appointments | Appointment scheduling and management |
| Appointment Types | Appointment type definitions with duration and booking settings |
| Patients | Patient demographics, contacts, and identifiers |
| Practitioners | Practitioner profiles, credentials, and provider numbers |
| Users | System users (includes both clinical and administrative staff) |
| Referrals | Patient referral records with requester details and validity periods |
| Procedures | Surgical/medical procedures with performer and scheduling details |
| Attachments | File uploads to patient records (documents, images, reports) |
| Sites of Service | Practice locations where practitioners provide services |

---

## Endpoint Reference

### Tenants

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tenants` | List all paired tenants with access status |
| GET | `/tenants/{tenantId}` | Get tenant details (name, number, timezone) |
| GET | `/tenants/{tenantId}/status` | Health check endpoint |

**Tenant Details Response:**
```json
{
  "tenantId": "3aef91c0-ff22-47e6-942d-182cb65cbf20",
  "tenantNumber": "12345",
  "tenantName": "Smith Medical Centre",
  "timezone": "Australia/Melbourne"
}
```

| Field | Type | Description |
|-------|------|-------------|
| tenantId | UUID | The practice identifier |
| tenantNumber | string \| null | Internal Gentu tenant number |
| tenantName | string \| null | Human-readable practice name |
| timezone | string \| null | IANA timezone (e.g., `Australia/Melbourne`) |

> **Usage:** Fetch once during setup to get `tenantName` for display purposes.

### Appointments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tenants/{tenantId}/appointments` | List appointments with filtering and pagination |
| GET | `/tenants/{tenantId}/appointments/{id}` | Get single appointment by ID |
| GET | `/tenants/{tenantId}/appointment-types` | List appointment type definitions |

**Appointment Types Response:**
```json
[
  {
    "id": "uuid",
    "text": "Telehealth Consultation",
    "duration": 30,
    "colour": "#4CAF50",
    "onlineBookable": true
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| text | string | Name of the appointment type (user-customizable) |
| duration | number \| null | Default duration in minutes |
| colour | string \| null | Hex colour code for display in Gentu |
| onlineBookable | boolean | Available for online bookings |

> **Note:** Appointment types are user-customizable with no built-in telehealth flag. Users must configure which appointment types represent telehealth appointments.

**List Appointments Query Parameters:**

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `fromDate` | Yes | datetime | ISO 8601 with offset, **must be URI encoded** |
| `toDate` | Yes | datetime | ISO 8601 with offset, **must be URI encoded** |
| `practitionerId` | Yes | UUID | Filter by practitioner |
| `limit` | Yes | integer | Results per page (5-100) |
| `cursor` | No | UUID | Pagination cursor for next page |
| `include` | No | string | Comma-delimited: `patients`, `practitioners`, `referrals` |

**Example Request:**
```
GET /v1/tenants/{tenantId}/appointments?practitionerId=abc123&fromDate=2024-12-16T00%3A00%3A00.000%2B10%3A00&toDate=2024-12-16T23%3A59%3A59.999%2B10%3A00&limit=50&include=patients,practitioners
```

**Response Structure:**
```json
{
  "appointments": [...],
  "pagination": {
    "next": "uuid-cursor-for-next-page",
    "limit": 50
  },
  "patients": [...],      // Only if include=patients
  "practitioners": [...], // Only if include=practitioners
  "referrals": [...]      // Only if include=referrals
}
```

### Patients

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tenants/{tenantId}/patients/{patientId}` | Get patient by ID |

> **Note:** No list endpoint for patients. Patient IDs are obtained via appointment participant references or the include parameter.

### Practitioners & Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tenants/{tenantId}/practitioners` | List practitioners (no pagination) |
| GET | `/tenants/{tenantId}/practitioners/{id}` | Get practitioner by ID |
| GET | `/tenants/{tenantId}/practitioners/{id}/sites` | List sites of service for practitioner |
| GET | `/tenants/{tenantId}/users` | List all users (practitioners + admin) |

**List Practitioners Response:**
```json
[
  {
    "id": "40027bce-841f-41de-9e06-a29864922558",
    "name": { "family": "Smith", "given": "John", "prefix": "Dr" },
    "contact": [
      { "system": "email", "use": "work", "rank": 1, "value": "john@clinic.com" },
      { "system": "phone", "use": "work", "rank": 2, "value": "0400000000" }
    ],
    "active": true,
    "shownInAppointmentBook": true
  }
]
```

**Key Fields:**
- `active` - Whether practitioner is active in the system
- `shownInAppointmentBook` - Whether practitioner appears in appointment book (use for filtering)

### Referrals

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tenants/{tenantId}/referrals` | List referrals (requires patientId query param) |

### Procedures

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tenants/{tenantId}/procedures` | List procedures with filtering and pagination |
| GET | `/tenants/{tenantId}/procedures/{id}` | Get procedure by ID |

### Attachments

| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/tenants/{tenantId}/patients/{id}/attachments` | Upload attachment to patient record |
| GET | `/tenants/{tenantId}/patients/{id}/attachments/{attachmentId}` | Get attachment metadata and status |

---

## Data Models

### Appointment

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string (UUID) | Yes | Unique appointment identifier |
| startAt | datetime | Yes | Start time (ISO 8601 with offset) |
| endAt | datetime \| null | Yes | End time (ISO 8601 with offset) |
| status | string \| null | Yes | Appointment status (e.g., 'cancelled') |
| minutesDuration | number \| null | Yes | Duration in minutes |
| comment | string \| null | Yes | Internal comment/note |
| description | string \| null | Yes | Appointment description |
| participant[] | array | Yes | Participants (see below) |
| appointmentType | object | Yes | Reference to appointment type (`{ reference: string }`) |
| extension[] | array | Yes | Extension data (see below) |

**Participant Object:**
```json
{
  "referenceType": "patient",  // patient | provider | location | health_care_service
  "referenceId": "uuid-of-participant",
  "arrivedAt": "2024-12-16T09:00:00.000+10:00"  // Optional, ISO 8601
}
```

**Extension Object (for additional data like cancellation timestamp):**
```json
{
  "system": "cancelled-at",
  "valueDateTime": "2024-12-15T14:30:00.000+10:00"
}
// Or boolean extensions:
{
  "system": "some-flag",
  "valueBoolean": true
}
```

### Patient

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID) | Unique patient identifier |
| name | object | Name object (family, given, prefix) |
| birthDate | string \| null | Date of birth (YYYY-MM-DD) |
| gender | enum \| null | female \| male \| unspecified |
| address[] | array \| null | Addresses with Australian state codes |
| contact[] | array | Contact details (email, phone, fax) with priority ranking |
| identifier[] | array | Medicare, DVA, pension, health fund identifiers |
| deceased | object \| null | Deceased status and date |
| indigenousStatus | enum \| null | aboriginal \| torres_strait_islander \| both \| neither \| declined |
| extension[] | array | Extensions including emergency contacts |

### Patient Identifier Types

The API supports Australian healthcare identifier types:

| Code | Description |
|------|-------------|
| mc | Medicare Card |
| pen | Pensioner Concession Card |
| dvau | DVA - Unspecified Entitlement Card |
| dvg | DVA - Gold Entitlement Card |
| dvo | DVA - Orange Entitlement Card |
| dvw | DVA - White Entitlement Card |
| hc | Health Care Card |
| mb | Private Insurance Member (with 30+ health fund assigners) |

### Procedure

The Procedure model is comprehensive, designed for specialist surgical scheduling. Key features include:

- **Multiple performer roles:** practitioner, anaesthetist, assistant, paediatrician, user
- **Body site laterality:** left/right indicators for surgical procedures
- **Scheduling status:** scheduled vs pending procedures
- **Clinical metadata:** anaesthetic type, infection risk, ICU requirements, fasting instructions
- **Urgency levels:** elective, immediate, emergency, scheduled-emergency
- **Hospital details:** name and address where procedure is performed

---

## Implementation Considerations

### Pagination

The API uses cursor-based pagination for list endpoints. The appointments endpoint requires a `limit` parameter (5-100) and returns a `pagination.next` cursor for subsequent requests. The procedures endpoint uses `next` and `previous` cursors with datetime values.

### Timezone Handling

All datetime fields use ISO 8601 format with timezone offsets (e.g., `2024-01-01T09:00:00.000+10:00`). The tenant endpoint provides an IANA timezone identifier (e.g., `Australia/Melbourne`) for the practice. Query parameters containing datetime values must be URI encoded as they include symbols that may be stripped from URLs.

### Data Inclusion

The appointments and procedures endpoints support an `include` parameter that accepts a comma-delimited list of related resources (`patients,practitioners,referrals`). Using this parameter returns the full related objects in the response, reducing the need for subsequent API calls.

### Attachment Upload

File uploads use a PUT endpoint with binary content in the request body. The API supports PDF, JPEG, PNG, TIFF, and MP4 formats with a 4MB size limit. Uploads are processed asynchronously—the initial response provides an `attachmentId` for polling status (`accepted` → `scanned_clean` → `completed`).

Attachment categories map to clinical document types: `attachment`, `consult_note`, `correspondence`, `diagnostic_report`, `diagnostic_request`, `pregnancy`, and `procedure`.

---

## API Quality Assessment

### Strengths

- **Clean REST design:** Predictable resource-oriented URLs following standard conventions
- **Standard authentication:** OAuth 2.0 client credentials flow with no proprietary mechanisms
- **Efficient data retrieval:** Include parameter reduces round trips for related data
- **Australian healthcare context:** Native support for Medicare, DVA, and health fund identifiers
- **Timezone-aware:** ISO 8601 with offsets and IANA timezone identifiers
- **Simple pairing:** 8-character code eliminates IT involvement at practice level
- **Comprehensive procedure model:** Rich surgical scheduling data for specialist practices
- **OpenAPI 3.0 specification:** Machine-readable spec enables code generation

### Limitations

- **No webhooks:** Real-time sync requires polling; no push notifications for changes
- **No patient search:** Patients can only be retrieved by ID; no list or search endpoint
- **Rate limits undocumented:** No documented throttling; limits must be discovered through testing
- **Token expiry ~1 hour:** OAuth tokens expire in 3599 seconds; implement proactive refresh
- **Read-heavy design:** Limited write operations; primarily attachments only
- **Status enum values undocumented:** Appointment status values not enumerated in spec

### Missing Capabilities

Based on the specification, the following capabilities are not available via API:

- Appointment creation or modification
- Patient creation or modification
- Billing and invoicing data
- Clinical notes and consultation records
- Practitioner availability/scheduling
- Practice configuration and settings

---

## Implementation Effort Estimate

The following estimates assume a read-only integration for appointment synchronisation, built by an experienced developer familiar with OAuth 2.0 and REST API consumption. Estimates include development, unit testing, and basic integration testing.

| Component | Effort | Notes |
|-----------|--------|-------|
| OAuth 2.0 Authentication Layer | 1-2 days | Token acquisition, refresh handling, secure storage |
| Tenant Pairing Flow | 1-2 days | UI for code entry, API consumption, tenant storage |
| Appointment Sync Service | 3-4 days | Polling logic, pagination handling, incremental sync |
| Data Model Mapping | 1-2 days | Transform Magentus schema to internal models |
| Error Handling & Resilience | 2 days | Retry logic, rate limit handling, logging, alerts |
| Integration & E2E Testing | 2-3 days | Sandbox testing, edge cases, timezone scenarios |
| **Total Estimate** | **10-15 days** | ~2-3 weeks with buffer |

### Effort by Integration Scope

The estimate above covers a core appointment sync integration. Additional scope would require incremental effort:

| Additional Scope | Add'l Effort | Complexity |
|------------------|--------------|------------|
| Patient data sync (demographics, contacts) | +2-3 days | Low |
| Practitioner/provider sync | +1-2 days | Low |
| Referral tracking integration | +2-3 days | Medium |
| Procedure/surgical scheduling sync | +3-5 days | Medium |
| Document/attachment upload to patient records | +3-4 days | Medium |
| Multi-tenant management UI | +2-3 days | Low |

### Assumptions & Dependencies

- API credentials and sandbox access are available
- At least one test tenant (practice) is paired for development
- Internal data models and database schema are defined
- No significant API changes during development
- Developer has experience with OAuth 2.0 and REST API integration

### Risk Factors

The following could impact the estimate:

- **Undocumented rate limits:** May require throttling implementation if limits are restrictive
- **Token expiry behaviour:** Not documented; may require additional handling if tokens expire frequently
- **Data quality variations:** Different practices may have inconsistent data entry patterns
- **Timezone edge cases:** Multi-timezone practices or daylight saving transitions may require additional handling
- **Sandbox vs production differences:** Production environment may behave differently than sandbox

---

## Summary

The Magentus Healthcare API is a well-designed, production-ready interface for accessing practice management data from Gentu. The API follows modern REST conventions, uses standard OAuth 2.0 authentication, and provides comprehensive data models tailored to the Australian healthcare context.

The specification is suitable for read-only integrations requiring access to appointment scheduling, patient demographics, practitioner details, referral information, and surgical procedures. The ability to upload attachments to patient records also enables document/report delivery use cases.

Integrators should note the absence of webhooks (requiring polling for real-time sync), the lack of patient search capabilities, and the predominantly read-only nature of the API. Rate limits and token expiry should be determined through testing with the production environment.
