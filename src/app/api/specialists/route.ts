import { NextResponse } from 'next/server';
import { db } from '@/db';
import { specialists } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const activeSpecialists = await db
      .select({
        id: specialists.id,
        name: specialists.name,
        specialty: specialists.specialty,
      })
      .from(specialists)
      .where(eq(specialists.isActive, true));

    return NextResponse.json({ data: activeSpecialists });
  } catch (error) {
    console.error('Error fetching specialists:', error);
    return NextResponse.json(
      { error: 'Failed to fetch specialists' },
      { status: 500 }
    );
  }
}
