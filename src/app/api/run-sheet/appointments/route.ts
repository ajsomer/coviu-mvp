import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { runSheets, runSheetAppointments, runSheetClinicians, telehealthInvites } from '@/db/schema';
import { eq } from 'drizzle-orm';

// GET - Get all appointments for a run sheet (defaults to today)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const includeInviteStatus = searchParams.get('includeInviteStatus') === 'true';
    const targetDate = dateParam || new Date().toISOString().split('T')[0];

    const runSheet = await db.query.runSheets.findFirst({
      where: eq(runSheets.date, targetDate),
    });

    if (!runSheet) {
      return NextResponse.json({ appointments: [] });
    }

    const appointments = await db.query.runSheetAppointments.findMany({
      where: eq(runSheetAppointments.runSheetId, runSheet.id),
      with: {
        clinician: true,
        ...(includeInviteStatus && { telehealthInvites: true }),
      },
    });

    // Transform appointments to include invite status
    const appointmentsWithStatus = appointments.map((appt) => {
      const latestInvite = includeInviteStatus && appt.telehealthInvites?.length > 0
        ? appt.telehealthInvites.sort((a, b) =>
            new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime()
          )[0]
        : null;

      return {
        ...appt,
        clinicianName: appt.clinician?.name || null,
        inviteStatus: latestInvite ? latestInvite.status : 'none',
      };
    });

    return NextResponse.json({ appointments: appointmentsWithStatus });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return NextResponse.json({ error: 'Failed to fetch appointments' }, { status: 500 });
  }
}

// POST - Add a manual appointment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { patientName, patientPhone, appointmentTime, appointmentType, clinicianName } = body;

    const today = new Date().toISOString().split('T')[0];

    let runSheet = await db.query.runSheets.findFirst({
      where: eq(runSheets.date, today),
    });

    if (!runSheet) {
      const [created] = await db.insert(runSheets).values({
        date: today,
        status: 'reviewing',
      }).returning();
      runSheet = created;
    }

    // Find or create clinician
    let clinician = await db.query.runSheetClinicians.findFirst({
      where: eq(runSheetClinicians.name, clinicianName),
    });

    if (!clinician && clinicianName) {
      const [created] = await db.insert(runSheetClinicians).values({
        name: clinicianName,
      }).returning();
      clinician = created;
    }

    const [appointment] = await db.insert(runSheetAppointments).values({
      runSheetId: runSheet.id,
      clinicianId: clinician?.id,
      patientName,
      patientPhone,
      appointmentTime,
      appointmentType,
      isManualEntry: true,
      confidence: 1.0,
    }).returning();

    return NextResponse.json({ success: true, appointment });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 });
  }
}
