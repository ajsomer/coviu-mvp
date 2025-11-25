'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Plus, Trash2, Send } from 'lucide-react';

interface Clinician {
  id: string;
  name: string;
}

interface InviteRow {
  id: string;
  phoneNumber: string;
  clinicianId: string;
  appointmentTime: string;
}

const TIME_SLOTS = Array.from({ length: 24 }, (_, hour) =>
  ['00', '30'].map((min) => `${hour.toString().padStart(2, '0')}:${min}`)
).flat();

const MESSAGE_TEMPLATE = 'Hi there, for your appointment with [clinician name] at [time], please click on this link: [link]';

function createEmptyInviteRow(): InviteRow {
  return {
    id: crypto.randomUUID(),
    phoneNumber: '',
    clinicianId: '',
    appointmentTime: '',
  };
}

export function TelehealthInviteModal() {
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [inviteRows, setInviteRows] = useState<InviteRow[]>([createEmptyInviteRow()]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchClinicians();
  }, []);

  async function fetchClinicians() {
    try {
      const response = await fetch('/api/specialists');
      const data = await response.json();
      const clinicianList = (data.data || []).map((s: { id: string; name: string }) => ({
        id: s.id,
        name: s.name,
      }));
      setClinicians(clinicianList);
    } catch (error) {
      console.error('Error fetching clinicians:', error);
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
  }

  function handleInvite() {
    alert('Invites sent! (Demo only - no actual invites sent)');
    setOpen(false);
    resetForm();
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

        <div className="space-y-6">
          {/* Message Preview */}
          <MessagePreview template={MESSAGE_TEMPLATE} />

          {/* Invite Rows */}
          <div className="space-y-4">
            {inviteRows.map((row) => (
              <InviteRowForm
                key={row.id}
                row={row}
                clinicians={clinicians}
                onUpdate={updateInviteRow}
                onRemove={removeInviteRow}
                canRemove={inviteRows.length > 1}
              />
            ))}

            {/* Add Row Button */}
            <Button variant="outline" onClick={addInviteRow} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Add Another Patient
            </Button>
          </div>

          {/* Invite Button */}
          <Button onClick={handleInvite} className="w-full">
            <Send className="w-4 h-4 mr-2" />
            Send Invites
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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

function InviteRowForm({ row, clinicians, onUpdate, onRemove, canRemove }: InviteRowFormProps) {
  return (
    <div className="flex items-end gap-3 p-4 border rounded-lg bg-gray-50">
      <div className="flex-1 space-y-2">
        <Label htmlFor={`phone-${row.id}`}>Phone Number</Label>
        <Input
          id={`phone-${row.id}`}
          type="tel"
          placeholder="+61 400 000 000"
          value={row.phoneNumber}
          onChange={(e) => onUpdate(row.id, 'phoneNumber', e.target.value)}
        />
      </div>

      <div className="flex-1 space-y-2">
        <Label htmlFor={`clinician-${row.id}`}>Clinician Name</Label>
        <Select
          value={row.clinicianId}
          onValueChange={(value) => onUpdate(row.id, 'clinicianId', value)}
        >
          <SelectTrigger id={`clinician-${row.id}`}>
            <SelectValue placeholder="Select clinician" />
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

      <div className="flex-1 space-y-2">
        <Label htmlFor={`time-${row.id}`}>Time (24hr)</Label>
        <Select
          value={row.appointmentTime}
          onValueChange={(value) => onUpdate(row.id, 'appointmentTime', value)}
        >
          <SelectTrigger id={`time-${row.id}`}>
            <SelectValue placeholder="Select time" />
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
        className="text-red-600 hover:text-red-700"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
