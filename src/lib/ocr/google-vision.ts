import { ImageAnnotatorClient } from '@google-cloud/vision';
import { preprocessImage } from './preprocess';

// Lazy-load the client to allow env vars to be set before initialization
let client: ImageAnnotatorClient | null = null;

function getClient(): ImageAnnotatorClient {
  if (!client) {
    const credentialsJson = process.env.GOOGLE_CLOUD_VISION_KEY;
    if (!credentialsJson) {
      throw new Error('[OCR] GOOGLE_CLOUD_VISION_KEY not set - OCR will not work');
    }
    const credentials = JSON.parse(credentialsJson);
    client = new ImageAnnotatorClient({ credentials });
  }
  return client;
}

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
  imageWidth?: number;
  imageHeight?: number;
  rawResponse?: unknown;
}

/**
 * Extract text from an image using Google Cloud Vision documentTextDetection.
 * This method is optimized for structured text like tables and forms.
 */
export async function extractTextFromImage(imageBuffer: Buffer): Promise<OCRResult> {
  const DEBUG = process.env.OCR_DEBUG_LOGGING === 'true';

  // Preprocess image for better OCR accuracy
  const processedBuffer = await preprocessImage(imageBuffer);

  if (DEBUG) {
    console.log(`[OCR] Sending ${processedBuffer.length} bytes to Vision API`);
  }

  // Use documentTextDetection for better structured text extraction
  const visionClient = getClient();
  const [result] = await visionClient.documentTextDetection({
    image: { content: processedBuffer.toString('base64') },
  });

  const fullTextAnnotation = result.fullTextAnnotation;
  const fullText = fullTextAnnotation?.text || '';

  // Get image dimensions from the first page
  const firstPage = fullTextAnnotation?.pages?.[0];
  const imageWidth = firstPage?.width || undefined;
  const imageHeight = firstPage?.height || undefined;

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
    imageWidth,
    imageHeight,
    rawResponse: DEBUG ? result : undefined,
  };
}
