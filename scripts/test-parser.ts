/**
 * Test script for the Gentu parser
 * Run with: npx tsx scripts/test-parser.ts
 */

import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local' });

// Enable debug logging
process.env.OCR_DEBUG_LOGGING = 'true';

import { readFileSync } from 'fs';
import { extractTextFromImage } from '../src/lib/ocr/google-vision';
import { parseGentuScreenshot } from '../src/lib/ocr/gentu-parser';

async function main() {
  const imagePath = process.argv[2] || 'sample-gentu/image.png';

  console.log(`\n📷 Testing parser with: ${imagePath}\n`);
  console.log('='.repeat(60));

  // Read the image
  const imageBuffer = readFileSync(imagePath);
  console.log(`✓ Read image: ${imageBuffer.length} bytes\n`);

  // Extract text via OCR
  console.log('🔍 Running OCR...\n');
  const ocrResult = await extractTextFromImage(imageBuffer);

  console.log(`\n✓ OCR extracted ${ocrResult.blocks.length} word blocks`);
  console.log(`✓ Full text length: ${ocrResult.fullText.length} chars\n`);

  // Show sample of blocks for debugging
  console.log('📦 Sample blocks (first 20):');
  ocrResult.blocks.slice(0, 20).forEach((block, i) => {
    console.log(`  ${i + 1}. "${block.text}" at (${block.boundingBox.x}, ${block.boundingBox.y})`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('📋 Parsing appointments...\n');

  // Parse appointments
  const appointments = parseGentuScreenshot(ocrResult.fullText, ocrResult.blocks);

  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Parsed ${appointments.length} appointments:\n`);

  appointments.forEach((appt, i) => {
    console.log(`${i + 1}. ${appt.appointmentTime || '??:??'} - ${appt.patientName || '(no name)'}`);
    console.log(`   📞 ${appt.patientPhone || '(no phone)'}`);
    console.log(`   📝 ${appt.appointmentType || '(no type)'}`);
    console.log(`   👨‍⚕️ ${appt.clinicianName || '(no clinician)'}`);
    console.log(`   📊 Confidence: ${Math.round(appt.confidence * 100)}%`);
    console.log('');
  });

  // Summary
  console.log('='.repeat(60));
  console.log('\n📊 Summary:');
  console.log(`   Total appointments: ${appointments.length}`);
  console.log(`   With name: ${appointments.filter(a => a.patientName).length}`);
  console.log(`   With phone: ${appointments.filter(a => a.patientPhone).length}`);
  console.log(`   With time: ${appointments.filter(a => a.appointmentTime).length}`);
  console.log(`   With type: ${appointments.filter(a => a.appointmentType).length}`);
  console.log(`   With clinician: ${appointments.filter(a => a.clinicianName).length}`);

  const avgConfidence = appointments.length > 0
    ? appointments.reduce((sum, a) => sum + a.confidence, 0) / appointments.length
    : 0;
  console.log(`   Avg confidence: ${Math.round(avgConfidence * 100)}%`);

  // Show types found
  console.log('\n📝 Types found:');
  const typesFound = appointments.filter(a => a.appointmentType).map(a => a.appointmentType);
  console.log(`   ${typesFound.join(', ') || '(none)'}`);

  // Cross-reference with expected (from the image)
  console.log('\n📋 Expected from image:');
  console.log('   Dr Andrew column: Smith Robert (Consulting), Adams Peter (Pre Operative), Johnson Jane, Nguyen James (Follow Up), Lake Jim (Post Op)');
  console.log('   Dr Seymour column: Benson Dorothy (Urgent), George Alfred (New Patient), PEARSON Leslee, Bragg Billy (Follow Up), Cooke Jeffrey (New Patient), Aitken Donald (Urgent), Anthony Evie (Pre Operative)');
  console.log('   Dr Amarita column: Ackfield Ida');
}

main().catch(console.error);
