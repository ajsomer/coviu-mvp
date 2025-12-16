import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { runSheetAppointments, telehealthInvites } from '@/db/schema';
import { eq } from 'drizzle-orm';

// DELETE - Remove an appointment from the run sheet
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // First delete any associated telehealth invites
    await db.delete(telehealthInvites).where(eq(telehealthInvites.runSheetAppointmentId, id));

    // Then delete the appointment
    const [deleted] = await db
      .delete(runSheetAppointments)
      .where(eq(runSheetAppointments.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    return NextResponse.json({ error: 'Failed to delete appointment' }, { status: 500 });
  }
}
