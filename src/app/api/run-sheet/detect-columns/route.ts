import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromImage } from '@/lib/ocr/google-vision';
import { detectColumns } from '@/lib/ocr/column-detector';
import sharp from 'sharp';

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

    // Validate file size (10MB max for detection)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Get image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const imageWidth = metadata.width || 1920;
    const imageHeight = metadata.height || 1080;

    // Extract text using OCR
    const ocrResult = await extractTextFromImage(imageBuffer);

    // Detect columns
    const detectionResult = detectColumns(ocrResult.blocks, imageWidth, imageHeight);

    return NextResponse.json({
      success: true,
      ...detectionResult,
      blockCount: ocrResult.blocks.length,
    });
  } catch (error) {
    console.error('Error detecting columns:', error);
    return NextResponse.json(
      { error: 'Failed to detect columns' },
      { status: 500 }
    );
  }
}
