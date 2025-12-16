// Gentu-specific types based on their API

export interface GentuTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  issued_at: string;
  application_name: string;
  api_product_list: string;
  developer_email: string;
  status: 'approved';
}

export interface GentuPairingResponse {
  message: string;
  tenantId: string;
}

export interface GentuTenant {
  tenantId: string;
  tenantNumber: string | null;
  tenantName: string | null;
  timezone: string | null;
}

export interface GentuAppointment {
  id: string;
  startAt: string;  // ISO 8601 with offset
  endAt: string | null;
  status: string | null;
  minutesDuration: number | null;
  comment: string | null;
  description: string | null;
  participant: GentuParticipant[];
  appointmentType: {
    reference: string | null;
  };
  extension: GentuExtension[];
}

export interface GentuParticipant {
  referenceType: 'patient' | 'provider' | 'location' | 'health_care_service';
  referenceId: string;
  arrivedAt?: string;
}

export interface GentuExtension {
  system: string;
  valueDateTime?: string;
  valueBoolean?: boolean;
}

export interface GentuPatient {
  id: string;
  name: {
    family: string;
    given: string | null;
    prefix: string | null;
  };
  birthDate: string | null;
  gender: 'female' | 'male' | 'unspecified' | null;
  address: GentuAddress[] | null;
  contact: GentuContact[];
  identifier: GentuIdentifier[];
  deceased: { date?: string } | null;
  occupation: string | null;
  indigenousStatus: 'aboriginal' | 'torres_strait_islander' | 'both' | 'neither' | 'declined' | null;
  extension: unknown[];
}

export interface GentuAddress {
  city: string | null;
  line: string[];
  postalCode: string | null;
  state: 'ACT' | 'NSW' | 'NT' | 'QLD' | 'SA' | 'TAS' | 'VIC' | 'WA' | null;
  use: 'home' | 'work';
  type: 'postal' | 'physical' | 'both';
}

export interface GentuContact {
  system: 'email' | 'fax' | 'phone';
  use: string;
  rank: number | null;
  value: string | null;
}

export interface GentuIdentifier {
  type: string;
  system: string;
  value?: string | null;
}

export interface GentuPractitioner {
  id: string;
  name: {
    family: string | null;
    given: string | null;
    prefix: string | null;
  };
  contact: GentuContact[];
  active: boolean;
  shownInAppointmentBook: boolean;
}

export interface GentuAppointmentType {
  id: string;
  text: string;
  duration: number | null;
  colour: string | null;
  onlineBookable: boolean;
}

export interface GentuAppointmentsResponse {
  appointments: GentuAppointment[];
  pagination: {
    next: string | null;
    limit: number;
  };
  patients?: GentuPatient[];
  practitioners?: GentuPractitioner[];
  referrals?: unknown[];
}
