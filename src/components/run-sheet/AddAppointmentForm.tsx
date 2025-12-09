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
