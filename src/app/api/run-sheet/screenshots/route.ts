import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { db } from '@/db';
import { runSheets, runSheetScreenshots, runSheetAppointments, runSheetClinicians } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { extractTextFromImage } from '@/lib/ocr/google-vision';
import { parseSingleColumnScreenshot, ExternalTimeData } from '@/lib/ocr/gentu-parser';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;
    const clinicianNameParam = formData.get('clinicianName') as string | null;
    const timeDataParam = formData.get('timeData') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    // Get or create today's run sheet
    const today = new Date().toISOString().split('T')[0];
    let runSheet = await db.query.runSheets.findFirst({
      where: eq(runSheets.date, today),
    });

    if (!runSheet) {
      const [created] = await db.insert(runSheets).values({
        date: today,
        status: 'draft',
      }).returning();
      runSheet = created;
    }

    // Upload original to Vercel Blob
    const blob = await put(`run-sheet/${runSheet.id}/${Date.now()}.png`, file, {
      access: 'public',
    });

    // Convert file to buffer for OCR
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Extract text using OCR
    const ocrResult = await extractTextFromImage(imageBuffer);

    // Parse external time data if provided
    let externalTimes: ExternalTimeData[] | undefined;
    if (timeDataParam) {
      try {
        externalTimes = JSON.parse(timeDataParam);
      } catch {
        console.warn('[Screenshots] Failed to parse timeData parameter');
      }
    }

    // Parse appointments from OCR result (single column mode)
    const parsedAppointments = parseSingleColumnScreenshot(
      ocrResult.fullText,
      ocrResult.blocks,
      clinicianNameParam || undefined,
      externalTimes,
      ocrResult.imageHeight
    );

    // Save screenshot record with raw OCR response
    const [screenshot] = await db.insert(runSheetScreenshots).values({
      runSheetId: runSheet.id,
      originalUrl: blob.url,
      croppedUrl: blob.url,
      processedAt: new Date(),
      ocrRawResponse: ocrResult.rawResponse || { fullText: ocrResult.fullText },
    }).returning();

    // Save parsed appointments
    const savedAppointments = [];
    for (const appt of parsedAppointments) {
      // Find or create clinician if present
      let clinicianId: string | null = null;
      if (appt.clinicianName) {
        let clinician = await db.query.runSheetClinicians.findFirst({
          where: eq(runSheetClinicians.name, appt.clinicianName),
        });
        if (!clinician) {
          const [created] = await db.insert(runSheetClinicians).values({
            name: appt.clinicianName,
          }).returning();
          clinician = created;
        }
        clinicianId = clinician.id;
      }

      const [saved] = await db.insert(runSheetAppointments).values({
        runSheetId: runSheet.id,
        screenshotId: screenshot.id,
        clinicianId,
        patientName: appt.patientName,
        patientPhone: appt.patientPhone,
        appointmentTime: appt.appointmentTime,
        appointmentType: appt.appointmentType,
        confidence: appt.confidence,
        isManualEntry: false,
      }).returning();

      savedAppointments.push({
        ...saved,
        clinicianName: appt.clinicianName,
      });
    }

    // Update run sheet status to reviewing
    await db.update(runSheets)
      .set({ status: 'reviewing', updatedAt: new Date() })
      .where(eq(runSheets.id, runSheet.id));

    return NextResponse.json({
      success: true,
      screenshotId: screenshot.id,
      appointments: savedAppointments,
    });
  } catch (error) {
    console.error('Error processing screenshot:', error);
    return NextResponse.json(
      { error: 'Failed to process screenshot' },
      { status: 500 }
    );
  }
}
