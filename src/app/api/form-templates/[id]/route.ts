import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { formTemplates, specialists } from '@/db/schema';
import { eq } from 'drizzle-orm';

// GET - Get form template by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [template] = await db
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
      .where(eq(formTemplates.id, id));

    if (!template) {
      return NextResponse.json(
        { error: 'Form template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: {
        ...template,
        specialist: template.specialistId ? {
          id: template.specialistId,
          name: template.specialistName,
        } : null,
      },
    });
  } catch (error) {
    console.error('Error fetching form template:', error);
    return NextResponse.json(
      { error: 'Failed to fetch form template' },
      { status: 500 }
    );
  }
}

// PATCH - Update form template
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, schema, specialistId, isDefault } = body;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (schema !== undefined) updateData.schema = schema;
    if (specialistId !== undefined) updateData.specialistId = specialistId;
    if (isDefault !== undefined) updateData.isDefault = isDefault;

    const [updated] = await db
      .update(formTemplates)
      .set(updateData)
      .where(eq(formTemplates.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { error: 'Form template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating form template:', error);
    return NextResponse.json(
      { error: 'Failed to update form template' },
      { status: 500 }
    );
  }
}

// DELETE - Delete form template
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [deleted] = await db
      .delete(formTemplates)
      .where(eq(formTemplates.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json(
        { error: 'Form template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting form template:', error);
    return NextResponse.json(
      { error: 'Failed to delete form template' },
      { status: 500 }
    );
  }
}
