import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { formRequests, formSubmissions } from '@/db/schema';
import { eq } from 'drizzle-orm';

// POST - Submit form response (patient completing the form)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { data, stripePaymentIntentId } = body;

    if (!data) {
      return NextResponse.json(
        { error: 'Form data is required' },
        { status: 400 }
      );
    }

    // Find the form request by token
    const [formRequest] = await db
      .select()
      .from(formRequests)
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
      return NextResponse.json(
        { error: 'This form has already been submitted' },
        { status: 400 }
      );
    }

    // Create the submission
    const [submission] = await db
      .insert(formSubmissions)
      .values({
        formRequestId: formRequest.id,
        data,
        stripePaymentIntentId: stripePaymentIntentId || null,
      })
      .returning();

    // Update the form request status to completed
    await db
      .update(formRequests)
      .set({
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(formRequests.id, formRequest.id));

    return NextResponse.json(
      {
        success: true,
        message: 'Form submitted successfully',
        submissionId: submission.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error submitting form:', error);
    return NextResponse.json(
      { error: 'Failed to submit form' },
      { status: 500 }
    );
  }
}
