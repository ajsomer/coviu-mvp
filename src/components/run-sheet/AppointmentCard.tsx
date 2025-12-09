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
