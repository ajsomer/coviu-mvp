# Technical Implementation Plan: Screenshot-Based Appointment Parsing

## Overview

This feature allows clinic staff to upload screenshots of their Gentu PMS appointment schedule, crop the relevant region, and have the system automatically extract patient appointments using Google Cloud Vision OCR. The parsed data populates a "Daily Run Sheet" that displays appointments grouped by clinician.

---

## Summary of MVP Scope

| Area | Decision |
|------|----------|
| **Screenshot capture** | File upload + in-browser cropping (react-image-crop) |
| **Multiple screenshots** | Sequential: upload → crop → add another → done |
| **OCR** | Google Cloud Vision (server-side) |
| **Storage** | Vercel Blob (existing) |
| **Fields to extract** | Patient name, phone, clinician, appointment time, appointment type |
| **Date handling** | Always "today" |
| **Run sheet display** | Tabs per clinician on single page |
| **Review/edit** | User reviews all parsed rows, can add/edit/delete before confirming |
| **Post-confirmation edit** | Returns to review screen |
| **Re-upload** | Overwrites existing data (with warning) |
| **Duplicates/conflicts** | Not handled (MVP) |
| **Templates/column mapping** | Per-upload (no saved templates) |
| **Fallback** | Manual entry if parsing fails |
| **Target PMS** | Gentu |

---

## 1. Database Schema

Add to `src/db/schema.ts`:

```typescript
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
  date: date('date').notNull(),  // Always "today" for MVP
  status: runSheetStatusEnum('status').notNull().default('draft'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Screenshots uploaded for a run sheet
export const runSheetScreenshots = pgTable('run_sheet_screenshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  runSheetId: uuid('run_sheet_id').references(() => runSheets.id).notNull(),
  originalUrl: text('original_url').notNull(),      // Full screenshot
  croppedUrl: text('cropped_url'),                  // Cropped region (if cropped)
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
  ocrRawResponse: jsonb('ocr_raw_response'),        // Store raw OCR for debugging
});

// Parsed appointments from screenshots
export const runSheetAppointments = pgTable('run_sheet_appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  runSheetId: uuid('run_sheet_id').references(() => runSheets.id).notNull(),
  screenshotId: uuid('screenshot_id').references(() => runSheetScreenshots.id),
  clinicianId: uuid('clinician_id').references(() => runSheetClinicians.id),

  // Extracted fields
  patientName: varchar('patient_name', { length: 255 }),
  patientPhone: varchar('patient_phone', { length: 50 }),
  appointmentTime: varchar('appointment_time', { length: 20 }),  // HH:MM format
  appointmentType: varchar('appointment_type', { length: 255 }),

  // Confidence scoring
  confidence: real('confidence'),  // 0.0 - 1.0

  // For manual entries or corrections
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

---

## 2. API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/run-sheet` | GET | Get today's run sheet (or create if none exists) |
| `/api/run-sheet` | DELETE | Delete today's run sheet (for re-upload) |
| `/api/run-sheet/screenshots` | POST | Upload and process a cropped screenshot |
| `/api/run-sheet/appointments` | GET | Get all parsed appointments for today |
| `/api/run-sheet/appointments` | POST | Add a manual appointment |
| `/api/run-sheet/appointments/[id]` | PATCH | Edit an appointment |
| `/api/run-sheet/appointments/[id]` | DELETE | Delete an appointment |
| `/api/run-sheet/confirm` | POST | Confirm the run sheet (move from reviewing → confirmed) |
| `/api/run-sheet/clinicians` | GET | Get all clinicians for today's run sheet |

### Endpoint Details

#### `POST /api/run-sheet/screenshots`

```typescript
// Request: multipart/form-data
{
  image: File,  // Cropped image blob (PNG/JPEG)
}

// Response
{
  success: true,
  screenshotId: "uuid",
  appointments: [
    {
      id: "uuid",
      patientName: "John Smith",
      patientPhone: "0412 345 678",
      appointmentTime: "09:30",
      appointmentType: "Follow-up",
      clinicianName: "Dr. Sarah Jones",
      confidence: 0.85
    },
    // ...
  ]
}
```

#### `POST /api/run-sheet/confirm`

```typescript
// Request: empty body

// Response
{
  success: true,
  runSheetId: "uuid",
  appointmentCount: 15,
  clinicianCount: 3
}
```

---

## 3. UI Routes & Components

### New Routes

| Route | Purpose |
|-------|---------|
| `/run-sheet` | Main run sheet page (tabs per clinician) |
| `/run-sheet/upload` | Screenshot upload & crop flow |
| `/run-sheet/review` | Review parsed appointments before confirming |

### New Components

```
src/components/run-sheet/
├── ScreenshotUploader.tsx      # File input + drag-drop zone
├── ImageCropper.tsx            # Wrapper around react-image-crop
├── UploadProgress.tsx          # Processing indicator
├── AppointmentReviewTable.tsx  # Editable table of parsed appointments
├── AppointmentRow.tsx          # Single editable row
├── AddAppointmentForm.tsx      # Manual entry form
├── ClinicianTabs.tsx           # Tab switcher for run sheet display
├── RunSheetTable.tsx           # Read-only appointment list per clinician
└── EmptyState.tsx              # No appointments / no run sheet state
```

### Page Structure

#### `/run-sheet/upload` (Upload Flow)

```
┌─────────────────────────────────────────────────────────┐
│  Upload Schedule Screenshots                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Step 1: Upload                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                                                   │   │
│  │     📁 Drop screenshot here or click to upload   │   │
│  │                                                   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Step 2: Crop (after upload)                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  [Image with crop overlay]                        │   │
│  │                                                   │   │
│  │  ┌─────────────┐                                 │   │
│  │  │ Crop region │                                 │   │
│  │  └─────────────┘                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Cancel]                    [Process This Region]      │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  Processed Regions: 2                                   │
│  ┌──────────┐  ┌──────────┐                            │
│  │ Region 1 │  │ Region 2 │   [+ Add Another Region]   │
│  └──────────┘  └──────────┘                            │
│                                                         │
│                              [Done - Review Results →]  │
└─────────────────────────────────────────────────────────┘
```

#### `/run-sheet/review` (Review Flow)

```
┌─────────────────────────────────────────────────────────┐
│  Review Appointments                     [← Back] [Save]│
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Found 15 appointments across 3 clinicians              │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Time  │ Patient      │ Phone        │ Type    │ 🗑️ ││
│  ├───────┼──────────────┼──────────────┼─────────┼────┤│
│  │ 09:00 │ John Smith   │ 0412 345 678 │ Consult │ 🗑️ ││
│  │ 09:30 │ Jane Doe     │ 0423 456 789 │ Follow  │ 🗑️ ││
│  │ ...   │ ...          │ ...          │ ...     │    ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  [+ Add Appointment Manually]                           │
│                                                         │
│  ⚠️ This will overwrite any existing run sheet for today│
│                                                         │
│  [Cancel]                          [Confirm Run Sheet]  │
└─────────────────────────────────────────────────────────┘
```

#### `/run-sheet` (Display)

```
┌─────────────────────────────────────────────────────────┐
│  Daily Run Sheet - Monday, 2 Dec 2024        [Edit] [↻] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┬──────────────┬──────────────┐        │
│  │ Dr. Smith (5)│ Dr. Jones (7)│ Dr. Lee (3)  │        │
│  └──────────────┴──────────────┴──────────────┘        │
│                                                         │
│  Dr. Smith's Appointments                               │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Time  │ Patient         │ Phone        │ Type      ││
│  ├───────┼─────────────────┼──────────────┼───────────┤│
│  │ 09:00 │ John Smith      │ 0412 345 678 │ Consult   ││
│  │ 09:30 │ Jane Doe        │ 0423 456 789 │ Follow-up ││
│  │ 10:00 │ Bob Johnson     │ 0434 567 890 │ New       ││
│  │ ...   │                 │              │           ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Google Cloud Vision Integration

### Setup

1. Create a Google Cloud project
2. Enable Cloud Vision API
3. Create a service account with Vision API access
4. Download JSON key file
5. Add environment variable (see Section 8)

### OCR Preprocessing

Before sending to Vision, the server should preprocess images using `sharp`:

1. **Convert to grayscale** — Removes color noise
2. **Increase contrast/sharpness** — Improves text edge detection
3. **Resize to max width (~2000px)** — Vision performs better at this resolution
4. **Remove alpha channel** — Convert to RGB
5. **Strip metadata** — Reduce payload size

These steps significantly increase OCR accuracy.

### Implementation

Create `src/lib/ocr/preprocess.ts`:

```typescript
import sharp from 'sharp';

const MAX_WIDTH = parseInt(process.env.OCR_MAX_WIDTH || '2000');

export async function preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    // Remove alpha channel, convert to RGB
    .flatten({ background: '#ffffff' })
    // Convert to grayscale
    .grayscale()
    // Resize to max width (maintains aspect ratio)
    .resize(MAX_WIDTH, null, {
      withoutEnlargement: true,
      fit: 'inside',
    })
    // Increase sharpness
    .sharpen()
    // Normalize contrast
    .normalize()
    // Output as PNG (lossless)
    .png()
    .toBuffer();
}
```

Create `src/lib/ocr/google-vision.ts`:

```typescript
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { preprocessImage } from './preprocess';

const credentials = JSON.parse(process.env.GOOGLE_CLOUD_VISION_KEY || '{}');
const client = new ImageAnnotatorClient({ credentials });

const DEBUG = process.env.OCR_DEBUG_LOGGING === 'true';

export async function extractTextFromImage(imageBuffer: Buffer): Promise<{
  fullText: string;
  blocks: Array<{
    text: string;
    boundingBox: { x: number; y: number; width: number; height: number };
  }>;
}> {
  // Preprocess image for better OCR accuracy
  const processedBuffer = await preprocessImage(imageBuffer);

  if (DEBUG) {
    console.log(`[OCR] Original size: ${imageBuffer.length}, Processed size: ${processedBuffer.length}`);
  }

  // Use documentTextDetection for better structured text extraction
  const [result] = await client.documentTextDetection({
    image: { content: processedBuffer.toString('base64') },
  });

  const fullTextAnnotation = result.fullTextAnnotation;
  const fullText = fullTextAnnotation?.text || '';

  // Extract words with bounding boxes from the structured response
  const blocks: Array<{
    text: string;
    boundingBox: { x: number; y: number; width: number; height: number };
  }> = [];

  // Traverse pages -> blocks -> paragraphs -> words
  for (const page of fullTextAnnotation?.pages || []) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of paragraph.words || []) {
          const wordText = word.symbols?.map(s => s.text).join('') || '';
          const vertices = word.boundingBox?.vertices || [];
          const x = vertices[0]?.x || 0;
          const y = vertices[0]?.y || 0;
          const width = (vertices[2]?.x || 0) - x;
          const height = (vertices[2]?.y || 0) - y;

          blocks.push({
            text: wordText,
            boundingBox: { x, y, width, height },
          });
        }
      }
    }
  }

  if (DEBUG) {
    console.log(`[OCR] Extracted ${blocks.length} word blocks`);
  }

  return { fullText, blocks };
}
```

### Cost Considerations

Vision OCR costs ~$1.50 per 1,000 units. A clinic uploading 1–3 screenshots per day is extremely affordable (~$0.05/month).

---

## 5. Parsing Logic for Gentu Screenshots (Improved)

The parsing logic follows a structured 7-step pipeline.

Create `src/lib/ocr/gentu-parser.ts`:

```typescript
interface TextBlock {
  text: string;
  boundingBox: { x: number; y: number; width: number; height: number };
}

interface ParsedAppointment {
  patientName: string | null;
  patientPhone: string | null;
  appointmentTime: string | null;
  appointmentType: string | null;
  clinicianName: string | null;
  confidence: number;
}

interface ColumnPositions {
  timeColumn: number | null;
  nameColumn: number | null;
  phoneColumn: number | null;
  typeColumn: number | null;
  clinicianName: string | null;
}

// Regex patterns
const TIME_REGEX = /\b([01]?[0-9]|2[0-3]):([0-5][0-9])\b/;
const TIME_12HR_REGEX = /\b(1[0-2]|0?[1-9])\s?(am|pm)\b/i;
const PHONE_REGEX = /\b0[2-478]\d{2}\s?\d{3}\s?\d{3}\b|\b04\d{2}\s?\d{3}\s?\d{3}\b/;
const HEADER_KEYWORDS = ['patient', 'time', 'clinician', 'doctor', 'ph', 'phone', 'appt', 'type'];

export function parseGentuScreenshot(
  fullText: string,
  blocks: TextBlock[]
): ParsedAppointment[] {
  // Step 1: Group blocks into rows by Y-position
  const rows = groupBlocksByRow(blocks, 15);

  // Step 2: Detect header row (if present)
  const headerInfo = detectHeaderRow(rows);

  // Step 3: Detect time column by pattern density
  const columns = detectColumns(rows, headerInfo);

  // Step 4: Parse each data row into appointments
  const rawAppointments = parseRows(rows, columns, headerInfo.headerRowIndex);

  // Step 5: Normalize extracted data
  const normalizedAppointments = rawAppointments.map(normalizeAppointment);

  // Step 6: Calculate confidence scores
  const scoredAppointments = normalizedAppointments.map(calculateConfidence);

  return scoredAppointments;
}

// ============================================
// Step 1: Group blocks into rows
// ============================================
function groupBlocksByRow(blocks: TextBlock[], tolerance: number): TextBlock[][] {
  const sorted = [...blocks].sort((a, b) => a.boundingBox.y - b.boundingBox.y);
  const rows: TextBlock[][] = [];
  let currentRow: TextBlock[] = [];
  let currentY = -1;

  for (const block of sorted) {
    if (currentY === -1 || Math.abs(block.boundingBox.y - currentY) <= tolerance) {
      currentRow.push(block);
      // Use average Y for the row
      if (currentY === -1) currentY = block.boundingBox.y;
    } else {
      if (currentRow.length > 0) {
        rows.push(currentRow.sort((a, b) => a.boundingBox.x - b.boundingBox.x));
      }
      currentRow = [block];
      currentY = block.boundingBox.y;
    }
  }
  if (currentRow.length > 0) {
    rows.push(currentRow.sort((a, b) => a.boundingBox.x - b.boundingBox.x));
  }

  return rows;
}

// ============================================
// Step 2: Detect header row
// ============================================
function detectHeaderRow(rows: TextBlock[][]): {
  headerRowIndex: number;
  columnLabels: Map<string, number>;
} {
  const columnLabels = new Map<string, number>();
  let headerRowIndex = -1;

  // Check top 4 rows for header keywords
  for (let i = 0; i < Math.min(4, rows.length); i++) {
    const rowText = rows[i].map(b => b.text.toLowerCase()).join(' ');
    const matchCount = HEADER_KEYWORDS.filter(kw => rowText.includes(kw)).length;

    if (matchCount >= 2) {
      headerRowIndex = i;
      // Map column labels to X positions
      for (const block of rows[i]) {
        const text = block.text.toLowerCase();
        for (const keyword of HEADER_KEYWORDS) {
          if (text.includes(keyword)) {
            columnLabels.set(keyword, block.boundingBox.x);
          }
        }
      }
      break;
    }
  }

  return { headerRowIndex, columnLabels };
}

// ============================================
// Step 3: Detect column positions
// ============================================
function detectColumns(
  rows: TextBlock[][],
  headerInfo: { headerRowIndex: number; columnLabels: Map<string, number> }
): ColumnPositions {
  const columns: ColumnPositions = {
    timeColumn: null,
    nameColumn: null,
    phoneColumn: null,
    typeColumn: null,
    clinicianName: null,
  };

  // If header found, use header positions
  if (headerInfo.columnLabels.size > 0) {
    columns.timeColumn = headerInfo.columnLabels.get('time') ?? null;
    columns.nameColumn = headerInfo.columnLabels.get('patient') ?? null;
    columns.phoneColumn = headerInfo.columnLabels.get('ph') ?? headerInfo.columnLabels.get('phone') ?? null;
    columns.typeColumn = headerInfo.columnLabels.get('type') ?? headerInfo.columnLabels.get('appt') ?? null;
  }

  // Detect time column by pattern density
  if (columns.timeColumn === null) {
    const xPositions: number[] = [];
    for (const row of rows) {
      for (const block of row) {
        if (TIME_REGEX.test(block.text) || TIME_12HR_REGEX.test(block.text)) {
          xPositions.push(block.boundingBox.x);
        }
      }
    }
    if (xPositions.length > 0) {
      // Use the most common X position (mode)
      columns.timeColumn = mode(xPositions);
    }
  }

  return columns;
}

// ============================================
// Step 4: Parse rows into appointments
// ============================================
function parseRows(
  rows: TextBlock[][],
  columns: ColumnPositions,
  headerRowIndex: number
): ParsedAppointment[] {
  const appointments: ParsedAppointment[] = [];

  for (let i = 0; i < rows.length; i++) {
    // Skip header row
    if (i === headerRowIndex) continue;

    const row = rows[i];
    const rowText = row.map(b => b.text).join(' ');

    // Only process rows that contain a time pattern
    const timeMatch = rowText.match(TIME_REGEX) || rowText.match(TIME_12HR_REGEX);
    if (!timeMatch) continue;

    const appointment: ParsedAppointment = {
      appointmentTime: timeMatch[0],
      patientName: null,
      patientPhone: null,
      appointmentType: null,
      clinicianName: columns.clinicianName,
      confidence: 0,
    };

    // Extract phone number
    const phoneMatch = rowText.match(PHONE_REGEX);
    if (phoneMatch) {
      appointment.patientPhone = phoneMatch[0];
    }

    // Extract name and type from remaining blocks
    const extracted = extractNameAndType(row);
    appointment.patientName = extracted.name;
    appointment.appointmentType = extracted.type;

    appointments.push(appointment);
  }

  return appointments;
}

// ============================================
// Step 5: Normalize data
// ============================================
function normalizeAppointment(appt: ParsedAppointment): ParsedAppointment {
  return {
    ...appt,
    // Capitalize patient names
    patientName: appt.patientName ? titleCase(appt.patientName) : null,
    // Normalize time to 24hr format (HH:MM)
    appointmentTime: appt.appointmentTime ? normalizeTime(appt.appointmentTime) : null,
    // Standardize phone format (0412 345 678)
    patientPhone: appt.patientPhone ? normalizePhone(appt.patientPhone) : null,
    // Clean up whitespace in type
    appointmentType: appt.appointmentType?.trim() || null,
  };
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeTime(time: string): string {
  // Handle 12hr format (e.g., "3 pm" → "15:00")
  const match12 = time.match(/(\d{1,2})\s?(am|pm)/i);
  if (match12) {
    let hours = parseInt(match12[1]);
    const isPM = match12[2].toLowerCase() === 'pm';
    if (isPM && hours !== 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:00`;
  }

  // Handle 24hr format, ensure HH:MM
  const match24 = time.match(/(\d{1,2}):(\d{2})/);
  if (match24) {
    return `${match24[1].padStart(2, '0')}:${match24[2]}`;
  }

  return time;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return phone;
}

// ============================================
// Step 6: Calculate confidence scores
// ============================================
function calculateConfidence(appt: ParsedAppointment): ParsedAppointment {
  let score = 0;
  let factors = 0;

  // Time present and valid format
  if (appt.appointmentTime && /^\d{2}:\d{2}$/.test(appt.appointmentTime)) {
    score += 1;
  }
  factors++;

  // Patient name present and reasonable length
  if (appt.patientName && appt.patientName.length >= 3) {
    score += 1;
  }
  factors++;

  // Phone present and valid AU format
  if (appt.patientPhone && /^0[2-478]\d{2} \d{3} \d{3}$/.test(appt.patientPhone)) {
    score += 1;
  }
  factors++;

  // Appointment type present
  if (appt.appointmentType) {
    score += 0.5;
  }
  factors += 0.5;

  return {
    ...appt,
    confidence: Math.round((score / factors) * 100) / 100,
  };
}

// ============================================
// Helper functions
// ============================================
function extractNameAndType(row: TextBlock[]): { name: string | null; type: string | null } {
  // Filter out time and phone blocks
  const candidates = row.filter(b =>
    !TIME_REGEX.test(b.text) &&
    !TIME_12HR_REGEX.test(b.text) &&
    !PHONE_REGEX.test(b.text)
  );

  // Longest text is likely the name
  const sorted = [...candidates].sort((a, b) => b.text.length - a.text.length);

  // Common appointment type abbreviations
  const typePatterns = /^(FU|F\/U|CONS|NEW|REVIEW|FOLLOW|TEL|PHONE|VIDEO)$/i;

  let name: string | null = null;
  let type: string | null = null;

  for (const block of sorted) {
    if (!type && typePatterns.test(block.text.trim())) {
      type = block.text.trim();
    } else if (!name && block.text.length >= 3) {
      name = block.text;
    }
  }

  return { name, type };
}

function mode(arr: number[]): number {
  const counts = new Map<number, number>();
  let maxCount = 0;
  let modeValue = arr[0];

  for (const val of arr) {
    const rounded = Math.round(val / 10) * 10; // Round to nearest 10px
    const count = (counts.get(rounded) || 0) + 1;
    counts.set(rounded, count);
    if (count > maxCount) {
      maxCount = count;
      modeValue = rounded;
    }
  }

  return modeValue;
}
```

---

## 6. File Structure (New Files)

```
src/
├── app/
│   ├── (dashboard)/
│   │   └── run-sheet/
│   │       ├── page.tsx              # Main run sheet display
│   │       ├── upload/
│   │       │   └── page.tsx          # Upload & crop flow
│   │       └── review/
│   │           └── page.tsx          # Review before confirm
│   └── api/
│       └── run-sheet/
│           ├── route.ts              # GET/DELETE run sheet
│           ├── screenshots/
│           │   └── route.ts          # POST screenshot
│           ├── appointments/
│           │   ├── route.ts          # GET/POST appointments
│           │   └── [id]/
│           │       └── route.ts      # PATCH/DELETE appointment
│           ├── confirm/
│           │   └── route.ts          # POST confirm
│           └── clinicians/
│               └── route.ts          # GET clinicians
├── components/
│   └── run-sheet/
│       ├── ScreenshotUploader.tsx
│       ├── ImageCropper.tsx
│       ├── UploadProgress.tsx
│       ├── AppointmentReviewTable.tsx
│       ├── AppointmentRow.tsx
│       ├── AddAppointmentForm.tsx
│       ├── ClinicianTabs.tsx
│       ├── RunSheetTable.tsx
│       └── EmptyState.tsx
└── lib/
    └── ocr/
        ├── google-vision.ts          # Google Cloud Vision client
        ├── preprocess.ts             # Image preprocessing (sharp)
        └── gentu-parser.ts           # Gentu-specific parsing logic
```

---

## 7. New Dependencies

```bash
npm install react-image-crop @google-cloud/vision sharp
```

---

## 8. Environment Variables

Add to `.env.local`:

```env
# Google Cloud Vision (JSON service account key, escaped as single line)
GOOGLE_CLOUD_VISION_KEY={"type":"service_account","project_id":"your-project",...}

# OCR Configuration
OCR_MAX_WIDTH=2000
OCR_DEBUG_LOGGING=true
```

---

## 9. Navigation Update

Update `src/app/(dashboard)/layout.tsx` to add Run Sheet link:

```tsx
<Link
  href="/run-sheet"
  className="text-gray-600 hover:text-gray-900"
>
  Run Sheet
</Link>
```

---

## 10. Implementation Order (Revised)

### Phase 1 — Foundation
- Database tables
- Run sheet API stubs
- Upload interface with cropping

### Phase 2 — OCR Pipeline
- Image preprocessing (sharp)
- Google Vision text detection
- Raw OCR annotation storage for debugging

### Phase 3 — Gentu Parsing Engine
- Row grouping
- Header detection
- Column detection
- Time parsing
- Phone detection
- Clinician inference
- Normalization
- Confidence scoring

### Phase 4 — Review UI
- Editable table
- Add/delete rows
- Confidence highlighting (rows < 60% flagged)

### Phase 5 — Run Sheet UI
- Tabs per clinician
- Per-appointment summary

### Phase 6 — Edge Cases & Polish
- Poor screenshot quality handling
- Multi-region uploads
- Manual overrides
- Error states

---

## 11. Risks & Mitigations

### 1. Poor Screenshot Quality
**Mitigation:** Server-side preprocessing (grayscale, contrast, sharpening) significantly improves OCR accuracy.

### 2. Variations in PMS Layouts
**Mitigation:** Start with Gentu-specific rules. The parser is structured to allow adding per-PMS parser classes later.

### 3. OCR Misreads Small Fonts
**Mitigation:** Encourage larger crops. Confidence scoring flags low-quality extractions for manual review.
