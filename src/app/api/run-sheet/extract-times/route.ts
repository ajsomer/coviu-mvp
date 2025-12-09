import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromImage } from '@/lib/ocr/google-vision';

export interface ExtractedTime {
  time: string;
  y: number;
  yPercent: number;
}

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

    // Convert file to buffer for OCR
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Extract text using OCR
    const ocrResult = await extractTextFromImage(imageBuffer);

    // Extract times from the OCR result
    const times = extractTimesFromBlocks(ocrResult.blocks, ocrResult.imageHeight || 1000);

    console.log(`[ExtractTimes] Found ${times.length} time labels`);

    return NextResponse.json({
      success: true,
      times,
    });
  } catch (error) {
    console.error('Error extracting times:', error);
    return NextResponse.json(
      { error: 'Failed to extract times' },
      { status: 500 }
    );
  }
}

/**
 * Extract time labels from OCR blocks
 */
function extractTimesFromBlocks(
  blocks: Array<{ text: string; boundingBox: { x: number; y: number; width: number; height: number } }>,
  imageHeight: number
): ExtractedTime[] {
  const times: ExtractedTime[] = [];

  // Regex patterns for time formats
  const timePatterns = [
    // 12-hour format with am/pm
    /^(1[0-2]|0?[1-9]):([0-5][0-9])\s*(am|pm)$/i,
    /^(1[0-2]|0?[1-9])\s*(am|pm)$/i,
    // 24-hour format
    /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/,
  ];

  for (const block of blocks) {
    const text = block.text.trim();

    for (const pattern of timePatterns) {
      if (pattern.test(text)) {
        const normalizedTime = normalizeTime(text);
        if (normalizedTime) {
          times.push({
            time: normalizedTime,
            y: block.boundingBox.y,
            yPercent: (block.boundingBox.y / imageHeight) * 100,
          });
        }
        break;
      }
    }
  }

  // Sort by Y position (top to bottom)
  times.sort((a, b) => a.y - b.y);

  return times;
}

/**
 * Normalize time to 24-hour format (HH:MM)
 */
function normalizeTime(timeStr: string): string | null {
  const text = timeStr.trim().toLowerCase();

  // Match 12-hour format with optional minutes
  const match12hr = text.match(/^(1[0-2]|0?[1-9])(?::([0-5][0-9]))?\s*(am|pm)$/i);
  if (match12hr) {
    let hours = parseInt(match12hr[1], 10);
    const minutes = match12hr[2] || '00';
    const period = match12hr[3].toLowerCase();

    if (period === 'pm' && hours !== 12) {
      hours += 12;
    } else if (period === 'am' && hours === 12) {
      hours = 0;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  // Match 24-hour format
  const match24hr = text.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/);
  if (match24hr) {
    const hours = parseInt(match24hr[1], 10);
    const minutes = match24hr[2];
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  return null;
}
