# Appointment Request -> Triage Workflow

## TL;DR
The appointment workflow consists of two main parts:
1.  **Patient Submission**: Patients submit a request via a public form (`/request`). This creates an `appointment_request` record and optionally uploads a referral document.
2.  **Receptionist Triage**: Receptionists view requests on the dashboard (`/dashboard`). They can view details, update status (e.g., to "contacted" or "scheduled"), and add notes. All status changes and notes are logged for audit history.

---

## 1. Patient Request Flow

### 1.1 Overview
Patients access a public-facing form to request an appointment with a specialist. The form collects personal details, referral information, and allows for document uploads.

### 1.2 Components & Routes
-   **Page**: `src/app/(public)/request/page.tsx`
-   **Component**: `src/components/forms/appointment-form.tsx`
-   **API**: `src/app/api/appointments/route.ts` (POST)

### 1.3 Detailed Steps
1.  **Initialization**:
    -   The `AppointmentForm` component fetches the list of active specialists from `/api/specialists` to populate the dropdown.
2.  **Form Submission**:
    -   **Validation**: Zod schema (`appointmentRequestSchema`) validates inputs (name, DOB, email, phone, specialist, referral details).
    -   **File Upload** (Optional):
        -   If a file is selected, it is uploaded to `/api/upload` first.
        -   The API returns a URL and filename, which are added to the form data.
    -   **Data Submission**:
        -   The form data (including file URL) is sent via POST to `/api/appointments`.
3.  **Server-Side Processing**:
    -   The API validates the payload again using Zod.
    -   A new record is inserted into the `appointment_requests` table.
    -   Returns the new `requestId`.
4.  **Completion**:
    -   On success, the user is redirected to `/confirmation`.

---

## 2. Triage Dashboard Flow

### 2.1 Overview
Receptionists use the dashboard to manage incoming requests. They can filter requests, view detailed information, and update the status of each request.

### 2.2 Components & Routes
-   **Dashboard Page**: `src/app/(dashboard)/dashboard/page.tsx`
-   **Request Table**: `src/components/dashboard/request-table.tsx`
-   **Detail API**: `src/app/api/appointments/[id]/route.ts` (GET, PATCH)

### 2.3 Detailed Steps
1.  **Listing Requests**:
    -   The dashboard fetches requests from `/api/appointments`.
    -   Supports filtering by `status`, `priority`, `specialistId`, and text search.
    -   Pagination is implemented to handle large datasets.
2.  **Viewing Details**:
    -   Clicking "View" on a request navigates to `/requests/[id]`.
    -   The page fetches full details via GET `/api/appointments/[id]`.
    -   **Related Data**: The API also fetches:
        -   `notesHistory`: Chronological list of notes added to the request.
        -   `formRequests`: Any supplementary forms sent to the patient (and their submission status).
3.  **Updating Status & Notes**:
    -   Receptionists can update the `status` (e.g., `pending` -> `contacted`) or `priority`.
    -   **Audit Trail**:
        -   Status changes are logged to the `status_history` table.
        -   New notes are logged to the `notes_history` table.
    -   Updates are performed via PATCH `/api/appointments/[id]`.

## 3. Data Model

### 3.1 Key Tables
-   `appointment_requests`: Stores the core request data.
-   `specialists`: Stores the list of available doctors.
-   `status_history`: Logs changes to the request status.
-   `notes_history`: Logs internal notes added by staff.

### 3.2 Key Enums
-   **Status**: `pending`, `in_review`, `contacted`, `scheduled`, `cancelled`, `completed`
-   **Priority**: `low`, `normal`, `high`, `urgent`
