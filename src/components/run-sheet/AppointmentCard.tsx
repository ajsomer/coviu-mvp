'use client';

import { Button } from '@/components/ui/button';
import { Check, Clock, AlertCircle, Send, RotateCcw, CalendarClock, X, User } from 'lucide-react';
import { format } from 'date-fns';

type InviteStatus = 'none' | 'queued' | 'sent' | 'failed';

interface Appointment {
  id: string;
  patientName: string | null;
  patientPhone: string | null;
  appointmentTime: string | null;
  clinicianId: string | null;
  clinicianName: string | null;
  inviteStatus: InviteStatus;
  inviteId?: string | null;
  scheduledFor?: string | null;
  sentAt?: string | null;
}

interface AppointmentCardProps {
  appointment: Appointment;
  onSendInvite: () => void;
  onSendNow?: () => void;
  onRemove?: () => void;
}

export function AppointmentCard({
  appointment,
  onSendInvite,
  onSendNow,
  onRemove,
}: AppointmentCardProps) {
  return (
    <div className="border rounded-lg p-3 bg-white hover:bg-gray-50 transition-colors relative">
      {/* Remove Button */}
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="absolute top-1 right-1 h-6 w-6 text-gray-400 hover:text-red-600"
        >
          <X className="w-3 h-3" />
        </Button>
      )}

      {/* Patient Name */}
      <div className="flex items-center gap-1.5 pr-6">
        <span className="font-medium text-gray-900">
          {appointment.patientName || 'Unknown Patient'}
        </span>
        {appointment.patientPhone && (
          <div className="relative group">
            <User className="w-3.5 h-3.5 text-gray-400 cursor-pointer hover:text-gray-600" />
            <div className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              View patient contact
            </div>
          </div>
        )}
      </div>

      {/* Clinician */}
      <div className="text-sm text-gray-600 mt-0.5">
        {appointment.clinicianName || 'Unknown'}
      </div>

      {/* Invite Status / Actions */}
      <div className="mt-2">
        <InviteStatusDisplay
          status={appointment.inviteStatus}
          scheduledFor={appointment.scheduledFor}
          sentAt={appointment.sentAt}
          onSend={onSendInvite}
          onSendNow={onSendNow}
          onResend={onSendNow}
        />
      </div>
    </div>
  );
}

interface InviteStatusDisplayProps {
  status: InviteStatus;
  scheduledFor?: string | null;
  sentAt?: string | null;
  onSend: () => void;
  onSendNow?: () => void;
  onResend?: () => void;
}

function InviteStatusDisplay({
  status,
  scheduledFor,
  sentAt,
  onSend,
  onSendNow,
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
      // Check if this is a scheduled invite (has scheduledFor in the future)
      if (scheduledFor) {
        const scheduledDate = new Date(scheduledFor);
        const now = new Date();
        if (scheduledDate > now) {
          return (
            <div className="flex items-center justify-between">
              <div className="relative group">
                <div className="flex items-center gap-1 text-xs text-blue-600 cursor-default">
                  <CalendarClock className="w-3 h-3" />
                  <span>Scheduled {format(scheduledDate, 'HH:mm')}</span>
                </div>
                <div className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Sending at {format(scheduledDate, 'h:mm a')}
                </div>
              </div>
              {onSendNow && (
                <Button variant="ghost" size="sm" onClick={onSendNow} className="h-6 px-2 text-xs">
                  <Send className="w-3 h-3 mr-1" />
                  Send Now
                </Button>
              )}
            </div>
          );
        }
      }
      return (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-amber-600">
            <Clock className="w-3 h-3" />
            Queued
          </div>
          {onSendNow && (
            <Button variant="ghost" size="sm" onClick={onSendNow} className="h-6 px-2 text-xs">
              <Send className="w-3 h-3 mr-1" />
              Send Now
            </Button>
          )}
        </div>
      );

    case 'sent':
      const sentDate = sentAt ? new Date(sentAt) : null;
      return (
        <div className="flex items-center justify-between">
          <div className="relative group">
            <div className="flex items-center gap-1 text-xs text-green-600 cursor-default">
              <Check className="w-3 h-3" />
              Sent
            </div>
            {sentDate && (
              <div className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                Sent at {format(sentDate, 'h:mm a')}
              </div>
            )}
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
