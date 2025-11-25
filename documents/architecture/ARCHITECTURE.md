# Coviu MVP - Architecture Document

## Overview

The Coviu MVP is a specialist appointment request system that enables patients to request appointments via an online form, which are then triaged by receptionists through a dashboard.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│                           (Next.js App Router)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐  │
│   │  Patient Form    │    │  Triage Dashboard │    │  Request Detail │  │
│   │  /request        │    │  /dashboard       │    │  /requests/[id] │  │
│   └────────┬─────────┘    └────────┬─────────┘    └────────┬────────┘  │
│            │                       │                        │           │
└────────────┼───────────────────────┼────────────────────────┼───────────┘
             │                       │                        │
             ▼                       ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              API LAYER                                   │
│                         (Next.js Route Handlers)                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐  │
│   │ /api/specialists │    │ /api/appointments│    │ /api/upload     │  │
│   │ GET              │    │ GET, POST        │    │ POST            │  │
│   └──────────────────┘    └──────────────────┘    └─────────────────┘  │
│                                                                          │
│   ┌──────────────────────────────────────────┐                          │
│   │ /api/appointments/[id]                   │                          │
│   │ GET, PATCH                               │                          │
│   └──────────────────────────────────────────┘                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
             │                                              │
             ▼                                              ▼
┌─────────────────────────────┐          ┌─────────────────────────────────┐
│       PostgreSQL            │          │        Vercel Blob              │
│       (Neon)                │          │        (File Storage)           │
├─────────────────────────────┤          ├─────────────────────────────────┤
│ - specialists               │          │ - Referral documents            │
│ - appointment_requests      │          │   (PDF, JPG, PNG)               │
│ - notes_history             │          │                                 │
│ - status_history            │          │                                 │
└─────────────────────────────┘          └─────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | Next.js 14 (App Router) | Full-stack React framework |
| **Language** | TypeScript | Type-safe development |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **UI Components** | shadcn/ui | Accessible component library |
| **Database** | PostgreSQL (Neon) | Serverless Postgres |
| **ORM** | Drizzle ORM | Type-safe database queries |
| **File Storage** | Vercel Blob | Referral document uploads |
| **Validation** | Zod | Runtime schema validation |
| **Deployment** | Vercel | Serverless hosting |

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────────────┐
│      specialists        │
├─────────────────────────┤
│ id (PK, UUID)           │
│ name (VARCHAR)          │
│ specialty (VARCHAR)     │
│ is_active (BOOLEAN)     │
│ created_at (TIMESTAMP)  │
└───────────┬─────────────┘
            │
            │ 1:N
            ▼
┌─────────────────────────┐
│  appointment_requests   │
├─────────────────────────┤
│ id (PK, UUID)           │
│ first_name              │
│ last_name               │
│ date_of_birth           │
│ email                   │
│ phone                   │
│ specialist_id (FK)  ────┘
│ referral_document_url   │
│ referral_document_name  │
│ referring_doctor_name   │
│ referring_doctor_phone  │
│ referring_doctor_email  │
│ referring_clinic        │
│ referral_date           │
│ status (ENUM)           │
│ priority (ENUM)         │
│ notes                   │
│ created_at              │
│ updated_at              │
└───────────┬─────────────┘
            │
            │ 1:N
            ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│     notes_history       │     │     status_history      │
├─────────────────────────┤     ├─────────────────────────┤
│ id (PK, UUID)           │     │ id (PK, UUID)           │
│ request_id (FK)         │     │ request_id (FK)         │
│ note (TEXT)             │     │ previous_status (ENUM)  │
│ created_at (TIMESTAMP)  │     │ new_status (ENUM)       │
└─────────────────────────┘     │ notes (TEXT)            │
                                │ created_at (TIMESTAMP)  │
                                └─────────────────────────┘
```

### Enums

**Request Status:**
- `pending` (default)
- `in_review`
- `contacted`
- `scheduled`
- `cancelled`
- `completed`

**Priority:**
- `low`
- `normal` (default)
- `high`
- `urgent`

---

## Directory Structure

```
coviu-mvp/
├── src/
│   ├── app/
│   │   ├── (public)/                    # Public routes
│   │   │   ├── request/page.tsx         # Patient form
│   │   │   └── confirmation/page.tsx    # Success page
│   │   │
│   │   ├── (dashboard)/                 # Dashboard routes
│   │   │   ├── layout.tsx               # Dashboard layout
│   │   │   ├── dashboard/page.tsx       # Request listing
│   │   │   └── requests/[id]/page.tsx   # Request detail
│   │   │
│   │   ├── api/
│   │   │   ├── specialists/route.ts     # GET specialists
│   │   │   ├── appointments/
│   │   │   │   ├── route.ts             # GET list, POST create
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts         # GET, PATCH single
│   │   │   │       └── history/route.ts # GET status history
│   │   │   └── upload/route.ts          # POST file upload
│   │   │
│   │   ├── layout.tsx                   # Root layout
│   │   ├── page.tsx                     # Landing page
│   │   └── globals.css                  # Global styles
│   │
│   ├── components/
│   │   ├── ui/                          # shadcn/ui components
│   │   ├── forms/
│   │   │   └── appointment-form.tsx     # Patient form component
│   │   └── dashboard/
│   │       ├── request-table.tsx        # Request listing table
│   │       ├── request-filters.tsx      # Filter controls
│   │       ├── status-badge.tsx         # Status indicator
│   │       └── priority-badge.tsx       # Priority indicator
│   │
│   ├── db/
│   │   ├── index.ts                     # Database connection
│   │   ├── schema.ts                    # Drizzle schema
│   │   └── seed.ts                      # Seed data
│   │
│   └── lib/
│       ├── utils.ts                     # Utility functions
│       └── validations.ts               # Zod schemas
│
├── documents/
│   └── architecture/                    # Architecture documentation
│
├── drizzle/                             # Generated migrations
├── drizzle.config.ts                    # Drizzle configuration
├── .env.local                           # Environment variables
└── package.json
```

---

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/specialists` | List active specialists |
| POST | `/api/appointments` | Create appointment request |
| POST | `/api/upload` | Upload referral document |

### Dashboard Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/appointments` | List requests (with filters) |
| GET | `/api/appointments/[id]` | Get single request |
| PATCH | `/api/appointments/[id]` | Update request |
| GET | `/api/appointments/[id]/history` | Get status history |

### Query Parameters (GET /api/appointments)

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status |
| `priority` | string | Filter by priority |
| `specialistId` | UUID | Filter by specialist |
| `search` | string | Search patient name |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20) |

---

## Data Flow

### Patient Form Submission

```
1. Patient visits /request
2. Form fetches specialists from /api/specialists
3. Patient fills form and optionally uploads referral
4. If file attached:
   a. POST /api/upload → returns file URL
5. POST /api/appointments with form data + file URL
6. Redirect to /confirmation
```

### Dashboard Triage Flow

```
1. Receptionist visits /dashboard
2. GET /api/appointments (with optional filters)
3. Click request → GET /api/appointments/[id]
4. Update status/priority/notes → PATCH /api/appointments/[id]
   a. Status change logged to status_history
   b. Notes logged to notes_history
```

---

## Security Considerations

### Current (Prototype)
- No authentication on dashboard
- HTTPS via Vercel
- Input validation via Zod
- SQL injection prevention via Drizzle ORM
- File type/size validation on uploads

### Production Requirements
- Add authentication (NextAuth.js / Clerk)
- Role-based access control
- Audit logging
- HIPAA compliance measures
- Rate limiting

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage token |

---

## Deployment

The application is deployed on Vercel with:
- Automatic deployments from GitHub
- Serverless functions for API routes
- Edge network for static assets
- Environment variables configured in Vercel dashboard

---

*Document Version: 1.0*
*Last Updated: November 2024*
