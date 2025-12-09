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
      <h3 className="font-semibold text-lg">{clinicianName}&apos;s Appointments</h3>

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
