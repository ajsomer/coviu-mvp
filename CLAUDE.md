# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Coviu MVP is a specialist appointment request system. Patients submit appointment requests via a form, which receptionists triage through a dashboard.

## Commands

```bash
# Development
npm run dev              # Start dev server at localhost:3000

# Build & Production
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint

# Database (Drizzle + Neon)
npm run db:generate      # Generate migrations from schema
npm run db:push          # Push schema to database
npm run db:studio        # Open Drizzle Studio
npm run db:seed          # Seed specialists data
```

## Architecture

### Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL via Neon (serverless) + Drizzle ORM
- **File Storage**: Vercel Blob
- **UI**: Tailwind CSS + shadcn/ui
- **Validation**: Zod + react-hook-form

### Route Structure

Uses Next.js route groups:
- `(public)/*` - Patient-facing pages (no auth)
- `(dashboard)/*` - Receptionist triage pages (no auth for prototype)

### Key Routes
| Route | Purpose |
|-------|---------|
| `/request` | Patient appointment form |
| `/confirmation` | Form submission success |
| `/dashboard` | Triage request listing |
| `/requests/[id]` | Request detail/edit view |

### API Endpoints
| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/api/specialists` | GET | List doctors for dropdown |
| `/api/appointments` | GET, POST | List/create requests |
| `/api/appointments/[id]` | GET, PATCH | View/update request |
| `/api/upload` | POST | Upload referral documents |

### Database Schema

Four tables in `src/db/schema.ts`:
- `specialists` - Doctors available at clinic
- `appointment_requests` - Patient requests with status/priority
- `notes_history` - Timestamped notes log
- `status_history` - Status change audit trail

### Key Patterns

**Form validation**: Zod schemas in `src/lib/validations.ts` used for both client (react-hook-form) and server validation.

**Database queries**: All via Drizzle ORM in `src/db/index.ts`. Schema defines types exported as `Specialist`, `AppointmentRequest`, etc.

**Component structure**: shadcn/ui components in `src/components/ui/`, custom components in `src/components/forms/` and `src/components/dashboard/`.

## Environment Variables

Required in `.env.local`:
```
DATABASE_URL=postgresql://...@neon.tech/...
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

## Notes

- No authentication implemented (prototype)
- Dashboard is publicly accessible
- Notes are logged to history (not overwritten)
- Status changes are tracked in `status_history` table
