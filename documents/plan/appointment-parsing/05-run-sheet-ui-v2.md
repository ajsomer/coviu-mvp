# Phase 5: Run Sheet UI (v2 - Sidebar Design)

## Objectives

- Display run sheet as a narrow sidebar-style column
- Show appointments chronologically (sparse - only filled times)
- Support filtering by clinician (All / specific practitioner)
- Support day navigation (arrows + calendar picker)
- Integrate data from OCR engine and telehealth invites
- Support sending/resending telehealth invites directly from cards

## Prerequisites

- Phase 4 complete (review UI working, can confirm run sheet)
- Telehealth invites table exists (for status tracking)

---

## UI Design

### Layout Wireframe

```
┌─────────────────────────────────┐
│           RUN SHEET             │
├─────────────────────────────────┤
│  [←]   Tue, 10 Dec 2024   [→]   │
├─────────────────────────────────┤
│       [All Clinicians ▼]        │
├─────────────────────────────────┤
│                                 │
│  09:00                          │
│  ┌───────────────────────────┐  │
│  │ John Smith                │  │
│  │ Dr Williams               │  │
│  │ 0412 345 678              │  │
│  │ [Send Invite]             │  │
│  └───────────────────────────┘  │
│                                 │
│  10:30                          │
│  ┌───────────────────────────┐  │
│  │ Mary Johnson              │  │
│  │ Dr Chen                   │  │
│  │ 0423 456 789              │  │
│  │ ⏳ Queued                  │  │
│  └───────────────────────────┘  │
│                                 │
│  11:00                          │
│  ┌───────────────────────────┐  │
│  │ Robert Brown              │  │
│  │ Dr Williams               │  │
│  │ 0434 567 890              │  │
│  │ ✓ Sent  [Resend]          │  │
│  └───────────────────────────┘  │
│                                 │
│  14:00                          │
│  ┌───────────────────────────┐  │
│  │ Sarah Davis               │  │
│  │ Dr Chen                   │  │
│  │ 0445 678 901              │  │
│  │ ✓ Sent  [Resend]          │  │
│  └───────────────────────────┘  │
│                                 │
│  15:30                          │
│  ┌───────────────────────────┐  │
│  │ Michael Lee               │  │
│  │ Dr Williams               │  │
│  │ 0456 789 012              │  │
│  │ [Send Invite]             │  │
│  └───────────────────────────┘  │
│                                 │
├─────────────────────────────────┤
│  [Edit]        [Re-upload]      │
└─────────────────────────────────┘
```

### Key Features

1. **Header**: "RUN SHEET" title - clear purpose
2. **Date Navigation**:
   - Left/right arrows to move between days
   - Clicking date opens calendar picker
   - Calendar highlights days with run sheets
3. **Clinician Filter**: Dropdown (no label) to toggle between:
   - "All Clinicians" (unified chronological view)
   - Individual practitioners
4. **Sparse Timeline**: Only displays times with appointments (no empty slots)
5. **Appointment Cards**: Minimal info - patient name, clinician, phone
6. **Telehealth Invite States**:
   - No invite: Shows "Send Invite" button
   - Queued: Shows "Queued" indicator (waiting to send)
   - Sent: Shows "Sent" checkmark + "Resend" button
7. **Footer Actions**: Edit and Re-upload buttons

### Invite Status States

| State | Display | Action |
|-------|---------|--------|
| `none` | `[Send Invite]` button | Click to queue invite |
| `queued` | `⏳ Queued` text | No action (waiting) |
| `sent` | `✓ Sent [Resend]` | Click Resend to re-queue |
| `failed` | `✗ Failed [Retry]` | Click Retry to re-queue |

---

## 1. Database Schema Addition

Add telehealth invites tracking to `src/db/schema.ts`:

```ts
export const telehealthInviteStatusEnum = pgEnum('telehealth_invite_status', [
  'queued',    // Waiting to be sent
  'sent',      // Successfully sent
  'failed',    // Failed to send
]);

// Telehealth invites - tracks SMS invites for appointments
export const telehealthInvites = pgTable('telehealth_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  runSheetAppointmentId: uuid('run_sheet_appointment_id').references(() => runSheetAppointments.id),
  phoneNumber: varchar('phone_number', { length: 50 }).notNull(),
  clinicianId: uuid('clinician_id').references(() => runSheetClinicians.id),
  appointmentDate: date('appointment_date').notNull(),
  appointmentTime: varchar('appointment_time', { length: 20 }).notNull(),
  status: telehealthInviteStatusEnum('status').notNull().default('queued'),
  queuedAt: timestamp('queued_at').defaultNow().notNull(),
  sentAt: timestamp('sent_at'),
  failedAt: timestamp('failed_at'),
  failureReason: text('failure_reason'),
});

export type TelehealthInvite = typeof telehealthInvites.$inferSelect;
export type NewTelehealthInvite = typeof telehealthInvites.$inferInsert;
```

---

## 2. Components

### `src/components/run-sheet/RunSheetSidebar.tsx`

Main container - fixed width sidebar layout.

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RunSheetDateNav } from './RunSheetDateNav';
import { ClinicianFilter } from './ClinicianFilter';
import { AppointmentCard } from './AppointmentCard';
import { EmptyState } from './EmptyState';
import { Pencil, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface Clinician {
  id: string;
  name: string;
}

type InviteStatus = 'none' | 'queued' | 'sent' | 'failed';

interface Appointment {
  id: string;
  patientName: string | null;
  patientPhone: string | null;
  appointmentTime: string | null;
  clinicianId: string | null;
  clinicianName: string | null;
  inviteStatus: InviteStatus;
}

interface RunSheet {
  id: string;
  date: string;
  status: 'draft' | 'reviewing' | 'confirmed';
}

export function RunSheetSidebar() {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedClinicianId, setSelectedClinicianId] = useState<string>('all');
  const [runSheet, setRunSheet] = useState<RunSheet | null>(null);
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate]);

  const fetchData = async (date: string) => {
    setLoading(true);
    try {
      const rsResponse = await fetch(`/api/run-sheet?date=${date}`);
      const rsData = await rsResponse.json();
      setRunSheet(rsData);

      if (rsData && rsData.status === 'confirmed') {
        const clinResponse = await fetch('/api/run-sheet/clinicians');
        const clinData = await clinResponse.json();
        setClinicians(clinData.clinicians || []);

        const apptResponse = await fetch(
          `/api/run-sheet/appointments?date=${date}&includeInviteStatus=true`
        );
        const apptData = await apptResponse.json();
        setAppointments(apptData.appointments || []);
      } else {
        setAppointments([]);
      }

      const datesResponse = await fetch('/api/run-sheet/dates');
      const datesData = await datesResponse.json();
      setAvailableDates(datesData.dates || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvite = async (appointmentId: string) => {
    try {
      await fetch('/api/telehealth-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId }),
      });
      // Refresh to show updated status
      fetchData(selectedDate);
    } catch (error) {
      console.error('Error sending invite:', error);
    }
  };

  const handleReUpload = async () => {
    if (!confirm('This will delete the current run sheet. Continue?')) return;
    try {
      await fetch(`/api/run-sheet?date=${selectedDate}`, { method: 'DELETE' });
      window.location.href = '/run-sheet/upload';
    } catch (error) {
      console.error('Error deleting run sheet:', error);
    }
  };

  // Filter appointments by selected clinician
  const filteredAppointments =
    selectedClinicianId === 'all'
      ? appointments
      : appointments.filter((a) => a.clinicianId === selectedClinicianId);

  // Sort by time
  const sortedAppointments = [...filteredAppointments].sort((a, b) => {
    const timeA = a.appointmentTime || '';
    const timeB = b.appointmentTime || '';
    return timeA.localeCompare(timeB);
  });

  // Group appointments by time for display
  const appointmentsByTime = sortedAppointments.reduce(
    (acc, appt) => {
      const time = appt.appointmentTime || 'No time';
      if (!acc[time]) acc[time] = [];
      acc[time].push(appt);
      return acc;
    },
    {} as Record<string, Appointment[]>
  );

  if (loading) {
    return (
      <Card className="w-80">
        <CardContent className="py-8 text-center">
          <p className="text-gray-500">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-80 flex flex-col h-full">
      {/* Header */}
      <CardHeader className="pb-2 border-b">
        <CardTitle className="text-center text-lg font-bold tracking-wide">
          RUN SHEET
        </CardTitle>
      </CardHeader>

      {/* Date Navigation */}
      <div className="px-4 py-3 border-b">
        <RunSheetDateNav
          selectedDate={selectedDate}
          availableDates={availableDates}
          onDateChange={setSelectedDate}
        />
      </div>

      {/* Clinician Filter */}
      <div className="px-4 py-3 border-b">
        <ClinicianFilter
          clinicians={clinicians}
          selectedId={selectedClinicianId}
          onSelect={setSelectedClinicianId}
        />
      </div>

      {/* Appointments List */}
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {!runSheet || runSheet.status !== 'confirmed' ? (
          <EmptyState compact />
        ) : sortedAppointments.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            No appointments
            {selectedClinicianId !== 'all' ? ' for this clinician' : ''}
          </p>
        ) : (
          Object.entries(appointmentsByTime).map(([time, appts]) => (
            <div key={time}>
              {/* Time Header */}
              <div className="text-sm font-semibold text-gray-700 mb-2">
                {time}
              </div>
              {/* Appointment Cards */}
              <div className="space-y-2">
                {appts.map((appt) => (
                  <AppointmentCard
                    key={appt.id}
                    appointment={appt}
                    onSendInvite={() => handleSendInvite(appt.id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </CardContent>

      {/* Footer Actions */}
      {runSheet?.status === 'confirmed' && (
        <div className="px-4 py-3 border-t flex gap-2">
          <Link href="/run-sheet/review" className="flex-1">
            <Button variant="outline" size="sm" className="w-full">
              <Pencil className="w-3 h-3 mr-1" />
              Edit
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={handleReUpload}
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Re-upload
          </Button>
        </div>
      )}
    </Card>
  );
}
```

### `src/components/run-sheet/RunSheetDateNav.tsx`

Date navigation with arrows and calendar picker.

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronLeft, ChevronRight, CalendarIcon } from 'lucide-react';
import { format, addDays, subDays, parseISO } from 'date-fns';

interface RunSheetDateNavProps {
  selectedDate: string; // YYYY-MM-DD
  availableDates: string[]; // Dates that have run sheets
  onDateChange: (date: string) => void;
}

export function RunSheetDateNav({
  selectedDate,
  availableDates,
  onDateChange,
}: RunSheetDateNavProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const currentDate = parseISO(selectedDate);

  const handlePrevDay = () => {
    const prev = subDays(currentDate, 1);
    onDateChange(format(prev, 'yyyy-MM-dd'));
  };

  const handleNextDay = () => {
    const next = addDays(currentDate, 1);
    onDateChange(format(next, 'yyyy-MM-dd'));
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      onDateChange(format(date, 'yyyy-MM-dd'));
      setCalendarOpen(false);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <Button variant="ghost" size="icon" onClick={handlePrevDay}>
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2">
            <span className="font-medium">
              {format(currentDate, 'EEE, d MMM yyyy')}
            </span>
            <CalendarIcon className="w-4 h-4 text-gray-500" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="single"
            selected={currentDate}
            onSelect={handleCalendarSelect}
            modifiers={{
              hasRunSheet: availableDates.map((d) => parseISO(d)),
            }}
            modifiersStyles={{
              hasRunSheet: {
                fontWeight: 'bold',
                textDecoration: 'underline',
              },
            }}
          />
        </PopoverContent>
      </Popover>

      <Button variant="ghost" size="icon" onClick={handleNextDay}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
```

### `src/components/run-sheet/ClinicianFilter.tsx`

Dropdown to filter by clinician.

```tsx
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Clinician {
  id: string;
  name: string;
}

interface ClinicianFilterProps {
  clinicians: Clinician[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function ClinicianFilter({
  clinicians,
  selectedId,
  onSelect,
}: ClinicianFilterProps) {
  return (
    <Select value={selectedId} onValueChange={onSelect}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select clinician" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Clinicians</SelectItem>
        {clinicians.map((clinician) => (
          <SelectItem key={clinician.id} value={clinician.id}>
            {clinician.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

### `src/components/run-sheet/AppointmentCard.tsx`

Individual appointment display card with invite actions.

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Check, Clock, AlertCircle, Send, RotateCcw } from 'lucide-react';

type InviteStatus = 'none' | 'queued' | 'sent' | 'failed';

interface Appointment {
  id: string;
  patientName: string | null;
  patientPhone: string | null;
  appointmentTime: string | null;
  clinicianId: string | null;
  clinicianName: string | null;
  inviteStatus: InviteStatus;
}

interface AppointmentCardProps {
  appointment: Appointment;
  onSendInvite: () => void;
}

export function AppointmentCard({
  appointment,
  onSendInvite,
}: AppointmentCardProps) {
  return (
    <div className="border rounded-lg p-3 bg-white hover:bg-gray-50 transition-colors">
      {/* Patient Name */}
      <div className="font-medium text-gray-900">
        {appointment.patientName || 'Unknown Patient'}
      </div>

      {/* Clinician */}
      <div className="text-sm text-gray-600 mt-0.5">
        {appointment.clinicianName || 'Unknown'}
      </div>

      {/* Phone */}
      {appointment.patientPhone && (
        <div className="text-sm text-gray-500 mt-1">
          {appointment.patientPhone}
        </div>
      )}

      {/* Invite Status / Actions */}
      <div className="mt-2">
        <InviteStatusDisplay
          status={appointment.inviteStatus}
          onSend={onSendInvite}
          onResend={onSendInvite}
        />
      </div>
    </div>
  );
}

interface InviteStatusDisplayProps {
  status: InviteStatus;
  onSend: () => void;
  onResend: () => void;
}

function InviteStatusDisplay({
  status,
  onSend,
  onResend,
}: InviteStatusDisplayProps) {
  switch (status) {
    case 'none':
      return (
        <Button variant="outline" size="sm" onClick={onSend} className="w-full">
          <Send className="w-3 h-3 mr-1" />
          Send Invite
        </Button>
      );

    case 'queued':
      return (
        <div className="flex items-center gap-1 text-xs text-amber-600">
          <Clock className="w-3 h-3" />
          Queued
        </div>
      );

    case 'sent':
      return (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-green-600">
            <Check className="w-3 h-3" />
            Sent
          </div>
          <Button variant="ghost" size="sm" onClick={onResend} className="h-6 px-2 text-xs">
            <RotateCcw className="w-3 h-3 mr-1" />
            Resend
          </Button>
        </div>
      );

    case 'failed':
      return (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-red-600">
            <AlertCircle className="w-3 h-3" />
            Failed
          </div>
          <Button variant="ghost" size="sm" onClick={onResend} className="h-6 px-2 text-xs">
            <RotateCcw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        </div>
      );

    default:
      return null;
  }
}
```

### `src/components/run-sheet/EmptyState.tsx` (Updated)

Supports compact mode for sidebar.

```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

interface EmptyStateProps {
  compact?: boolean;
}

export function EmptyState({ compact = false }: EmptyStateProps) {
  if (compact) {
    return (
      <div className="text-center py-6">
        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-600 mb-3">No run sheet for this day</p>
        <Link href="/run-sheet/upload">
          <Button size="sm">
            <Upload className="w-3 h-3 mr-1" />
            Upload
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        No Run Sheet for Today
      </h3>
      <p className="text-gray-600 mb-6 max-w-md mx-auto">
        Upload screenshots of your PMS appointment schedule to automatically
        generate today's run sheet.
      </p>
      <Link href="/run-sheet/upload">
        <Button>
          <Upload className="w-4 h-4 mr-2" />
          Upload Screenshots
        </Button>
      </Link>
    </div>
  );
}
```

---

## 3. API Endpoints

### `GET /api/run-sheet/dates`

Returns list of dates that have confirmed run sheets.

```ts
// src/app/api/run-sheet/dates/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { runSheets } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const sheets = await db
    .select({ date: runSheets.date })
    .from(runSheets)
    .where(eq(runSheets.status, 'confirmed'))
    .orderBy(runSheets.date);

  return NextResponse.json({
    dates: sheets.map((s) => s.date),
  });
}
```

### Update `GET /api/run-sheet/appointments`

Add invite status to response.

```ts
// Add to existing appointments endpoint
// Join with telehealthInvites to get status

const appointmentsWithInviteStatus = appointments.map((appt) => {
  const invite = telehealthInvites.find(
    (inv) =>
      inv.runSheetAppointmentId === appt.id ||
      (inv.phoneNumber === appt.patientPhone &&
        inv.appointmentDate === runSheet.date &&
        inv.appointmentTime === appt.appointmentTime)
  );

  return {
    ...appt,
    inviteStatus: invite ? invite.status : 'none',
  };
});
```

### `POST /api/telehealth-invites`

Queue a new invite or re-queue an existing one.

```ts
// src/app/api/telehealth-invites/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { telehealthInvites, runSheetAppointments, runSheets } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const { appointmentId } = await request.json();

  // Get appointment details
  const appointment = await db.query.runSheetAppointments.findFirst({
    where: eq(runSheetAppointments.id, appointmentId),
    with: {
      runSheet: true,
      clinician: true,
    },
  });

  if (!appointment) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  // Check for existing invite
  const existingInvite = await db.query.telehealthInvites.findFirst({
    where: eq(telehealthInvites.runSheetAppointmentId, appointmentId),
  });

  if (existingInvite) {
    // Re-queue existing invite
    await db
      .update(telehealthInvites)
      .set({
        status: 'queued',
        queuedAt: new Date(),
        sentAt: null,
        failedAt: null,
        failureReason: null,
      })
      .where(eq(telehealthInvites.id, existingInvite.id));
  } else {
    // Create new invite
    await db.insert(telehealthInvites).values({
      runSheetAppointmentId: appointmentId,
      phoneNumber: appointment.patientPhone || '',
      clinicianId: appointment.clinicianId,
      appointmentDate: appointment.runSheet.date,
      appointmentTime: appointment.appointmentTime || '',
      status: 'queued',
    });
  }

  return NextResponse.json({ success: true });
}
```

---

## 4. Future: SMS Reminders Modal Update

The existing TelehealthInviteModal will need updates to integrate with this system:

**Changes needed:**
1. When sending invites from the modal, create records in `telehealthInvites` table
2. Show invite status in the modal if re-opening for same appointments
3. Support pre-populating from run sheet appointments

**Note**: This is out of scope for Phase 5 but should be planned for. The run sheet sidebar provides the primary interface for managing day-of invites, while the modal can be used for bulk operations or manual entry.

---

## 5. Page Integration

### `src/app/(dashboard)/run-sheet/page.tsx`

Replace with sidebar component.

```tsx
import { RunSheetSidebar } from '@/components/run-sheet/RunSheetSidebar';

export default function RunSheetPage() {
  return (
    <div className="flex justify-center">
      <RunSheetSidebar />
    </div>
  );
}
```

**Note**: In production, this sidebar would be positioned on the right side of a main content area. For standalone viewing, it's centered.

---

## 6. Dependencies

Requires `date-fns` for date manipulation:

```bash
npm install date-fns
```

Requires shadcn calendar component:

```bash
npx shadcn-ui@latest add calendar popover
```

---

## Checklist

- [ ] Add `telehealthInviteStatusEnum` to schema
- [ ] Add `telehealthInvites` table to schema
- [ ] Run `npm run db:generate` and `npm run db:push`
- [ ] Install `date-fns` if not present
- [ ] Add shadcn `calendar` and `popover` components
- [ ] Create `src/components/run-sheet/RunSheetSidebar.tsx`
- [ ] Create `src/components/run-sheet/RunSheetDateNav.tsx`
- [ ] Create `src/components/run-sheet/ClinicianFilter.tsx`
- [ ] Create `src/components/run-sheet/AppointmentCard.tsx`
- [ ] Update `src/components/run-sheet/EmptyState.tsx`
- [ ] Create `src/app/api/run-sheet/dates/route.ts`
- [ ] Create `src/app/api/telehealth-invites/route.ts`
- [ ] Update appointments endpoint for invite status
- [ ] Update `src/app/(dashboard)/run-sheet/page.tsx`
- [ ] Test date navigation (arrows + calendar)
- [ ] Test clinician filtering
- [ ] Test send invite flow
- [ ] Test resend invite flow
- [ ] Verify sparse timeline (only shows filled times)
- [ ] (Future) Update TelehealthInviteModal to use telehealthInvites table
