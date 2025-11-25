'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Send, Copy, Check } from 'lucide-react';

interface FormTemplate {
  id: string;
  name: string;
  description: string | null;
}

interface SendFormDialogProps {
  appointmentRequestId: string;
  patientName: string;
  patientEmail: string;
  onFormSent?: () => void;
}

export function SendFormDialog({
  appointmentRequestId,
  patientName,
  patientEmail,
  onFormSent,
}: SendFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [loading, setLoading] = useState(false);
  const [formUrl, setFormUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      fetchTemplates();
    }
  }, [open]);

  async function fetchTemplates() {
    try {
      const response = await fetch('/api/form-templates');
      const data = await response.json();
      setTemplates(data.data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  }

  async function handleSendForm() {
    if (!selectedTemplateId) return;

    setLoading(true);
    try {
      const response = await fetch('/api/form-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentRequestId,
          formTemplateId: selectedTemplateId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send form');
      }

      const data = await response.json();
      setFormUrl(data.data.formUrl);
      onFormSent?.();
    } catch (error) {
      console.error('Error sending form:', error);
      alert('Failed to send form');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(formUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }

  function handleClose() {
    setOpen(false);
    setFormUrl('');
    setSelectedTemplateId('');
    setCopied(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Send className="w-4 h-4 mr-2" />
          Send Form
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Intake Form</DialogTitle>
          <DialogDescription>
            Send an intake form to {patientName} ({patientEmail})
          </DialogDescription>
        </DialogHeader>

        {formUrl ? (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800 font-medium mb-2">
                Form link created successfully!
              </p>
              <p className="text-sm text-green-700">
                Share this link with the patient to complete their intake form.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Form Link</Label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={formUrl}
                  className="flex-1 px-3 py-2 text-sm border rounded-md bg-gray-50"
                />
                <Button onClick={handleCopyLink} variant="outline" size="sm">
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Form Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a form template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templates.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No form templates available. Create one first.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSendForm}
                disabled={!selectedTemplateId || loading}
              >
                {loading ? 'Creating...' : 'Create Form Link'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
