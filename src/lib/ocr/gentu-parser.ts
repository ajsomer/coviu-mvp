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

interface ClinicianColumn {
  name: string;
  xStart: number;
  xEnd: number;
}

// Regex patterns
const TIME_24HR_REGEX = /\b([01]?[0-9]|2[0-3]):([0-5][0-9])\b/;
const TIME_12HR_REGEX = /\b(1[0-2]|0?[1-9]):?([0-5][0-9])?\s?(am|pm)\b/i;
// Phone patterns - both combined and split formats
const PHONE_REGEX = /\b0[2-478]\d{2}\s?\d{3}\s?\d{3}\b|\b04\d{2}\s?\d{3}\s?\d{3}\b/;
const PHONE_START_REGEX = /^0[24]\d{2}$/; // e.g., "0400", "0412"
const HEADER_KEYWORDS = ['patient', 'time', 'clinician', 'doctor', 'ph', 'phone', 'appt', 'type', 'name'];
const TYPE_PATTERNS = /^(FU|F\/U|CONS|NEW|REVIEW|FOLLOW|TEL|PHONE|VIDEO|CONSULT|INITIAL|STANDARD|LONG|SHORT|PRE\s?OPERATIVE|POST\s?OP|CONSULTING|URGENT|NEW\s?PATIENT|FOLLOW\s?UP|PRE\s?OP)$/i;

// Check DEBUG at runtime
function isDebug(): boolean {
  return process.env.OCR_DEBUG_LOGGING === 'true';
}

/**
 * External time data from a separate time column OCR
 */
export interface ExternalTimeData {
  time: string;
  y: number;
  yPercent: number;
}

/**
 * Parse a single-column cropped screenshot into appointments.
 * This is the simplified parser for use with the column selection UI.
 *
 * Since the image is already cropped to a single column, we don't need
 * complex column detection - just parse appointments vertically.
 *
 * @param fullText - The full text from OCR
 * @param blocks - The text blocks from OCR
 * @param clinicianName - The clinician name for this column
 * @param externalTimes - Optional time data from a separate time column
 * @param imageHeight - Optional image height for calculating Y percentages
 */
export function parseSingleColumnScreenshot(
  fullText: string,
  blocks: TextBlock[],
  clinicianName?: string,
  externalTimes?: ExternalTimeData[],
  imageHeight?: number
): ParsedAppointment[] {
  if (blocks.length === 0) {
    if (isDebug()) console.log('[Parser] No blocks to parse');
    return [];
  }

  if (isDebug()) {
    console.log(`[Parser] Single column parse with ${blocks.length} blocks`);
    console.log(`[Parser] Clinician: ${clinicianName || 'unknown'}`);
    if (externalTimes) {
      console.log(`[Parser] Using ${externalTimes.length} external time labels`);
    }
  }

  // Preprocess blocks to merge split components (phones, times)
  const mergedBlocks = mergeAdjacentBlocks(blocks);

  // Use external times if provided, otherwise find times in this column
  let timeLabels: Array<{ time: string; y: number }>;

  if (externalTimes && externalTimes.length > 0 && imageHeight) {
    // Convert external times (which use yPercent) to absolute Y positions for this image
    timeLabels = externalTimes.map((t) => ({
      time: t.time,
      y: (t.yPercent / 100) * imageHeight,
    }));
    if (isDebug()) {
      console.log(`[Parser] Converted ${timeLabels.length} external time labels to absolute Y`);
    }
  } else {
    // Fall back to finding times in this column
    timeLabels = findTimeLabelsInColumn(mergedBlocks);
  }

  if (isDebug()) {
    console.log(`[Parser] Using ${timeLabels.length} time labels`);
  }

  // Group blocks into appointment clusters by Y-position
  // Use a tolerance that captures multi-line appointment cards
  const clusters = groupBlocksIntoClusters(mergedBlocks, 70);

  if (isDebug()) {
    console.log(`[Parser] Grouped into ${clusters.length} clusters`);
  }

  const appointments: ParsedAppointment[] = [];

  for (const cluster of clusters) {
    const appointment = parseAppointmentClusterSimple(cluster, clinicianName || null, timeLabels);
    if (appointment) {
      appointments.push(appointment);
    }
  }

  // Normalize and calculate confidence
  return appointments.map(normalizeAppointment).map(calculateConfidence);
}

/**
 * Parse an appointment cluster for single-column mode
 * Accepts null clinician name
 */
function parseAppointmentClusterSimple(
  cluster: TextBlock[],
  clinicianName: string | null,
  timeLabels: Array<{ time: string; y: number }>
): ParsedAppointment | null {
  // Combine all text in the cluster
  const clusterText = cluster.map((b) => b.text).join(' ');
  const clusterY = Math.min(...cluster.map((b) => b.boundingBox.y));

  // Skip if this looks like a header or navigation element
  if (isHeaderOrNavigation(clusterText)) {
    return null;
  }

  // Find the nearest time label
  let appointmentTime: string | null = null;

  // First check if time is embedded in the cluster itself
  const embeddedTime = clusterText.match(/\b(1[0-2]|0?[1-9]):?([0-5][0-9])?\s?(am|pm)\b/i);
  if (embeddedTime) {
    appointmentTime = embeddedTime[0];
  } else {
    // Find nearest time label by Y position
    let nearestTime: { time: string; y: number } | null = null;
    let minDistance = Infinity;

    for (const label of timeLabels) {
      const distance = Math.abs(label.y - clusterY);
      if (distance < minDistance) {
        minDistance = distance;
        nearestTime = label;
      }
    }

    // Only use if reasonably close (within 100px for single column)
    if (nearestTime && minDistance < 100) {
      appointmentTime = nearestTime.time;
    }
  }

  // Extract phone number
  let patientPhone: string | null = null;
  const phoneMatch = clusterText.match(PHONE_REGEX);
  if (phoneMatch) {
    patientPhone = phoneMatch[0];
  }

  // Extract patient name and appointment type
  const { name, type } = extractNameAndTypeFromCluster(cluster);

  // Skip clusters that don't have enough appointment data
  if (!name && !appointmentTime) {
    return null;
  }

  return {
    patientName: name,
    patientPhone,
    appointmentTime,
    appointmentType: type,
    clinicianName,
    confidence: 0,
  };
}

/**
 * Find time labels within a single column
 */
function findTimeLabelsInColumn(blocks: TextBlock[]): Array<{ time: string; y: number }> {
  const timeLabels: Array<{ time: string; y: number }> = [];

  for (const block of blocks) {
    // Check for 12-hour time format (e.g., "12pm", "12:30pm", "1pm")
    const match12 = block.text.match(/^(1[0-2]|0?[1-9]):?([0-5][0-9])?(am|pm)$/i);
    if (match12) {
      timeLabels.push({
        time: block.text,
        y: block.boundingBox.y,
      });
      continue;
    }

    // Check for 24-hour time format
    const match24 = block.text.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/);
    if (match24) {
      timeLabels.push({
        time: block.text,
        y: block.boundingBox.y,
      });
    }
  }

  return timeLabels.sort((a, b) => a.y - b.y);
}

/**
 * Parse Gentu PMS screenshot OCR results into structured appointments.
 *
 * Pipeline:
 * 1. Detect if it's a calendar view (multiple clinician columns) or tabular view
 * 2. For calendar view: detect clinician columns, group appointments by position
 * 3. For tabular view: group blocks into rows, detect headers, parse rows
 * 4. Extract patient name, phone, time, type for each appointment
 * 5. Normalize data and calculate confidence scores
 */
export function parseGentuScreenshot(
  fullText: string,
  blocks: TextBlock[]
): ParsedAppointment[] {
  if (blocks.length === 0) {
    if (isDebug()) console.log('[Parser] No blocks to parse');
    return [];
  }

  if (isDebug()) {
    console.log(`[Parser] Starting parse with ${blocks.length} blocks`);
    console.log(`[Parser] Full text preview: ${fullText.substring(0, 300)}...`);
  }

  // Detect clinician columns (Gentu calendar view)
  const clinicianColumns = detectClinicianColumns(blocks, fullText);

  if (clinicianColumns.length > 0) {
    if (isDebug()) {
      console.log(`[Parser] Detected ${clinicianColumns.length} clinician columns (calendar view)`);
      clinicianColumns.forEach((c) => console.log(`  - ${c.name}: x=${c.xStart}-${c.xEnd}`));
    }
    return parseCalendarView(blocks, clinicianColumns);
  }

  // Fall back to tabular parsing
  if (isDebug()) console.log('[Parser] Using tabular view parsing');
  return parseTabularView(blocks);
}

// ============================================
// Calendar View Parsing (Gentu-specific)
// ============================================

function detectClinicianColumns(blocks: TextBlock[], fullText: string): ClinicianColumn[] {
  const columns: ClinicianColumn[] = [];

  // Look for "Dr" patterns in the header area (y between 100-160, where clinician headers appear)
  const headerBlocks = blocks.filter((b) => b.boundingBox.y >= 100 && b.boundingBox.y < 160);

  // Find blocks containing "Dr" that are likely clinician headers
  const drBlocks = headerBlocks.filter((b) => b.text === 'Dr');

  if (isDebug()) {
    console.log(`[Parser] Found ${drBlocks.length} potential clinician header blocks`);
    drBlocks.forEach((b) => console.log(`  - "Dr" at x=${b.boundingBox.x}, y=${b.boundingBox.y}`));
  }

  // Group adjacent blocks that form clinician names
  for (const drBlock of drBlocks) {
    // Find adjacent blocks to form full name
    const adjacentBlocks = headerBlocks.filter(
      (b) =>
        Math.abs(b.boundingBox.y - drBlock.boundingBox.y) < 15 &&
        b.boundingBox.x >= drBlock.boundingBox.x &&
        b.boundingBox.x < drBlock.boundingBox.x + 200
    );

    const sortedAdjacent = adjacentBlocks.sort((a, b) => a.boundingBox.x - b.boundingBox.x);
    const fullName = sortedAdjacent.map((b) => b.text).join(' ');

    columns.push({
      name: fullName.trim(),
      xStart: drBlock.boundingBox.x, // Will be adjusted to midpoints
      xEnd: 0, // Will be calculated
    });
  }

  // Sort columns by X position
  columns.sort((a, b) => a.xStart - b.xStart);

  // Calculate column boundaries using midpoints between doctor headers
  // This creates clean divisions between visual columns
  for (let i = 0; i < columns.length; i++) {
    if (i === 0) {
      // First column starts at the time labels area
      columns[i].xStart = 450;
    } else {
      // Start at midpoint between previous Dr and this Dr
      const prevDrX = columns[i - 1].xStart + 150; // Restore original Dr X (we store xStart as drX)
      const thisDrX = columns[i].xStart;
      columns[i].xStart = Math.floor((prevDrX + thisDrX) / 2);
    }

    if (i < columns.length - 1) {
      // End at midpoint between this Dr and next Dr
      const thisDrX = columns[i].xStart;
      const nextDrX = columns[i + 1].xStart;
      columns[i].xEnd = Math.floor((thisDrX + nextDrX) / 2);
    } else {
      columns[i].xEnd = 2000; // Last column extends to edge
    }
  }

  // Fix the calculation - we need to recalculate with actual Dr X positions
  // Store original Dr X positions first
  const drXPositions = drBlocks.map((b) => b.boundingBox.x).sort((a, b) => a - b);

  for (let i = 0; i < columns.length; i++) {
    if (i === 0) {
      columns[i].xStart = 450; // After time labels
    } else {
      columns[i].xStart = Math.floor((drXPositions[i - 1] + drXPositions[i]) / 2);
    }

    if (i < columns.length - 1) {
      columns[i].xEnd = Math.floor((drXPositions[i] + drXPositions[i + 1]) / 2);
    } else {
      columns[i].xEnd = 2000;
    }
  }

  if (isDebug()) {
    columns.forEach((c) => console.log(`  - ${c.name}: x=${c.xStart}-${c.xEnd}`));
  }

  return columns;
}

function parseCalendarView(
  blocks: TextBlock[],
  clinicianColumns: ClinicianColumn[]
): ParsedAppointment[] {
  const appointments: ParsedAppointment[] = [];

  // Preprocess blocks to merge split components
  const mergedBlocks = mergeAdjacentBlocks(blocks);

  // Find time labels on the left side (typically x < 450)
  const timeLabels = findTimeLabels(mergedBlocks);

  if (isDebug()) {
    console.log(`[Parser] Found ${timeLabels.length} time labels`);
    timeLabels.slice(0, 10).forEach((t) => console.log(`  - ${t.time} at y=${t.y}`));
  }

  // Group appointment blocks by clinician column and vertical position
  for (const column of clinicianColumns) {
    // Get blocks within this column (excluding header area)
    const columnBlocks = mergedBlocks.filter(
      (b) =>
        b.boundingBox.x >= column.xStart &&
        b.boundingBox.x < column.xEnd &&
        b.boundingBox.y > 150 // Below header
    );

    if (isDebug()) {
      console.log(`[Parser] Column "${column.name}": ${columnBlocks.length} blocks`);
    }

    // Group blocks into appointment clusters by Y-position
    // Use larger tolerance (70px) to capture multi-line appointment cards
    const clusters = groupBlocksIntoClusters(columnBlocks, 70);

    if (isDebug()) {
      console.log(`[Parser] Column "${column.name}": ${clusters.length} clusters`);
      clusters.forEach((c, i) => {
        const clusterText = c.map(b => b.text).join(' ');
        const minY = Math.min(...c.map(b => b.boundingBox.y));
        console.log(`  Cluster ${i + 1} (y=${minY}): ${clusterText.substring(0, 80)}...`);
      });
    }

    for (const cluster of clusters) {
      const appointment = parseAppointmentCluster(cluster, column.name, timeLabels);
      if (appointment) {
        appointments.push(appointment);
      }
    }
  }

  // Normalize and score all appointments
  return appointments.map(normalizeAppointment).map(calculateConfidence);
}

/**
 * Merge adjacent blocks that belong together (phones, times, names)
 */
function mergeAdjacentBlocks(blocks: TextBlock[]): TextBlock[] {
  const result: TextBlock[] = [];
  const used = new Set<number>();

  // Sort blocks by Y then X
  const sorted = [...blocks].sort((a, b) => {
    const yDiff = a.boundingBox.y - b.boundingBox.y;
    if (Math.abs(yDiff) < 15) {
      return a.boundingBox.x - b.boundingBox.x;
    }
    return yDiff;
  });

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;

    const block = sorted[i];

    // Try to merge phone numbers (0400 + 000 + 000)
    if (PHONE_START_REGEX.test(block.text)) {
      const phoneBlocks = [block];
      let lastX = block.boundingBox.x + block.boundingBox.width;

      for (let j = i + 1; j < sorted.length && phoneBlocks.length < 3; j++) {
        if (used.has(j)) continue;
        const next = sorted[j];

        // Check if on same line and adjacent
        if (
          Math.abs(next.boundingBox.y - block.boundingBox.y) < 15 &&
          next.boundingBox.x - lastX < 50 &&
          /^\d{3}$/.test(next.text)
        ) {
          phoneBlocks.push(next);
          used.add(j);
          lastX = next.boundingBox.x + next.boundingBox.width;
        }
      }

      if (phoneBlocks.length === 3) {
        const mergedPhone = phoneBlocks.map((b) => b.text).join(' ');
        result.push({
          text: mergedPhone,
          boundingBox: {
            x: block.boundingBox.x,
            y: block.boundingBox.y,
            width: phoneBlocks[2].boundingBox.x + phoneBlocks[2].boundingBox.width - block.boundingBox.x,
            height: block.boundingBox.height,
          },
        });
        used.add(i);
        continue;
      }
    }

    // Try to merge time + pm/am (e.g., "12:30" + "pm")
    if (/^\d{1,2}:?\d{0,2}$/.test(block.text) && !used.has(i)) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(j)) continue;
        const next = sorted[j];

        if (
          Math.abs(next.boundingBox.y - block.boundingBox.y) < 15 &&
          next.boundingBox.x - (block.boundingBox.x + block.boundingBox.width) < 30 &&
          /^(am|pm)$/i.test(next.text)
        ) {
          result.push({
            text: block.text + next.text,
            boundingBox: {
              x: block.boundingBox.x,
              y: block.boundingBox.y,
              width: next.boundingBox.x + next.boundingBox.width - block.boundingBox.x,
              height: block.boundingBox.height,
            },
          });
          used.add(i);
          used.add(j);
          break;
        }
      }
      if (used.has(i)) continue;
    }

    // Clean name prefixes (remove leading -)
    if (block.text.startsWith('-')) {
      result.push({
        text: block.text.substring(1),
        boundingBox: block.boundingBox,
      });
      used.add(i);
      continue;
    }

    // Keep block as-is
    if (!used.has(i)) {
      result.push(block);
      used.add(i);
    }
  }

  return result;
}

function findTimeLabels(blocks: TextBlock[]): Array<{ time: string; y: number }> {
  const timeLabels: Array<{ time: string; y: number }> = [];

  // Time labels are typically on the left/center area (x < 500) in Gentu calendar view
  const leftBlocks = blocks.filter((b) => b.boundingBox.x < 500);

  for (const block of leftBlocks) {
    // Check for 12-hour time format (e.g., "12pm", "12:30pm", "1pm")
    const match12 = block.text.match(/^(1[0-2]|0?[1-9]):?([0-5][0-9])?(am|pm)$/i);
    if (match12) {
      timeLabels.push({
        time: block.text,
        y: block.boundingBox.y,
      });
      continue;
    }

    // Check for 24-hour time format
    const match24 = block.text.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/);
    if (match24) {
      timeLabels.push({
        time: block.text,
        y: block.boundingBox.y,
      });
    }
  }

  // Sort by Y position
  return timeLabels.sort((a, b) => a.y - b.y);
}

function groupBlocksIntoClusters(blocks: TextBlock[], yTolerance: number): TextBlock[][] {
  if (blocks.length === 0) return [];

  // Sort by Y position
  const sorted = [...blocks].sort((a, b) => a.boundingBox.y - b.boundingBox.y);

  const clusters: TextBlock[][] = [];
  let currentCluster: TextBlock[] = [sorted[0]];
  let clusterMinY = sorted[0].boundingBox.y;

  for (let i = 1; i < sorted.length; i++) {
    const block = sorted[i];

    // Check if block is within tolerance of the cluster's starting Y
    if (block.boundingBox.y - clusterMinY <= yTolerance) {
      currentCluster.push(block);
    } else {
      // Start a new cluster
      if (currentCluster.length > 0) {
        clusters.push(currentCluster);
      }
      currentCluster = [block];
      clusterMinY = block.boundingBox.y;
    }
  }

  // Don't forget the last cluster
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  return clusters;
}

function parseAppointmentCluster(
  cluster: TextBlock[],
  clinicianName: string,
  timeLabels: Array<{ time: string; y: number }>
): ParsedAppointment | null {
  // Combine all text in the cluster
  const clusterText = cluster.map((b) => b.text).join(' ');
  const clusterY = Math.min(...cluster.map((b) => b.boundingBox.y));

  // Skip if this looks like a header or navigation element
  if (isHeaderOrNavigation(clusterText)) {
    return null;
  }

  // Find the nearest time label
  let appointmentTime: string | null = null;

  // First check if time is embedded in the cluster itself
  const embeddedTime = clusterText.match(/\b(1[0-2]|0?[1-9]):?([0-5][0-9])?\s?(am|pm)\b/i);
  if (embeddedTime) {
    appointmentTime = embeddedTime[0];
  } else {
    // Find nearest time label by Y position
    let nearestTime: { time: string; y: number } | null = null;
    let minDistance = Infinity;

    for (const label of timeLabels) {
      const distance = Math.abs(label.y - clusterY);
      if (distance < minDistance) {
        minDistance = distance;
        nearestTime = label;
      }
    }

    // Only use if reasonably close (within 80px)
    if (nearestTime && minDistance < 80) {
      appointmentTime = nearestTime.time;
    }
  }

  // Extract phone number
  let patientPhone: string | null = null;
  const phoneMatch = clusterText.match(PHONE_REGEX);
  if (phoneMatch) {
    patientPhone = phoneMatch[0];
  }

  // Extract patient name and appointment type
  const { name, type } = extractNameAndTypeFromCluster(cluster);

  // Skip clusters that don't have enough appointment data
  if (!name && !appointmentTime) {
    return null;
  }

  return {
    patientName: name,
    patientPhone,
    appointmentTime,
    appointmentType: type,
    clinicianName,
    confidence: 0,
  };
}

function isHeaderOrNavigation(text: string): boolean {
  const lowerText = text.toLowerCase();

  // Skip if it contains navigation/UI elements
  const skipPatterns = [
    'print',
    'today',
    'week',
    'day',
    'search',
    'legend',
    'providers',
    'day notes',
    'settings',
    'all-day',
    'oct',
    'october',
    'september',
    'november',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];

  return skipPatterns.some((p) => lowerText.includes(p));
}

function extractNameAndTypeFromCluster(cluster: TextBlock[]): {
  name: string | null;
  type: string | null;
} {
  let name: string | null = null;
  let type: string | null = null;

  // Sort blocks by Y position (top to bottom), then X (left to right)
  const sortedBlocks = [...cluster].sort((a, b) => {
    const yDiff = a.boundingBox.y - b.boundingBox.y;
    if (Math.abs(yDiff) < 15) {
      return a.boundingBox.x - b.boundingBox.x;
    }
    return yDiff;
  });

  // Complete appointment type phrases (check full text first)
  // Ordered by specificity (longer phrases first)
  const typeFullPhrases = [
    { pattern: 'pre operative', display: 'Pre Operative' },
    { pattern: 'pre op', display: 'Pre Op' },
    { pattern: 'post op', display: 'Post Op' },
    { pattern: 'post operative', display: 'Post Operative' },
    { pattern: 'new patient', display: 'New Patient' },
    { pattern: 'follow up', display: 'Follow Up' },
    { pattern: 'consulting', display: 'Consulting' },
    { pattern: 'urgent', display: 'Urgent' },
    { pattern: 'review', display: 'Review' },
    { pattern: 'consult', display: 'Consult' },
  ];

  // First pass: check if any full type phrase exists in the cluster text
  const clusterFullText = sortedBlocks.map((b) => b.text).join(' ').toLowerCase();
  for (const { pattern, display } of typeFullPhrases) {
    if (clusterFullText.includes(pattern)) {
      type = display;
      break;
    }
  }

  // Build list of type words to exclude from name extraction
  const typeWordsLower = type ? type.toLowerCase().split(' ') : [];
  const nonTypeBlocks: TextBlock[] = [];

  for (const block of sortedBlocks) {
    const text = block.text.trim();
    const lowerText = text.toLowerCase();

    // Skip empty, very short, or numeric blocks
    if (text.length < 2 || /^\d+$/.test(text)) {
      continue;
    }

    // Skip phone numbers (they contain spaces after merging)
    if (/^0\d{3}\s\d{3}\s\d{3}$/.test(text)) {
      continue;
    }

    // Skip time patterns
    if (TIME_12HR_REGEX.test(text) || TIME_24HR_REGEX.test(text)) {
      continue;
    }

    // Skip UI elements
    if (['Dr', 'AM', 'PM', 'all-day', '▾', '☑'].includes(text)) {
      continue;
    }

    // Skip if this block is part of the detected type
    if (typeWordsLower.includes(lowerText)) {
      continue;
    }

    nonTypeBlocks.push(block);
  }

  // Find name from remaining blocks - look for capitalized words or ALL CAPS
  const nameBlocks: TextBlock[] = [];

  for (const block of nonTypeBlocks) {
    const text = block.text.trim();

    // Name parts: either start with capital letter, or ALL CAPS (like "PEARSON")
    if ((/^[A-Z][a-zA-Z]*$/.test(text) || /^[A-Z]{2,}$/.test(text)) && text.length >= 2) {
      nameBlocks.push(block);
    }
  }

  // Group name blocks by Y position (same row)
  if (nameBlocks.length > 0) {
    const rows: TextBlock[][] = [];
    let currentRow: TextBlock[] = [nameBlocks[0]];
    let currentY = nameBlocks[0].boundingBox.y;

    for (let i = 1; i < nameBlocks.length; i++) {
      if (Math.abs(nameBlocks[i].boundingBox.y - currentY) < 15) {
        currentRow.push(nameBlocks[i]);
      } else {
        rows.push(currentRow);
        currentRow = [nameBlocks[i]];
        currentY = nameBlocks[i].boundingBox.y;
      }
    }
    rows.push(currentRow);

    // Take the first row as the name (usually "LastName FirstName")
    if (rows.length > 0) {
      const firstRow = rows[0].sort((a, b) => a.boundingBox.x - b.boundingBox.x);
      name = firstRow.map((b) => b.text).join(' ');
    }
  }

  return { name, type };
}

// ============================================
// Tabular View Parsing (fallback)
// ============================================

function parseTabularView(blocks: TextBlock[]): ParsedAppointment[] {
  // Step 1: Group blocks into rows by Y-position
  const rows = groupBlocksByRow(blocks, 15);
  if (isDebug()) console.log(`[Parser] Grouped into ${rows.length} rows`);

  // Step 2: Detect header row (if present)
  const headerInfo = detectHeaderRow(rows);
  if (isDebug()) {
    console.log(`[Parser] Header row index: ${headerInfo.headerRowIndex}`);
    console.log(`[Parser] Column labels found: ${[...headerInfo.columnLabels.keys()].join(', ')}`);
  }

  // Step 3: Detect column positions
  const columns = detectColumns(rows, headerInfo);
  if (isDebug()) console.log(`[Parser] Time column X: ${columns.timeColumn}`);

  // Step 4: Parse each data row into appointments
  const rawAppointments = parseRows(rows, columns, headerInfo.headerRowIndex);
  if (isDebug()) console.log(`[Parser] Parsed ${rawAppointments.length} raw appointments`);

  // Step 5 & 6: Normalize and calculate confidence
  return rawAppointments.map(normalizeAppointment).map(calculateConfidence);
}

function groupBlocksByRow(blocks: TextBlock[], tolerance: number): TextBlock[][] {
  // Sort by Y position
  const sorted = [...blocks].sort((a, b) => a.boundingBox.y - b.boundingBox.y);

  const rows: TextBlock[][] = [];
  let currentRow: TextBlock[] = [];
  let currentY = -1;

  for (const block of sorted) {
    if (currentY === -1 || Math.abs(block.boundingBox.y - currentY) <= tolerance) {
      currentRow.push(block);
      if (currentY === -1) {
        currentY = block.boundingBox.y;
      }
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

function detectHeaderRow(rows: TextBlock[][]): {
  headerRowIndex: number;
  columnLabels: Map<string, number>;
} {
  const columnLabels = new Map<string, number>();
  let headerRowIndex = -1;

  for (let i = 0; i < Math.min(4, rows.length); i++) {
    const rowText = rows[i].map((b) => b.text.toLowerCase()).join(' ');
    const matchCount = HEADER_KEYWORDS.filter((kw) => rowText.includes(kw)).length;

    if (matchCount >= 2) {
      headerRowIndex = i;

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

  if (headerInfo.columnLabels.size > 0) {
    columns.timeColumn = headerInfo.columnLabels.get('time') ?? null;
    columns.nameColumn =
      headerInfo.columnLabels.get('patient') ?? headerInfo.columnLabels.get('name') ?? null;
    columns.phoneColumn =
      headerInfo.columnLabels.get('ph') ?? headerInfo.columnLabels.get('phone') ?? null;
    columns.typeColumn =
      headerInfo.columnLabels.get('type') ?? headerInfo.columnLabels.get('appt') ?? null;
  }

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
      columns.timeColumn = mode(xPositions);
    }
  }

  return columns;
}

function parseRows(
  rows: TextBlock[][],
  columns: ColumnPositions,
  headerRowIndex: number
): ParsedAppointment[] {
  const appointments: ParsedAppointment[] = [];

  for (let i = 0; i < rows.length; i++) {
    if (i === headerRowIndex) continue;

    const row = rows[i];
    const rowText = row.map((b) => b.text).join(' ');

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

    const phoneMatch = rowText.match(PHONE_REGEX);
    if (phoneMatch) {
      appointment.patientPhone = phoneMatch[0];
    }

    const extracted = extractNameAndType(row);
    appointment.patientName = extracted.name;
    appointment.appointmentType = extracted.type;

    appointments.push(appointment);
  }

  return appointments;
}

// ============================================
// Normalization
// ============================================

function normalizeAppointment(appt: ParsedAppointment): ParsedAppointment {
  return {
    ...appt,
    patientName: appt.patientName ? titleCase(appt.patientName) : null,
    appointmentTime: appt.appointmentTime ? normalizeTime(appt.appointmentTime) : null,
    patientPhone: appt.patientPhone ? normalizePhone(appt.patientPhone) : null,
    appointmentType: appt.appointmentType?.trim() || null,
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
  // Handle 12hr format (e.g., "3pm" → "15:00", "9:30am" → "09:30", "12:30pm" → "12:30")
  const match12 = time.match(/(1[0-2]|0?[1-9]):?([0-5][0-9])?\s?(am|pm)/i);
  if (match12) {
    let hours = parseInt(match12[1]);
    const minutes = match12[2] ? parseInt(match12[2]) : 0;
    const isPM = match12[3].toLowerCase() === 'pm';

    if (isPM && hours !== 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  // Handle 24hr format
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
// Confidence Scoring
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
  const candidates = row.filter(
    (b) =>
      !TIME_24HR_REGEX.test(b.text) &&
      !TIME_12HR_REGEX.test(b.text) &&
      !PHONE_REGEX.test(b.text)
  );

  const sorted = [...candidates].sort((a, b) => b.text.length - a.text.length);

  let name: string | null = null;
  let type: string | null = null;

  for (const block of sorted) {
    const text = block.text.trim();

    if (!type && TYPE_PATTERNS.test(text)) {
      type = text;
    } else if (!name && text.length >= 3 && !TYPE_PATTERNS.test(text)) {
      name = text;
    }

    if (name && type) break;
  }

  if (name) {
    const nameBlocks = candidates.filter(
      (b) =>
        b.text.length >= 2 &&
        !TYPE_PATTERNS.test(b.text.trim()) &&
        b.boundingBox.x <= (candidates.find((c) => c.text === name)?.boundingBox.x ?? 0) + 200
    );

    if (nameBlocks.length > 1) {
      const sortedNameBlocks = nameBlocks.sort((a, b) => a.boundingBox.x - b.boundingBox.x);
      const potentialFullName = sortedNameBlocks.map((b) => b.text).join(' ');

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
