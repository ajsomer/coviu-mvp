import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { formTemplates } from './schema';
import * as fs from 'fs';
import * as path from 'path';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function seedFormTemplates() {
  console.log('Seeding form templates...');

  // Read the sample intake form JSON
  const sampleFormPath = path.join(__dirname, '../../documents/plan/sample-intake-form.json');
  const sampleFormSchema = JSON.parse(fs.readFileSync(sampleFormPath, 'utf-8'));

  // Create a default intake form template
  await db.insert(formTemplates).values({
    name: 'General Intake Form',
    description: 'Comprehensive patient intake form including personal details, Medicare, medical history, medications, allergies, and consent',
    schema: sampleFormSchema,
    isDefault: true,
  });
  console.log('  Added: General Intake Form (default)');

  // Create a simple follow-up form
  const simpleFollowUpSchema = {
    title: 'Pre-Appointment Follow-up',
    description: 'Quick follow-up questions before your appointment',
    pages: [
      {
        name: 'followUp',
        title: 'Pre-Appointment Questions',
        elements: [
          {
            type: 'boolean',
            name: 'conditionChanged',
            title: 'Has your condition changed since your referral?',
            isRequired: true,
          },
          {
            type: 'comment',
            name: 'conditionChangedDetails',
            title: 'Please describe any changes',
            visibleIf: '{conditionChanged} = true',
            rows: 3,
          },
          {
            type: 'boolean',
            name: 'newMedications',
            title: 'Have you started any new medications since your referral?',
            isRequired: true,
          },
          {
            type: 'comment',
            name: 'newMedicationsDetails',
            title: 'Please list the new medications',
            visibleIf: '{newMedications} = true',
            rows: 3,
          },
          {
            type: 'comment',
            name: 'questionsForDoctor',
            title: 'Do you have any specific questions you would like to discuss with the specialist?',
            rows: 4,
          },
          {
            type: 'boolean',
            name: 'confirmAttendance',
            title: 'I confirm I will attend my scheduled appointment',
            isRequired: true,
          },
        ],
      },
    ],
    showProgressBar: 'off',
    showNavigationButtons: true,
    completedHtml: '<div><h2>Thank you!</h2><p>Your responses have been submitted. We look forward to seeing you at your appointment.</p></div>',
  };

  await db.insert(formTemplates).values({
    name: 'Pre-Appointment Follow-up',
    description: 'Short questionnaire to check on patient status before their appointment',
    schema: simpleFollowUpSchema,
    isDefault: false,
  });
  console.log('  Added: Pre-Appointment Follow-up');

  console.log('Form template seeding complete!');
}

seedFormTemplates().catch(console.error);
