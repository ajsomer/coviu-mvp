# Phase 6: Polish & Edge Cases

## Objectives

- Handle error states gracefully
- Improve loading states
- Handle edge cases (empty results, poor quality screenshots)
- Add manual fallback when parsing fails

## Prerequisites

- Phases 1-5 complete (full flow working)

## 1. Error Handling in API Routes

### Add Error Boundaries to Screenshot Processing

Update `src/app/api/run-sheet/screenshots/route.ts` to handle OCR failures gracefully:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { db } from '@/db';
import { runSheets, runSheetScreenshots, runSheetAppointments, runSheetClinicians } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { extractTextFromImage } from '@/lib/ocr/google-vision';
import { parseGentuScreenshot } from '@/lib/ocr/gentu-parser';

export async function POST(request: NextRequest) {
  let screenshotId: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload a PNG or JPG image.' },
        { status: 400 }
      );
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB.' },
        { status: 400 }
      );
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

    // Upload to Vercel Blob first (so we have the image even if OCR fails)
    const blob = await put(`run-sheet/${runSheet.id}/${Date.now()}.png`, file, {
      access: 'public',
    });

    // Save screenshot record immediately
    const [screenshot] = await db.insert(runSheetScreenshots).values({
      runSheetId: runSheet.id,
      originalUrl: blob.url,
      croppedUrl: blob.url,
    }).returning();

    screenshotId = screenshot.id;

    // Try OCR processing
    let ocrResult;
    let parsedAppointments = [];
    let ocrError: string | null = null;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      ocrResult = await extractTextFromImage(imageBuffer);
      parsedAppointments = parseGentuScreenshot(ocrResult.fullText, ocrResult.blocks);

      // Update screenshot with OCR results
      await db.update(runSheetScreenshots)
        .set({
          processedAt: new Date(),
          ocrRawResponse: { fullText: ocrResult.fullText, blockCount: ocrResult.blocks.length },
        })
        .where(eq(runSheetScreenshots.id, screenshot.id));

    } catch (error) {
      console.error('OCR processing failed:', error);
      ocrError = error instanceof Error ? error.message : 'OCR processing failed';

      // Update screenshot with error
      await db.update(runSheetScreenshots)
        .set({
          processedAt: new Date(),
          ocrRawResponse: { error: ocrError },
        })
        .where(eq(runSheetScreenshots.id, screenshot.id));
    }

    // Save parsed appointments (if any)
    const savedAppointments = [];
    for (const appt of parsedAppointments) {
      let clinicianId: string | null = null;

      if (appt.clinicianName) {
        let clinician = await db.query.runSheetClinicians.findFirst({
          where: eq(runSheetClinicians.name, appt.clinicianName),
        });
        if (!clinician) {
          const [created] = await db.insert(runSheetClinicians).values({
            name: appt.clinicianName,
          }).returning();
          clinician = created;
        }
        clinicianId = clinician.id;
      }

      const [saved] = await db.insert(runSheetAppointments).values({
        runSheetId: runSheet.id,
        screenshotId: screenshot.id,
        clinicianId,
        patientName: appt.patientName,
        patientPhone: appt.patientPhone,
        appointmentTime: appt.appointmentTime,
        appointmentType: appt.appointmentType,
        confidence: appt.confidence,
        isManualEntry: false,
      }).returning();

      savedAppointments.push({
        ...saved,
        clinicianName: appt.clinicianName,
      });
    }

    // Update run sheet status
    await db.update(runSheets)
      .set({ status: 'reviewing', updatedAt: new Date() })
      .where(eq(runSheets.id, runSheet.id));

    return NextResponse.json({
      success: true,
      screenshotId: screenshot.id,
      appointments: savedAppointments,
      ocrError, // null if successful, error message if failed
      warning: parsedAppointments.length === 0 && !ocrError
        ? 'No appointments detected. You may need to add them manually.'
        : null,
    });

  } catch (error) {
    console.error('Error processing screenshot:', error);

    // Return partial success if we at least saved the screenshot
    if (screenshotId) {
      return NextResponse.json({
        success: true,
        screenshotId,
        appointments: [],
        ocrError: 'Failed to process screenshot. Please add appointments manually.',
      });
    }

    return NextResponse.json(
      { error: 'Failed to upload screenshot. Please try again.' },
      { status: 500 }
    );
  }
}
```

## 2. Improved Upload UI with Error States

Update `src/app/(dashboard)/run-sheet/upload/page.tsx` to show warnings:

```tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface ProcessedRegion {
  id: string;
  thumbnailUrl: string;
  appointmentCount: number;
  warning?: string | null;
  error?: string | null;
}

export default function UploadPage() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedRegions, setProcessedRegions] = useState<ProcessedRegion[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate on client side too
      if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
        setUploadError('Please select a PNG or JPG image.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setUploadError('Image is too large. Maximum size is 5MB.');
        return;
      }

      setUploadError(null);
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
    setUploadError(null);

    try {
      const croppedBlob = await getCroppedImage();
      if (!croppedBlob) throw new Error('Failed to crop image');

      const formData = new FormData();
      formData.append('image', croppedBlob, 'cropped.png');

      const response = await fetch('/api/run-sheet/screenshots', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      // Add to processed regions
      setProcessedRegions((prev) => [
        ...prev,
        {
          id: data.screenshotId,
          thumbnailUrl: URL.createObjectURL(croppedBlob),
          appointmentCount: data.appointments?.length || 0,
          warning: data.warning,
          error: data.ocrError,
        },
      ]);

      // Reset for another crop
      setCrop(undefined);
      setCompletedCrop(undefined);

    } catch (error) {
      console.error('Error processing region:', error);
      setUploadError(
        error instanceof Error ? error.message : 'Failed to process region. Please try again.'
      );
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
    setUploadError(null);
  };

  const totalAppointments = processedRegions.reduce((sum, r) => sum + r.appointmentCount, 0);
  const hasWarnings = processedRegions.some((r) => r.warning || r.error);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Upload Schedule Screenshots</h1>
      </div>

      {/* Error Alert */}
      {uploadError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Upload Error</p>
            <p className="text-sm text-red-700 mt-1">{uploadError}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {!imageUrl ? 'Step 1: Upload Screenshot' : 'Step 2: Select Region'}
          </CardTitle>
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
                Drag to select the appointment table region, then click "Process This Region"
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

      {/* Processed Regions */}
      {processedRegions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Processed Regions
              <span className="text-sm font-normal text-gray-500">
                ({totalAppointments} appointment{totalAppointments !== 1 ? 's' : ''} found)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Region thumbnails */}
              <div className="flex flex-wrap gap-4">
                {processedRegions.map((region, index) => (
                  <div key={region.id} className="relative">
                    <img
                      src={region.thumbnailUrl}
                      alt={`Region ${index + 1}`}
                      className="w-32 h-24 object-cover rounded border"
                    />
                    <div className="absolute bottom-1 right-1 flex items-center gap-1">
                      {region.error ? (
                        <span className="bg-red-500 text-white text-xs px-1 rounded flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          Error
                        </span>
                      ) : region.warning ? (
                        <span className="bg-yellow-500 text-white text-xs px-1 rounded flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {region.appointmentCount}
                        </span>
                      ) : (
                        <span className="bg-green-500 text-white text-xs px-1 rounded flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          {region.appointmentCount}
                        </span>
                      )}
                    </div>
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

              {/* Warnings */}
              {hasWarnings && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-800">Some regions had issues</p>
                      <p className="text-sm text-yellow-700 mt-1">
                        You can still proceed and add appointments manually in the review step.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Continue button */}
              <div className="flex justify-end">
                <Button onClick={handleDone}>
                  Done - Review Results →
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

## 3. Loading States

### Skeleton Components

Create `src/components/ui/skeleton.tsx` (if not exists):

```tsx
import { cn } from '@/lib/utils';

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-gray-200', className)}
      {...props}
    />
  );
}

export { Skeleton };
```

### Table Skeleton

Create `src/components/run-sheet/TableSkeleton.tsx`:

```tsx
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20"><Skeleton className="h-4 w-12" /></TableHead>
          <TableHead><Skeleton className="h-4 w-24" /></TableHead>
          <TableHead><Skeleton className="h-4 w-20" /></TableHead>
          <TableHead><Skeleton className="h-4 w-16" /></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-12" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
            <TableCell><Skeleton className="h-4 w-28" /></TableCell>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

## 4. Manual Entry Fallback

The review page already supports manual entry via the AddAppointmentForm. Ensure it's prominent when no appointments are found:

In the review page, when `appointments.length === 0`:

```tsx
{appointments.length === 0 && (
  <div className="text-center py-12">
    <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
    <h3 className="text-lg font-semibold text-gray-900 mb-2">
      No Appointments Detected
    </h3>
    <p className="text-gray-600 mb-6 max-w-md mx-auto">
      The screenshot couldn't be parsed automatically. You can add appointments manually below.
    </p>
    <Button onClick={() => setShowAddForm(true)}>
      <Plus className="w-4 h-4 mr-2" />
      Add First Appointment
    </Button>
  </div>
)}
```

## 5. Edge Cases Handled

| Edge Case | Handling |
|-----------|----------|
| Empty screenshot (no text) | Warning shown, manual entry available |
| OCR fails completely | Error saved to DB, manual entry available |
| No appointments detected | Warning shown with manual entry prompt |
| Very low confidence rows | Highlighted in yellow for review |
| Duplicate uploads | Each upload adds to the run sheet |
| Re-upload same day | Delete confirmation, fresh start |
| Large images | Preprocessed to max 2000px width |
| Wrong file type | Client + server validation with clear error |
| File too large | Client + server validation with clear error |

## Checklist

- [ ] Update screenshot API with better error handling
- [ ] Update upload page with error states and warnings
- [ ] Add skeleton loading components
- [ ] Test with intentionally bad screenshots
- [ ] Test OCR failure scenario (invalid credentials)
- [ ] Test empty results scenario
- [ ] Verify manual entry works when parsing fails
- [ ] Test all validation errors show correctly
