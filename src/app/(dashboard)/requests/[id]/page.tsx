'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/dashboard/status-badge';
import { PriorityBadge } from '@/components/dashboard/priority-badge';
import { IntakeFormsSection } from '@/components/dashboard/IntakeFormsSection';

interface NoteEntry {
  id: string;
  note: string;
  createdAt: string;
}

interface FormSubmission {
  id: string;
  data: Record<string, unknown>;
  submittedAt: string;
}

interface FormRequestData {
  id: string;
  token: string;
  status: string;
  sentAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  templateId: string;
  templateName: string;
  templateDescription: string | null;
  submission: FormSubmission | null;
}

interface AppointmentRequest {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  specialist: {
    id: string;
    name: string | null;
    specialty: string | null;
  };
  referralDocumentUrl: string | null;
  referralDocumentName: string | null;
  referringDoctorName: string;
  referringDoctorPhone: string | null;
  referringDoctorEmail: string | null;
  referringClinic: string | null;
  referralDate: string;
  status: string;
  priority: string;
  notes: string | null;
  notesHistory: NoteEntry[];
  formRequests: FormRequestData[];
  createdAt: string;
  updatedAt: string;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [request, setRequest] = useState<AppointmentRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [newNote, setNewNote] = useState('');
  const [notesHistory, setNotesHistory] = useState<NoteEntry[]>([]);
  const [formRequests, setFormRequests] = useState<FormRequestData[]>([]);

  useEffect(() => {
    async function fetchRequest() {
      try {
        const response = await fetch(`/api/appointments/${resolvedParams.id}`);
        if (response.ok) {
          const data = await response.json();
          setRequest(data.data);
          setStatus(data.data.status);
          setPriority(data.data.priority);
          setNotesHistory(data.data.notesHistory || []);
          setFormRequests(data.data.formRequests || []);
        }
      } catch (error) {
        console.error('Failed to fetch request:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchRequest();
  }, [resolvedParams.id]);

  const refreshRequest = async () => {
    try {
      const response = await fetch(`/api/appointments/${resolvedParams.id}`);
      if (response.ok) {
        const data = await response.json();
        setRequest(data.data);
        setFormRequests(data.data.formRequests || []);
      }
    } catch (error) {
      console.error('Failed to refresh request:', error);
    }
  };

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const response = await fetch(`/api/appointments/${resolvedParams.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, priority, notes: newNote }),
      });

      if (response.ok) {
        const data = await response.json();
        setRequest(prev => prev ? { ...prev, ...data.data } : null);
        if (data.notesHistory) {
          setNotesHistory(data.notesHistory);
        }
        setNewNote('');
        alert('Request updated successfully');
      }
    } catch (error) {
      console.error('Failed to update request:', error);
      alert('Failed to update request');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading request details...</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Request not found</p>
        <Link href="/dashboard">
          <Button variant="outline" className="mt-4">
            Back to Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard">
          <Button variant="outline" size="sm">
            ← Back to Dashboard
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Patient Information */}
          <Card>
            <CardHeader>
              <CardTitle>Patient Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Name</Label>
                <p className="font-medium">{request.firstName} {request.lastName}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Date of Birth</Label>
                <p className="font-medium">{formatDate(request.dateOfBirth)}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="font-medium">{request.email}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Phone</Label>
                <p className="font-medium">{request.phone}</p>
              </div>
            </CardContent>
          </Card>

          {/* Intake Forms */}
          <IntakeFormsSection
            appointmentRequestId={request.id}
            patientName={`${request.firstName} ${request.lastName}`}
            patientEmail={request.email}
            formRequests={formRequests}
            onRefresh={refreshRequest}
          />

          {/* Notes History */}
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
              <CardDescription>History of notes for this request</CardDescription>
            </CardHeader>
            <CardContent>
              {notesHistory.length === 0 ? (
                <p className="text-muted-foreground text-sm">No notes yet</p>
              ) : (
                <div className="space-y-4">
                  {notesHistory.map((entry) => (
                    <div key={entry.id} className="border-l-2 border-gray-200 pl-4 py-2">
                      <p className="text-sm text-gray-900">{entry.note}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDateTime(entry.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Specialist */}
          <Card>
            <CardHeader>
              <CardTitle>Requested Specialist</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-medium">{request.specialist.name}</p>
              <p className="text-muted-foreground">{request.specialist.specialty}</p>
            </CardContent>
          </Card>

          {/* Referral Information */}
          <Card>
            <CardHeader>
              <CardTitle>Referral Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Referring Doctor</Label>
                  <p className="font-medium">{request.referringDoctorName}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Referral Date</Label>
                  <p className="font-medium">{formatDate(request.referralDate)}</p>
                </div>
                {request.referringDoctorPhone && (
                  <div>
                    <Label className="text-muted-foreground">Doctor Phone</Label>
                    <p className="font-medium">{request.referringDoctorPhone}</p>
                  </div>
                )}
                {request.referringDoctorEmail && (
                  <div>
                    <Label className="text-muted-foreground">Doctor Email</Label>
                    <p className="font-medium">{request.referringDoctorEmail}</p>
                  </div>
                )}
                {request.referringClinic && (
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">Clinic</Label>
                    <p className="font-medium">{request.referringClinic}</p>
                  </div>
                )}
              </div>

              {request.referralDocumentUrl && (
                <div className="pt-4 border-t">
                  <Label className="text-muted-foreground">Referral Document</Label>
                  <div className="mt-2">
                    <a
                      href={request.referralDocumentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 hover:underline"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {request.referralDocumentName || 'View Document'}
                    </a>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Status & Actions */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status & Priority</CardTitle>
              <CardDescription>Update the request status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <StatusBadge status={request.status} />
                <PriorityBadge priority={request.priority} />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add notes about this request..."
                  rows={4}
                />
              </div>

              <Button
                onClick={handleUpdate}
                disabled={updating}
                className="w-full"
              >
                {updating ? 'Updating...' : 'Update Request'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Submitted: {formatDate(request.createdAt)}</p>
                <p>Last Updated: {formatDate(request.updatedAt)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
