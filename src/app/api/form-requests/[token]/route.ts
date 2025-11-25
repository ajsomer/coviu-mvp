import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { formRequests, formTemplates, appointmentRequests, formSubmissions } from '@/db/schema';
import { eq } from 'drizzle-orm';

// GET - Get form by token (public - for patient to fill out)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Find the form request by token
    const [formRequest] = await db
      .select({
        id: formRequests.id,
        status: formRequests.status,
        expiresAt: formRequests.expiresAt,
        templateId: formRequests.formTemplateId,
        appointmentRequestId: formRequests.appointmentRequestId,
        templateName: formTemplates.name,
        templateDescription: formTemplates.description,
        templateSchema: formTemplates.schema,
        patientFirstName: appointmentRequests.firstName,
        patientLastName: appointmentRequests.lastName,
        patientEmail: appointmentRequests.email,
        patientDateOfBirth: appointmentRequests.dateOfBirth,
      })
      .from(formRequests)
      .innerJoin(formTemplates, eq(formRequests.formTemplateId, formTemplates.id))
      .innerJoin(appointmentRequests, eq(formRequests.appointmentRequestId, appointmentRequests.id))
      .where(eq(formRequests.token, token));

    if (!formRequest) {
      return NextResponse.json(
        { error: 'Form not found' },
        { status: 404 }
      );
    }

    // Check if form has expired
    if (formRequest.expiresAt && new Date() > formRequest.expiresAt) {
      return NextResponse.json(
        { error: 'This form has expired' },
        { status: 410 }
      );
    }

    // Check if form is already completed
    if (formRequest.status === 'completed') {
      // Get the submission
      const [submission] = await db
        .select()
        .from(formSubmissions)
        .where(eq(formSubmissions.formRequestId, formRequest.id));

      return NextResponse.json({
        status: 'completed',
        message: 'This form has already been submitted',
        submittedAt: submission?.submittedAt,
      });
    }

    return NextResponse.json({
      data: {
        formRequestId: formRequest.id,
        templateName: formRequest.templateName,
        templateDescription: formRequest.templateDescription,
        schema: formRequest.templateSchema,
        patient: {
          firstName: formRequest.patientFirstName,
          lastName: formRequest.patientLastName,
          email: formRequest.patientEmail,
          dateOfBirth: formRequest.patientDateOfBirth,
        },
        expiresAt: formRequest.expiresAt,
      },
    });
  } catch (error) {
    console.error('Error fetching form:', error);
    return NextResponse.json(
      { error: 'Failed to fetch form' },
      { status: 500 }
    );
  }
}
