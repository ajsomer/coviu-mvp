import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { specialists, runSheetClinicians } from './schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const initialSpecialists = [
  { name: 'Dr. Sarah Chen', specialty: 'Cardiology' },
  { name: 'Dr. Michael Roberts', specialty: 'Dermatology' },
  { name: 'Dr. Emily Watson', specialty: 'Endocrinology' },
  { name: 'Dr. James Miller', specialty: 'Gastroenterology' },
  { name: 'Dr. Lisa Park', specialty: 'Neurology' },
];

async function seed() {
  console.log('Seeding specialists...');

  for (const specialist of initialSpecialists) {
    await db.insert(specialists).values(specialist);
    console.log(`  Added specialist: ${specialist.name} (${specialist.specialty})`);
  }

  console.log('\nSeeding run sheet clinicians...');

  // Also add these as run sheet clinicians for telehealth invites
  for (const specialist of initialSpecialists) {
    await db.insert(runSheetClinicians).values({ name: specialist.name });
    console.log(`  Added clinician: ${specialist.name}`);
  }

  console.log('\nSeeding complete!');
}

seed().catch(console.error);
