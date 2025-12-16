import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { specialists, runSheetClinicians } from './schema';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function seedClinicians() {
  console.log('Fetching existing specialists...');

  // Get all specialists
  const existingSpecialists = await db.select().from(specialists);
  console.log(`Found ${existingSpecialists.length} specialists`);

  // Get existing clinicians to avoid duplicates
  const existingClinicians = await db.select().from(runSheetClinicians);
  const existingNames = new Set(existingClinicians.map(c => c.name));
  console.log(`Found ${existingClinicians.length} existing clinicians`);

  console.log('\nSeeding run sheet clinicians from specialists...');

  let added = 0;
  for (const specialist of existingSpecialists) {
    if (!existingNames.has(specialist.name)) {
      await db.insert(runSheetClinicians).values({ name: specialist.name });
      console.log(`  Added: ${specialist.name}`);
      added++;
    } else {
      console.log(`  Skipped (exists): ${specialist.name}`);
    }
  }

  console.log(`\nSeeding complete! Added ${added} new clinicians.`);
}

seedClinicians().catch(console.error);
