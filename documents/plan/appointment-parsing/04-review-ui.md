# Phase 4: Review UI

## Objectives

- Build editable table for reviewing parsed appointments
- Allow inline editing of all fields
- Support adding manual appointments
- Support deleting incorrect appointments
- Highlight low-confidence rows
- Confirm and save final run sheet

## Prerequisites

- Phase 3 complete (parsing engine working)
- Appointments being saved to database

## 1. Components

### `src/components/run-sheet/AppointmentReviewTable.tsx`

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Trash2, Plus, AlertTriangle } from 'lucide-react';

interface Appointment {
  id: string;
  patientName: string | null;
  patientPhone: string | null;
  appointmentTime: string | null;
  appointmentType: string | null;
  clinicianName?: string | null;
  confidence: number | null;
  isManualEntry: boolean;
}

interface AppointmentReviewTableProps {
  appointments: Appointment[];
  onUpdate: (id: string, field: string, value: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAdd: () => void;
}

export function AppointmentReviewTable({
  appointments,
  onUpdate,
  onDelete,
  onAdd,
}: AppointmentReviewTableProps) {
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const handleStartEdit = (id: string, field: string, currentValue: string | null) => {
    setEditingCell({ id, field });
    setEditValue(currentValue || '');
  };

  const handleSaveEdit = async () => {
    if (!editingCell) return;

    setSaving(true);
    try {
      await onUpdate(editingCell.id, editingCell.field, editValue);
    } finally {
      setSaving(false);
      setEditingCell(null);
      setEditValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setEditValue('');
    }
  };

  const isEditing = (id: string, field: string) =>
    editingCell?.id === id && editingCell?.field === field;

  const isLowConfidence = (confidence: number | null) =>
    confidence !== null && confidence < 0.6;

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Time</TableHead>
            <TableHead>Patient Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Clinician</TableHead>
            <TableHead className="w-16">Conf.</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {appointments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                No appointments found. Add one manually or upload another screenshot.
              </TableCell>
            </TableRow>
          ) : (
            appointments.map((appt) => (
              <TableRow
                key={appt.id}
                className={isLowConfidence(appt.confidence) ? 'bg-yellow-50' : ''}
              >
                {/* Time */}
                <TableCell>
                  {isEditing(appt.id, 'appointmentTime') ? (
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleSaveEdit}
                      onKeyDown={handleKeyDown}
                      className="h-8 w-20"
                      autoFocus
                      disabled={saving}
                    />
                  ) : (
                    <span
                      onClick={() => handleStartEdit(appt.id, 'appointmentTime', appt.appointmentTime)}
                      className="cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded"
                    >
                      {appt.appointmentTime || '—'}
                    </span>
                  )}
                </TableCell>

                {/* Patient Name */}
                <TableCell>
                  {isEditing(appt.id, 'patientName') ? (
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleSaveEdit}
                      onKeyDown={handleKeyDown}
                      className="h-8"
                      autoFocus
                      disabled={saving}
                    />
                  ) : (
                    <span
                      onClick={() => handleStartEdit(appt.id, 'patientName', appt.patientName)}
                      className="cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded"
                    >
                      {appt.patientName || '—'}
                    </span>
                  )}
                </TableCell>

                {/* Phone */}
                <TableCell>
                  {isEditing(appt.id, 'patientPhone') ? (
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleSaveEdit}
                      onKeyDown={handleKeyDown}
                      className="h-8 w-32"
                      autoFocus
                      disabled={saving}
                    />
                  ) : (
                    <span
                      onClick={() => handleStartEdit(appt.id, 'patientPhone', appt.patientPhone)}
                      className="cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded"
                    >
                      {appt.patientPhone || '—'}
                    </span>
                  )}
                </TableCell>

                {/* Type */}
                <TableCell>
                  {isEditing(appt.id, 'appointmentType') ? (
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={handleSaveEdit}
                      onKeyDown={handleKeyDown}
                      className="h-8 w-24"
                      autoFocus
                      disabled={saving}
                    />
                  ) : (
                    <span
                      onClick={() => handleStartEdit(appt.id, 'appointmentType', appt.appointmentType)}
                      className="cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded"
                    >
                      {appt.appointmentType || '—'}
                    </span>
                  )}
                </TableCell>

                {/* Clinician */}
                <TableCell>
                  <span className="text-gray-600">
                    {appt.clinicianName || 'Unknown'}
                  </span>
                </TableCell>

                {/* Confidence */}
                <TableCell>
                  <div className="flex items-center gap-1">
                    {isLowConfidence(appt.confidence) && (
                      <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    )}
                    <span
                      className={
                        isLowConfidence(appt.confidence)
                          ? 'text-yellow-600 font-medium'
                          : 'text-gray-500'
                      }
                    >
                      {appt.confidence !== null
                        ? `${Math.round(appt.confidence * 100)}%`
                        : '—'}
                    </span>
                  </div>
                </TableCell>

                {/* Delete */}
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(appt.id)}
                    className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Button variant="outline" onClick={onAdd} className="w-full">
        <Plus className="w-4 h-4 mr-2" />
        Add Appointment Manually
      </Button>
    </div>
  );
}
```

### `src/components/run-sheet/AddAppointmentForm.tsx`

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AddAppointmentFormProps {
  open: boolean;
  onClose: () => void;
  onAdd: (appointment: {
    patientName: string;
    patientPhone: string;
    appointmentTime: string;
    appointmentType: string;
    clinicianName: string;
  }) => Promise<void>;
}

export function AddAppointmentForm({ open, onClose, onAdd }: AddAppointmentFormProps) {
  const [formData, setFormData] = useState({
    patientName: '',
    patientPhone: '',
    appointmentTime: '',
    appointmentType: '',
    clinicianName: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onAdd(formData);
      setFormData({
        patientName: '',
        patientPhone: '',
        appointmentTime: '',
        appointmentType: '',
        clinicianName: '',
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Appointment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                placeholder="09:30"
                value={formData.appointmentTime}
                onChange={(e) =>
                  setFormData({ ...formData, appointmentTime: e.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Input
                id="type"
                placeholder="CONSULT"
                value={formData.appointmentType}
                onChange={(e) =>
                  setFormData({ ...formData, appointmentType: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Patient Name</Label>
            <Input
              id="name"
              placeholder="John Smith"
              value={formData.patientName}
              onChange={(e) =>
                setFormData({ ...formData, patientName: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              placeholder="0412 345 678"
              value={formData.patientPhone}
              onChange={(e) =>
                setFormData({ ...formData, patientPhone: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clinician">Clinician</Label>
            <Input
              id="clinician"
              placeholder="Dr. Smith"
              value={formData.clinicianName}
              onChange={(e) =>
                setFormData({ ...formData, clinicianName: e.target.value })
              }
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Adding...' : 'Add Appointment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

## 2. Review Page

Replace `src/app/(dashboard)/run-sheet/review/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppointmentReviewTable } from '@/components/run-sheet/AppointmentReviewTable';
import { AddAppointmentForm } from '@/components/run-sheet/AddAppointmentForm';
import { AlertTriangle } from 'lucide-react';

interface Appointment {
  id: string;
  patientName: string | null;
  patientPhone: string | null;
  appointmentTime: string | null;
  appointmentType: string | null;
  clinicianName?: string | null;
  confidence: number | null;
  isManualEntry: boolean;
}

export default function ReviewPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    try {
      const response = await fetch('/api/run-sheet/appointments');
      const data = await response.json();
      setAppointments(data.appointments || []);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: string, field: string, value: string) => {
    try {
      await fetch(`/api/run-sheet/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });

      setAppointments((prev) =>
        prev.map((appt) =>
          appt.id === id ? { ...appt, [field]: value } : appt
        )
      );
    } catch (error) {
      console.error('Error updating appointment:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this appointment?')) return;

    try {
      await fetch(`/api/run-sheet/appointments/${id}`, {
        method: 'DELETE',
      });

      setAppointments((prev) => prev.filter((appt) => appt.id !== id));
    } catch (error) {
      console.error('Error deleting appointment:', error);
    }
  };

  const handleAdd = async (appointment: {
    patientName: string;
    patientPhone: string;
    appointmentTime: string;
    appointmentType: string;
    clinicianName: string;
  }) => {
    try {
      const response = await fetch('/api/run-sheet/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appointment),
      });

      const data = await response.json();
      if (data.appointment) {
        setAppointments((prev) => [...prev, { ...data.appointment, ...appointment }]);
      }
    } catch (error) {
      console.error('Error adding appointment:', error);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const response = await fetch('/api/run-sheet/confirm', {
        method: 'POST',
      });

      if (response.ok) {
        router.push('/run-sheet');
      } else {
        alert('Failed to confirm run sheet');
      }
    } catch (error) {
      console.error('Error confirming run sheet:', error);
      alert('Failed to confirm run sheet');
    } finally {
      setConfirming(false);
    }
  };

  const lowConfidenceCount = appointments.filter(
    (a) => a.confidence !== null && a.confidence < 0.6
  ).length;

  const clinicianCount = new Set(
    appointments.map((a) => a.clinicianName).filter(Boolean)
  ).size;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading appointments...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Review Appointments</h1>
        <div className="flex gap-2">
          <Link href="/run-sheet/upload">
            <Button variant="outline">← Back to Upload</Button>
          </Link>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm">
        <span className="text-gray-600">
          Found <strong>{appointments.length}</strong> appointments
        </span>
        {clinicianCount > 0 && (
          <span className="text-gray-600">
            across <strong>{clinicianCount}</strong> clinician{clinicianCount !== 1 ? 's' : ''}
          </span>
        )}
        {lowConfidenceCount > 0 && (
          <span className="text-yellow-600 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            <strong>{lowConfidenceCount}</strong> need review
          </span>
        )}
      </div>

      {/* Appointments Table */}
      <Card>
        <CardHeader>
          <CardTitle>Appointments</CardTitle>
        </CardHeader>
        <CardContent>
          <AppointmentReviewTable
            appointments={appointments}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onAdd={() => setShowAddForm(true)}
          />
        </CardContent>
      </Card>

      {/* Warning */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-yellow-800">
            This will overwrite any existing run sheet for today
          </p>
          <p className="text-sm text-yellow-700 mt-1">
            Make sure all appointments are correct before confirming.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Link href="/run-sheet/upload">
          <Button variant="outline">Cancel</Button>
        </Link>
        <Button
          onClick={handleConfirm}
          disabled={confirming || appointments.length === 0}
        >
          {confirming ? 'Confirming...' : 'Confirm Run Sheet'}
        </Button>
      </div>

      {/* Add Form Dialog */}
      <AddAppointmentForm
        open={showAddForm}
        onClose={() => setShowAddForm(false)}
        onAdd={handleAdd}
      />
    </div>
  );
}
```

## 3. Update Drizzle Relations (Optional)

If you want to use Drizzle's `with` clause for fetching clinicians, add relations to `src/db/schema.ts`:

```typescript
import { relations } from 'drizzle-orm';

// Add after table definitions
export const runSheetAppointmentsRelations = relations(runSheetAppointments, ({ one }) => ({
  clinician: one(runSheetClinicians, {
    fields: [runSheetAppointments.clinicianId],
    references: [runSheetClinicians.id],
  }),
  runSheet: one(runSheets, {
    fields: [runSheetAppointments.runSheetId],
    references: [runSheets.id],
  }),
  screenshot: one(runSheetScreenshots, {
    fields: [runSheetAppointments.screenshotId],
    references: [runSheetScreenshots.id],
  }),
}));

export const runSheetCliniciansRelations = relations(runSheetClinicians, ({ many }) => ({
  appointments: many(runSheetAppointments),
}));
```

Then update `src/db/index.ts` to include schema for relations:

```typescript
import * as schema from './schema';

export const db = drizzle(sql, { schema });
```

## Checklist

- [ ] Create `src/components/run-sheet/AppointmentReviewTable.tsx`
- [ ] Create `src/components/run-sheet/AddAppointmentForm.tsx`
- [ ] Update `src/app/(dashboard)/run-sheet/review/page.tsx`
- [ ] (Optional) Add Drizzle relations for cleaner queries
- [ ] Test inline editing
- [ ] Test adding manual appointments
- [ ] Test deleting appointments
- [ ] Test confirming the run sheet
- [ ] Verify low-confidence highlighting works
