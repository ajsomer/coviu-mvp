import { z } from 'zod';

export const appointmentRequestSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(100, 'First name must be less than 100 characters'),

  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must be less than 100 characters'),

  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format')
    .refine((date) => {
      const dob = new Date(date);
      const today = new Date();
      return dob < today;
    }, 'Date of birth must be in the past'),

  email: z
    .string()
    .email('Invalid email address'),

  phone: z
    .string()
    .min(8, 'Phone number must be at least 8 digits')
    .regex(/^[\d\s\+\-\(\)]+$/, 'Invalid phone number format'),

  specialistId: z
    .string()
    .uuid('Please select a specialist'),

  referralDocumentUrl: z
    .string()
    .optional(),

  referralDocumentName: z
    .string()
    .optional(),

  referringDoctorName: z
    .string()
    .min(1, 'Referring doctor name is required'),

  referringDoctorPhone: z
    .string()
    .optional()
    .or(z.literal('')),

  referringDoctorEmail: z
    .string()
    .email('Invalid email address')
    .optional()
    .or(z.literal('')),

  referringClinic: z
    .string()
    .optional()
    .or(z.literal('')),

  referralDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
});

export const updateRequestSchema = z.object({
  status: z.enum([
    'pending',
    'in_review',
    'contacted',
    'scheduled',
    'cancelled',
    'completed'
  ]).optional(),

  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),

  notes: z.string().optional(),
});

export type AppointmentRequestInput = z.infer<typeof appointmentRequestSchema>;
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;
