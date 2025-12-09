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
