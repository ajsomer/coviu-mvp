import type {
  GentuPractitioner,
  GentuAppointmentType,
  GentuAppointment,
  GentuPatient,
  GentuTenant,
} from './types';

export const mockTenant: GentuTenant = {
  tenantId: '3aef91c0-ff22-47e6-942d-182cb65cbf20',
  tenantNumber: '12345',
  tenantName: 'Smith Medical Centre',
  timezone: 'Australia/Melbourne',
};

export const mockPractitioners: GentuPractitioner[] = [
  {
    id: 'prac-001',
    name: { family: 'Smith', given: 'John', prefix: 'Dr' },
    contact: [
      { system: 'email', use: 'work', rank: 1, value: 'john.smith@clinic.com' },
      { system: 'phone', use: 'work', rank: 2, value: '0400000001' },
    ],
    active: true,
    shownInAppointmentBook: true,
  },
  {
    id: 'prac-002',
    name: { family: 'Jones', given: 'Sarah', prefix: 'Dr' },
    contact: [
      { system: 'email', use: 'work', rank: 1, value: 'sarah.jones@clinic.com' },
    ],
    active: true,
    shownInAppointmentBook: true,
  },
  {
    id: 'prac-003',
    name: { family: 'Williams', given: 'Michael', prefix: 'Dr' },
    contact: [],
    active: false,
    shownInAppointmentBook: false,
  },
];

export const mockAppointmentTypes: GentuAppointmentType[] = [
  { id: 'type-001', text: 'Telehealth Consultation', duration: 30, colour: '#4CAF50', onlineBookable: true },
  { id: 'type-002', text: 'Video Follow-up', duration: 15, colour: '#2196F3', onlineBookable: true },
  { id: 'type-003', text: 'Standard Consultation', duration: 30, colour: '#9E9E9E', onlineBookable: false },
  { id: 'type-004', text: 'New Patient', duration: 45, colour: '#FF9800', onlineBookable: false },
  { id: 'type-005', text: 'Procedure', duration: 60, colour: '#F44336', onlineBookable: false },
];

export const mockPatients: GentuPatient[] = [
  {
    id: 'patient-001',
    name: { family: 'Brown', given: 'Alice', prefix: 'Ms' },
    birthDate: '1985-03-15',
    gender: 'female',
    address: null,
    contact: [
      { system: 'phone', use: 'mobile', rank: 1, value: '0412345678' },
      { system: 'email', use: 'home', rank: 2, value: 'alice.brown@email.com' },
    ],
    identifier: [],
    deceased: null,
    occupation: null,
    indigenousStatus: null,
    extension: [],
  },
  {
    id: 'patient-002',
    name: { family: 'Davis', given: 'Robert', prefix: 'Mr' },
    birthDate: '1972-08-22',
    gender: 'male',
    address: null,
    contact: [
      { system: 'phone', use: 'mobile', rank: 1, value: '0423456789' },
    ],
    identifier: [],
    deceased: null,
    occupation: null,
    indigenousStatus: null,
    extension: [],
  },
  {
    id: 'patient-003',
    name: { family: 'Wilson', given: 'Emma', prefix: 'Mrs' },
    birthDate: '1990-11-30',
    gender: 'female',
    address: null,
    contact: [
      { system: 'phone', use: 'mobile', rank: 1, value: '0434567890' },
      { system: 'email', use: 'home', rank: 2, value: 'emma.wilson@email.com' },
    ],
    identifier: [],
    deceased: null,
    occupation: null,
    indigenousStatus: null,
    extension: [],
  },
  {
    id: 'patient-004',
    name: { family: 'Taylor', given: 'James', prefix: 'Mr' },
    birthDate: '1965-05-10',
    gender: 'male',
    address: null,
    contact: [
      { system: 'phone', use: 'mobile', rank: 1, value: '0445678901' },
    ],
    identifier: [],
    deceased: null,
    occupation: null,
    indigenousStatus: null,
    extension: [],
  },
];

/**
 * Generate mock appointments for a given date
 */
export function generateMockAppointments(date: Date): GentuAppointment[] {
  const dateStr = date.toISOString().split('T')[0];

  return [
    {
      id: 'appt-001',
      startAt: `${dateStr}T09:00:00.000+10:00`,
      endAt: `${dateStr}T09:30:00.000+10:00`,
      status: 'booked',
      minutesDuration: 30,
      comment: null,
      description: 'Telehealth follow-up',
      participant: [
        { referenceType: 'patient', referenceId: 'patient-001' },
        { referenceType: 'provider', referenceId: 'prac-001' },
      ],
      appointmentType: { reference: 'type-001' },
      extension: [],
    },
    {
      id: 'appt-002',
      startAt: `${dateStr}T09:30:00.000+10:00`,
      endAt: `${dateStr}T09:45:00.000+10:00`,
      status: 'confirmed',
      minutesDuration: 15,
      comment: null,
      description: 'Quick video check-in',
      participant: [
        { referenceType: 'patient', referenceId: 'patient-002' },
        { referenceType: 'provider', referenceId: 'prac-001' },
      ],
      appointmentType: { reference: 'type-002' },
      extension: [],
    },
    {
      id: 'appt-003',
      startAt: `${dateStr}T10:00:00.000+10:00`,
      endAt: `${dateStr}T10:30:00.000+10:00`,
      status: 'booked',
      minutesDuration: 30,
      comment: null,
      description: 'In-person consultation',
      participant: [
        { referenceType: 'patient', referenceId: 'patient-001' },
        { referenceType: 'provider', referenceId: 'prac-002' },
      ],
      appointmentType: { reference: 'type-003' },  // Not telehealth
      extension: [],
    },
    {
      id: 'appt-004',
      startAt: `${dateStr}T11:00:00.000+10:00`,
      endAt: `${dateStr}T11:30:00.000+10:00`,
      status: 'booked',
      minutesDuration: 30,
      comment: null,
      description: 'Telehealth consultation',
      participant: [
        { referenceType: 'patient', referenceId: 'patient-002' },
        { referenceType: 'provider', referenceId: 'prac-002' },
      ],
      appointmentType: { reference: 'type-001' },
      extension: [],
    },
    {
      id: 'appt-005',
      startAt: `${dateStr}T13:00:00.000+10:00`,
      endAt: `${dateStr}T13:30:00.000+10:00`,
      status: 'booked',
      minutesDuration: 30,
      comment: 'Patient requested afternoon',
      description: 'Telehealth consultation',
      participant: [
        { referenceType: 'patient', referenceId: 'patient-003' },
        { referenceType: 'provider', referenceId: 'prac-001' },
      ],
      appointmentType: { reference: 'type-001' },
      extension: [],
    },
    {
      id: 'appt-006',
      startAt: `${dateStr}T14:00:00.000+10:00`,
      endAt: `${dateStr}T14:15:00.000+10:00`,
      status: 'confirmed',
      minutesDuration: 15,
      comment: null,
      description: 'Video follow-up',
      participant: [
        { referenceType: 'patient', referenceId: 'patient-004' },
        { referenceType: 'provider', referenceId: 'prac-002' },
      ],
      appointmentType: { reference: 'type-002' },
      extension: [],
    },
    {
      id: 'appt-007',
      startAt: `${dateStr}T15:00:00.000+10:00`,
      endAt: `${dateStr}T15:45:00.000+10:00`,
      status: 'booked',
      minutesDuration: 45,
      comment: null,
      description: 'New patient consultation',
      participant: [
        { referenceType: 'patient', referenceId: 'patient-003' },
        { referenceType: 'provider', referenceId: 'prac-002' },
      ],
      appointmentType: { reference: 'type-004' },  // Not telehealth
      extension: [],
    },
  ];
}
