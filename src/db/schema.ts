import { pgTable, uuid, varchar, text, date, timestamp, pgEnum, boolean, jsonb, real } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const requestStatusEnum = pgEnum('request_status', [
  'pending',
  'in_review',
  'contacted',
  'scheduled',
  'cancelled',
  'completed'
]);

export const priorityEnum = pgEnum('priority', [
  'low',
  'normal',
  'high',
  'urgent'
]);

export const formRequestStatusEnum = pgEnum('form_request_status', [
  'pending',
  'completed',
  'expired'
]);

// Specialists table - doctors available at the clinic
export const specialists = pgTable('specialists', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  specialty: varchar('specialty', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const appointmentRequests = pgTable('appointment_requests', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Patient details
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  dateOfBirth: date('date_of_birth').notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),

  // Selected specialist (which doctor the patient wants to see)
  specialistId: uuid('specialist_id').references(() => specialists.id).notNull(),

  // Referral details
  referralDocumentUrl: text('referral_document_url'),
  referralDocumentName: varchar('referral_document_name', { length: 255 }),

  // Referring doctor details (the GP who referred them)
  referringDoctorName: varchar('referring_doctor_name', { length: 255 }).notNull(),
  referringDoctorPhone: varchar('referring_doctor_phone', { length: 20 }),
  referringDoctorEmail: varchar('referring_doctor_email', { length: 255 }),
  referringClinic: varchar('referring_clinic', { length: 255 }),
  referralDate: date('referral_date').notNull(),

  // Triage fields
  status: requestStatusEnum('status').notNull().default('pending'),
  priority: priorityEnum('priority').notNull().default('normal'),
  notes: text('notes'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const statusHistory = pgTable('status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestId: uuid('request_id').references(() => appointmentRequests.id).notNull(),
  previousStatus: requestStatusEnum('previous_status'),
  newStatus: requestStatusEnum('new_status').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Notes history - tracks all notes added to a request
export const notesHistory = pgTable('notes_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestId: uuid('request_id').references(() => appointmentRequests.id).notNull(),
  note: text('note').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Form templates - reusable form schemas created by staff
export const formTemplates = pgTable('form_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  schema: jsonb('schema').notNull(),
  specialistId: uuid('specialist_id').references(() => specialists.id),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Form requests - tracks forms sent to patients
export const formRequests = pgTable('form_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentRequestId: uuid('appointment_request_id').references(() => appointmentRequests.id).notNull(),
  formTemplateId: uuid('form_template_id').references(() => formTemplates.id).notNull(),
  token: varchar('token', { length: 64 }).unique().notNull(),
  status: formRequestStatusEnum('status').notNull().default('pending'),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  expiresAt: timestamp('expires_at'),
});

// Form submissions - patient responses
export const formSubmissions = pgTable('form_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  formRequestId: uuid('form_request_id').references(() => formRequests.id).notNull(),
  data: jsonb('data').notNull(),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
});

// ============================================
// DAILY RUN SHEET - Screenshot Parsing Feature
// ============================================

export const runSheetStatusEnum = pgEnum('run_sheet_status', [
  'draft',      // Still uploading/cropping screenshots
  'reviewing',  // User is reviewing parsed data
  'confirmed'   // Run sheet is finalized
]);

export const telehealthInviteStatusEnum = pgEnum('telehealth_invite_status', [
  'queued',    // Waiting to be sent
  'sent',      // Successfully sent
  'failed',    // Failed to send
]);

// Clinicians extracted from screenshots (separate from specialists)
export const runSheetClinicians = pgTable('run_sheet_clinicians', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Daily run sheet - one per day
export const runSheets = pgTable('run_sheets', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: date('date').notNull(),
  status: runSheetStatusEnum('status').notNull().default('draft'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Screenshots uploaded for a run sheet
export const runSheetScreenshots = pgTable('run_sheet_screenshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  runSheetId: uuid('run_sheet_id').references(() => runSheets.id).notNull(),
  originalUrl: text('original_url').notNull(),
  croppedUrl: text('cropped_url'),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
  ocrRawResponse: jsonb('ocr_raw_response'),
});

// Parsed appointments from screenshots
export const runSheetAppointments = pgTable('run_sheet_appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  runSheetId: uuid('run_sheet_id').references(() => runSheets.id).notNull(),
  screenshotId: uuid('screenshot_id').references(() => runSheetScreenshots.id),
  clinicianId: uuid('clinician_id').references(() => runSheetClinicians.id),
  patientName: varchar('patient_name', { length: 255 }),
  patientPhone: varchar('patient_phone', { length: 50 }),
  appointmentTime: varchar('appointment_time', { length: 20 }),
  appointmentType: varchar('appointment_type', { length: 255 }),
  confidence: real('confidence'),
  isManualEntry: boolean('is_manual_entry').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Telehealth invites - tracks SMS invites for appointments
export const telehealthInvites = pgTable('telehealth_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  runSheetAppointmentId: uuid('run_sheet_appointment_id').references(() => runSheetAppointments.id),
  phoneNumber: varchar('phone_number', { length: 50 }).notNull(),
  clinicianId: uuid('clinician_id').references(() => runSheetClinicians.id),
  appointmentDate: date('appointment_date').notNull(),
  appointmentTime: varchar('appointment_time', { length: 20 }).notNull(),
  status: telehealthInviteStatusEnum('status').notNull().default('queued'),
  queuedAt: timestamp('queued_at').defaultNow().notNull(),
  sentAt: timestamp('sent_at'),
  failedAt: timestamp('failed_at'),
  failureReason: text('failure_reason'),
});

// Run sheet relations
export const runSheetsRelations = relations(runSheets, ({ many }) => ({
  screenshots: many(runSheetScreenshots),
  appointments: many(runSheetAppointments),
}));

export const runSheetScreenshotsRelations = relations(runSheetScreenshots, ({ one, many }) => ({
  runSheet: one(runSheets, {
    fields: [runSheetScreenshots.runSheetId],
    references: [runSheets.id],
  }),
  appointments: many(runSheetAppointments),
}));

export const runSheetAppointmentsRelations = relations(runSheetAppointments, ({ one, many }) => ({
  runSheet: one(runSheets, {
    fields: [runSheetAppointments.runSheetId],
    references: [runSheets.id],
  }),
  screenshot: one(runSheetScreenshots, {
    fields: [runSheetAppointments.screenshotId],
    references: [runSheetScreenshots.id],
  }),
  clinician: one(runSheetClinicians, {
    fields: [runSheetAppointments.clinicianId],
    references: [runSheetClinicians.id],
  }),
  telehealthInvites: many(telehealthInvites),
}));

export const runSheetCliniciansRelations = relations(runSheetClinicians, ({ many }) => ({
  appointments: many(runSheetAppointments),
  telehealthInvites: many(telehealthInvites),
}));

export const telehealthInvitesRelations = relations(telehealthInvites, ({ one }) => ({
  appointment: one(runSheetAppointments, {
    fields: [telehealthInvites.runSheetAppointmentId],
    references: [runSheetAppointments.id],
  }),
  clinician: one(runSheetClinicians, {
    fields: [telehealthInvites.clinicianId],
    references: [runSheetClinicians.id],
  }),
}));

// Type exports
export type Specialist = typeof specialists.$inferSelect;
export type NewSpecialist = typeof specialists.$inferInsert;
export type AppointmentRequest = typeof appointmentRequests.$inferSelect;
export type NewAppointmentRequest = typeof appointmentRequests.$inferInsert;
export type StatusHistory = typeof statusHistory.$inferSelect;
export type NotesHistory = typeof notesHistory.$inferSelect;
export type FormTemplate = typeof formTemplates.$inferSelect;
export type NewFormTemplate = typeof formTemplates.$inferInsert;
export type FormRequest = typeof formRequests.$inferSelect;
export type NewFormRequest = typeof formRequests.$inferInsert;
export type FormSubmission = typeof formSubmissions.$inferSelect;
export type NewFormSubmission = typeof formSubmissions.$inferInsert;
export type RunSheet = typeof runSheets.$inferSelect;
export type NewRunSheet = typeof runSheets.$inferInsert;
export type RunSheetScreenshot = typeof runSheetScreenshots.$inferSelect;
export type RunSheetAppointment = typeof runSheetAppointments.$inferSelect;
export type NewRunSheetAppointment = typeof runSheetAppointments.$inferInsert;
export type RunSheetClinician = typeof runSheetClinicians.$inferSelect;
export type TelehealthInvite = typeof telehealthInvites.$inferSelect;
export type NewTelehealthInvite = typeof telehealthInvites.$inferInsert;
