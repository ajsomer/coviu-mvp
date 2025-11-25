# Form Builder Implementation Plan

## Overview

This document outlines the implementation plan for integrating SurveyJS (as a form rendering engine) into the Coviu MVP to enable specialists to create and send intake forms to patients after accepting their referral.

**Note**: While we use SurveyJS as the underlying library, the user-facing terminology is "forms" not "surveys". SurveyJS is simply a robust JSON-based form rendering engine that supports the form fields and validation we need.

**Key Concept**: The Request Detail page (`/requests/[id]`) serves as the **Patient File** - a comprehensive view of all patient information including the initial referral request AND all completed intake form submissions. This centralizes patient data for the receptionist/specialist workflow.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Dashboard                                      │
│  ┌─────────────────┐    ┌───────────────────────────────────────────┐   │
│  │  Form Builder   │    │         Request Detail (PATIENT FILE)      │   │
│  │  (Creator)      │    │  ┌─────────────────────────────────────┐  │   │
│  └────────┬────────┘    │  │ Patient Info (from initial request) │  │   │
│           │             │  ├─────────────────────────────────────┤  │   │
│           │             │  │ Referral Details                    │  │   │
│           │             │  ├─────────────────────────────────────┤  │   │
│           │             │  │ Intake Forms Section                │  │   │
│           │             │  │  - Pending forms (send reminder)    │  │   │
│           │             │  │  - Completed submissions (view)     │  │   │
│           │             │  │  - [Send New Form] button           │  │   │
│           │             │  ├─────────────────────────────────────┤  │   │
│           │             │  │ Notes & Status History              │  │   │
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
│  │   + Stripe Elements for payment          │                            │
│  └─────────────────────────────────────────┘                            │
│                              │                                           │
│                              ▼                                           │
│  ┌─────────────────────────────────────────┐                            │
│  │      form_submissions table             │◄── Linked back to request  │
│  │   (Patient responses stored)            │    via form_requests table │
│  └─────────────────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────┘
```

## Patient File Concept

The `/requests/[id]` page becomes the central **Patient File** containing:

1. **Initial Request Data** - Name, DOB, contact info, referral document
2. **Intake Form Submissions** - All completed forms with responses displayed inline
3. **Payment Information** - Captured card details, payment status
4. **Medicare/Insurance** - From intake form submissions
5. **Medical History** - Aggregated from form submissions
6. **Notes & Status History** - Staff notes and status changes

This design means:
- Receptionists see everything about a patient in one place
- Form submissions are not siloed - they enrich the patient file
- Easy to review all patient info before an appointment

---

## Phase 1: Database Schema

### New Tables

```sql
-- Form templates created by specialists/staff
CREATE TABLE form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  schema JSONB NOT NULL,                    -- SurveyJS JSON schema
  specialist_id UUID REFERENCES specialists(id),
  is_default BOOLEAN DEFAULT false,         -- Default form for specialist
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Track which forms are sent to patients
CREATE TABLE form_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_request_id UUID NOT NULL REFERENCES appointment_requests(id),
  form_template_id UUID NOT NULL REFERENCES form_templates(id),
  token VARCHAR(64) UNIQUE NOT NULL,        -- Secure access token
  status VARCHAR(20) DEFAULT 'pending',     -- pending, completed, expired
  sent_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  expires_at TIMESTAMP                      -- Optional expiry
);

-- Store patient form submissions
CREATE TABLE form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_request_id UUID NOT NULL REFERENCES form_requests(id),
  data JSONB NOT NULL,                      -- Patient responses
  stripe_payment_intent_id VARCHAR(255),    -- For payment capture
  submitted_at TIMESTAMP DEFAULT NOW()
);
```

### Drizzle Schema Addition

Add to `src/db/schema.ts`:

```typescript
export const formTemplates = pgTable('form_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  schema: jsonb('schema').notNull(),
  specialistId: uuid('specialist_id').references(() => specialists.id),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const formRequests = pgTable('form_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentRequestId: uuid('appointment_request_id').notNull().references(() => appointmentRequests.id),
  formTemplateId: uuid('form_template_id').notNull().references(() => formTemplates.id),
  token: varchar('token', { length: 64 }).unique().notNull(),
  status: varchar('status', { length: 20 }).default('pending'),
  sentAt: timestamp('sent_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  expiresAt: timestamp('expires_at'),
});

export const formSubmissions = pgTable('form_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  formRequestId: uuid('form_request_id').notNull().references(() => formRequests.id),
  data: jsonb('data').notNull(),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  submittedAt: timestamp('submitted_at').defaultNow(),
});
```

---

## Phase 2: Package Installation

```bash
# Form renderer (for patient-facing forms) - SurveyJS library
npm install survey-react-ui --save

# Form builder UI (for dashboard - staff creating form templates)
npm install survey-creator-react --save

# Stripe for payment capture
npm install @stripe/stripe-js @stripe/react-stripe-js --save
```

> **Terminology**: The npm packages use "survey" naming but we expose these as "forms" to users.

---

## Phase 3: API Endpoints

### Form Templates API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/form-templates` | GET | List all templates |
| `/api/form-templates` | POST | Create new template |
| `/api/form-templates/[id]` | GET | Get template by ID |
| `/api/form-templates/[id]` | PATCH | Update template |
| `/api/form-templates/[id]` | DELETE | Delete template |

### Form Requests API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/form-requests` | POST | Send form to patient |
| `/api/form-requests/[token]` | GET | Get form by token (public) |
| `/api/form-requests/[token]/submit` | POST | Submit completed form |

---

## Phase 4: Component Structure

```
src/
├── components/
│   ├── forms/
│   │   ├── FormCreator.tsx           # Form builder UI (dashboard) - wraps SurveyJS Creator
│   │   ├── FormRenderer.tsx          # Form renderer (patient portal) - wraps SurveyJS
│   │   └── StripePaymentField.tsx    # Custom Stripe card input component
│   └── dashboard/
│       ├── SendFormDialog.tsx        # Modal to select & send form to patient
│       ├── IntakeFormsSection.tsx    # Section in patient file showing forms
│       ├── FormSubmissionCard.tsx    # Display completed form submission
│       └── FormSubmissionViewer.tsx  # Expandable view of form responses
├── app/
│   ├── (dashboard)/
│   │   ├── form-builder/
│   │   │   └── page.tsx              # Form template editor
│   │   ├── form-templates/
│   │   │   └── page.tsx              # List all templates
│   │   └── requests/
│   │       └── [id]/
│   │           └── page.tsx          # PATIENT FILE - enhanced with forms
│   └── (public)/
│       └── intake/
│           └── [token]/
│               └── page.tsx          # Patient form submission
```

### Patient File Page Structure (`/requests/[id]`)

The request detail page will be reorganized into a tabbed or sectioned layout:

```
┌─────────────────────────────────────────────────────────────┐
│  Patient File: John Smith                    Status: [Btn]  │
│  DOB: 1985-03-15 | Phone: 0412 345 678                      │
├─────────────────────────────────────────────────────────────┤
│  [Overview] [Intake Forms] [Documents] [Notes] [History]    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  INTAKE FORMS                           [+ Send New Form]   │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ✓ General Intake Form          Completed 2024-01-15 │   │
│  │   Medicare: 1234 56789 0/1     Expiry: 03/2025      │   │
│  │   Card ending: •••• 4242       [View Full Response] │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ⏳ Pre-Surgery Questionnaire    Pending (sent 2d ago)│   │
│  │   [Send Reminder] [Copy Link] [Cancel]              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 5: Implementation Steps

### Step 1: Database Migration
1. Add new tables to Drizzle schema (`form_templates`, `form_requests`, `form_submissions`)
2. Run `npm run db:generate`
3. Run `npm run db:push`
4. Seed a default intake form template

### Step 2: Form Builder Page
1. Create `/form-builder` route in dashboard
2. Implement `FormCreator` component (wraps SurveyJS Creator) with save functionality
3. Add API endpoint to save templates
4. Seed the sample intake form as a default template

### Step 3: Form Renderer for Patients
1. Create `/intake/[token]` public route
2. Implement `FormRenderer` component (wraps SurveyJS renderer)
3. Add custom Stripe payment field
4. Create submission API endpoint
5. Add confirmation page after submission

### Step 4: Patient File Enhancement (Request Detail Page)
1. **Refactor `/requests/[id]` into Patient File layout**
   - Add tabs: Overview | Intake Forms | Documents | Notes | History
   - Create `IntakeFormsSection` component
2. **Add "Send Intake Form" functionality**
   - Create `SendFormDialog` component
   - Allow selection from available templates
   - Generate secure token and create form_request record
3. **Display pending forms**
   - Show form name, sent date, status
   - Actions: Send Reminder, Copy Link, Cancel
4. **Display completed submissions**
   - Show summary of key fields (Medicare, card last 4)
   - Expandable view to see full form responses
   - `FormSubmissionViewer` component renders responses in readable format
5. **API integration**
   - GET `/api/appointments/[id]` returns form_requests and submissions
   - POST `/api/form-requests` creates and sends a form

### Step 5: Stripe Integration
1. Create Stripe payment intent on form load
2. Capture card details via Stripe Elements
3. Store payment intent ID with submission
4. Display card last 4 digits in patient file
5. Process payment when appointment is confirmed

### Step 6: Data Display in Patient File
Form submission data should be displayed intelligently:

```typescript
// Key fields extracted and shown in summary cards:
interface FormSummary {
  medicareNumber: string;      // "1234 56789 0/1"
  medicareExpiry: string;      // "03/2025"
  cardLast4: string;           // "4242"
  emergencyContact: string;    // "Jane Smith (0412 345 678)"
  allergies: string[];         // ["Penicillin", "Latex"]
  completedAt: Date;
}

// Full responses available in expandable detail view
```

---

## Sample Intake Form Schema

See `documents/plan/sample-intake-form.json` for a complete specialist intake form that captures:

- Personal details verification
- Medicare card information
- Emergency contact
- Medical history
- Current medications
- Allergies
- Payment details (Stripe)
- Consent and declarations

---

## Custom Field Types

SurveyJS supports custom field types. We'll need to create:

### 1. Stripe Card Element
A custom field type that renders Stripe Elements for secure card capture:

```typescript
// src/lib/formbuilder/stripe-field.ts
import { ComponentCollection } from 'survey-core';

ComponentCollection.Instance.add({
  name: 'stripe-card',
  title: 'Payment Card',
  questionJSON: {
    type: 'html',
    html: '<div id="stripe-card-element"></div>'
  }
});
```

### 2. Medicare Card Validator
Custom validation for Australian Medicare card numbers:

```typescript
// src/lib/formbuilder/validators.ts
// Medicare card validation (10 digits, check digit algorithm)
function validateMedicareNumber(value: string): boolean {
  const cleaned = value.replace(/\s/g, '');
  if (!/^\d{10}$/.test(cleaned)) return false;

  const weights = [1, 3, 7, 9, 1, 3, 7, 9];
  const digits = cleaned.slice(0, 8).split('').map(Number);
  const checkDigit = parseInt(cleaned[8]);

  const sum = digits.reduce((acc, digit, i) => acc + digit * weights[i], 0);
  return (sum % 10) === checkDigit;
}
```

---

## Security Considerations

1. **Token Generation**: Use cryptographically secure random tokens (32+ bytes)
2. **Token Expiry**: Forms should expire after 7-14 days
3. **Rate Limiting**: Prevent brute-force token guessing
4. **Data Encryption**: Sensitive data (Medicare, DOB) encrypted at rest
5. **Stripe PCI Compliance**: Card details never touch our server
6. **HTTPS Only**: All form submissions over TLS
7. **Input Validation**: Server-side validation of all submissions

---

## Future Enhancements

- Email/SMS notifications when form is sent
- Form completion reminders
- PDF generation of completed forms
- Pre-fill forms from existing patient data
- Conditional form sections based on specialist type
- Multi-language support
- Form analytics and completion rates
