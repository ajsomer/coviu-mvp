# Halaxy API

## Technical Review for Appointment Integration

**December 2025**

---

## Overview

Halaxy is a cloud-based practice management platform popular with allied health practitioners in Australia (physiotherapy, psychology, occupational therapy, etc.). This document provides a technical review of their API for read-only appointment synchronisation.

> **Notable:** Halaxy uses a FHIR-like resource structure with references between resources. The API includes native telehealth location types and has comprehensive patient/practitioner endpoints, making it more complete than some competitors for a full integration.

---

## Base URL

```
https://au-api.halaxy.com
```

> **Note:** Authentication details are not included in the provided specification. Implementation will require additional documentation from Halaxy on authentication mechanism (likely OAuth 2.0 or API key).

---

## Endpoint Reference

### Appointments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/main/Appointment` | List appointments |
| GET | `/main/Appointment/{id}` | Get single appointment |
| GET | `/main/Appointment/$find` | Find available slots |
| POST | `/main/Appointment/$book` | Book appointment |
| PATCH | `/main/Appointment/{id}` | Update appointment |

### Patients

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/main/Patient` | List patients |
| GET | `/main/Patient/{id}` | Get single patient |
| GET | `/main/Patient/$export-ids` | Export patient IDs |
| POST | `/main/Patient` | Create patient |
| PATCH | `/main/Patient/{id}` | Update patient |
| PUT | `/main/Patient/{id}` | Replace patient |

### Practitioners

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/main/Practitioner` | List practitioners |
| GET | `/main/Practitioner/{id}` | Get single practitioner |
| POST | `/main/Practitioner` | Create external practitioner |

---

## Data Models

### Appointment Schema

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique appointment ID in Halaxy |
| description | string | Appointment comments/notes |
| **start** | datetime | When appointment starts (required) |
| **end** | datetime | When appointment ends (required) |
| minutesDuration | integer | Duration in minutes (direct value) |
| created | datetime | When appointment was created |
| supportingInformation | array | Appointment type ref + location type |
| participant | array | Practitioner and patient references |

**Bold** = Required field.

### Location Types

The `location-type` in `supportingInformation` indicates how the appointment is delivered:

| Value | Description |
|-------|-------------|
| clinic | In-person at clinic location |
| telehealth | Video consultation (key for Coviu integration) |
| online | Online appointment |
| phone | Phone consultation |
| organization | At organization/external location |

### Participant Status (Patient)

The `appointment-participant-status` extension tracks patient attendance:

| Status | Description |
|--------|-------------|
| booked | Appointment scheduled |
| confirmed | Patient has confirmed |
| attended | Patient attended the appointment |
| cancelled | Appointment cancelled |

### Patient Schema (Key Fields)

| Field | Type | Description |
|-------|------|-------------|
| id | string | Patient ID in practice group |
| active | boolean | Whether patient profile is active |
| name | array | Official/usual name with given, family, prefix |
| telecom | array | Phone/email (sms, phone, fax, email) |
| gender | string | male \| female \| other \| custom |
| birthDate | date | Date of birth (YYYY-MM-DD) |
| address | array | Home/work/billing/mailing addresses |
| contact | array | Emergency contacts with relationship |
| patient-status | extension | Halaxy extension: current, etc. |
| profile-type | extension | full \| dependant \| contact only |

---

## Implementation Considerations

### FHIR-like Resource References

Halaxy uses FHIR-style references between resources. Appointments reference patients and practitioners via URLs:

```json
"reference": "/main/Patient/123456789"
"type": "Patient"
```

This is cleaner than flat ID fields but requires understanding the reference pattern to extract IDs and resolve related data.

### Telehealth Identification

Telehealth appointments are identified by `location-type: "telehealth"` in the `supportingInformation` array. This makes filtering for video consultations straightforward—no need to check appointment types.

### Appointment Type via HealthcareService

Appointment types are referenced as HealthcareService resources. To get the appointment type name/details, you need to follow the reference: `"/main/HealthcareService/123456"`. This may require an additional API call unless Halaxy supports resource expansion.

### Invoice Integration

Appointments include an `appointment-participant-invoice` extension linking to the Invoice resource. This could enable billing integration in future phases.

### Practitioner ID Prefixes

Practitioner IDs use prefixes: `PR-` for internal practitioners, `EP-` for external/professional contacts. This distinction may be relevant for filtering or reporting.

---

## API Quality Assessment

### Strengths

- **FHIR-like structure** provides standardisation and extensibility
- **Native telehealth location type** makes filtering simple
- **Direct minutesDuration field** (no code lookup needed)
- **Full patient list/search endpoint** (unlike some competitors)
- **Practitioner list endpoint** available
- **$find operation** for available slot discovery
- **Invoice reference** enables future billing integration
- **Patient $export-ids** for bulk access management

### Limitations

- **Authentication method not documented** in spec
- **Query parameters for filtering** not fully documented
- **Pagination approach** not specified
- **No webhooks** mentioned
- **Rate limits not documented**
- **May need extra calls** to resolve HealthcareService references

### Missing Information

- Authentication mechanism (OAuth? API key?)
- Date range filtering parameters for appointments
- Pagination details (cursor? page?)
- HealthcareService endpoint documentation
- Webhook/event notification capabilities

---

## Implementation Effort Estimate

The following estimates assume a read-only integration for appointment synchronisation. Note that some API details (auth, pagination, filtering) require clarification from Halaxy documentation, which may affect estimates.

| Component | Effort | Notes |
|-----------|--------|-------|
| Authentication Layer | 1-2 days | Depends on auth mechanism (TBD) |
| Practice/Org Connection Setup | 1 day | Organization reference setup, validation |
| Appointment Sync Service | 2-3 days | Polling, pagination, date filtering |
| FHIR Reference Resolution | 1-2 days | Patient, practitioner, healthcare service |
| Data Model Mapping | 1-2 days | Transform FHIR-like to internal models |
| Telehealth Filtering | 0.5 day | Filter by location-type: telehealth |
| Error Handling & Resilience | 1-2 days | Retry logic, rate limit handling, logging |
| Integration & E2E Testing | 2 days | Sandbox testing, edge cases |
| **Total Estimate** | **9.5-14.5 days** | ~2-3 weeks with buffer |

### Effort by Integration Scope

| Additional Scope | Add'l Effort | Complexity |
|------------------|--------------|------------|
| Patient data sync (using Patient endpoint) | +1-2 days | Low |
| Practitioner sync (using Practitioner endpoint) | +1 day | Low |
| Available slot discovery ($find integration) | +2 days | Medium |
| Two-way sync (book/update appointments) | +3-4 days | Medium |
| Invoice integration (read-only) | +2-3 days | Medium |
| Multi-practice management UI | +2-3 days | Low |

### Assumptions & Dependencies

- API credentials and documentation are available from Halaxy
- Authentication mechanism is standard (OAuth 2.0 or API key)
- Date range filtering is supported on appointment list endpoint
- At least one test practice is available for development
- FHIR-like structure follows standard patterns

### Risk Factors

- **Unknown authentication:** May be simple API key or complex OAuth flow
- **Incomplete spec:** Query params, pagination, rate limits need discovery
- **Reference resolution:** May need multiple API calls to get complete appointment data
- **FHIR complexity:** Extensions and custom terminology may add parsing complexity
- **Allied health focus:** May have different workflow patterns than GP/specialist PMSs

---

## Summary

Halaxy provides a modern FHIR-like API structure that's well-suited for integration. The native telehealth location type makes identifying video consultation appointments straightforward, and the direct `minutesDuration` field avoids code lookup complexity.

Key advantages over other PMSs include comprehensive patient and practitioner list endpoints (unlike Magentus) and the `$find` operation for discovering available slots. The FHIR-like structure also provides extensibility through the extension mechanism.

**Estimated effort:** 9.5-14.5 days (~2-3 weeks) for a read-only appointment sync integration. This is comparable to Magentus and slightly more than Medirecords, primarily due to FHIR reference resolution requirements.

**Market context:** Halaxy is popular with allied health practitioners (physio, psychology, OT). If Coviu's target market includes allied health telehealth, this integration could be strategically important.

**Key next steps:** (1) obtain full API documentation from Halaxy including authentication details, (2) confirm query parameters for date filtering, (3) verify pagination approach, (4) get sandbox access for development.
