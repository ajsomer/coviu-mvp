import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { formRequests, formTemplates, appointmentRequests } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateSecureToken } from '@/lib/utils/token';

// POST - Send a form to a patient (creates form request)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { appointmentRequestId, formTemplateId, expiresInDays } = body;

    if (!appointmentRequestId || !formTemplateId) {
      return NextResponse.json(
        { error: 'appointmentRequestId and formTemplateId are required' },
        { status: 400 }
      );
    }

    // Verify the appointment request exists
    const [appointmentRequest] = await db
      .select()
      .from(appointmentRequests)
      .where(eq(appointmentRequests.id, appointmentRequestId));

    if (!appointmentRequest) {
      return NextResponse.json(
        { error: 'Appointment request not found' },
        { status: 404 }
      );
    }

    // Verify the form template exists
    const [template] = await db
      .select()
      .from(formTemplates)
      .where(eq(formTemplates.id, formTemplateId));

    if (!template) {
      return NextResponse.json(
        { error: 'Form template not found' },
        { status: 404 }
      );
    }

    // Generate secure token
    const token = generateSecureToken();

    // Calculate expiry date (default 14 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (expiresInDays || 14));

    // Create form request
    const [newFormRequest] = await db
      .insert(formRequests)
      .values({
        appointmentRequestId,
        formTemplateId,
        token,
        expiresAt,
      })
      .returning();

    // Build the form URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const formUrl = `${baseUrl}/intake/${token}`;

    return NextResponse.json(
      {
        success: true,
        data: {
          ...newFormRequest,
          formUrl,
          templateName: template.name,
          patientName: `${appointmentRequest.firstName} ${appointmentRequest.lastName}`,
          patientEmail: appointmentRequest.email,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating form request:', error);
    return NextResponse.json(
      { error: 'Failed to create form request' },
      { status: 500 }
    );
  }
}
