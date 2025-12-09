import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { runSheets } from '@/db/schema';
import { eq } from 'drizzle-orm';

// GET - Get or create run sheet for a date (defaults to today)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const targetDate = dateParam || new Date().toISOString().split('T')[0];

    let runSheet = await db.query.runSheets.findFirst({
      where: eq(runSheets.date, targetDate),
    });

    // Only auto-create for today if no date specified
    if (!runSheet && !dateParam) {
      const [created] = await db.insert(runSheets).values({
        date: targetDate,
        status: 'draft',
      }).returning();
      runSheet = created;
    }

    return NextResponse.json(runSheet);
  } catch (error) {
    console.error('Error fetching run sheet:', error);
    return NextResponse.json({ error: 'Failed to fetch run sheet' }, { status: 500 });
  }
}

// DELETE - Delete run sheet for a date (defaults to today)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const targetDate = dateParam || new Date().toISOString().split('T')[0];

    await db.delete(runSheets).where(eq(runSheets.date, targetDate));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting run sheet:', error);
    return NextResponse.json({ error: 'Failed to delete run sheet' }, { status: 500 });
  }
}
