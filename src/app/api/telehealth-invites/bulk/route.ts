import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { telehealthInvites, runSheets, runSheetAppointments } from '@/db/schema';
import { parse, addMinutes } from 'date-fns';
import { eq } from 'drizzle-orm';

interface InviteInput {
  patientName: string | null;
  phoneNumber: string;
  clinicianId: string;
  appointmentTime: string;
  appointmentDate: string;
  minutesBefore: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const { invites } = (await request.json()) as { invites: InviteInput[] };

    if (!invites || invites.length === 0) {
      return NextResponse.json({ error: 'No invites provided' }, { status: 400 });
    }

    // Group invites by date to create/update run sheets
    const invitesByDate = invites.reduce((acc, invite) => {
      if (!acc[invite.appointmentDate]) {
        acc[invite.appointmentDate] = [];
      }
      acc[invite.appointmentDate].push(invite);
      return acc;
    }, {} as Record<string, InviteInput[]>);

    // Process each date
    for (const [dateStr, dateInvites] of Object.entries(invitesByDate)) {
      // Find or create run sheet for this date
      let runSheet = await db.query.runSheets.findFirst({
        where: eq(runSheets.date, dateStr),
      });

      if (!runSheet) {
        // Create new run sheet with confirmed status (since user is manually adding)
        const [newRunSheet] = await db.insert(runSheets).values({
          date: dateStr,
          status: 'confirmed',
        }).returning();
        runSheet = newRunSheet;
      } else if (runSheet.status !== 'confirmed') {
        // Update to confirmed if it was draft/reviewing
        await db.update(runSheets)
          .set({ status: 'confirmed', updatedAt: new Date() })
          .where(eq(runSheets.id, runSheet.id));
      }

      // Create appointments and invites for this date
      for (const invite of dateInvites) {
        // Create the run sheet appointment
        const [appointment] = await db.insert(runSheetAppointments).values({
          runSheetId: runSheet.id,
          clinicianId: invite.clinicianId,
          patientName: invite.patientName,
          patientPhone: invite.phoneNumber,
          appointmentTime: invite.appointmentTime,
          isManualEntry: true,
        }).returning();

        // Calculate scheduled time if needed
        let scheduledFor: Date | null = null;
        if (invite.minutesBefore) {
          const appointmentDateTime = parse(
            `${invite.appointmentDate} ${invite.appointmentTime}`,
            'yyyy-MM-dd HH:mm',
            new Date()
          );
          scheduledFor = addMinutes(appointmentDateTime, -invite.minutesBefore);
        }

        // Create the telehealth invite linked to the appointment
        await db.insert(telehealthInvites).values({
          runSheetAppointmentId: appointment.id,
          patientName: invite.patientName,
          phoneNumber: invite.phoneNumber,
          clinicianId: invite.clinicianId,
          appointmentDate: invite.appointmentDate,
          appointmentTime: invite.appointmentTime,
          minutesBefore: invite.minutesBefore,
          scheduledFor,
          status: 'queued',
        });
      }
    }

    return NextResponse.json({
      success: true,
      count: invites.length,
    });
  } catch (error) {
    console.error('Error creating bulk telehealth invites:', error);
    return NextResponse.json({ error: 'Failed to create invites' }, { status: 500 });
  }
}
