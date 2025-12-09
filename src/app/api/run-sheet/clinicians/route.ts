import { NextResponse } from 'next/server';
import { db } from '@/db';
import { runSheets, runSheetAppointments, runSheetClinicians } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const runSheet = await db.query.runSheets.findFirst({
      where: eq(runSheets.date, today),
    });

    if (!runSheet) {
      return NextResponse.json({ clinicians: [] });
    }

    // Get unique clinician IDs from today's appointments
    const appointments = await db.query.runSheetAppointments.findMany({
      where: eq(runSheetAppointments.runSheetId, runSheet.id),
      columns: { clinicianId: true },
    });

    const clinicianIds = [...new Set(appointments.map(a => a.clinicianId).filter(Boolean))] as string[];

    if (clinicianIds.length === 0) {
      return NextResponse.json({ clinicians: [] });
    }

    const clinicians = await db.query.runSheetClinicians.findMany({
      where: inArray(runSheetClinicians.id, clinicianIds),
    });

    return NextResponse.json({ clinicians });
  } catch (error) {
    console.error('Error fetching clinicians:', error);
    return NextResponse.json({ error: 'Failed to fetch clinicians' }, { status: 500 });
  }
}
