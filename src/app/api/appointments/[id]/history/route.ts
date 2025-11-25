import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { statusHistory } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

// GET - Get status history for an appointment request
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const history = await db
      .select()
      .from(statusHistory)
      .where(eq(statusHistory.requestId, id))
      .orderBy(desc(statusHistory.createdAt));

    return NextResponse.json({ data: history });
  } catch (error) {
    console.error('Error fetching status history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status history' },
      { status: 500 }
    );
  }
}
