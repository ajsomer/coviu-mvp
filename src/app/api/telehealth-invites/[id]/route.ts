import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { telehealthInvites } from '@/db/schema';
import { eq } from 'drizzle-orm';

// PATCH - Update invite status (send now, resend, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!['queued', 'sent', 'failed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { status };

    // Set timestamp based on status
    if (status === 'sent') {
      updateData.sentAt = new Date();
      updateData.failedAt = null;
      updateData.failureReason = null;
    } else if (status === 'failed') {
      updateData.failedAt = new Date();
      updateData.failureReason = body.failureReason || null;
    } else if (status === 'queued') {
      updateData.queuedAt = new Date();
      updateData.sentAt = null;
      updateData.failedAt = null;
      updateData.failureReason = null;
    }

    const [updated] = await db
      .update(telehealthInvites)
      .set(updateData)
      .where(eq(telehealthInvites.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, invite: updated });
  } catch (error) {
    console.error('Error updating invite:', error);
    return NextResponse.json({ error: 'Failed to update invite' }, { status: 500 });
  }
}
