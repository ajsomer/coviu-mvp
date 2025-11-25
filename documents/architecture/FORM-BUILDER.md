# Form Builder Architecture

## Overview

The Form Builder feature enables specialists/staff to create custom intake forms that can be sent to patients for completion before their appointments. Forms are rendered using SurveyJS and submissions are linked back to the patient's appointment request.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Dashboard                                      │
│  ┌─────────────────┐    ┌───────────────────────────────────────────┐   │
│  │  Form Builder   │    │         Request Detail (PATIENT FILE)      │   │
│  │  /form-builder  │    │  ┌─────────────────────────────────────┐  │   │
│  └────────┬────────┘    │  │ Patient Info (from initial request) │  │   │
│           │             │  ├─────────────────────────────────────┤  │   │
│           │             │  │ Intake Forms Section                │  │   │
│           │             │  │  - Pending forms (copy link)        │  │   │
│           │             │  │  - Completed submissions (view)     │  │   │
│           │             │  │  - [Send New Form] button           │  │   │
│           │             │  └─────────────────────────────────────┘  │   │
│           │             └────────────────────┬──────────────────────┘   │
│           ▼                                  │                           │
│  ┌─────────────────────────────────────────┐ │                           │
│  │          form_templates table           │ │                           │
│  │  (JSON schemas stored in Neon DB)       │ │                           │
│  └─────────────────────────────────────────┘ │                           │
└──────────────────────────────────────────────┼───────────────────────────┘
                                               │
            ┌──────────────────────────────────┘
            │  Form submissions linked to
            │  appointment_request via form_requests
            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Patient Portal                                    │
│  ┌─────────────────────────────────────────┐                            │
│  │   /intake/[token]                        │                            │
│  │   (Renders form from JSON schema)        │                            │
│  └─────────────────────────────────────────┘                            │
│                              │                                           │
│                              ▼                                           │
│  ┌─────────────────────────────────────────┐                            │
│  │      form_submissions table             │◄── Linked back to request  │
│  │   (Patient responses stored as JSON)    │    via form_requests table │
│  └─────────────────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### New Tables

```
┌─────────────────────────┐
│     form_templates      │
├─────────────────────────┤
│ id (PK, UUID)           │
│ name (VARCHAR)          │
│ description (TEXT)      │
│ schema (JSONB)          │──── SurveyJS JSON schema
│ specialist_id (FK)      │──┐
│ is_default (BOOLEAN)    │  │
│ created_at (TIMESTAMP)  │  │
│ updated_at (TIMESTAMP)  │  │
└─────────────────────────┘  │
            ▲                │
            │                │
            │ 1:N            │ Optional link to specialist
            │                ▼
┌─────────────────────────┐  ┌─────────────────────────┐
│     form_requests       │  │      specialists        │
├─────────────────────────┤  └─────────────────────────┘
│ id (PK, UUID)           │
│ appointment_request_id  │──┐
│ form_template_id (FK)   │──┘
│ token (VARCHAR, UNIQUE) │──── Secure access token
│ status (ENUM)           │
│ sent_at (TIMESTAMP)     │
│ completed_at (TIMESTAMP)│
│ expires_at (TIMESTAMP)  │
└───────────┬─────────────┘
            │
            │ 1:1
            ▼
┌─────────────────────────┐
│    form_submissions     │
├─────────────────────────┤
│ id (PK, UUID)           │
│ form_request_id (FK)    │
│ data (JSONB)            │──── Patient responses
│ stripe_payment_intent_id│──── For future payment integration
│ submitted_at (TIMESTAMP)│
└─────────────────────────┘
```

### Form Request Status Enum

- `pending` - Form sent, awaiting patient completion
- `completed` - Patient has submitted the form
- `expired` - Form link has expired

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Form Builder UI** | SurveyJS Creator | Drag-and-drop form builder |
| **Form Renderer** | SurveyJS React | Renders forms for patients |
| **Form Storage** | PostgreSQL JSONB | Stores form schemas and responses |
| **Token Generation** | Node.js crypto | Secure random tokens for form links |

### SurveyJS Packages

```json
{
  "survey-core": "^2.3.16",
  "survey-react-ui": "^2.3.16",
  "survey-creator-core": "^2.3.16",
  "survey-creator-react": "^2.3.16"
}
```

---

## API Endpoints

### Form Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/form-templates` | List all templates |
| POST | `/api/form-templates` | Create new template |
| GET | `/api/form-templates/[id]` | Get template by ID |
| PATCH | `/api/form-templates/[id]` | Update template |
| DELETE | `/api/form-templates/[id]` | Delete template |

### Form Requests

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/form-requests` | Create form request (send to patient) |
| GET | `/api/form-requests/[token]` | Get form by token (public) |
| POST | `/api/form-requests/[token]/submit` | Submit form response |

---

## Page Routes

### Dashboard (Staff)

| Route | Purpose |
|-------|---------|
| `/form-templates` | List all form templates |
| `/form-builder` | Create new form template |
| `/form-builder/[id]` | Edit existing template |
| `/requests/[id]` | Patient file with intake forms section |

### Public (Patient)

| Route | Purpose |
|-------|---------|
| `/intake/[token]` | Fill out intake form |

---

## Component Structure

```
src/components/
├── forms/
│   ├── FormCreator.tsx        # SurveyJS Creator wrapper
│   └── FormRenderer.tsx       # SurveyJS Survey wrapper
└── dashboard/
    ├── SendFormDialog.tsx     # Modal to send form to patient
    └── IntakeFormsSection.tsx # Display forms in patient file
```

### FormCreator

Wraps SurveyJS Creator for building forms:

```tsx
<FormCreator
  initialSchema={existingSchema}  // Optional: for editing
  onSave={(schema) => {...}}      // Called on save
/>
```

### FormRenderer

Wraps SurveyJS Survey for displaying forms:

```tsx
<FormRenderer
  schema={formSchema}
  prefillData={{...}}             // Pre-fill patient details
  onComplete={(data) => {...}}   // Called on submission
  readOnly={false}               // Display mode for viewing
/>
```

---

## Data Flow

### Creating a Form Template

```
1. Staff visits /form-builder
2. Uses SurveyJS Creator to design form
3. Clicks "Save Template"
4. POST /api/form-templates with JSON schema
5. Template saved to form_templates table
```

### Sending a Form to Patient

```
1. Staff opens patient file (/requests/[id])
2. Clicks "Send Form" in Intake Forms section
3. Selects template from dropdown
4. POST /api/form-requests
   - Generates secure 64-char token
   - Creates form_request record
   - Returns form URL
5. Staff copies link to send to patient
```

### Patient Completing a Form

```
1. Patient opens /intake/[token]
2. GET /api/form-requests/[token]
   - Validates token exists and not expired
   - Returns form schema and patient info
3. Patient fills out form
4. POST /api/form-requests/[token]/submit
   - Creates form_submission record
   - Updates form_request status to 'completed'
5. Patient sees confirmation message
```

### Viewing Submissions (Staff)

```
1. Staff opens patient file (/requests/[id])
2. GET /api/appointments/[id] includes formRequests
3. IntakeFormsSection displays:
   - Pending forms with "Copy Link" button
   - Completed forms with expandable responses
```

---

## Security Considerations

### Token Security

- Tokens are 64-character hex strings (32 bytes of randomness)
- Generated using Node.js `crypto.randomBytes()`
- Unique constraint in database prevents collisions

### Form Expiry

- Forms can have optional expiry dates
- Default expiry: 14 days from creation
- Expired forms return 410 Gone status

### Data Validation

- Form schemas validated by SurveyJS on client
- Server validates token exists and is valid
- Submissions stored as JSONB for flexibility

---

## Default Form Templates

Two templates are seeded by default:

### 1. General Intake Form

Comprehensive intake form with sections:
- Personal details (name, DOB, address, contact)
- Medicare & health fund details
- Emergency contact
- Medical history
- Current medications
- Allergies
- Payment details (placeholder for Stripe)
- Consent & declaration

### 2. Pre-Appointment Follow-up

Short questionnaire for:
- Condition changes since referral
- New medications
- Questions for the specialist
- Attendance confirmation

---

## Future Enhancements

- [ ] Email/SMS notifications when form is sent
- [ ] Stripe integration for payment capture
- [ ] Form completion reminders
- [ ] PDF generation of completed forms
- [ ] Pre-fill forms from previous submissions
- [ ] Conditional forms based on specialist type
- [ ] Form analytics and completion rates

---

*Document Version: 1.0*
*Last Updated: November 2025*
