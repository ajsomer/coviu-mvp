import { NextResponse } from 'next/server';
import { db } from '@/db';
import { runSheets, runSheetAppointments } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const runSheet = await db.query.runSheets.findFirst({
      where: eq(runSheets.date, today),
    });

    if (!runSheet) {
      return NextResponse.json({ error: 'No run sheet found' }, { status: 404 });
    }

    // Update status to confirmed
    await db.update(runSheets)
      .set({ status: 'confirmed', updatedAt: new Date() })
      .where(eq(runSheets.id, runSheet.id));

    // Count appointments and clinicians
    const appointments = await db.query.runSheetAppointments.findMany({
      where: eq(runSheetAppointments.runSheetId, runSheet.id),
    });

    const clinicianIds = new Set(appointments.map(a => a.clinicianId).filter(Boolean));

    return NextResponse.json({
      success: true,
      runSheetId: runSheet.id,
      appointmentCount: appointments.length,
      clinicianCount: clinicianIds.size,
    });
  } catch (error) {
    console.error('Error confirming run sheet:', error);
    return NextResponse.json({ error: 'Failed to confirm run sheet' }, { status: 500 });
  }
}
