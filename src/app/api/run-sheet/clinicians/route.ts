import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { runSheets, runSheetAppointments, runSheetClinicians } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const allClinicians = searchParams.get('all') === 'true';

    // If requesting all clinicians (for telehealth modal)
    if (allClinicians || !dateParam) {
      const clinicians = await db.query.runSheetClinicians.findMany({
        orderBy: (clinicians, { asc }) => [asc(clinicians.name)],
      });
      return NextResponse.json({ clinicians });
    }

    // Otherwise, get clinicians for a specific date's run sheet
    const runSheet = await db.query.runSheets.findFirst({
      where: eq(runSheets.date, dateParam),
    });

    if (!runSheet) {
      // Return all clinicians if no run sheet exists for the date
      const clinicians = await db.query.runSheetClinicians.findMany({
        orderBy: (clinicians, { asc }) => [asc(clinicians.name)],
      });
      return NextResponse.json({ clinicians });
    }

    // Get unique clinician IDs from the run sheet's appointments
    const appointments = await db.query.runSheetAppointments.findMany({
      where: eq(runSheetAppointments.runSheetId, runSheet.id),
      columns: { clinicianId: true },
    });

    const clinicianIds = [...new Set(appointments.map(a => a.clinicianId).filter(Boolean))] as string[];

    if (clinicianIds.length === 0) {
      // Return all clinicians if no appointments have clinicians assigned
      const clinicians = await db.query.runSheetClinicians.findMany({
        orderBy: (clinicians, { asc }) => [asc(clinicians.name)],
      });
      return NextResponse.json({ clinicians });
    }

    const clinicians = await db.query.runSheetClinicians.findMany({
      where: inArray(runSheetClinicians.id, clinicianIds),
      orderBy: (clinicians, { asc }) => [asc(clinicians.name)],
    });

    return NextResponse.json({ clinicians });
  } catch (error) {
    console.error('Error fetching clinicians:', error);
    return NextResponse.json({ error: 'Failed to fetch clinicians' }, { status: 500 });
  }
}
