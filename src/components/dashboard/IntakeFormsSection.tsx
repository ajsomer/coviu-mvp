'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SendFormDialog } from './SendFormDialog';
import { CheckCircle2, Clock, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';

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

interface IntakeFormsSectionProps {
  appointmentRequestId: string;
  patientName: string;
  patientEmail: string;
  formRequests: FormRequestData[];
  onRefresh: () => void;
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

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else {
    return 'Just now';
  }
}

function FormSubmissionViewer({ data }: { data: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);

  // Extract some key fields for summary
  const summaryFields = ['medicareNumber', 'emergencyContactName', 'allergies', 'currentMedications'];
  const hasSummaryData = summaryFields.some(field => data[field]);

  return (
    <div className="mt-3 pt-3 border-t">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
      >
        {expanded ? (
          <>
            <ChevronUp className="w-4 h-4" />
            Hide Response
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" />
            View Response
          </>
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 text-sm">
          {Object.entries(data).map(([key, value]) => {
            // Skip internal fields
            if (key.startsWith('_')) return null;

            // Format the key nicely
            const label = key
              .replace(/([A-Z])/g, ' $1')
              .replace(/^./, str => str.toUpperCase())
              .trim();

            // Format the value
            let displayValue: string;
            if (value === null || value === undefined || value === '') {
              displayValue = '-';
            } else if (typeof value === 'boolean') {
              displayValue = value ? 'Yes' : 'No';
            } else if (Array.isArray(value)) {
              displayValue = value.length > 0 ? value.join(', ') : '-';
            } else if (typeof value === 'object') {
              displayValue = JSON.stringify(value);
            } else {
              displayValue = String(value);
            }

            return (
              <div key={key} className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">{label}:</span>
                <span className="col-span-2 font-medium">{displayValue}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormRequestCard({ formRequest }: { formRequest: FormRequestData }) {
  const [copied, setCopied] = useState(false);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const formUrl = `${baseUrl}/intake/${formRequest.token}`;

  const isExpired = formRequest.expiresAt && new Date(formRequest.expiresAt) < new Date();
  const isPending = formRequest.status === 'pending' && !isExpired;
  const isCompleted = formRequest.status === 'completed';

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(formUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }

  return (
    <div className="p-4 border rounded-lg">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {isCompleted ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : isPending ? (
            <Clock className="w-5 h-5 text-yellow-500" />
          ) : (
            <Clock className="w-5 h-5 text-gray-400" />
          )}
          <div>
            <h4 className="font-medium">{formRequest.templateName}</h4>
            {formRequest.templateDescription && (
              <p className="text-sm text-muted-foreground">{formRequest.templateDescription}</p>
            )}
          </div>
        </div>
        <Badge variant={isCompleted ? 'default' : isPending ? 'secondary' : 'outline'}>
          {isCompleted ? 'Completed' : isPending ? 'Pending' : 'Expired'}
        </Badge>
      </div>

      <div className="mt-2 text-sm text-muted-foreground">
        {isCompleted && formRequest.completedAt ? (
          <p>Completed {formatDateTime(formRequest.completedAt)}</p>
        ) : (
          <p>Sent {formatRelativeTime(formRequest.sentAt)}</p>
        )}
      </div>

      {isPending && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" onClick={handleCopyLink}>
            {copied ? (
              <>
                <Check className="w-3 h-3 mr-1" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 mr-1" />
                Copy Link
              </>
            )}
          </Button>
        </div>
      )}

      {isCompleted && formRequest.submission && (
        <FormSubmissionViewer data={formRequest.submission.data as Record<string, unknown>} />
      )}
    </div>
  );
}

export function IntakeFormsSection({
  appointmentRequestId,
  patientName,
  patientEmail,
  formRequests,
  onRefresh,
}: IntakeFormsSectionProps) {
  const completedForms = formRequests.filter(fr => fr.status === 'completed');
  const pendingForms = formRequests.filter(
    fr => fr.status === 'pending' && (!fr.expiresAt || new Date(fr.expiresAt) > new Date())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Intake Forms</CardTitle>
            <CardDescription>
              Forms sent to the patient for completion
            </CardDescription>
          </div>
          <SendFormDialog
            appointmentRequestId={appointmentRequestId}
            patientName={patientName}
            patientEmail={patientEmail}
            onFormSent={onRefresh}
          />
        </div>
      </CardHeader>
      <CardContent>
        {formRequests.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No intake forms have been sent yet
          </p>
        ) : (
          <div className="space-y-4">
            {pendingForms.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  Pending ({pendingForms.length})
                </h4>
                <div className="space-y-3">
                  {pendingForms.map(fr => (
                    <FormRequestCard key={fr.id} formRequest={fr} />
                  ))}
                </div>
              </div>
            )}

            {completedForms.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">
                  Completed ({completedForms.length})
                </h4>
                <div className="space-y-3">
                  {completedForms.map(fr => (
                    <FormRequestCard key={fr.id} formRequest={fr} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
