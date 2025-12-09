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
      // Map clinician data to clinicianName for the table
      const mappedAppointments = (data.appointments || []).map((appt: Record<string, unknown>) => ({
        ...appt,
        clinicianName: appt.clinician ? (appt.clinician as { name: string }).name : null,
      }));
      setAppointments(mappedAppointments);
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
            <Button variant="outline">Back to Upload</Button>
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
