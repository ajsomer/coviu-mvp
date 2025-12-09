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
