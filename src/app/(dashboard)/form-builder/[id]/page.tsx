'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';

// Dynamically import FormCreator to avoid SSR issues with SurveyJS
const FormCreator = dynamic(
  () => import('@/components/forms/FormCreator').then(mod => mod.FormCreator),
  { ssr: false, loading: () => <div className="h-96 flex items-center justify-center">Loading form builder...</div> }
);

interface FormTemplate {
  id: string;
  name: string;
  description: string | null;
  schema: object;
  isDefault: boolean;
}

export default function EditFormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchTemplate() {
      try {
        const response = await fetch(`/api/form-templates/${id}`);
        if (!response.ok) {
          throw new Error('Template not found');
        }
        const data = await response.json();
        setTemplate(data.data);
        setName(data.data.name);
        setDescription(data.data.description || '');
      } catch (error) {
        console.error('Error fetching template:', error);
        router.push('/form-templates');
      } finally {
        setLoading(false);
      }
    }
    fetchTemplate();
  }, [id, router]);

  async function handleSave() {
    if (!name.trim()) {
      alert('Please enter a template name');
      return;
    }

    // Get schema from the creator component via window
    const schema = (window as any).__formCreatorGetSchema?.() || {};

    setSaving(true);
    try {
      const response = await fetch(`/api/form-templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          schema,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save template');
      }

      router.push('/form-templates');
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading template...</div>
      </div>
    );
  }

  if (!template) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/form-templates">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">Edit Form Template</h1>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Template'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Template Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., General Intake Form"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the form..."
                rows={1}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Form Builder</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <FormCreator initialSchema={template.schema} />
        </CardContent>
      </Card>
    </div>
  );
}
