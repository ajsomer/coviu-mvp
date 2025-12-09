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
