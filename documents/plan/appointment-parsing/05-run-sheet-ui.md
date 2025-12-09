# Phase 5: Run Sheet UI

## Objectives

- Display confirmed run sheet with clinician tabs
- Show appointment list per clinician
- Allow editing (return to review) and re-upload

## Prerequisites

- Phase 4 complete (review UI working, can confirm run sheet)

## 1. Components

### `src/components/run-sheet/ClinicianTabs.tsx`

```tsx
'use client';

interface Clinician {
  id: string;
  name: string;
  appointmentCount: number;
}

interface ClinicianTabsProps {
  clinicians: Clinician[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ClinicianTabs({ clinicians, selectedId, onSelect }: ClinicianTabsProps) {
  if (clinicians.length === 0) {
    return null;
  }

  return (
    <div className="border-b">
      <nav className="flex gap-1 -mb-px">
        {clinicians.map((clinician) => (
          <button
            key={clinician.id}
            onClick={() => onSelect(clinician.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              selectedId === clinician.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {clinician.name}
            <span className="ml-2 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
              {clinician.appointmentCount}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
```

### `src/components/run-sheet/RunSheetTable.tsx`

```tsx
'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Appointment {
  id: string;
  patientName: string | null;
  patientPhone: string | null;
  appointmentTime: string | null;
  appointmentType: string | null;
}

interface RunSheetTableProps {
  appointments: Appointment[];
  clinicianName: string;
}

export function RunSheetTable({ appointments, clinicianName }: RunSheetTableProps) {
  // Sort by time
  const sortedAppointments = [...appointments].sort((a, b) => {
    const timeA = a.appointmentTime || '';
    const timeB = b.appointmentTime || '';
    return timeA.localeCompare(timeB);
  });

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">{clinicianName}'s Appointments</h3>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Time</TableHead>
            <TableHead>Patient</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Type</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedAppointments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                No appointments for this clinician
              </TableCell>
            </TableRow>
          ) : (
            sortedAppointments.map((appt) => (
              <TableRow key={appt.id}>
                <TableCell className="font-mono">{appt.appointmentTime || '—'}</TableCell>
                <TableCell className="font-medium">{appt.patientName || '—'}</TableCell>
                <TableCell>{appt.patientPhone || '—'}</TableCell>
                <TableCell>
                  <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-sm">
                    {appt.appointmentType || '—'}
                  </span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

### `src/components/run-sheet/EmptyState.tsx`

```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="text-center py-12">
      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        No Run Sheet for Today
      </h3>
      <p className="text-gray-600 mb-6 max-w-md mx-auto">
        Upload screenshots of your PMS appointment schedule to automatically generate today's run sheet.
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

## 2. Main Run Sheet Page

Replace `src/app/(dashboard)/run-sheet/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClinicianTabs } from '@/components/run-sheet/ClinicianTabs';
import { RunSheetTable } from '@/components/run-sheet/RunSheetTable';
import { EmptyState } from '@/components/run-sheet/EmptyState';
import { Pencil, RefreshCw, Upload } from 'lucide-react';

interface RunSheet {
  id: string;
  date: string;
  status: 'draft' | 'reviewing' | 'confirmed';
}

interface Clinician {
  id: string;
  name: string;
}

interface Appointment {
  id: string;
  patientName: string | null;
  patientPhone: string | null;
  appointmentTime: string | null;
  appointmentType: string | null;
  clinicianId: string | null;
}

export default function RunSheetPage() {
  const [runSheet, setRunSheet] = useState<RunSheet | null>(null);
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedClinicianId, setSelectedClinicianId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch run sheet
      const rsResponse = await fetch('/api/run-sheet');
      const rsData = await rsResponse.json();
      setRunSheet(rsData);

      if (rsData && rsData.status === 'confirmed') {
        // Fetch clinicians
        const clinResponse = await fetch('/api/run-sheet/clinicians');
        const clinData = await clinResponse.json();
        setClinicians(clinData.clinicians || []);

        // Fetch appointments
        const apptResponse = await fetch('/api/run-sheet/appointments');
        const apptData = await apptResponse.json();
        setAppointments(apptData.appointments || []);

        // Select first clinician by default
        if (clinData.clinicians?.length > 0) {
          setSelectedClinicianId(clinData.clinicians[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReUpload = async () => {
    if (!confirm('This will delete the current run sheet. Continue?')) return;

    try {
      await fetch('/api/run-sheet', { method: 'DELETE' });
      window.location.href = '/run-sheet/upload';
    } catch (error) {
      console.error('Error deleting run sheet:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  // No run sheet or not confirmed yet
  if (!runSheet || runSheet.status !== 'confirmed') {
    // If draft/reviewing, redirect to appropriate page
    if (runSheet?.status === 'draft') {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Daily Run Sheet</h1>
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-gray-600 mb-4">
                You have an upload in progress.
              </p>
              <Link href="/run-sheet/upload">
                <Button>Continue Upload</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (runSheet?.status === 'reviewing') {
      return (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Daily Run Sheet</h1>
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-gray-600 mb-4">
                You have appointments ready for review.
              </p>
              <Link href="/run-sheet/review">
                <Button>Review Appointments</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Daily Run Sheet</h1>
        <Card>
          <CardContent className="py-8">
            <EmptyState />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Format date
  const dateStr = new Date(runSheet.date + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Get clinicians with appointment counts
  const cliniciansWithCounts = clinicians.map((c) => ({
    ...c,
    appointmentCount: appointments.filter((a) => a.clinicianId === c.id).length,
  }));

  // Handle "Unknown" clinician (appointments without clinicianId)
  const unknownAppointments = appointments.filter((a) => !a.clinicianId);
  if (unknownAppointments.length > 0) {
    cliniciansWithCounts.push({
      id: 'unknown',
      name: 'Unknown',
      appointmentCount: unknownAppointments.length,
    });
  }

  // Get appointments for selected clinician
  const selectedAppointments = selectedClinicianId === 'unknown'
    ? unknownAppointments
    : appointments.filter((a) => a.clinicianId === selectedClinicianId);

  const selectedClinician = cliniciansWithCounts.find((c) => c.id === selectedClinicianId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Daily Run Sheet</h1>
          <p className="text-gray-600">{dateStr}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/run-sheet/review">
            <Button variant="outline">
              <Pencil className="w-4 h-4 mr-2" />
              Edit
            </Button>
          </Link>
          <Button variant="outline" onClick={handleReUpload}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Re-upload
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="text-sm text-gray-600">
        {appointments.length} appointment{appointments.length !== 1 ? 's' : ''} across{' '}
        {cliniciansWithCounts.length} clinician{cliniciansWithCounts.length !== 1 ? 's' : ''}
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader className="pb-0">
          <ClinicianTabs
            clinicians={cliniciansWithCounts}
            selectedId={selectedClinicianId}
            onSelect={setSelectedClinicianId}
          />
        </CardHeader>
        <CardContent className="pt-6">
          {selectedClinician ? (
            <RunSheetTable
              appointments={selectedAppointments}
              clinicianName={selectedClinician.name}
            />
          ) : (
            <p className="text-gray-500 text-center py-8">
              Select a clinician to view appointments
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

## 3. Update Navigation Active State (Optional)

If you want to highlight the active nav item, update `src/app/(dashboard)/layout.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (path: string) => pathname?.startsWith(path);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="text-xl font-bold text-gray-900">
                Coviu Triage
              </Link>
              <nav className="flex gap-4">
                <Link
                  href="/dashboard"
                  className={isActive('/dashboard') && !isActive('/dashboard/') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}
                >
                  Dashboard
                </Link>
                <Link
                  href="/form-templates"
                  className={isActive('/form-templates') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}
                >
                  Form Templates
                </Link>
                <Link
                  href="/telehealth-invites"
                  className={isActive('/telehealth-invites') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}
                >
                  Telehealth Invites
                </Link>
                <Link
                  href="/run-sheet"
                  className={isActive('/run-sheet') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}
                >
                  Run Sheet
                </Link>
              </nav>
            </div>
            <div className="text-sm text-gray-500">
              Prototype - No Authentication
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
```

## Checklist

- [ ] Create `src/components/run-sheet/ClinicianTabs.tsx`
- [ ] Create `src/components/run-sheet/RunSheetTable.tsx`
- [ ] Create `src/components/run-sheet/EmptyState.tsx`
- [ ] Update `src/app/(dashboard)/run-sheet/page.tsx`
- [ ] (Optional) Update dashboard layout for active nav states
- [ ] Test viewing confirmed run sheet
- [ ] Test clinician tab switching
- [ ] Test edit button (goes to review)
- [ ] Test re-upload button (deletes and redirects)
- [ ] Verify appointments sorted by time
