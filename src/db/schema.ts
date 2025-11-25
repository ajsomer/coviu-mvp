import { pgTable, uuid, varchar, text, date, timestamp, pgEnum, boolean } from 'drizzle-orm/pg-core';

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

// Type exports
export type Specialist = typeof specialists.$inferSelect;
export type NewSpecialist = typeof specialists.$inferInsert;
export type AppointmentRequest = typeof appointmentRequests.$inferSelect;
export type NewAppointmentRequest = typeof appointmentRequests.$inferInsert;
export type StatusHistory = typeof statusHistory.$inferSelect;
