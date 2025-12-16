import { pgTable, uuid, varchar, text, date, timestamp, pgEnum, boolean, jsonb, real, integer, uniqueIndex } from 'drizzle-orm/pg-core';
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

// ============================================
// PMS INTEGRATION - Practice Management System
// ============================================

export const pmsTypeEnum = pgEnum('pms_type', [
  'gentu',
  'medirecords',
  'halaxy'
]);

export const pmsSyncStatusEnum = pgEnum('pms_sync_status', [
  'success',
  'partial',
  'failed',
  'running'
]);

export const pmsSyncTypeEnum = pgEnum('pms_sync_type', [
  'full',
  'incremental',
  'manual'
]);

export const pmsAppointmentStatusEnum = pgEnum('pms_appointment_status', [
  'booked',
  'confirmed',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
  'no_show'
]);

// PMS Connections - stores PMS connection configuration for each practice
export const pmsConnections = pgTable('pms_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  pmsType: pmsTypeEnum('pms_type').notNull(),
  displayName: varchar('display_name', { length: 255 }).notNull(),

  // PMS-specific identifiers (only one will be populated based on pmsType)
  tenantId: varchar('tenant_id', { length: 255 }),        // Gentu: tenantId from pairing
  practiceId: varchar('practice_id', { length: 255 }),    // Medirecords: practice GUID
  organizationId: varchar('organization_id', { length: 255 }), // Halaxy: organization reference

  // OAuth credentials
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),

  // Sync configuration
  syncEnabled: boolean('sync_enabled').notNull().default(true),
  syncFrequencyMinutes: integer('sync_frequency_minutes').notNull().default(15),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastSyncStatus: pmsSyncStatusEnum('last_sync_status'),
  lastSyncError: text('last_sync_error'),

  // Filtering
  syncTelehealthOnly: boolean('sync_telehealth_only').notNull().default(true),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Clinicians extracted from screenshots (separate from specialists)
// Note: This is defined before pms_clinician_mappings because it's referenced by foreign key
export const runSheetClinicians = pgTable('run_sheet_clinicians', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// PMS Clinician Mappings - maps PMS practitioners to run sheet clinicians
export const pmsClinicianMappings = pgTable('pms_clinician_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  pmsConnectionId: uuid('pms_connection_id').references(() => pmsConnections.id, { onDelete: 'cascade' }).notNull(),

  // External PMS identifiers
  pmsPractitionerId: varchar('pms_practitioner_id', { length: 255 }).notNull(),
  pmsPractitionerName: varchar('pms_practitioner_name', { length: 255 }),

  // Internal mapping
  runSheetClinicianId: uuid('run_sheet_clinician_id').references(() => runSheetClinicians.id),

  // Config
  syncEnabled: boolean('sync_enabled').notNull().default(true),
  autoCreated: boolean('auto_created').notNull().default(false),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniquePmsPractitioner: uniqueIndex('pms_clinician_mappings_connection_practitioner_idx')
    .on(table.pmsConnectionId, table.pmsPractitionerId),
}));

// PMS Appointment Types - caches appointment types from PMS
export const pmsAppointmentTypes = pgTable('pms_appointment_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  pmsConnectionId: uuid('pms_connection_id').references(() => pmsConnections.id, { onDelete: 'cascade' }).notNull(),

  // External PMS identifiers
  pmsTypeId: varchar('pms_type_id', { length: 255 }).notNull(),
  pmsTypeName: varchar('pms_type_name', { length: 255 }).notNull(),

  // Cached metadata
  defaultDurationMinutes: integer('default_duration_minutes'),
  colour: varchar('colour', { length: 20 }),

  // User configuration
  isTelehealth: boolean('is_telehealth').notNull().default(false),
  syncEnabled: boolean('sync_enabled').notNull().default(true),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniquePmsType: uniqueIndex('pms_appointment_types_connection_type_idx')
    .on(table.pmsConnectionId, table.pmsTypeId),
}));

// PMS Sync Log - audit trail of sync operations
export const pmsSyncLog = pgTable('pms_sync_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  pmsConnectionId: uuid('pms_connection_id').references(() => pmsConnections.id, { onDelete: 'cascade' }).notNull(),

  syncType: pmsSyncTypeEnum('sync_type').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),

  status: pmsSyncStatusEnum('status').notNull(),
  appointmentsFetched: integer('appointments_fetched').notNull().default(0),
  appointmentsCreated: integer('appointments_created').notNull().default(0),
  appointmentsUpdated: integer('appointments_updated').notNull().default(0),
  appointmentsSkipped: integer('appointments_skipped').notNull().default(0),

  errorMessage: text('error_message'),
  errorDetails: jsonb('error_details'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
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

// Parsed appointments from screenshots or PMS sync
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

  // PMS integration fields
  pmsConnectionId: uuid('pms_connection_id').references(() => pmsConnections.id),
  pmsAppointmentId: varchar('pms_appointment_id', { length: 255 }),
  pmsLastSyncedAt: timestamp('pms_last_synced_at', { withTimezone: true }),
  isTelehealth: boolean('is_telehealth').default(false),
  appointmentStatus: pmsAppointmentStatusEnum('appointment_status'),
  appointmentDurationMinutes: integer('appointment_duration_minutes'),
  patientDob: date('patient_dob'),
  patientEmail: varchar('patient_email', { length: 255 }),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  uniquePmsAppointment: uniqueIndex('run_sheet_appointments_pms_unique_idx')
    .on(table.pmsConnectionId, table.pmsAppointmentId),
}));

// Telehealth invites - tracks SMS invites for appointments
export const telehealthInvites = pgTable('telehealth_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  runSheetAppointmentId: uuid('run_sheet_appointment_id').references(() => runSheetAppointments.id),

  // Patient details
  patientName: varchar('patient_name', { length: 255 }),
  phoneNumber: varchar('phone_number', { length: 50 }).notNull(),

  // Appointment details
  clinicianId: uuid('clinician_id').references(() => runSheetClinicians.id),
  appointmentDate: date('appointment_date').notNull(),
  appointmentTime: varchar('appointment_time', { length: 20 }).notNull(),

  // Scheduling
  scheduledFor: timestamp('scheduled_for'),  // When to send (null = immediate)
  minutesBefore: integer('minutes_before'),  // e.g., 30 = send 30 mins before appt

  // Status tracking
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
  pmsConnection: one(pmsConnections, {
    fields: [runSheetAppointments.pmsConnectionId],
    references: [pmsConnections.id],
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

// PMS relations
export const pmsConnectionsRelations = relations(pmsConnections, ({ many }) => ({
  clinicianMappings: many(pmsClinicianMappings),
  appointmentTypes: many(pmsAppointmentTypes),
  syncLogs: many(pmsSyncLog),
  appointments: many(runSheetAppointments),
}));

export const pmsClinicianMappingsRelations = relations(pmsClinicianMappings, ({ one }) => ({
  pmsConnection: one(pmsConnections, {
    fields: [pmsClinicianMappings.pmsConnectionId],
    references: [pmsConnections.id],
  }),
  runSheetClinician: one(runSheetClinicians, {
    fields: [pmsClinicianMappings.runSheetClinicianId],
    references: [runSheetClinicians.id],
  }),
}));

export const pmsAppointmentTypesRelations = relations(pmsAppointmentTypes, ({ one }) => ({
  pmsConnection: one(pmsConnections, {
    fields: [pmsAppointmentTypes.pmsConnectionId],
    references: [pmsConnections.id],
  }),
}));

export const pmsSyncLogRelations = relations(pmsSyncLog, ({ one }) => ({
  pmsConnection: one(pmsConnections, {
    fields: [pmsSyncLog.pmsConnectionId],
    references: [pmsConnections.id],
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
export type PMSConnection = typeof pmsConnections.$inferSelect;
export type NewPMSConnection = typeof pmsConnections.$inferInsert;
export type PMSClinicianMapping = typeof pmsClinicianMappings.$inferSelect;
export type NewPMSClinicianMapping = typeof pmsClinicianMappings.$inferInsert;
export type PMSAppointmentType = typeof pmsAppointmentTypes.$inferSelect;
export type NewPMSAppointmentType = typeof pmsAppointmentTypes.$inferInsert;
export type PMSSyncLog = typeof pmsSyncLog.$inferSelect;
export type NewPMSSyncLog = typeof pmsSyncLog.$inferInsert;
