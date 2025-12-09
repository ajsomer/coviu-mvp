# Phase 1: Foundation

## Objectives

- Add database tables for run sheets and appointments
- Create API route stubs
- Build upload interface with image cropping

## 1. Database Schema

Add to `src/db/schema.ts`:

```typescript
import { pgTable, uuid, varchar, text, date, timestamp, pgEnum, boolean, jsonb, real } from 'drizzle-orm/pg-core';

// ============================================
// DAILY RUN SHEET - Screenshot Parsing Feature
// ============================================

export const runSheetStatusEnum = pgEnum('run_sheet_status', [
  'draft',      // Still uploading/cropping screenshots
  'reviewing',  // User is reviewing parsed data
  'confirmed'   // Run sheet is finalized
]);

// Clinicians extracted from screenshots (separate from specialists)
export const runSheetClinicians = pgTable('run_sheet_clinicians', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Daily run sheet - one per day
export const runSheets = pgTable('run_sheets', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: date('date').notNull(),
  status: runSheetStatusEnum('status').notNull().default('draft'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Screenshots uploaded for a run sheet
export const runSheetScreenshots = pgTable('run_sheet_screenshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  runSheetId: uuid('run_sheet_id').references(() => runSheets.id).notNull(),
  originalUrl: text('original_url').notNull(),
  croppedUrl: text('cropped_url'),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
  ocrRawResponse: jsonb('ocr_raw_response'),
});

// Parsed appointments from screenshots
export const runSheetAppointments = pgTable('run_sheet_appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  runSheetId: uuid('run_sheet_id').references(() => runSheets.id).notNull(),
  screenshotId: uuid('screenshot_id').references(() => runSheetScreenshots.id),
  clinicianId: uuid('clinician_id').references(() => runSheetClinicians.id),
  patientName: varchar('patient_name', { length: 255 }),
  patientPhone: varchar('patient_phone', { length: 50 }),
  appointmentTime: varchar('appointment_time', { length: 20 }),
  appointmentType: varchar('appointment_type', { length: 255 }),
  confidence: real('confidence'),
  isManualEntry: boolean('is_manual_entry').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Type exports
export type RunSheet = typeof runSheets.$inferSelect;
export type NewRunSheet = typeof runSheets.$inferInsert;
export type RunSheetScreenshot = typeof runSheetScreenshots.$inferSelect;
export type RunSheetAppointment = typeof runSheetAppointments.$inferSelect;
export type NewRunSheetAppointment = typeof runSheetAppointments.$inferInsert;
export type RunSheetClinician = typeof runSheetClinicians.$inferSelect;
```

After adding, run:
```bash
npm run db:generate
npm run db:push
```

## 2. API Route Stubs

### `src/app/api/run-sheet/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { runSheets } from '@/db/schema';
import { eq } from 'drizzle-orm';

// GET - Get or create today's run sheet
export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];

    let runSheet = await db.query.runSheets.findFirst({
      where: eq(runSheets.date, today),
    });

    if (!runSheet) {
      const [created] = await db.insert(runSheets).values({
        date: today,
        status: 'draft',
      }).returning();
      runSheet = created;
    }

    return NextResponse.json(runSheet);
  } catch (error) {
    console.error('Error fetching run sheet:', error);
    return NextResponse.json({ error: 'Failed to fetch run sheet' }, { status: 500 });
  }
}

// DELETE - Delete today's run sheet (for re-upload)
export async function DELETE() {
  try {
    const today = new Date().toISOString().split('T')[0];

    await db.delete(runSheets).where(eq(runSheets.date, today));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting run sheet:', error);
    return NextResponse.json({ error: 'Failed to delete run sheet' }, { status: 500 });
  }
}
```

### `src/app/api/run-sheet/screenshots/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { db } from '@/db';
import { runSheets, runSheetScreenshots } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 });
    }

    // Get or create today's run sheet
    const today = new Date().toISOString().split('T')[0];
    let runSheet = await db.query.runSheets.findFirst({
      where: eq(runSheets.date, today),
    });

    if (!runSheet) {
      const [created] = await db.insert(runSheets).values({
        date: today,
        status: 'draft',
      }).returning();
      runSheet = created;
    }

    // Upload to Vercel Blob
    const blob = await put(`run-sheet/${runSheet.id}/${Date.now()}.png`, file, {
      access: 'public',
    });

    // Save screenshot record
    const [screenshot] = await db.insert(runSheetScreenshots).values({
      runSheetId: runSheet.id,
      originalUrl: blob.url,
      croppedUrl: blob.url, // Same for now, cropping happens client-side
    }).returning();

    // TODO: Phase 2 - Process with OCR and return appointments
    return NextResponse.json({
      success: true,
      screenshotId: screenshot.id,
      appointments: [], // Will be populated in Phase 2
    });
  } catch (error) {
    console.error('Error uploading screenshot:', error);
    return NextResponse.json({ error: 'Failed to upload screenshot' }, { status: 500 });
  }
}
```

### `src/app/api/run-sheet/appointments/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { runSheets, runSheetAppointments, runSheetClinicians } from '@/db/schema';
import { eq } from 'drizzle-orm';

// GET - Get all appointments for today's run sheet
export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const runSheet = await db.query.runSheets.findFirst({
      where: eq(runSheets.date, today),
    });

    if (!runSheet) {
      return NextResponse.json({ appointments: [] });
    }

    const appointments = await db.query.runSheetAppointments.findMany({
      where: eq(runSheetAppointments.runSheetId, runSheet.id),
      with: {
        clinician: true,
      },
    });

    return NextResponse.json({ appointments });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return NextResponse.json({ error: 'Failed to fetch appointments' }, { status: 500 });
  }
}

// POST - Add a manual appointment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { patientName, patientPhone, appointmentTime, appointmentType, clinicianName } = body;

    const today = new Date().toISOString().split('T')[0];

    let runSheet = await db.query.runSheets.findFirst({
      where: eq(runSheets.date, today),
    });

    if (!runSheet) {
      const [created] = await db.insert(runSheets).values({
        date: today,
        status: 'reviewing',
      }).returning();
      runSheet = created;
    }

    // Find or create clinician
    let clinician = await db.query.runSheetClinicians.findFirst({
      where: eq(runSheetClinicians.name, clinicianName),
    });

    if (!clinician && clinicianName) {
      const [created] = await db.insert(runSheetClinicians).values({
        name: clinicianName,
      }).returning();
      clinician = created;
    }

    const [appointment] = await db.insert(runSheetAppointments).values({
      runSheetId: runSheet.id,
      clinicianId: clinician?.id,
      patientName,
      patientPhone,
      appointmentTime,
      appointmentType,
      isManualEntry: true,
      confidence: 1.0,
    }).returning();

    return NextResponse.json({ success: true, appointment });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 });
  }
}
```

### `src/app/api/run-sheet/appointments/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { runSheetAppointments } from '@/db/schema';
import { eq } from 'drizzle-orm';

// PATCH - Update an appointment
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const [updated] = await db.update(runSheetAppointments)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(runSheetAppointments.id, id))
      .returning();

    return NextResponse.json({ success: true, appointment: updated });
  } catch (error) {
    console.error('Error updating appointment:', error);
    return NextResponse.json({ error: 'Failed to update appointment' }, { status: 500 });
  }
}

// DELETE - Delete an appointment
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;

    await db.delete(runSheetAppointments)
      .where(eq(runSheetAppointments.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    return NextResponse.json({ error: 'Failed to delete appointment' }, { status: 500 });
  }
}
```

### `src/app/api/run-sheet/confirm/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { runSheets, runSheetAppointments } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const runSheet = await db.query.runSheets.findFirst({
      where: eq(runSheets.date, today),
    });

    if (!runSheet) {
      return NextResponse.json({ error: 'No run sheet found' }, { status: 404 });
    }

    // Update status to confirmed
    await db.update(runSheets)
      .set({ status: 'confirmed', updatedAt: new Date() })
      .where(eq(runSheets.id, runSheet.id));

    // Count appointments and clinicians
    const appointments = await db.query.runSheetAppointments.findMany({
      where: eq(runSheetAppointments.runSheetId, runSheet.id),
    });

    const clinicianIds = new Set(appointments.map(a => a.clinicianId).filter(Boolean));

    return NextResponse.json({
      success: true,
      runSheetId: runSheet.id,
      appointmentCount: appointments.length,
      clinicianCount: clinicianIds.size,
    });
  } catch (error) {
    console.error('Error confirming run sheet:', error);
    return NextResponse.json({ error: 'Failed to confirm run sheet' }, { status: 500 });
  }
}
```

### `src/app/api/run-sheet/clinicians/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { runSheets, runSheetAppointments, runSheetClinicians } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const runSheet = await db.query.runSheets.findFirst({
      where: eq(runSheets.date, today),
    });

    if (!runSheet) {
      return NextResponse.json({ clinicians: [] });
    }

    // Get unique clinician IDs from today's appointments
    const appointments = await db.query.runSheetAppointments.findMany({
      where: eq(runSheetAppointments.runSheetId, runSheet.id),
      columns: { clinicianId: true },
    });

    const clinicianIds = [...new Set(appointments.map(a => a.clinicianId).filter(Boolean))] as string[];

    if (clinicianIds.length === 0) {
      return NextResponse.json({ clinicians: [] });
    }

    const clinicians = await db.query.runSheetClinicians.findMany({
      where: inArray(runSheetClinicians.id, clinicianIds),
    });

    return NextResponse.json({ clinicians });
  } catch (error) {
    console.error('Error fetching clinicians:', error);
    return NextResponse.json({ error: 'Failed to fetch clinicians' }, { status: 500 });
  }
}
```

## 3. Install Cropping Library

```bash
npm install react-image-crop
```

## 4. Upload Page with Cropping

### `src/app/(dashboard)/run-sheet/upload/page.tsx`

```tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ProcessedRegion {
  id: string;
  thumbnailUrl: string;
  appointmentCount: number;
}

export default function UploadPage() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedRegions, setProcessedRegions] = useState<ProcessedRegion[]>([]);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      setCrop(undefined);
      setCompletedCrop(undefined);
    }
  };

  const getCroppedImage = useCallback(async (): Promise<Blob | null> => {
    if (!imgRef.current || !completedCrop) return null;

    const canvas = document.createElement('canvas');
    const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height;

    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(
      imgRef.current,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png', 1);
    });
  }, [completedCrop]);

  const handleProcessRegion = async () => {
    if (!completedCrop) return;

    setIsProcessing(true);
    try {
      const croppedBlob = await getCroppedImage();
      if (!croppedBlob) throw new Error('Failed to crop image');

      const formData = new FormData();
      formData.append('image', croppedBlob, 'cropped.png');

      const response = await fetch('/api/run-sheet/screenshots', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();

      // Add to processed regions
      setProcessedRegions((prev) => [
        ...prev,
        {
          id: data.screenshotId,
          thumbnailUrl: URL.createObjectURL(croppedBlob),
          appointmentCount: data.appointments?.length || 0,
        },
      ]);

      // Reset for another crop
      setCrop(undefined);
      setCompletedCrop(undefined);
    } catch (error) {
      console.error('Error processing region:', error);
      alert('Failed to process region. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDone = () => {
    router.push('/run-sheet/review');
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setImageUrl(null);
    setCrop(undefined);
    setCompletedCrop(undefined);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Upload Schedule Screenshots</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step 1: Upload Screenshot</CardTitle>
        </CardHeader>
        <CardContent>
          {!imageUrl ? (
            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg className="w-10 h-10 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="mb-2 text-sm text-gray-500">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-500">PNG, JPG (MAX. 5MB)</p>
              </div>
              <input
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleFileSelect}
              />
            </label>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Step 2: Drag to select the appointment table region
              </p>
              <div className="max-h-[600px] overflow-auto border rounded-lg">
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                >
                  <img
                    ref={imgRef}
                    src={imageUrl}
                    alt="Screenshot"
                    className="max-w-full"
                  />
                </ReactCrop>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button
                  onClick={handleProcessRegion}
                  disabled={!completedCrop || isProcessing}
                >
                  {isProcessing ? 'Processing...' : 'Process This Region'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {processedRegions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Processed Regions: {processedRegions.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {processedRegions.map((region) => (
                <div key={region.id} className="relative">
                  <img
                    src={region.thumbnailUrl}
                    alt="Processed region"
                    className="w-32 h-24 object-cover rounded border"
                  />
                  <span className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
                    {region.appointmentCount} appts
                  </span>
                </div>
              ))}
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setImageUrl(null);
                }}
                className="w-32 h-24 border-2 border-dashed rounded flex items-center justify-center text-gray-500 hover:bg-gray-50"
              >
                + Add Region
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={handleDone}>
                Done - Review Results →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

## 5. Update Navigation

Update `src/app/(dashboard)/layout.tsx`:

```tsx
<Link
  href="/run-sheet"
  className="text-gray-600 hover:text-gray-900"
>
  Run Sheet
</Link>
```

## 6. Placeholder Pages

### `src/app/(dashboard)/run-sheet/page.tsx`

```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function RunSheetPage() {
  // TODO: Phase 5 - Fetch and display confirmed run sheet
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Daily Run Sheet</h1>
        <Link href="/run-sheet/upload">
          <Button>Upload Screenshots</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>No Run Sheet for Today</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 mb-4">
            Upload screenshots of your PMS schedule to generate today's run sheet.
          </p>
          <Link href="/run-sheet/upload">
            <Button>Get Started</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
```

### `src/app/(dashboard)/run-sheet/review/page.tsx`

```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function ReviewPage() {
  // TODO: Phase 4 - Build review UI
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Review Appointments</h1>
        <div className="flex gap-2">
          <Link href="/run-sheet/upload">
            <Button variant="outline">← Back</Button>
          </Link>
        </div>
      </div>

      <p className="text-gray-600">
        Review UI will be implemented in Phase 4.
      </p>
    </div>
  );
}
```

## Checklist

- [ ] Add schema to `src/db/schema.ts`
- [ ] Run `npm run db:generate && npm run db:push`
- [ ] Create API routes:
  - [ ] `src/app/api/run-sheet/route.ts`
  - [ ] `src/app/api/run-sheet/screenshots/route.ts`
  - [ ] `src/app/api/run-sheet/appointments/route.ts`
  - [ ] `src/app/api/run-sheet/appointments/[id]/route.ts`
  - [ ] `src/app/api/run-sheet/confirm/route.ts`
  - [ ] `src/app/api/run-sheet/clinicians/route.ts`
- [ ] Install `react-image-crop`
- [ ] Create pages:
  - [ ] `src/app/(dashboard)/run-sheet/page.tsx`
  - [ ] `src/app/(dashboard)/run-sheet/upload/page.tsx`
  - [ ] `src/app/(dashboard)/run-sheet/review/page.tsx`
- [ ] Update navigation in dashboard layout
- [ ] Test upload and cropping flow
