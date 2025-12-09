import { TextBlock } from './google-vision';

export interface DetectedColumn {
  id: string;
  clinicianName: string | null;
  xStart: number;
  xEnd: number;
  // Percentage values for responsive UI
  xStartPercent: number;
  xEndPercent: number;
  isTimeColumn?: boolean;
}

export interface ColumnDetectionResult {
  columns: DetectedColumn[];
  timeColumn: DetectedColumn | null;
  imageWidth: number;
  imageHeight: number;
  isCalendarView: boolean;
}

/**
 * Detect column boundaries in a Gentu screenshot.
 * Returns detected columns that the user can adjust.
 */
export function detectColumns(
  blocks: TextBlock[],
  imageWidth: number,
  imageHeight: number
): ColumnDetectionResult {
  // Look for "Dr" patterns in the header area (top 15% of image)
  const headerYThreshold = imageHeight * 0.15;
  const headerBlocks = blocks.filter((b) => b.boundingBox.y < headerYThreshold);

  // Find blocks containing "Dr" that are likely clinician headers
  const drBlocks = headerBlocks.filter((b) => b.text === 'Dr');

  // If we find multiple "Dr" headers, it's likely a calendar view
  const isCalendarView = drBlocks.length >= 2;

  if (!isCalendarView) {
    // Single column or tabular view - return one column covering the whole image
    return {
      columns: [
        {
          id: 'col-1',
          clinicianName: null,
          xStart: 0,
          xEnd: imageWidth,
          xStartPercent: 0,
          xEndPercent: 100,
        },
      ],
      timeColumn: null,
      imageWidth,
      imageHeight,
      isCalendarView: false,
    };
  }

  // Detect time column on the left side
  const timeColumn = detectTimeColumn(blocks, imageWidth, imageHeight);

  // Sort Dr blocks by X position
  const sortedDrBlocks = [...drBlocks].sort((a, b) => a.boundingBox.x - b.boundingBox.x);

  // Build clinician names by finding adjacent text blocks
  const columns: DetectedColumn[] = sortedDrBlocks.map((drBlock, index) => {
    // Find adjacent blocks to form full name
    const adjacentBlocks = headerBlocks.filter(
      (b) =>
        Math.abs(b.boundingBox.y - drBlock.boundingBox.y) < 20 &&
        b.boundingBox.x >= drBlock.boundingBox.x &&
        b.boundingBox.x < drBlock.boundingBox.x + 250
    );

    const sortedAdjacent = adjacentBlocks.sort((a, b) => a.boundingBox.x - b.boundingBox.x);
    const clinicianName = sortedAdjacent.map((b) => b.text).join(' ').trim();

    return {
      id: `col-${index + 1}`,
      clinicianName: clinicianName || `Column ${index + 1}`,
      xStart: drBlock.boundingBox.x,
      xEnd: 0, // Will be calculated
      xStartPercent: 0,
      xEndPercent: 0,
    };
  });

  // Calculate column boundaries using midpoints
  // First, find the time labels area (left side boundary)
  const timeLabelsEndX = findTimeLabelsEnd(blocks, imageWidth);

  for (let i = 0; i < columns.length; i++) {
    if (i === 0) {
      // First column starts after time labels
      columns[i].xStart = timeLabelsEndX;
    } else {
      // Start at midpoint between previous Dr and this Dr
      const prevDrX = sortedDrBlocks[i - 1].boundingBox.x;
      const thisDrX = sortedDrBlocks[i].boundingBox.x;
      columns[i].xStart = Math.floor((prevDrX + thisDrX) / 2);
    }

    if (i < columns.length - 1) {
      // End at midpoint between this Dr and next Dr
      const thisDrX = sortedDrBlocks[i].boundingBox.x;
      const nextDrX = sortedDrBlocks[i + 1].boundingBox.x;
      columns[i].xEnd = Math.floor((thisDrX + nextDrX) / 2);
    } else {
      // Last column extends to edge
      columns[i].xEnd = imageWidth;
    }

    // Calculate percentages
    columns[i].xStartPercent = Math.round((columns[i].xStart / imageWidth) * 100);
    columns[i].xEndPercent = Math.round((columns[i].xEnd / imageWidth) * 100);
  }

  return {
    columns,
    timeColumn,
    imageWidth,
    imageHeight,
    isCalendarView: true,
  };
}

/**
 * Detect the time column on the left side of the image
 */
function detectTimeColumn(
  blocks: TextBlock[],
  imageWidth: number,
  imageHeight: number
): DetectedColumn | null {
  // Look for time patterns on the left side (first 30% of image)
  const timePatterns = /^(1[0-2]|0?[1-9]):?([0-5][0-9])?\s*(am|pm)?$/i;

  const timeBlocks = blocks.filter(
    (b) => timePatterns.test(b.text.trim()) && b.boundingBox.x < imageWidth * 0.3
  );

  if (timeBlocks.length < 2) {
    // Need at least 2 time labels to consider it a time column
    return null;
  }

  // Find the boundaries of time labels
  const minX = Math.min(...timeBlocks.map((b) => b.boundingBox.x));
  const maxX = Math.max(...timeBlocks.map((b) => b.boundingBox.x + b.boundingBox.width));

  // Add padding
  const xStart = Math.max(0, minX - 10);
  const xEnd = Math.min(imageWidth, maxX + 20);

  return {
    id: 'time-col',
    clinicianName: null,
    xStart,
    xEnd,
    xStartPercent: Math.round((xStart / imageWidth) * 100),
    xEndPercent: Math.round((xEnd / imageWidth) * 100),
    isTimeColumn: true,
  };
}

/**
 * Find where the time labels column ends (left sidebar boundary)
 */
function findTimeLabelsEnd(blocks: TextBlock[], imageWidth: number): number {
  // Look for time patterns on the left side
  const timePatterns = /^(1[0-2]|0?[1-9]):?([0-5][0-9])?(am|pm)?$/i;

  const timeBlocks = blocks.filter(
    (b) => timePatterns.test(b.text) && b.boundingBox.x < imageWidth * 0.3
  );

  if (timeBlocks.length === 0) {
    // Default to 25% of image width if no time labels found
    return Math.floor(imageWidth * 0.25);
  }

  // Find the rightmost time label
  const maxX = Math.max(...timeBlocks.map((b) => b.boundingBox.x + b.boundingBox.width));

  // Add some padding
  return Math.floor(maxX + 20);
}

/**
 * Crop blocks to a specific column region
 */
export function cropBlocksToColumn(
  blocks: TextBlock[],
  column: DetectedColumn,
  imageHeight: number
): TextBlock[] {
  // Filter blocks within the column boundaries
  // Also exclude header area (top 15%)
  const headerYThreshold = imageHeight * 0.12;

  return blocks.filter(
    (b) =>
      b.boundingBox.x >= column.xStart &&
      b.boundingBox.x < column.xEnd &&
      b.boundingBox.y > headerYThreshold
  );
}
