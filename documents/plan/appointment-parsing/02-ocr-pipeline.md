# Phase 2: OCR Pipeline

## Objectives

- Set up Google Cloud Vision integration
- Implement image preprocessing with Sharp
- Extract text with bounding boxes from screenshots
- Store raw OCR responses for debugging

## Prerequisites

- Phase 1 complete (database, API stubs, upload UI)
- Google Cloud project with Vision API enabled
- Service account credentials

## 1. Install Dependencies

```bash
npm install @google-cloud/vision sharp
npm install --save-dev @types/sharp
```

## 2. Environment Variables

Add to `.env.local`:

```env
# Google Cloud Vision (JSON service account key as single line)
GOOGLE_CLOUD_VISION_KEY={"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}

# OCR Configuration
OCR_MAX_WIDTH=2000
OCR_DEBUG_LOGGING=true
```

## 3. Image Preprocessing

Create `src/lib/ocr/preprocess.ts`:

```typescript
import sharp from 'sharp';

const MAX_WIDTH = parseInt(process.env.OCR_MAX_WIDTH || '2000');

/**
 * Preprocess image for optimal OCR accuracy:
 * 1. Remove alpha channel (convert to RGB)
 * 2. Convert to grayscale
 * 3. Resize to max width (maintains aspect ratio)
 * 4. Sharpen edges
 * 5. Normalize contrast
 */
export async function preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
  const DEBUG = process.env.OCR_DEBUG_LOGGING === 'true';

  if (DEBUG) {
    const metadata = await sharp(imageBuffer).metadata();
    console.log(`[Preprocess] Input: ${metadata.width}x${metadata.height}, ${metadata.format}`);
  }

  const processed = await sharp(imageBuffer)
    // Remove alpha channel, convert to RGB with white background
    .flatten({ background: '#ffffff' })
    // Convert to grayscale for better text detection
    .grayscale()
    // Resize to max width (maintains aspect ratio, don't upscale)
    .resize(MAX_WIDTH, null, {
      withoutEnlargement: true,
      fit: 'inside',
    })
    // Sharpen to improve edge detection
    .sharpen({
      sigma: 1,
      m1: 1,
      m2: 2,
    })
    // Normalize contrast
    .normalize()
    // Output as PNG (lossless)
    .png()
    .toBuffer();

  if (DEBUG) {
    const outMetadata = await sharp(processed).metadata();
    console.log(`[Preprocess] Output: ${outMetadata.width}x${outMetadata.height}, size: ${processed.length} bytes`);
  }

  return processed;
}
```

## 4. Google Cloud Vision Client

Create `src/lib/ocr/google-vision.ts`:

```typescript
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { preprocessImage } from './preprocess';

// Parse credentials from environment variable
const credentialsJson = process.env.GOOGLE_CLOUD_VISION_KEY;
if (!credentialsJson) {
  console.warn('[OCR] GOOGLE_CLOUD_VISION_KEY not set - OCR will not work');
}

const credentials = credentialsJson ? JSON.parse(credentialsJson) : {};
const client = new ImageAnnotatorClient({ credentials });

const DEBUG = process.env.OCR_DEBUG_LOGGING === 'true';

export interface TextBlock {
  text: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OCRResult {
  fullText: string;
  blocks: TextBlock[];
  rawResponse?: unknown;
}

/**
 * Extract text from an image using Google Cloud Vision documentTextDetection.
 * This method is optimized for structured text like tables and forms.
 */
export async function extractTextFromImage(imageBuffer: Buffer): Promise<OCRResult> {
  // Preprocess image for better OCR accuracy
  const processedBuffer = await preprocessImage(imageBuffer);

  if (DEBUG) {
    console.log(`[OCR] Sending ${processedBuffer.length} bytes to Vision API`);
  }

  // Use documentTextDetection for better structured text extraction
  const [result] = await client.documentTextDetection({
    image: { content: processedBuffer.toString('base64') },
  });

  const fullTextAnnotation = result.fullTextAnnotation;
  const fullText = fullTextAnnotation?.text || '';

  // Extract words with bounding boxes from the structured response
  const blocks: TextBlock[] = [];

  // Traverse pages -> blocks -> paragraphs -> words
  for (const page of fullTextAnnotation?.pages || []) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of paragraph.words || []) {
          // Combine symbols to get the word text
          const wordText = word.symbols?.map((s) => s.text).join('') || '';

          // Get bounding box
          const vertices = word.boundingBox?.vertices || [];
          const x = vertices[0]?.x || 0;
          const y = vertices[0]?.y || 0;
          const width = (vertices[2]?.x || 0) - x;
          const height = (vertices[2]?.y || 0) - y;

          if (wordText.trim()) {
            blocks.push({
              text: wordText,
              boundingBox: { x, y, width, height },
            });
          }
        }
      }
    }
  }

  if (DEBUG) {
    console.log(`[OCR] Extracted ${blocks.length} word blocks`);
    console.log(`[OCR] Full text length: ${fullText.length} chars`);
  }

  return {
    fullText,
    blocks,
    rawResponse: DEBUG ? result : undefined,
  };
}
```

## 5. Update Screenshot API to Use OCR

Update `src/app/api/run-sheet/screenshots/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { db } from '@/db';
import { runSheets, runSheetScreenshots, runSheetAppointments, runSheetClinicians } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { extractTextFromImage } from '@/lib/ocr/google-vision';
import { parseGentuScreenshot } from '@/lib/ocr/gentu-parser';

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

    // Upload original to Vercel Blob
    const blob = await put(`run-sheet/${runSheet.id}/${Date.now()}.png`, file, {
      access: 'public',
    });

    // Convert file to buffer for OCR
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Extract text using OCR
    const ocrResult = await extractTextFromImage(imageBuffer);

    // Parse appointments from OCR result
    const parsedAppointments = parseGentuScreenshot(ocrResult.fullText, ocrResult.blocks);

    // Save screenshot record with raw OCR response
    const [screenshot] = await db.insert(runSheetScreenshots).values({
      runSheetId: runSheet.id,
      originalUrl: blob.url,
      croppedUrl: blob.url,
      processedAt: new Date(),
      ocrRawResponse: ocrResult.rawResponse || { fullText: ocrResult.fullText },
    }).returning();

    // Save parsed appointments
    const savedAppointments = [];
    for (const appt of parsedAppointments) {
      // Find or create clinician if present
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

    // Update run sheet status to reviewing
    await db.update(runSheets)
      .set({ status: 'reviewing', updatedAt: new Date() })
      .where(eq(runSheets.id, runSheet.id));

    return NextResponse.json({
      success: true,
      screenshotId: screenshot.id,
      appointments: savedAppointments,
    });
  } catch (error) {
    console.error('Error processing screenshot:', error);
    return NextResponse.json(
      { error: 'Failed to process screenshot' },
      { status: 500 }
    );
  }
}
```

## 6. Stub Parser (Phase 3 Will Implement Fully)

Create `src/lib/ocr/gentu-parser.ts` with a basic stub:

```typescript
import { TextBlock } from './google-vision';

export interface ParsedAppointment {
  patientName: string | null;
  patientPhone: string | null;
  appointmentTime: string | null;
  appointmentType: string | null;
  clinicianName: string | null;
  confidence: number;
}

/**
 * Parse Gentu PMS screenshot OCR results into appointments.
 * Full implementation in Phase 3.
 */
export function parseGentuScreenshot(
  fullText: string,
  blocks: TextBlock[]
): ParsedAppointment[] {
  // TODO: Phase 3 - Full parsing implementation
  // For now, return empty array (OCR is working but parsing is not)
  console.log(`[Parser] Received ${blocks.length} blocks to parse`);
  console.log(`[Parser] Full text preview: ${fullText.substring(0, 200)}...`);

  return [];
}
```

## 7. Testing the OCR Pipeline

### Manual Test Steps

1. Start the dev server: `npm run dev`
2. Navigate to `/run-sheet/upload`
3. Upload a Gentu screenshot
4. Draw a crop region and click "Process This Region"
5. Check server logs for OCR output:
   - `[Preprocess] Input/Output` - Image dimensions
   - `[OCR] Extracted X word blocks` - Number of text blocks found
   - `[Parser] Full text preview` - Raw text extracted

### Debug Queries

Check the database for stored OCR data:

```sql
-- View recent screenshots with OCR data
SELECT id, original_url, processed_at, ocr_raw_response
FROM run_sheet_screenshots
ORDER BY uploaded_at DESC
LIMIT 5;

-- View parsed appointments
SELECT * FROM run_sheet_appointments
ORDER BY created_at DESC
LIMIT 20;
```

## Checklist

- [ ] Install `@google-cloud/vision` and `sharp`
- [ ] Add Google Cloud credentials to `.env.local`
- [ ] Create `src/lib/ocr/preprocess.ts`
- [ ] Create `src/lib/ocr/google-vision.ts`
- [ ] Create stub `src/lib/ocr/gentu-parser.ts`
- [ ] Update screenshots API to use OCR
- [ ] Test with a real Gentu screenshot
- [ ] Verify OCR output in server logs
- [ ] Check database for stored OCR responses

## Troubleshooting

### "GOOGLE_CLOUD_VISION_KEY not set"
- Ensure the environment variable is set in `.env.local`
- The JSON must be on a single line (escape newlines in private key)

### Sharp installation issues on M1 Mac
```bash
npm rebuild sharp
```

### Vision API errors
- Check that Vision API is enabled in Google Cloud Console
- Verify service account has "Cloud Vision API User" role
- Check credentials JSON is valid

### Low quality OCR results
- Ensure preprocessing is running (check logs)
- Try increasing `OCR_MAX_WIDTH` to 2500 or 3000
- Check if original screenshot is too low resolution
