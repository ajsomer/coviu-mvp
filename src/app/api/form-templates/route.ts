import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { formTemplates, specialists } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

// GET - List all form templates
export async function GET() {
  try {
    const templates = await db
      .select({
        id: formTemplates.id,
        name: formTemplates.name,
        description: formTemplates.description,
        schema: formTemplates.schema,
        specialistId: formTemplates.specialistId,
        specialistName: specialists.name,
        isDefault: formTemplates.isDefault,
        createdAt: formTemplates.createdAt,
        updatedAt: formTemplates.updatedAt,
      })
      .from(formTemplates)
      .leftJoin(specialists, eq(formTemplates.specialistId, specialists.id))
      .orderBy(desc(formTemplates.createdAt));

    return NextResponse.json({
      data: templates.map(t => ({
        ...t,
        specialist: t.specialistId ? {
          id: t.specialistId,
          name: t.specialistName,
        } : null,
      })),
    });
  } catch (error) {
    console.error('Error fetching form templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch form templates' },
      { status: 500 }
    );
  }
}

// POST - Create new form template
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, schema, specialistId, isDefault } = body;

    if (!name || !schema) {
      return NextResponse.json(
        { error: 'Name and schema are required' },
        { status: 400 }
      );
    }

    const [newTemplate] = await db
      .insert(formTemplates)
      .values({
        name,
        description: description || null,
        schema,
        specialistId: specialistId || null,
        isDefault: isDefault || false,
      })
      .returning();

    return NextResponse.json(
      { success: true, data: newTemplate },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating form template:', error);
    return NextResponse.json(
      { error: 'Failed to create form template' },
      { status: 500 }
    );
  }
}
