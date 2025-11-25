# Coviu MVP - Specialist Appointment Request System

## Technical Specification & Implementation Guide

---

## 1. Overview

### 1.1 Product Summary
A web-based system enabling patients to request appointments with specialist doctors. Patients access a form via website link or SMS, submit their details and referral documents, which then populates a triage dashboard for receptionist management.

### 1.2 Core User Flows

```
┌─────────────────────────────────────────────────────────────────┐
│                     PATIENT FLOW                                │
├─────────────────────────────────────────────────────────────────┤
│  Website/SMS Link → Patient Form → Submit → Confirmation       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   RECEPTIONIST FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│  Login → Triage Dashboard → Review Request → Update Status      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

### 2.1 Recommended Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Frontend** | Next.js 14 (App Router) | Full-stack React framework, server components, API routes |
| **Styling** | Tailwind CSS + shadcn/ui | Rapid UI development, accessible components |
| **Database** | PostgreSQL (Neon) | Serverless Postgres, scales to zero, branching support |
| **ORM** | Drizzle ORM | Type-safe, lightweight, excellent DX with Neon |
| **File Storage** | Vercel Blob or AWS S3 | Referral document uploads |
| **Authentication** | None (Prototype) | Dashboard is unprotected for MVP simplicity |
| **Validation** | Zod | Runtime validation, TypeScript inference |
| **Deployment** | Vercel | Seamless Next.js deployment, edge functions |

### 2.2 Alternative Considerations

- **Supabase**: Could replace Neon + file storage (built-in storage bucket)
- **tRPC**: If API complexity grows, provides end-to-end type safety

### 2.3 Authentication Note (Prototype)

For this MVP/prototype, the dashboard will be **unprotected** - no login required. This simplifies development and allows rapid iteration. For production, authentication should be added (NextAuth.js or Clerk recommended).

---

## 3. Database Schema

### 3.1 Entity Relationship Diagram

```
┌─────────────────────────┐       ┌─────────────────────────┐
│   appointment_requests  │       │       specialists       │
├─────────────────────────┤       ├─────────────────────────┤
│ id (PK)                 │       │ id (PK)                 │
│ first_name              │       │ name                    │
│ last_name               │       │ specialty               │
│ date_of_birth           │       │ is_active               │
│ email                   │       │ created_at              │
│ phone                   │       └─────────────────────────┘
│ specialist_id (FK)      │◄──────────────────┘
│ referral_document_url   │       (selected specialist)
│ referring_doctor_name   │
│ referring_doctor_phone  │
│ referring_doctor_email  │
│ referring_clinic        │
│ referral_date           │
│ status                  │
│ notes                   │
│ priority                │
│ created_at              │
│ updated_at              │
└─────────────────────────┘

┌─────────────────────────┐
│     status_history      │
├─────────────────────────┤
│ id (PK)                 │
│ request_id (FK)         │
│ previous_status         │
│ new_status              │
│ notes                   │
│ created_at              │
└─────────────────────────┘
```

### 3.2 SQL Schema (Drizzle)

```typescript
// src/db/schema.ts

import { pgTable, uuid, varchar, text, date, timestamp, pgEnum, boolean } from 'drizzle-orm/pg-core';

export const requestStatusEnum = pgEnum('request_status', [
  'pending',
  'in_review',
  'contacted',
  'scheduled',
  'cancelled',
  'completed'
]);

export const priorityEnum = pgEnum('priority', [
  'low',
  'normal',
  'high',
  'urgent'
]);

// Specialists table - doctors available at the clinic
export const specialists = pgTable('specialists', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  specialty: varchar('specialty', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const appointmentRequests = pgTable('appointment_requests', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Patient details
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  dateOfBirth: date('date_of_birth').notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),

  // Selected specialist (which doctor the patient wants to see)
  specialistId: uuid('specialist_id').references(() => specialists.id).notNull(),

  // Referral details
  referralDocumentUrl: text('referral_document_url'),
  referralDocumentName: varchar('referral_document_name', { length: 255 }),

  // Referring doctor details (the GP who referred them)
  referringDoctorName: varchar('referring_doctor_name', { length: 255 }).notNull(),
  referringDoctorPhone: varchar('referring_doctor_phone', { length: 20 }),
  referringDoctorEmail: varchar('referring_doctor_email', { length: 255 }),
  referringClinic: varchar('referring_clinic', { length: 255 }),
  referralDate: date('referral_date').notNull(),

  // Triage fields
  status: requestStatusEnum('status').notNull().default('pending'),
  priority: priorityEnum('priority').notNull().default('normal'),
  notes: text('notes'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const statusHistory = pgTable('status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestId: uuid('request_id').references(() => appointmentRequests.id).notNull(),
  previousStatus: requestStatusEnum('previous_status'),
  newStatus: requestStatusEnum('new_status').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### 3.3 Seed Data (Specialists)

```typescript
// src/db/seed.ts

import { db } from './index';
import { specialists } from './schema';

const initialSpecialists = [
  { name: 'Dr. Sarah Chen', specialty: 'Cardiology' },
  { name: 'Dr. Michael Roberts', specialty: 'Dermatology' },
  { name: 'Dr. Emily Watson', specialty: 'Endocrinology' },
  { name: 'Dr. James Miller', specialty: 'Gastroenterology' },
  { name: 'Dr. Lisa Park', specialty: 'Neurology' },
];

async function seed() {
  await db.insert(specialists).values(initialSpecialists);
  console.log('Seeded specialists');
}

seed();
```

---

## 4. API Specification

### 4.1 Public Endpoints (Patient Form)

#### GET `/api/specialists`
Get list of active specialists for the dropdown.

**Response:**
```typescript
{
  data: {
    id: string;
    name: string;
    specialty: string;
  }[]
}
```

#### POST `/api/appointments/request`
Submit a new appointment request.

**Request Body:**
```typescript
{
  firstName: string;          // Required, max 100 chars
  lastName: string;           // Required, max 100 chars
  dateOfBirth: string;        // Required, ISO date format (YYYY-MM-DD)
  email: string;              // Required, valid email
  phone: string;              // Required, valid phone format
  specialistId: string;       // Required, UUID of selected specialist
  referralDocument?: File;    // Optional, max 10MB, PDF/JPG/PNG
  referringDoctorName: string; // Required
  referringDoctorPhone?: string;
  referringDoctorEmail?: string;
  referringClinic?: string;
  referralDate: string;       // Required, ISO date format
}
```

**Response:**
```typescript
// Success (201)
{
  success: true;
  message: "Appointment request submitted successfully";
  requestId: string;
}

// Validation Error (400)
{
  success: false;
  errors: { field: string; message: string; }[]
}
```

### 4.2 Dashboard Endpoints (Unprotected for Prototype)

#### GET `/api/appointments`
List all appointment requests with filtering/pagination.

**Query Parameters:**
```
?status=pending,in_review    // Filter by status (comma-separated)
&priority=high,urgent        // Filter by priority
&specialistId=uuid           // Filter by specialist (doctor)
&search=john                 // Search by patient name
&sortBy=createdAt            // Sort field
&sortOrder=desc              // Sort direction
&page=1                      // Page number
&limit=20                    // Items per page
```

**Response:**
```typescript
{
  data: AppointmentRequest[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }
}
```

#### GET `/api/appointments/:id`
Get single appointment request with full details.

#### PATCH `/api/appointments/:id`
Update appointment request (status, priority, notes, assignment).

**Request Body:**
```typescript
{
  status?: 'pending' | 'in_review' | 'contacted' | 'scheduled' | 'cancelled' | 'completed';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  notes?: string;
}
```

#### GET `/api/appointments/:id/history`
Get status change history for an appointment.

---

## 5. Project Structure

```
coviu-mvp/
├── src/
│   ├── app/
│   │   ├── (public)/                    # Public routes
│   │   │   ├── request/
│   │   │   │   └── page.tsx             # Patient appointment form
│   │   │   └── confirmation/
│   │   │       └── page.tsx             # Submission confirmation
│   │   │
│   │   ├── (dashboard)/                 # Dashboard routes (unprotected for prototype)
│   │   │   ├── layout.tsx               # Dashboard layout with sidebar
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx             # Triage dashboard
│   │   │   └── requests/
│   │   │       └── [id]/
│   │   │           └── page.tsx         # Request detail view
│   │   │
│   │   ├── api/
│   │   │   ├── specialists/
│   │   │   │   └── route.ts             # GET list of specialists
│   │   │   ├── appointments/
│   │   │   │   ├── route.ts             # GET list, POST create
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts         # GET, PATCH single request
│   │   │   │       └── history/
│   │   │   │           └── route.ts     # GET status history
│   │   │   └── upload/
│   │   │       └── route.ts             # File upload handler
│   │   │
│   │   ├── layout.tsx                   # Root layout
│   │   └── page.tsx                     # Landing/redirect
│   │
│   ├── components/
│   │   ├── ui/                          # shadcn/ui components
│   │   ├── forms/
│   │   │   └── appointment-form.tsx     # Patient request form
│   │   └── dashboard/
│   │       ├── request-table.tsx        # Triage table
│   │       ├── request-filters.tsx      # Filter controls
│   │       ├── request-detail.tsx       # Detail view
│   │       └── status-badge.tsx         # Status indicator
│   │
│   ├── db/
│   │   ├── index.ts                     # Database connection
│   │   ├── schema.ts                    # Drizzle schema
│   │   └── migrations/                  # Database migrations
│   │
│   ├── lib/
│   │   ├── validations.ts               # Zod schemas
│   │   └── utils.ts                     # Helper functions
│   │
│   └── types/
│       └── index.ts                     # TypeScript types
│
├── public/
├── drizzle.config.ts                    # Drizzle configuration
├── .env.local                           # Environment variables
├── .env.example                         # Environment template
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

---

## 6. Implementation Steps

### Phase 1: Project Setup
1. Initialize Next.js project with TypeScript
2. Configure Tailwind CSS and shadcn/ui
3. Set up Neon database and Drizzle ORM
4. Create database schema and run migrations
5. Seed specialists data
6. Configure environment variables

### Phase 2: Patient Form
1. Create specialists API endpoint
2. Create appointment request form UI with specialist dropdown
3. Implement file upload for referral documents
4. Add form validation (client + server)
5. Create API endpoint for form submission
6. Build confirmation page

### Phase 3: Triage Dashboard
1. Build dashboard layout with navigation
2. Create request listing table with sorting/filtering
3. Add specialist filter dropdown
4. Implement status update functionality
5. Add request detail view
6. Build status history timeline

### Phase 4: Polish & Deploy
1. Add loading states and error handling
2. Implement responsive design
3. Deploy to Vercel
4. Configure production database on Neon

---

## 7. Validation Schemas

```typescript
// src/lib/validations.ts

import { z } from 'zod';

export const appointmentRequestSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(100, 'First name must be less than 100 characters'),

  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must be less than 100 characters'),

  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format')
    .refine((date) => {
      const dob = new Date(date);
      const today = new Date();
      return dob < today;
    }, 'Date of birth must be in the past'),

  email: z
    .string()
    .email('Invalid email address'),

  phone: z
    .string()
    .min(8, 'Phone number must be at least 8 digits')
    .regex(/^[\d\s\+\-\(\)]+$/, 'Invalid phone number format'),

  specialistId: z
    .string()
    .uuid('Please select a specialist'),

  referringDoctorName: z
    .string()
    .min(1, 'Referring doctor name is required'),

  referringDoctorPhone: z
    .string()
    .optional(),

  referringDoctorEmail: z
    .string()
    .email('Invalid email address')
    .optional()
    .or(z.literal('')),

  referringClinic: z
    .string()
    .optional(),

  referralDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
});

export const updateRequestSchema = z.object({
  status: z.enum([
    'pending',
    'in_review',
    'contacted',
    'scheduled',
    'cancelled',
    'completed'
  ]).optional(),

  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),

  notes: z.string().optional(),
});
```

---

## 8. Environment Variables

```bash
# .env.example

# Database (Neon)
DATABASE_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require"

# File Storage (Vercel Blob)
BLOB_READ_WRITE_TOKEN="your-vercel-blob-token"
```

---

## 9. Key Component Examples

### 9.1 Patient Form Component

```typescript
// src/components/forms/appointment-form.tsx

'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { appointmentRequestSchema } from '@/lib/validations';

interface Specialist {
  id: string;
  name: string;
  specialty: string;
}

export function AppointmentForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);

  // Fetch specialists for dropdown
  useEffect(() => {
    fetch('/api/specialists')
      .then(res => res.json())
      .then(data => setSpecialists(data.data));
  }, []);

  const form = useForm({
    resolver: zodResolver(appointmentRequestSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      email: '',
      phone: '',
      specialistId: '',
      referringDoctorName: '',
      referringDoctorPhone: '',
      referringDoctorEmail: '',
      referringClinic: '',
      referralDate: '',
    },
  });

  async function onSubmit(data: z.infer<typeof appointmentRequestSchema>) {
    setIsSubmitting(true);

    try {
      // Upload file first if present
      let referralDocumentUrl = null;
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        const uploadData = await uploadRes.json();
        referralDocumentUrl = uploadData.url;
      }

      // Submit appointment request
      const response = await fetch('/api/appointments/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          referralDocumentUrl,
          referralDocumentName: file?.name,
        }),
      });

      if (response.ok) {
        router.push('/confirmation');
      } else {
        const error = await response.json();
        // Handle validation errors
      }
    } catch (error) {
      // Handle network errors
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Patient details fields */}

      {/* Specialist dropdown */}
      <Select onValueChange={(value) => form.setValue('specialistId', value)}>
        <SelectTrigger>
          <SelectValue placeholder="Which doctor would you like to see?" />
        </SelectTrigger>
        <SelectContent>
          {specialists.map((specialist) => (
            <SelectItem key={specialist.id} value={specialist.id}>
              {specialist.name} - {specialist.specialty}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Referral details fields */}
    </form>
  );
}
```

### 9.2 Dashboard Filters Component

```typescript
// src/components/dashboard/request-filters.tsx

'use client';

import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Specialist {
  id: string;
  name: string;
  specialty: string;
}

interface RequestFiltersProps {
  onFilterChange: (filters: {
    specialistId?: string;
    status?: string;
    priority?: string;
  }) => void;
}

export function RequestFilters({ onFilterChange }: RequestFiltersProps) {
  const [specialists, setSpecialists] = useState<Specialist[]>([]);

  useEffect(() => {
    fetch('/api/specialists')
      .then(res => res.json())
      .then(data => setSpecialists(data.data));
  }, []);

  return (
    <div className="flex gap-4 mb-6">
      {/* Specialist filter */}
      <Select onValueChange={(value) => onFilterChange({ specialistId: value || undefined })}>
        <SelectTrigger className="w-[250px]">
          <SelectValue placeholder="Filter by Doctor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Doctors</SelectItem>
          {specialists.map((specialist) => (
            <SelectItem key={specialist.id} value={specialist.id}>
              {specialist.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status filter */}
      <Select onValueChange={(value) => onFilterChange({ status: value || undefined })}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filter by Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="in_review">In Review</SelectItem>
          <SelectItem value="contacted">Contacted</SelectItem>
          <SelectItem value="scheduled">Scheduled</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      {/* Priority filter */}
      <Select onValueChange={(value) => onFilterChange({ priority: value || undefined })}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filter by Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Priorities</SelectItem>
          <SelectItem value="urgent">Urgent</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="normal">Normal</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

### 9.3 Dashboard Table Component

```typescript
// src/components/dashboard/request-table.tsx

'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from './status-badge';
import { PriorityBadge } from './priority-badge';

interface AppointmentRequest {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  specialist: {
    name: string;
    specialty: string;
  };
  referringDoctorName: string;
  referralDate: string;
  status: string;
  priority: string;
  createdAt: string;
}

interface RequestTableProps {
  requests: AppointmentRequest[];
  onStatusChange: (id: string, status: string) => void;
}

export function RequestTable({ requests, onStatusChange }: RequestTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Patient Name</TableHead>
          <TableHead>DOB</TableHead>
          <TableHead>Specialist</TableHead>
          <TableHead>Referring Doctor</TableHead>
          <TableHead>Referral Date</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Submitted</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => (
          <TableRow key={request.id}>
            <TableCell>
              {request.firstName} {request.lastName}
            </TableCell>
            <TableCell>{formatDate(request.dateOfBirth)}</TableCell>
            <TableCell>
              <div>{request.specialist.name}</div>
              <div className="text-sm text-muted-foreground">
                {request.specialist.specialty}
              </div>
            </TableCell>
            <TableCell>{request.referringDoctorName}</TableCell>
            <TableCell>{formatDate(request.referralDate)}</TableCell>
            <TableCell>
              <StatusBadge status={request.status} />
            </TableCell>
            <TableCell>
              <PriorityBadge priority={request.priority} />
            </TableCell>
            <TableCell>{formatDate(request.createdAt)}</TableCell>
            <TableCell>
              {/* Action buttons */}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

---

## 10. Security Considerations

### 10.1 Prototype Limitations
**Note:** This is a prototype with simplified security. For production:
- Add authentication to the dashboard
- Implement proper access controls
- Add audit logging

### 10.2 Data Protection (MVP)
- All data transmitted over HTTPS (Vercel default)
- Database connections use SSL (Neon default)
- File uploads restricted by type and size

### 10.3 Input Validation
- Server-side validation on all inputs (Zod)
- File type and size restrictions
- SQL injection prevention via parameterized queries (Drizzle)
- XSS prevention via React's default escaping

### 10.4 Production Considerations (Future)
- Add authentication (NextAuth.js or Clerk)
- HIPAA/privacy compliance for patient data
- Audit logging for data access
- Data retention policies
- Virus scanning for file uploads

---

## 11. Future Enhancements (Out of Scope for MVP)

- Dashboard authentication and role-based access
- SMS notifications for patients on status changes
- Email notifications for new requests
- Patient portal to track request status
- Calendar integration for scheduling
- Integration with practice management systems
- Bulk actions on dashboard
- Advanced reporting and analytics
- Multi-clinic support
- Specialist availability/scheduling preferences

---

## 12. Quick Start Commands

```bash
# Create Next.js project
npx create-next-app@latest coviu-mvp --typescript --tailwind --eslint --app --src-dir

# Install dependencies
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit
npm install @hookform/resolvers react-hook-form zod
npm install @vercel/blob

# Install shadcn/ui
npx shadcn@latest init
npx shadcn@latest add button input label card table badge select dialog

# Generate database migrations
npx drizzle-kit generate

# Push schema to database
npx drizzle-kit push

# Seed specialists data
npx tsx src/db/seed.ts

# Run development server
npm run dev

# Deploy to Vercel
vercel
```

---

## 13. Acceptance Criteria

### Patient Form
- [ ] Form accessible via unique URL (shareable via SMS/website)
- [ ] Specialist dropdown populated from database
- [ ] All required fields validated before submission
- [ ] File upload accepts PDF, JPG, PNG up to 10MB
- [ ] Clear error messages for validation failures
- [ ] Confirmation page displayed after successful submission
- [ ] Mobile-responsive design

### Triage Dashboard
- [ ] Dashboard accessible at `/dashboard` (no login for prototype)
- [ ] List view shows all appointment requests
- [ ] **Filter by specialist/doctor**
- [ ] Filter by status and priority
- [ ] Search by patient name
- [ ] Sortable columns
- [ ] Specialist name displayed in table
- [ ] Click to view full request details
- [ ] Ability to update status and priority
- [ ] Ability to add notes
- [ ] View referral document
- [ ] Status history visible

---

*Document Version: 1.1*
*Last Updated: November 2024*
