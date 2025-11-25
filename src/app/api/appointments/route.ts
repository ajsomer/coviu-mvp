import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { appointmentRequests, specialists } from '@/db/schema';
import { appointmentRequestSchema } from '@/lib/validations';
import { eq, desc, and, ilike, or, SQL } from 'drizzle-orm';

// POST - Create new appointment request (from patient form)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = appointmentRequestSchema.parse(body);

    const [newRequest] = await db
      .insert(appointmentRequests)
      .values({
        firstName: validatedData.firstName,
        lastName: validatedData.lastName,
        dateOfBirth: validatedData.dateOfBirth,
        email: validatedData.email,
        phone: validatedData.phone,
        specialistId: validatedData.specialistId,
        referralDocumentUrl: validatedData.referralDocumentUrl || null,
        referralDocumentName: validatedData.referralDocumentName || null,
        referringDoctorName: validatedData.referringDoctorName,
        referringDoctorPhone: validatedData.referringDoctorPhone || null,
        referringDoctorEmail: validatedData.referringDoctorEmail || null,
        referringClinic: validatedData.referringClinic || null,
        referralDate: validatedData.referralDate,
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        message: 'Appointment request submitted successfully',
        requestId: newRequest.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating appointment request:', error);

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { success: false, errors: (error as any).errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to submit appointment request' },
      { status: 500 }
    );
  }
}

// GET - List appointment requests (for dashboard)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const specialistId = searchParams.get('specialistId');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions: SQL[] = [];

    if (status && status !== 'all') {
      conditions.push(eq(appointmentRequests.status, status as any));
    }

    if (priority && priority !== 'all') {
      conditions.push(eq(appointmentRequests.priority, priority as any));
    }

    if (specialistId && specialistId !== 'all') {
      conditions.push(eq(appointmentRequests.specialistId, specialistId));
    }

    if (search) {
      conditions.push(
        or(
          ilike(appointmentRequests.firstName, `%${search}%`),
          ilike(appointmentRequests.lastName, `%${search}%`)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch requests with specialist info
    const requests = await db
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
      .where(whereClause)
      .orderBy(desc(appointmentRequests.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const allRequests = await db
      .select({ id: appointmentRequests.id })
      .from(appointmentRequests)
      .where(whereClause);

    const total = allRequests.length;

    return NextResponse.json({
      data: requests.map(r => ({
        ...r,
        specialist: {
          id: r.specialistId,
          name: r.specialistName,
          specialty: r.specialistSpecialty,
        },
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching appointment requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch appointment requests' },
      { status: 500 }
    );
  }
}
