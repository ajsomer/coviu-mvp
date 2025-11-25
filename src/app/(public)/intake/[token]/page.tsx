'use client';

import { useEffect, useState, use } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react';

// Dynamically import FormRenderer to avoid SSR issues
const FormRenderer = dynamic(
  () => import('@/components/forms/FormRenderer').then(mod => mod.FormRenderer),
  { ssr: false, loading: () => <div className="h-48 flex items-center justify-center">Loading form...</div> }
);

interface FormData {
  formRequestId: string;
  templateName: string;
  templateDescription: string | null;
  schema: object;
  patient: {
    firstName: string;
    lastName: string;
    email: string;
    dateOfBirth: string;
  };
  expiresAt: string | null;
}

export default function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'completed' | 'expired' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    async function fetchForm() {
      try {
        const response = await fetch(`/api/form-requests/${token}`);
        const data = await response.json();

        if (response.status === 404) {
          setStatus('error');
          setErrorMessage('This form link is invalid or has been removed.');
          return;
        }

        if (response.status === 410) {
          setStatus('expired');
          return;
        }

        if (data.status === 'completed') {
          setStatus('completed');
          return;
        }

        if (data.data) {
          setFormData(data.data);
          setStatus('ready');
        }
      } catch (error) {
        console.error('Error fetching form:', error);
        setStatus('error');
        setErrorMessage('Failed to load the form. Please try again later.');
      }
    }
    fetchForm();
  }, [token]);

  async function handleFormComplete(data: Record<string, unknown>) {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/form-requests/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit form');
      }

      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('Failed to submit form. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-muted-foreground">Loading form...</div>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <Clock className="w-12 h-12 text-yellow-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Form Expired</h2>
              <p className="text-muted-foreground">
                This form has expired. Please contact the clinic to request a new form link.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'completed' || submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Form Submitted</h2>
              <p className="text-muted-foreground">
                Thank you for completing this form. The clinic has received your information.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Error</h2>
              <p className="text-muted-foreground">{errorMessage}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!formData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>{formData.templateName}</CardTitle>
            {formData.templateDescription && (
              <CardDescription>{formData.templateDescription}</CardDescription>
            )}
            <p className="text-sm text-muted-foreground mt-2">
              Patient: {formData.patient.firstName} {formData.patient.lastName}
            </p>
          </CardHeader>
          <CardContent>
            {submitting ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-muted-foreground">Submitting form...</div>
              </div>
            ) : (
              <FormRenderer
                schema={formData.schema}
                prefillData={{
                  firstName: formData.patient.firstName,
                  lastName: formData.patient.lastName,
                  email: formData.patient.email,
                  dateOfBirth: formData.patient.dateOfBirth,
                }}
                onComplete={handleFormComplete}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
