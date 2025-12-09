# Phase 3: Parsing Engine

## Objectives

- Implement structured parsing of Gentu screenshots
- Group OCR blocks into rows
- Detect headers and column positions
- Extract patient name, phone, time, type, clinician
- Normalize data and calculate confidence scores

## Prerequisites

- Phase 2 complete (OCR pipeline working)
- Sample Gentu screenshots for testing

## 1. Full Parser Implementation

Replace `src/lib/ocr/gentu-parser.ts`:

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

interface ColumnPositions {
  timeColumn: number | null;
  nameColumn: number | null;
  phoneColumn: number | null;
  typeColumn: number | null;
  clinicianName: string | null;
}

// Regex patterns
const TIME_24HR_REGEX = /\b([01]?[0-9]|2[0-3]):([0-5][0-9])\b/;
const TIME_12HR_REGEX = /\b(1[0-2]|0?[1-9])\s?(am|pm)\b/i;
const PHONE_REGEX = /\b0[2-478]\d{2}\s?\d{3}\s?\d{3}\b|\b04\d{2}\s?\d{3}\s?\d{3}\b/;
const HEADER_KEYWORDS = ['patient', 'time', 'clinician', 'doctor', 'ph', 'phone', 'appt', 'type', 'name'];
const TYPE_PATTERNS = /^(FU|F\/U|CONS|NEW|REVIEW|FOLLOW|TEL|PHONE|VIDEO|CONSULT|INITIAL|STANDARD|LONG|SHORT)$/i;

const DEBUG = process.env.OCR_DEBUG_LOGGING === 'true';

/**
 * Parse Gentu PMS screenshot OCR results into structured appointments.
 *
 * Pipeline:
 * 1. Group blocks into rows by Y-position
 * 2. Detect header row (if present)
 * 3. Detect column positions by pattern density
 * 4. Parse each data row into appointments
 * 5. Normalize extracted data
 * 6. Calculate confidence scores
 */
export function parseGentuScreenshot(
  fullText: string,
  blocks: TextBlock[]
): ParsedAppointment[] {
  if (blocks.length === 0) {
    if (DEBUG) console.log('[Parser] No blocks to parse');
    return [];
  }

  // Step 1: Group blocks into rows by Y-position
  const rows = groupBlocksByRow(blocks, 15);
  if (DEBUG) console.log(`[Parser] Grouped into ${rows.length} rows`);

  // Step 2: Detect header row (if present)
  const headerInfo = detectHeaderRow(rows);
  if (DEBUG) {
    console.log(`[Parser] Header row index: ${headerInfo.headerRowIndex}`);
    console.log(`[Parser] Column labels found: ${[...headerInfo.columnLabels.keys()].join(', ')}`);
  }

  // Step 3: Detect column positions
  const columns = detectColumns(rows, headerInfo);
  if (DEBUG) console.log(`[Parser] Time column X: ${columns.timeColumn}`);

  // Step 4: Parse each data row into appointments
  const rawAppointments = parseRows(rows, columns, headerInfo.headerRowIndex);
  if (DEBUG) console.log(`[Parser] Parsed ${rawAppointments.length} raw appointments`);

  // Step 5: Normalize extracted data
  const normalizedAppointments = rawAppointments.map(normalizeAppointment);

  // Step 6: Calculate confidence scores
  const scoredAppointments = normalizedAppointments.map(calculateConfidence);

  if (DEBUG) {
    console.log(`[Parser] Final appointments:`);
    scoredAppointments.forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.appointmentTime} - ${a.patientName} (${a.patientPhone}) [${Math.round(a.confidence * 100)}%]`);
    });
  }

  return scoredAppointments;
}

// ============================================
// Step 1: Group blocks into rows
// ============================================
function groupBlocksByRow(blocks: TextBlock[], tolerance: number): TextBlock[][] {
  // Sort by Y position
  const sorted = [...blocks].sort((a, b) => a.boundingBox.y - b.boundingBox.y);

  const rows: TextBlock[][] = [];
  let currentRow: TextBlock[] = [];
  let currentY = -1;

  for (const block of sorted) {
    if (currentY === -1 || Math.abs(block.boundingBox.y - currentY) <= tolerance) {
      currentRow.push(block);
      // Track the average Y for this row
      if (currentY === -1) {
        currentY = block.boundingBox.y;
      }
    } else {
      // Start a new row
      if (currentRow.length > 0) {
        // Sort row by X position (left to right)
        rows.push(currentRow.sort((a, b) => a.boundingBox.x - b.boundingBox.x));
      }
      currentRow = [block];
      currentY = block.boundingBox.y;
    }
  }

  // Don't forget the last row
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
    const rowText = rows[i].map((b) => b.text.toLowerCase()).join(' ');
    const matchCount = HEADER_KEYWORDS.filter((kw) => rowText.includes(kw)).length;

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
    columns.nameColumn =
      headerInfo.columnLabels.get('patient') ??
      headerInfo.columnLabels.get('name') ??
      null;
    columns.phoneColumn =
      headerInfo.columnLabels.get('ph') ??
      headerInfo.columnLabels.get('phone') ??
      null;
    columns.typeColumn =
      headerInfo.columnLabels.get('type') ??
      headerInfo.columnLabels.get('appt') ??
      null;
  }

  // Detect time column by pattern density (most reliable)
  if (columns.timeColumn === null) {
    const xPositions: number[] = [];
    for (const row of rows) {
      for (const block of row) {
        if (TIME_24HR_REGEX.test(block.text) || TIME_12HR_REGEX.test(block.text)) {
          xPositions.push(block.boundingBox.x);
        }
      }
    }
    if (xPositions.length > 0) {
      // Use the most common X position (mode), rounded to nearest 10px
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
    const rowText = row.map((b) => b.text).join(' ');

    // Only process rows that contain a time pattern
    const timeMatch = rowText.match(TIME_24HR_REGEX) || rowText.match(TIME_12HR_REGEX);
    if (!timeMatch) continue;

    const appointment: ParsedAppointment = {
      appointmentTime: timeMatch[0],
      patientName: null,
      patientPhone: null,
      appointmentType: null,
      clinicianName: columns.clinicianName,
      confidence: 0,
    };

    // Extract phone number (Australian format)
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
    // Capitalize patient names properly
    patientName: appt.patientName ? titleCase(appt.patientName) : null,
    // Normalize time to 24hr format (HH:MM)
    appointmentTime: appt.appointmentTime ? normalizeTime(appt.appointmentTime) : null,
    // Standardize phone format (0412 345 678)
    patientPhone: appt.patientPhone ? normalizePhone(appt.patientPhone) : null,
    // Clean up whitespace in type
    appointmentType: appt.appointmentType?.trim().toUpperCase() || null,
  };
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeTime(time: string): string {
  // Handle 12hr format (e.g., "3 pm" → "15:00", "9am" → "09:00")
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
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');

  // Format as 0412 345 678
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

  // Time present and valid 24hr format (+1)
  if (appt.appointmentTime && /^\d{2}:\d{2}$/.test(appt.appointmentTime)) {
    score += 1;
  }
  factors++;

  // Patient name present and reasonable length (+1)
  if (appt.patientName && appt.patientName.length >= 3) {
    score += 1;
  }
  factors++;

  // Phone present and valid AU format (+1)
  if (appt.patientPhone && /^0[2-478]\d{2} \d{3} \d{3}$/.test(appt.patientPhone)) {
    score += 1;
  }
  factors++;

  // Appointment type present (+0.5)
  if (appt.appointmentType) {
    score += 0.5;
  }
  factors += 0.5;

  const confidence = Math.round((score / factors) * 100) / 100;

  return {
    ...appt,
    confidence,
  };
}

// ============================================
// Helper functions
// ============================================
function extractNameAndType(row: TextBlock[]): { name: string | null; type: string | null } {
  // Filter out time and phone blocks
  const candidates = row.filter(
    (b) =>
      !TIME_24HR_REGEX.test(b.text) &&
      !TIME_12HR_REGEX.test(b.text) &&
      !PHONE_REGEX.test(b.text)
  );

  // Sort by text length (longest first)
  const sorted = [...candidates].sort((a, b) => b.text.length - a.text.length);

  let name: string | null = null;
  let type: string | null = null;

  for (const block of sorted) {
    const text = block.text.trim();

    // Check if it's a known appointment type
    if (!type && TYPE_PATTERNS.test(text)) {
      type = text;
    }
    // Otherwise, if long enough, it's probably a name
    else if (!name && text.length >= 3 && !TYPE_PATTERNS.test(text)) {
      name = text;
    }

    // Stop once we have both
    if (name && type) break;
  }

  // If we have multiple name-like candidates, join them
  if (name) {
    const nameBlocks = candidates.filter(
      (b) =>
        b.text.length >= 2 &&
        !TYPE_PATTERNS.test(b.text.trim()) &&
        b.boundingBox.x <= (candidates.find((c) => c.text === name)?.boundingBox.x ?? 0) + 200
    );

    if (nameBlocks.length > 1) {
      // Sort by X position and join
      const sortedNameBlocks = nameBlocks.sort((a, b) => a.boundingBox.x - b.boundingBox.x);
      const potentialFullName = sortedNameBlocks.map((b) => b.text).join(' ');

      // Only use if it looks like a name (has space, reasonable length)
      if (potentialFullName.includes(' ') && potentialFullName.length <= 50) {
        name = potentialFullName;
      }
    }
  }

  return { name, type };
}

function mode(arr: number[]): number {
  const counts = new Map<number, number>();
  let maxCount = 0;
  let modeValue = arr[0];

  for (const val of arr) {
    // Round to nearest 10px for grouping
    const rounded = Math.round(val / 10) * 10;
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

## 2. Testing the Parser

### Debug Output

With `OCR_DEBUG_LOGGING=true`, you'll see detailed output:

```
[Parser] Grouped into 15 rows
[Parser] Header row index: 0
[Parser] Column labels found: time, patient, phone
[Parser] Time column X: 50
[Parser] Parsed 12 raw appointments
[Parser] Final appointments:
  1. 09:00 - John Smith (0412 345 678) [100%]
  2. 09:30 - Jane Doe (0423 456 789) [100%]
  3. 10:00 - Bob Johnson (null) [67%]
  ...
```

### Common Issues & Fixes

**Names being split across blocks:**
- The `extractNameAndType` function attempts to join adjacent name blocks
- Adjust the X-position tolerance (currently 200px) if needed

**Times not detected:**
- Check if the PMS uses unusual time formats
- Add more patterns to `TIME_24HR_REGEX` or `TIME_12HR_REGEX`

**Phone numbers not detected:**
- Australian phones: 04XX XXX XXX (mobile), 0X XXXX XXXX (landline)
- Adjust `PHONE_REGEX` for other formats

**Wrong blocks grouped into rows:**
- Increase/decrease the Y-tolerance (currently 15px)
- Depends on screenshot resolution and font size

## 3. Tuning for Your Screenshots

After testing with real Gentu screenshots, you may need to adjust:

| Parameter | Location | Purpose |
|-----------|----------|---------|
| Y-tolerance | `groupBlocksByRow(blocks, 15)` | How close blocks must be vertically to be same row |
| Header keywords | `HEADER_KEYWORDS` array | Words that indicate a header row |
| Type patterns | `TYPE_PATTERNS` regex | Common appointment type abbreviations |
| Name X-tolerance | `extractNameAndType` (200px) | How far apart name blocks can be to join |

## Checklist

- [ ] Replace `src/lib/ocr/gentu-parser.ts` with full implementation
- [ ] Test with real Gentu screenshots
- [ ] Check debug output for parsing accuracy
- [ ] Tune parameters based on actual screenshot formats
- [ ] Verify appointments are saved to database correctly
- [ ] Check confidence scores are reasonable

## Next Phase

Once parsing is working reliably, proceed to Phase 4 to build the review UI where users can correct any parsing errors.
