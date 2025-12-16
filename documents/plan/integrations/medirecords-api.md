# Medirecords API

## Technical Review for Appointment Integration

**December 2025**

---

## Overview

Medirecords is a cloud-based practice management system designed for Australian healthcare practices. This document provides a technical review of their Appointments API for read-only appointment synchronisation.

> **Notable:** Medirecords already has a native Coviu integration. Appointment responses include `telehealthLinkForProvider` and `telehealthLinkForPatient` fields that return Coviu session URLs. This presents both an opportunity (existing relationship) and a consideration (may affect integration approach).

---

## Authentication

### OAuth 2.0 Bearer Tokens

The API uses OAuth 2.0 Bearer token authentication. All requests require an Authorization header with a valid access token.

**Header Format:**
```
Authorization: Bearer <access_token>
```

> **Note:** The API specification does not document the token endpoint or OAuth flow details. Implementation will require additional documentation from Medirecords on token acquisition and refresh mechanisms.

### Base URL

```
https://api.medirecords.com
```

---

## Endpoint Reference

### Appointments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/practices/{practice_id}/appointments` | List appointments with filters |
| GET | `/v1/practices/{practice_id}/appointments/{id}` | Get single appointment |
| POST | `/v1/practices/{practice_id}/appointments` | Create appointment |
| PUT | `/v1/practices/{practice_id}/appointments/{id}` | Update appointment |
| DELETE | `/v1/practices/{practice_id}/appointments/{id}` | Delete appointment |

### Appointment Types

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/practices/{practice_id}/appointment-types` | List all types |
| GET | `/v1/practices/{practice_id}/appointment-types/{id}` | Get single type |

### Appointment List Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| appointmentDateRangeStart | string | Start date filter (YYYY-MM-DDThh:mm) |
| appointmentDateRangeEnd | string | End date filter (YYYY-MM-DDThh:mm) |
| providerId | UUID | Filter by provider |
| patientId | UUID | Filter by patient |
| appointmentStatus | integer | Filter by status (2-8) |
| appointmentTypeId | UUID | Filter by appointment type |
| roomId | UUID | Filter by room |
| urgency | integer | 1=Normal, 2=Urgent |
| page | integer | Page number (default: 0) |
| size | integer | Items per page (default: 20) |

---

## Data Models

### Appointment Schema

| Field | Type | Description |
|-------|------|-------------|
| **id** | UUID | Unique appointment identifier |
| **practiceId** | UUID | Practice identifier |
| **patientId** | UUID | Patient identifier |
| providerId | UUID | Provider identifier (nullable) |
| **appointmentTypeId** | UUID | Reference to appointment type |
| **scheduleTime** | string | Scheduled datetime (YYYY-MM-DDThh:mm) |
| **appointmentStatus** | integer | Status code (2-8, see status codes) |
| appointmentIntervalCode | integer | Duration code (lookup required) |
| roomId | UUID | Room identifier (nullable) |
| referralId | UUID | Referral identifier (nullable) |
| notes | string | Appointment notes (max 500 chars) |
| urgency | integer | 1=Normal, 2=Urgent |
| walkIn | boolean | Walk-in appointment flag |
| telehealthLinkForProvider | string | **Coviu session URL for provider** |
| telehealthLinkForPatient | string | **Coviu session URL for patient** |
| confirmationLink | string | Patient confirmation link |
| createdDateTime | string | Creation timestamp |
| updatedDateTime | string | Last update timestamp |

**Bold** = Required field. Fields highlighted = Coviu integration fields.

### Appointment Status Codes

| Code | Status | Description |
|------|--------|-------------|
| 2 | Booked | Appointment scheduled |
| 3 | Confirmed | Patient has confirmed attendance |
| 4 | Waiting Room | Patient arrived and waiting |
| 5 | With Doctor | Consultation in progress |
| 6 | At Billing | Consultation complete, processing payment |
| 7 | Completed | Appointment fully completed |
| 8 | Cancelled | Appointment cancelled (requires reason) |

### Appointment Type Schema

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| name | string | Type name (max 500 chars) |
| duration | string | Duration as string (e.g., "4 hrs") |
| colour | string | Hex colour code (e.g., "#a9a9a9") |
| activeStatus | integer | 1=Active, 2=Inactive |
| community | boolean | Available for community booking |
| telehealth | boolean | Telehealth appointment type |
| description | string | Type description |

---

## Implementation Considerations

### Pagination

The API uses standard page-based pagination with `page` (0-indexed) and `size` parameters. Responses include pagination metadata: `first`, `last`, `totalPages`, `totalElements`.

### Datetime Handling

Schedule times use the format `YYYY-MM-DDThh:mm` without timezone offset. Implementation should assume the practice's local timezone. Timestamps (`createdDateTime`, `updatedDateTime`) include timezone offset: `2020-12-15T07:43:52.529+0000`.

### Duration Handling

Appointment duration is stored as an `appointmentIntervalCode` (integer) which requires a lookup via a separate code system endpoint (`/code-system/appointment-Interval-Code`). This adds complexity compared to APIs that return duration directly in minutes.

### Existing Coviu Integration

Medirecords already generates Coviu session URLs for telehealth appointments. The `telehealthLinkForProvider` and `telehealthLinkForPatient` fields return direct Coviu session links. This existing integration may influence the approach—potentially leveraging existing session creation rather than duplicating it.

---

## API Quality Assessment

### Strengths

- **Full CRUD operations** for appointments
- **Native Coviu telehealth integration** already built in
- **Rich appointment status workflow** (7 states)
- **Comprehensive filtering options** for appointment queries
- **Telehealth flag** on appointment types for easy filtering
- **Standard REST patterns** and pagination
- **Double-booking prevention** flags for patient and provider
- **Reminder system** with SMS and email options

### Limitations

- **No webhooks documented** (polling required for real-time sync)
- **Schedule time lacks timezone** information
- **Duration requires code lookup** rather than direct minutes value
- **OAuth flow details not documented** in spec
- **Rate limits not documented**
- **No patient list/search endpoint** in this spec

### Missing Capabilities

- Webhooks for real-time event notifications
- Provider/practitioner list endpoint
- Patient search/list endpoint
- Batch operations for multiple appointments
- Efficient include parameter for related data

---

## Implementation Effort Estimate

The following estimates assume a read-only integration for appointment synchronisation, built by an experienced developer familiar with OAuth 2.0 and REST API consumption. Estimates include development, unit testing, and basic integration testing.

| Component | Effort | Notes |
|-----------|--------|-------|
| OAuth 2.0 Authentication Layer | 1-2 days | Token acquisition, refresh handling, secure storage |
| Practice Connection Setup | 1 day | UI for practice ID entry, validation, storage |
| Appointment Sync Service | 2-3 days | Polling logic, page-based pagination, filtering |
| Data Model Mapping | 1-2 days | Transform Medirecords schema to internal models |
| Duration Code Resolution | 0.5 day | Fetch and cache interval code lookups |
| Error Handling & Resilience | 1-2 days | Retry logic, rate limit handling, logging, alerts |
| Integration & E2E Testing | 2 days | Sandbox testing, edge cases, status transitions |
| **Total Estimate** | **8.5-12.5 days** | ~2 weeks with buffer |

### Effort by Integration Scope

The estimate above covers a core appointment sync integration. Additional scope would require incremental effort:

| Additional Scope | Add'l Effort | Complexity |
|------------------|--------------|------------|
| Appointment type sync and filtering | +1 day | Low |
| Telehealth-only filtering (using telehealth flag) | +0.5 day | Low |
| Two-way sync (create/update appointments) | +3-4 days | Medium |
| Status workflow automation | +2-3 days | Medium |
| Leverage existing Coviu links (session deduplication) | +1-2 days | Low |
| Multi-practice management UI | +2-3 days | Low |

### Assumptions & Dependencies

- API credentials and sandbox access are available
- OAuth token endpoint details are provided by Medirecords
- At least one test practice is available for development
- Internal data models and database schema are defined
- Developer has experience with OAuth 2.0 and REST API integration

### Risk Factors

The following could impact the estimate:

- **OAuth flow complexity:** Token endpoint and flow details not in spec; may require additional discovery
- **Undocumented rate limits:** May require throttling implementation if limits are restrictive
- **Timezone handling:** Schedule times lack timezone; may need practice timezone lookup
- **Duration code system:** Interval code endpoint not fully documented; may require additional API discovery
- **Existing Coviu integration:** May need coordination to avoid session duplication

---

## Comparison with Magentus

| Aspect | Magentus | Medirecords |
|--------|----------|-------------|
| Market Focus | Specialists (65% share) | General practice |
| Implementation Effort | 10-15 days (~2-3 weeks) | 8.5-12.5 days (~2 weeks) |
| Onboarding | 8-char pairing code | Practice ID (GUID) |
| Pagination | Cursor-based | Page-based |
| Datetime Format | ISO 8601 with offset | ISO 8601 without offset |
| Duration | Direct (minutesDuration) | Code lookup required |
| Coviu Integration | Separate (build new) | Built-in (existing) |
| Write Operations | Limited | Full CRUD |
| Status Workflow | Basic | Rich (7 states) |
| Partnership Status | Existing (Coviu) | Existing (Coviu) |

---

## Summary

Medirecords provides a well-designed REST API suitable for appointment synchronisation. The API follows standard patterns with page-based pagination and comprehensive filtering options. Notable features include a built-in Coviu telehealth integration and a rich appointment status workflow.

The existing Coviu integration is particularly interesting. Appointment responses already include Coviu session URLs, which may allow Coviu to leverage existing telehealth sessions rather than creating new ones. This could simplify the integration and provide a smoother experience for practices already using Medirecords for telehealth.

**Estimated effort:** 8.5-12.5 days (~2 weeks) for a read-only appointment sync integration. This is slightly less than the Magentus estimate due to simpler page-based pagination and no pairing flow, though offset by the need for duration code lookups and timezone handling.

**Key next steps** would include: (1) obtaining OAuth flow documentation from Medirecords, (2) clarifying how to work with the existing Coviu integration, and (3) getting sandbox access with a test practice for development.
