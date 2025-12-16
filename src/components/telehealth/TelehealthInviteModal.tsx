'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Send, ArrowLeft, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

type ModalStep = 'date-selection' | 'calendar' | 'invite-entry';

interface Clinician {
  id: string;
  name: string;
}

interface InviteRow {
  id: string;
  patientName: string;
  phoneNumber: string;
  clinicianId: string;
  appointmentTime: string;
}

const TIME_SLOTS = Array.from({ length: 24 }, (_, hour) =>
  ['00', '30'].map((min) => `${hour.toString().padStart(2, '0')}:${min}`)
).flat();

const MINUTES_OPTIONS = [
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '45', label: '45 minutes' },
  { value: '60', label: '60 minutes' },
];

const MESSAGE_TEMPLATE =
  'Hi [patient name], for your appointment with [clinician] at [time], please click on this link: [link]';

function createEmptyInviteRow(): InviteRow {
  return {
    id: crypto.randomUUID(),
    patientName: '',
    phoneNumber: '',
    clinicianId: '',
    appointmentTime: '',
  };
}

export function TelehealthInviteModal() {
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [inviteRows, setInviteRows] = useState<InviteRow[]>([createEmptyInviteRow()]);
  const [open, setOpen] = useState(false);

  // Step management
  const [step, setStep] = useState<ModalStep>('date-selection');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Scheduling state
  const [scheduleBeforeAppointment, setScheduleBeforeAppointment] = useState(false);
  const [minutesBefore, setMinutesBefore] = useState('30');

  // Loading state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset to date selection when modal opens
  useEffect(() => {
    if (open) {
      setStep('date-selection');
      setSelectedDate(new Date());
      setClinicians([]);
    }
  }, [open]);

  // Fetch clinicians when date is selected and we move to invite entry
  useEffect(() => {
    if (step === 'invite-entry') {
      fetchClinicians(selectedDate);
    }
  }, [step, selectedDate]);

  async function fetchClinicians(date: Date) {
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const response = await fetch(`/api/run-sheet/clinicians?date=${dateStr}`);
      const data = await response.json();
      setClinicians(data.clinicians || []);
    } catch (error) {
      console.error('Error fetching clinicians:', error);
    }
  }

  function handleSelectToday() {
    setSelectedDate(new Date());
    setStep('invite-entry');
  }

  function handleSelectAnotherDay() {
    setStep('calendar');
  }

  function handleCalendarSelect(date: Date | undefined) {
    if (date) {
      setSelectedDate(date);
      setStep('invite-entry');
    }
  }

  function handleBack() {
    if (step === 'calendar') {
      setStep('date-selection');
    } else if (step === 'invite-entry') {
      setStep('date-selection');
    }
  }

  function addInviteRow() {
    setInviteRows([...inviteRows, createEmptyInviteRow()]);
  }

  function removeInviteRow(id: string) {
    if (inviteRows.length > 1) {
      setInviteRows(inviteRows.filter((row) => row.id !== id));
    }
  }

  function updateInviteRow(id: string, field: keyof InviteRow, value: string) {
    setInviteRows(
      inviteRows.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  }

  function resetForm() {
    setInviteRows([createEmptyInviteRow()]);
    setScheduleBeforeAppointment(false);
    setMinutesBefore('30');
    setStep('date-selection');
    setSelectedDate(new Date());
  }

  async function handleQueueInvites() {
    try {
      const validRows = inviteRows.filter(
        (row) => row.phoneNumber && row.clinicianId && row.appointmentTime
      );

      if (validRows.length === 0) {
        alert('Please fill in at least one complete invite row (phone, clinician, and time are required)');
        return;
      }

      setIsSubmitting(true);

      const response = await fetch('/api/telehealth-invites/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invites: validRows.map((row) => ({
            patientName: row.patientName || null,
            phoneNumber: row.phoneNumber,
            clinicianId: row.clinicianId,
            appointmentTime: row.appointmentTime,
            appointmentDate: format(selectedDate, 'yyyy-MM-dd'),
            minutesBefore: scheduleBeforeAppointment ? parseInt(minutesBefore) : null,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to queue invites');
      }

      alert(
        scheduleBeforeAppointment
          ? `${validRows.length} invite(s) scheduled for ${minutesBefore} minutes before appointments`
          : `${validRows.length} invite(s) queued for immediate sending`
      );
      setOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error queueing invites:', error);
      alert('Failed to queue invites');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Send className="w-4 h-4 mr-2" />
          Invite
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Telehealth Invites</DialogTitle>
        </DialogHeader>

        {/* Step 1: Date Selection */}
        {step === 'date-selection' && (
          <DateSelectionStep
            onSelectToday={handleSelectToday}
            onSelectAnotherDay={handleSelectAnotherDay}
          />
        )}

        {/* Step 1b: Calendar Selection */}
        {step === 'calendar' && (
          <CalendarStep
            selectedDate={selectedDate}
            onSelect={handleCalendarSelect}
            onBack={handleBack}
          />
        )}

        {/* Step 2: Invite Entry */}
        {step === 'invite-entry' && (
          <InviteEntryStep
            selectedDate={selectedDate}
            inviteRows={inviteRows}
            clinicians={clinicians}
            scheduleBeforeAppointment={scheduleBeforeAppointment}
            minutesBefore={minutesBefore}
            isSubmitting={isSubmitting}
            onBack={handleBack}
            onAddRow={addInviteRow}
            onRemoveRow={removeInviteRow}
            onUpdateRow={updateInviteRow}
            onScheduleChange={setScheduleBeforeAppointment}
            onMinutesChange={setMinutesBefore}
            onSubmit={handleQueueInvites}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Step 1: Date Selection
interface DateSelectionStepProps {
  onSelectToday: () => void;
  onSelectAnotherDay: () => void;
}

function DateSelectionStep({ onSelectToday, onSelectAnotherDay }: DateSelectionStepProps) {
  const today = new Date();

  return (
    <div className="py-8">
      <p className="text-center text-gray-600 mb-6">
        Which day are these appointments for?
      </p>
      <div className="flex justify-center gap-4">
        <Button
          variant="outline"
          className="h-24 w-40 flex flex-col items-center justify-center gap-1"
          onClick={onSelectToday}
        >
          <span className="font-semibold">Today</span>
          <span className="text-sm text-gray-500">
            {format(today, 'EEE, d MMM')}
          </span>
        </Button>
        <Button
          variant="outline"
          className="h-24 w-40 flex flex-col items-center justify-center gap-1"
          onClick={onSelectAnotherDay}
        >
          <CalendarIcon className="w-5 h-5 mb-1" />
          <span className="font-semibold">Another Day</span>
          <span className="text-sm text-gray-500">Select date</span>
        </Button>
      </div>
    </div>
  );
}

// Step 1b: Calendar Selection
interface CalendarStepProps {
  selectedDate: Date;
  onSelect: (date: Date | undefined) => void;
  onBack: () => void;
}

function CalendarStep({ selectedDate, onSelect, onBack }: CalendarStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <span className="text-sm text-gray-600">Select a date</span>
      </div>
      <div className="flex justify-center">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={onSelect}
          className="rounded-md border"
        />
      </div>
    </div>
  );
}

// Step 2: Invite Entry
interface InviteEntryStepProps {
  selectedDate: Date;
  inviteRows: InviteRow[];
  clinicians: Clinician[];
  scheduleBeforeAppointment: boolean;
  minutesBefore: string;
  isSubmitting: boolean;
  onBack: () => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onUpdateRow: (id: string, field: keyof InviteRow, value: string) => void;
  onScheduleChange: (value: boolean) => void;
  onMinutesChange: (value: string) => void;
  onSubmit: () => void;
}

function InviteEntryStep({
  selectedDate,
  inviteRows,
  clinicians,
  scheduleBeforeAppointment,
  minutesBefore,
  isSubmitting,
  onBack,
  onAddRow,
  onRemoveRow,
  onUpdateRow,
  onScheduleChange,
  onMinutesChange,
  onSubmit,
}: InviteEntryStepProps) {
  return (
    <div className="space-y-6">
      {/* Header with back button and date */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <span className="text-sm font-medium">
          {format(selectedDate, 'EEE, d MMMM yyyy')}
        </span>
      </div>

      {/* Message Preview */}
      <MessagePreview template={MESSAGE_TEMPLATE} />

      {/* Invite Rows */}
      <div className="space-y-4">
        {inviteRows.map((row) => (
          <InviteRowForm
            key={row.id}
            row={row}
            clinicians={clinicians}
            onUpdate={onUpdateRow}
            onRemove={onRemoveRow}
            canRemove={inviteRows.length > 1}
          />
        ))}

        <Button variant="outline" onClick={onAddRow} className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          Add Another Patient
        </Button>
      </div>

      {/* Scheduling Options */}
      <div className="border rounded-lg p-4 space-y-4">
        <Label className="text-sm font-medium">Scheduling</Label>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id="schedule-before"
              checked={scheduleBeforeAppointment}
              onCheckedChange={(checked) => onScheduleChange(checked === true)}
            />
            <div className="space-y-1">
              <label
                htmlFor="schedule-before"
                className="text-sm font-medium cursor-pointer"
              >
                Schedule invites before appointment
              </label>
              {scheduleBeforeAppointment && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>Send</span>
                  <Select value={minutesBefore} onValueChange={onMinutesChange}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MINUTES_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span>before appointment time</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="send-immediately"
              checked={!scheduleBeforeAppointment}
              onCheckedChange={(checked) => onScheduleChange(checked !== true)}
            />
            <label
              htmlFor="send-immediately"
              className="text-sm font-medium cursor-pointer"
            >
              Send immediately
            </label>
          </div>
        </div>
      </div>

      {/* Queue Button */}
      <Button onClick={onSubmit} className="w-full" disabled={isSubmitting}>
        <Send className="w-4 h-4 mr-2" />
        {isSubmitting ? 'Queueing...' : 'Queue Invites'}
      </Button>
    </div>
  );
}

interface MessagePreviewProps {
  template: string;
}

function MessagePreview({ template }: MessagePreviewProps) {
  return (
    <div className="space-y-2">
      <Label>Message Preview</Label>
      <div className="bg-gray-100 p-4 rounded-md text-sm">{template}</div>
    </div>
  );
}

interface InviteRowFormProps {
  row: InviteRow;
  clinicians: Clinician[];
  onUpdate: (id: string, field: keyof InviteRow, value: string) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

function InviteRowForm({
  row,
  clinicians,
  onUpdate,
  onRemove,
  canRemove,
}: InviteRowFormProps) {
  return (
    <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
      {/* Row 1: Patient Name and Phone */}
      <div className="flex gap-3">
        <div className="flex-1 space-y-1">
          <Label htmlFor={`name-${row.id}`} className="text-xs">
            Patient Name
          </Label>
          <Input
            id={`name-${row.id}`}
            placeholder="John Smith"
            value={row.patientName}
            onChange={(e) => onUpdate(row.id, 'patientName', e.target.value)}
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label htmlFor={`phone-${row.id}`} className="text-xs">
            Phone Number
          </Label>
          <Input
            id={`phone-${row.id}`}
            type="tel"
            placeholder="0412 345 678"
            value={row.phoneNumber}
            onChange={(e) => onUpdate(row.id, 'phoneNumber', e.target.value)}
          />
        </div>
      </div>

      {/* Row 2: Clinician, Time, Delete */}
      <div className="flex gap-3 items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor={`clinician-${row.id}`} className="text-xs">
            Clinician
          </Label>
          <Select
            value={row.clinicianId}
            onValueChange={(value) => onUpdate(row.id, 'clinicianId', value)}
          >
            <SelectTrigger id={`clinician-${row.id}`}>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {clinicians.map((clinician) => (
                <SelectItem key={clinician.id} value={clinician.id}>
                  {clinician.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 space-y-1">
          <Label htmlFor={`time-${row.id}`} className="text-xs">
            Time
          </Label>
          <Select
            value={row.appointmentTime}
            onValueChange={(value) => onUpdate(row.id, 'appointmentTime', value)}
          >
            <SelectTrigger id={`time-${row.id}`}>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {TIME_SLOTS.map((time) => (
                <SelectItem key={time} value={time}>
                  {time}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={() => onRemove(row.id)}
          disabled={!canRemove}
          className="text-red-600 hover:text-red-700 shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
