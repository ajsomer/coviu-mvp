import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { telehealthInvites, runSheetAppointments } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const { appointmentId } = await request.json();

    // Get appointment details with relations
    const appointment = await db.query.runSheetAppointments.findFirst({
      where: eq(runSheetAppointments.id, appointmentId),
      with: {
        runSheet: true,
        clinician: true,
      },
    });

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }

    if (!appointment.patientPhone) {
      return NextResponse.json({ error: 'No phone number for this appointment' }, { status: 400 });
    }

    // Check for existing invite
    const existingInvite = await db.query.telehealthInvites.findFirst({
      where: eq(telehealthInvites.runSheetAppointmentId, appointmentId),
    });

    if (existingInvite) {
      // Re-queue existing invite
      await db
        .update(telehealthInvites)
        .set({
          status: 'queued',
          queuedAt: new Date(),
          sentAt: null,
          failedAt: null,
          failureReason: null,
        })
        .where(eq(telehealthInvites.id, existingInvite.id));
    } else {
      // Create new invite
      await db.insert(telehealthInvites).values({
        runSheetAppointmentId: appointmentId,
        phoneNumber: appointment.patientPhone,
        clinicianId: appointment.clinicianId,
        appointmentDate: appointment.runSheet.date,
        appointmentTime: appointment.appointmentTime || '',
        status: 'queued',
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating/updating telehealth invite:', error);
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
  }
}
