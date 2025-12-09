import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { runSheetAppointments } from '@/db/schema';
import { eq } from 'drizzle-orm';

// PATCH - Update an appointment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const [updated] = await db.update(runSheetAppointments)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(runSheetAppointments.id, id))
      .returning();

    return NextResponse.json({ success: true, appointment: updated });
  } catch (error) {
    console.error('Error updating appointment:', error);
    return NextResponse.json({ error: 'Failed to update appointment' }, { status: 500 });
  }
}

// DELETE - Delete an appointment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.delete(runSheetAppointments)
      .where(eq(runSheetAppointments.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    return NextResponse.json({ error: 'Failed to delete appointment' }, { status: 500 });
  }
}
