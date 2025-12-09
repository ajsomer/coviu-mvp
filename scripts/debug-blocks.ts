/**
 * Debug script to analyze OCR blocks
 * Run with: npx tsx scripts/debug-blocks.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync } from 'fs';
import { extractTextFromImage } from '../src/lib/ocr/google-vision';

async function main() {
  const imagePath = process.argv[2] || 'sample-gentu/image.png';

  console.log(`\n📷 Analyzing: ${imagePath}\n`);

  const imageBuffer = readFileSync(imagePath);
  const ocrResult = await extractTextFromImage(imageBuffer);

  console.log(`Full text:\n${ocrResult.fullText}\n`);
  console.log('='.repeat(60));

  // Group blocks by approximate Y position
  const rowTolerance = 20;
  const rows: Map<number, typeof ocrResult.blocks> = new Map();

  for (const block of ocrResult.blocks) {
    const roundedY = Math.round(block.boundingBox.y / rowTolerance) * rowTolerance;
    if (!rows.has(roundedY)) {
      rows.set(roundedY, []);
    }
    rows.get(roundedY)!.push(block);
  }

  // Sort rows by Y position
  const sortedRows = [...rows.entries()].sort((a, b) => a[0] - b[0]);

  console.log('\nBlocks grouped by row (Y position):\n');

  for (const [y, blocks] of sortedRows) {
    const sortedBlocks = blocks.sort((a, b) => a.boundingBox.x - b.boundingBox.x);
    const rowText = sortedBlocks.map(b => `"${b.text}"@(${b.boundingBox.x})`).join(' | ');
    console.log(`Y=${y}: ${rowText}`);
  }

  // Look for phone patterns
  console.log('\n' + '='.repeat(60));
  console.log('\n📞 Phone-like blocks:');
  for (const block of ocrResult.blocks) {
    if (/\d{3,}/.test(block.text) || /0[24]\d/.test(block.text)) {
      console.log(`  "${block.text}" at (${block.boundingBox.x}, ${block.boundingBox.y})`);
    }
  }

  // Look for time patterns
  console.log('\n⏰ Time-like blocks:');
  for (const block of ocrResult.blocks) {
    if (/pm|am|:\d{2}|^\d{1,2}$/i.test(block.text)) {
      console.log(`  "${block.text}" at (${block.boundingBox.x}, ${block.boundingBox.y})`);
    }
  }

  // Look for patient names (capitalized words that aren't UI elements)
  console.log('\n👤 Name-like blocks:');
  const uiElements = ['Dr', 'Oct', 'Today', 'Day', 'Week', 'Print', 'Search', 'Gentu', 'Legend', 'Providers', 'Notes', 'Appointment', 'Procedure', 'ACL', 'Antenatal'];
  for (const block of ocrResult.blocks) {
    if (/^[A-Z][a-z]+$/.test(block.text) && !uiElements.includes(block.text)) {
      console.log(`  "${block.text}" at (${block.boundingBox.x}, ${block.boundingBox.y})`);
    }
  }
}

main().catch(console.error);
