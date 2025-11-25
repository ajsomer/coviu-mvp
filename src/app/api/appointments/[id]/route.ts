import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { appointmentRequests, specialists, statusHistory, notesHistory, formRequests, formTemplates, formSubmissions } from '@/db/schema';
import { updateRequestSchema } from '@/lib/validations';
import { eq, desc } from 'drizzle-orm';

// GET - Get single appointment request
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [result] = await db
      .select({
        id: appointmentRequests.id,
        firstName: appointmentRequests.firstName,
        lastName: appointmentRequests.lastName,
        dateOfBirth: appointmentRequests.dateOfBirth,
        email: appointmentRequests.email,
        phone: appointmentRequests.phone,
        specialistId: appointmentRequests.specialistId,
        specialistName: specialists.name,
        specialistSpecialty: specialists.specialty,
        referralDocumentUrl: appointmentRequests.referralDocumentUrl,
        referralDocumentName: appointmentRequests.referralDocumentName,
        referringDoctorName: appointmentRequests.referringDoctorName,
        referringDoctorPhone: appointmentRequests.referringDoctorPhone,
        referringDoctorEmail: appointmentRequests.referringDoctorEmail,
        referringClinic: appointmentRequests.referringClinic,
        referralDate: appointmentRequests.referralDate,
        status: appointmentRequests.status,
        priority: appointmentRequests.priority,
        notes: appointmentRequests.notes,
        createdAt: appointmentRequests.createdAt,
        updatedAt: appointmentRequests.updatedAt,
      })
      .from(appointmentRequests)
      .leftJoin(specialists, eq(appointmentRequests.specialistId, specialists.id))
      .where(eq(appointmentRequests.id, id));

    if (!result) {
      return NextResponse.json(
        { error: 'Appointment request not found' },
        { status: 404 }
      );
    }

    // Fetch notes history
    const notes = await db
      .select()
      .from(notesHistory)
      .where(eq(notesHistory.requestId, id))
      .orderBy(desc(notesHistory.createdAt));

    // Fetch form requests and their submissions
    const formRequestsData = await db
      .select({
        id: formRequests.id,
        token: formRequests.token,
        status: formRequests.status,
        sentAt: formRequests.sentAt,
        completedAt: formRequests.completedAt,
        expiresAt: formRequests.expiresAt,
        templateId: formTemplates.id,
        templateName: formTemplates.name,
        templateDescription: formTemplates.description,
      })
      .from(formRequests)
      .innerJoin(formTemplates, eq(formRequests.formTemplateId, formTemplates.id))
      .where(eq(formRequests.appointmentRequestId, id))
      .orderBy(desc(formRequests.sentAt));

    // Fetch submissions for completed forms
    const formRequestsWithSubmissions = await Promise.all(
      formRequestsData.map(async (fr) => {
        if (fr.status === 'completed') {
          const [submission] = await db
            .select()
            .from(formSubmissions)
            .where(eq(formSubmissions.formRequestId, fr.id));
          return { ...fr, submission };
        }
        return { ...fr, submission: null };
      })
    );

    return NextResponse.json({
      data: {
        ...result,
        specialist: {
          id: result.specialistId,
          name: result.specialistName,
          specialty: result.specialistSpecialty,
        },
        notesHistory: notes,
        formRequests: formRequestsWithSubmissions,
      },
    });
  } catch (error) {
    console.error('Error fetching appointment request:', error);
    return NextResponse.json(
      { error: 'Failed to fetch appointment request' },
      { status: 500 }
    );
  }
}

// PATCH - Update appointment request (status, priority, notes)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validatedData = updateRequestSchema.parse(body);

    // Get current request to track status change
    const [currentRequest] = await db
      .select()
      .from(appointmentRequests)
      .where(eq(appointmentRequests.id, id));

    if (!currentRequest) {
      return NextResponse.json(
        { error: 'Appointment request not found' },
        { status: 404 }
      );
    }

    // Update the request
    const [updatedRequest] = await db
      .update(appointmentRequests)
      .set({
        ...validatedData,
        updatedAt: new Date(),
      })
      .where(eq(appointmentRequests.id, id))
      .returning();

    // If status changed, record in history
    if (validatedData.status && validatedData.status !== currentRequest.status) {
      await db.insert(statusHistory).values({
        requestId: id,
        previousStatus: currentRequest.status,
        newStatus: validatedData.status,
        notes: validatedData.notes || null,
      });
    }

    // If notes provided, add to notes history
    if (validatedData.notes && validatedData.notes.trim()) {
      await db.insert(notesHistory).values({
        requestId: id,
        note: validatedData.notes.trim(),
      });
    }

    // Fetch updated notes history
    const notes = await db
      .select()
      .from(notesHistory)
      .where(eq(notesHistory.requestId, id))
      .orderBy(desc(notesHistory.createdAt));

    return NextResponse.json({
      success: true,
      data: updatedRequest,
      notesHistory: notes,
    });
  } catch (error) {
    console.error('Error updating appointment request:', error);

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { success: false, errors: (error as any).errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to update appointment request' },
      { status: 500 }
    );
  }
}
