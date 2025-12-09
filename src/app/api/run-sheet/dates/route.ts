import { NextResponse } from 'next/server';
import { db } from '@/db';
import { runSheets } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const sheets = await db
      .select({ date: runSheets.date })
      .from(runSheets)
      .where(eq(runSheets.status, 'confirmed'))
      .orderBy(runSheets.date);

    return NextResponse.json({
      dates: sheets.map((s) => s.date),
    });
  } catch (error) {
    console.error('Error fetching run sheet dates:', error);
    return NextResponse.json({ error: 'Failed to fetch dates' }, { status: 500 });
  }
}
