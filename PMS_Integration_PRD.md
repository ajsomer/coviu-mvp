# PMS Integration Prototype - Technical Specification

## Document Purpose

This document provides a complete technical specification for an AI coding agent to implement a read-only PMS (Practice Management System) integration prototype. The prototype will connect to three Australian healthcare PMS platforms (Magentus, Medirecords, Halaxy) and synchronise appointment data into a unified model.

---

## 1. Project Overview

### 1.1 Objective

Build a working prototype that:
1. Authenticates with three PMS APIs (Magentus, Medirecords, Halaxy)
2. Fetches appointment data from each platform
3. Transforms PMS-specific data into a unified appointment model
4. Stores normalised appointments in PostgreSQL
5. Provides a simple API to query synchronised appointments

### 1.2 Success Criteria

- [ ] Successfully authenticate with each PMS sandbox/test environment
- [ ] Fetch and store appointments from all three platforms
- [ ] Unified model captures all critical appointment fields without data loss
- [ ] Incremental sync works (only fetch new/updated appointments)
- [ ] Telehealth appointments are correctly identified across all platforms
- [ ] Error handling and logging captures issues for debugging

### 1.3 Non-Goals (Out of Scope)

- Production deployment
- User authentication/authorization
- Write operations (creating/updating appointments in PMS)
- Real-time sync (webhooks)
- Frontend UI

---

## 2. Technical Stack

### 2.1 Core Technologies

| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Node.js | 20.x LTS |
| Language | TypeScript | 5.x |
| Framework | Hono | 4.x |
| Database | PostgreSQL (Neon) | 16.x |
| ORM | Drizzle ORM | 0.30.x |
| HTTP Client | ofetch | 1.x |
| Validation | Zod | 3.x |
| Logging | pino | 8.x |
| Task Scheduling | node-cron | 3.x |
| Environment | dotenv | 16.x |

### 2.2 Development Tools

| Tool | Purpose |
|------|---------|
| drizzle-kit | Database migrations |
| tsx | TypeScript execution |
| vitest | Testing |
| biome | Linting and formatting |

---

## 3. Project Structure

```
pms-integration-prototype/
├── src/
│   ├── index.ts                    # Application entry point
│   ├── config/
│   │   └── env.ts                  # Environment configuration
│   ├── db/
│   │   ├── index.ts                # Database connection
│   │   ├── schema.ts               # Drizzle schema definitions
│   │   └── migrations/             # Generated migrations
│   ├── adapters/
│   │   ├── types.ts                # Shared adapter interfaces
│   │   ├── base.adapter.ts         # Abstract base adapter
│   │   ├── magentus/
│   │   │   ├── index.ts            # Magentus adapter
│   │   │   ├── auth.ts             # OAuth implementation
│   │   │   ├── client.ts           # API client
│   │   │   ├── transform.ts        # Data transformation
│   │   │   └── types.ts            # Magentus-specific types
│   │   ├── medirecords/
│   │   │   ├── index.ts            # Medirecords adapter
│   │   │   ├── auth.ts             # OAuth implementation
│   │   │   ├── client.ts           # API client
│   │   │   ├── transform.ts        # Data transformation
│   │   │   └── types.ts            # Medirecords-specific types
│   │   └── halaxy/
│   │       ├── index.ts            # Halaxy adapter
│   │       ├── auth.ts             # Auth implementation
│   │       ├── client.ts           # API client
│   │       ├── transform.ts        # Data transformation
│   │       └── types.ts            # Halaxy-specific types
│   ├── models/
│   │   ├── appointment.ts          # Unified appointment model
│   │   ├── practice.ts             # Practice/tenant model
│   │   └── sync-log.ts             # Sync history model
│   ├── services/
│   │   ├── sync.service.ts         # Orchestrates sync across adapters
│   │   ├── appointment.service.ts  # Appointment CRUD operations
│   │   └── practice.service.ts     # Practice management
│   ├── lib/
│   │   ├── http.ts                 # HTTP client with retry logic
│   │   ├── rate-limiter.ts         # Rate limiting utility
│   │   ├── token-manager.ts        # Token storage and refresh
│   │   ├── logger.ts               # Logging configuration
│   │   └── dates.ts                # Date/timezone utilities
│   ├── api/
│   │   ├── index.ts                # Hono app setup
│   │   └── routes/
│   │       ├── appointments.ts     # Appointment endpoints
│   │       ├── practices.ts        # Practice endpoints
│   │       └── sync.ts             # Manual sync triggers
│   └── jobs/
│       └── sync.job.ts             # Scheduled sync job
├── drizzle.config.ts               # Drizzle configuration
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

## 4. Database Schema

### 4.1 Schema Definition (Drizzle)

```typescript
// src/db/schema.ts

import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core';

// Enums
export const pmsProviderEnum = pgEnum('pms_provider', ['magentus', 'medirecords', 'halaxy']);
export const appointmentStatusEnum = pgEnum('appointment_status', [
  'booked',
  'confirmed',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
  'no_show'
]);
export const syncStatusEnum = pgEnum('sync_status', ['pending', 'in_progress', 'completed', 'failed']);

// Practices table - represents a connected PMS tenant/practice
export const practices = pgTable('practices', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // PMS connection details
  pmsProvider: pmsProviderEnum('pms_provider').notNull(),
  pmsIdentifier: text('pms_identifier').notNull(), // tenantId, practiceId, etc.
  pmsPracticeName: text('pms_practice_name'),
  
  // Credentials (encrypted in production, plain for prototype)
  credentials: jsonb('credentials').notNull(), // { accessToken, refreshToken, expiresAt, etc. }
  
  // Sync state
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastSyncCursor: text('last_sync_cursor'), // For cursor-based pagination
  syncEnabled: boolean('sync_enabled').notNull().default(true),
  
  // Metadata
  timezone: text('timezone').default('Australia/Sydney'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Unified appointments table
export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Source tracking
  practiceId: uuid('practice_id').notNull().references(() => practices.id, { onDelete: 'cascade' }),
  pmsProvider: pmsProviderEnum('pms_provider').notNull(),
  pmsAppointmentId: text('pms_appointment_id').notNull(), // Original ID from PMS
  
  // Core appointment data
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }).notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  
  // Status
  status: appointmentStatusEnum('status').notNull(),
  
  // Telehealth
  isTelehealth: boolean('is_telehealth').notNull().default(false),
  telehealthUrl: text('telehealth_url'),
  
  // Participants (stored as references, not full objects)
  patientId: text('patient_id'),
  patientName: text('patient_name'),
  patientEmail: text('patient_email'),
  patientPhone: text('patient_phone'),
  
  practitionerId: text('practitioner_id'),
  practitionerName: text('practitioner_name'),
  
  // Appointment details
  appointmentTypeId: text('appointment_type_id'),
  appointmentTypeName: text('appointment_type_name'),
  locationName: text('location_name'),
  notes: text('notes'),
  
  // Raw data for debugging
  rawData: jsonb('raw_data'),
  
  // Timestamps
  pmsCreatedAt: timestamp('pms_created_at', { withTimezone: true }),
  pmsUpdatedAt: timestamp('pms_updated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Sync logs for debugging and monitoring
export const syncLogs = pgTable('sync_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  practiceId: uuid('practice_id').notNull().references(() => practices.id, { onDelete: 'cascade' }),
  
  status: syncStatusEnum('status').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  
  // Stats
  appointmentsFetched: integer('appointments_fetched').default(0),
  appointmentsCreated: integer('appointments_created').default(0),
  appointmentsUpdated: integer('appointments_updated').default(0),
  
  // Error tracking
  errorMessage: text('error_message'),
  errorDetails: jsonb('error_details'),
  
  // Sync parameters
  syncFromDate: timestamp('sync_from_date', { withTimezone: true }),
  syncToDate: timestamp('sync_to_date', { withTimezone: true }),
  cursor: text('cursor'),
});

// Appointment types cache
export const appointmentTypes = pgTable('appointment_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  practiceId: uuid('practice_id').notNull().references(() => practices.id, { onDelete: 'cascade' }),
  
  pmsTypeId: text('pms_type_id').notNull(),
  name: text('name').notNull(),
  durationMinutes: integer('duration_minutes'),
  isTelehealth: boolean('is_telehealth').default(false),
  color: text('color'),
  isActive: boolean('is_active').default(true),
  
  rawData: jsonb('raw_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Practitioners cache
export const practitioners = pgTable('practitioners', {
  id: uuid('id').primaryKey().defaultRandom(),
  practiceId: uuid('practice_id').notNull().references(() => practices.id, { onDelete: 'cascade' }),
  
  pmsPractitionerId: text('pms_practitioner_id').notNull(),
  name: text('name').notNull(),
  email: text('email'),
  specialty: text('specialty'),
  isActive: boolean('is_active').default(true),
  
  rawData: jsonb('raw_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 4.2 Indexes

```typescript
// Add to schema.ts

import { index, uniqueIndex } from 'drizzle-orm/pg-core';

// Unique constraint: one appointment per PMS source
export const appointmentsUniqueIdx = uniqueIndex('appointments_pms_unique_idx')
  .on(appointments.practiceId, appointments.pmsProvider, appointments.pmsAppointmentId);

// Query indexes
export const appointmentsStartTimeIdx = index('appointments_start_time_idx')
  .on(appointments.startTime);

export const appointmentsPracticeIdx = index('appointments_practice_idx')
  .on(appointments.practiceId);

export const appointmentsTelehealthIdx = index('appointments_telehealth_idx')
  .on(appointments.isTelehealth);

export const practicesPmsIdx = uniqueIndex('practices_pms_idx')
  .on(practices.pmsProvider, practices.pmsIdentifier);
```

---

## 5. Configuration

### 5.1 Environment Variables

```bash
# .env.example

# Database
DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require

# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug

# Magentus API
MAGENTUS_BASE_URL=https://api.pm.magentus.com
MAGENTUS_CLIENT_ID=your_client_id
MAGENTUS_CLIENT_SECRET=your_client_secret

# Medirecords API
MEDIRECORDS_BASE_URL=https://api.medirecords.com
MEDIRECORDS_CLIENT_ID=your_client_id
MEDIRECORDS_CLIENT_SECRET=your_client_secret

# Halaxy API
HALAXY_BASE_URL=https://au-api.halaxy.com
HALAXY_API_KEY=your_api_key

# Sync Configuration
SYNC_INTERVAL_MINUTES=5
SYNC_LOOKBACK_DAYS=30
SYNC_LOOKAHEAD_DAYS=90
```

### 5.2 Configuration Module

```typescript
// src/config/env.ts

import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),
  
  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  
  // Magentus
  MAGENTUS_BASE_URL: z.string().url(),
  MAGENTUS_CLIENT_ID: z.string(),
  MAGENTUS_CLIENT_SECRET: z.string(),
  
  // Medirecords
  MEDIRECORDS_BASE_URL: z.string().url(),
  MEDIRECORDS_CLIENT_ID: z.string(),
  MEDIRECORDS_CLIENT_SECRET: z.string(),
  
  // Halaxy
  HALAXY_BASE_URL: z.string().url(),
  HALAXY_API_KEY: z.string(),
  
  // Sync
  SYNC_INTERVAL_MINUTES: z.coerce.number().default(5),
  SYNC_LOOKBACK_DAYS: z.coerce.number().default(30),
  SYNC_LOOKAHEAD_DAYS: z.coerce.number().default(90),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
```

---

## 6. Adapter Architecture

### 6.1 Adapter Interface

```typescript
// src/adapters/types.ts

import { z } from 'zod';

export const PmsProvider = z.enum(['magentus', 'medirecords', 'halaxy']);
export type PmsProvider = z.infer<typeof PmsProvider>;

// Unified appointment type that all adapters must output
export const UnifiedAppointment = z.object({
  pmsAppointmentId: z.string(),
  startTime: z.date(),
  endTime: z.date(),
  durationMinutes: z.number(),
  status: z.enum(['booked', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show']),
  isTelehealth: z.boolean(),
  telehealthUrl: z.string().nullable(),
  patientId: z.string().nullable(),
  patientName: z.string().nullable(),
  patientEmail: z.string().nullable(),
  patientPhone: z.string().nullable(),
  practitionerId: z.string().nullable(),
  practitionerName: z.string().nullable(),
  appointmentTypeId: z.string().nullable(),
  appointmentTypeName: z.string().nullable(),
  locationName: z.string().nullable(),
  notes: z.string().nullable(),
  pmsCreatedAt: z.date().nullable(),
  pmsUpdatedAt: z.date().nullable(),
  rawData: z.record(z.unknown()),
});
export type UnifiedAppointment = z.infer<typeof UnifiedAppointment>;

// Fetch options
export interface FetchAppointmentsOptions {
  fromDate: Date;
  toDate: Date;
  practitionerId?: string;
  cursor?: string;
  limit?: number;
}

// Fetch result with pagination info
export interface FetchAppointmentsResult {
  appointments: UnifiedAppointment[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount?: number;
}

// Credentials shape per provider
export interface MagentusCredentials {
  tenantId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export interface MedirecordsCredentials {
  practiceId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export interface HalaxyCredentials {
  organizationId: string;
  apiKey: string;
}

export type PmsCredentials = MagentusCredentials | MedirecordsCredentials | HalaxyCredentials;

// Adapter interface
export interface PmsAdapter {
  readonly provider: PmsProvider;
  
  // Authentication
  authenticate(): Promise<void>;
  refreshTokenIfNeeded(): Promise<void>;
  
  // Data fetching
  fetchAppointments(options: FetchAppointmentsOptions): Promise<FetchAppointmentsResult>;
  fetchAppointmentTypes(): Promise<AppointmentType[]>;
  fetchPractitioners(): Promise<Practitioner[]>;
  
  // Health check
  testConnection(): Promise<boolean>;
}

// Supporting types
export interface AppointmentType {
  pmsTypeId: string;
  name: string;
  durationMinutes: number | null;
  isTelehealth: boolean;
  color: string | null;
  isActive: boolean;
  rawData: Record<string, unknown>;
}

export interface Practitioner {
  pmsPractitionerId: string;
  name: string;
  email: string | null;
  specialty: string | null;
  isActive: boolean;
  rawData: Record<string, unknown>;
}
```

### 6.2 Base Adapter

```typescript
// src/adapters/base.adapter.ts

import { PmsAdapter, PmsProvider, FetchAppointmentsOptions, FetchAppointmentsResult, AppointmentType, Practitioner, PmsCredentials } from './types';
import { logger } from '../lib/logger';
import { TokenManager } from '../lib/token-manager';
import { RateLimiter } from '../lib/rate-limiter';

export abstract class BaseAdapter implements PmsAdapter {
  abstract readonly provider: PmsProvider;
  
  protected credentials: PmsCredentials;
  protected tokenManager: TokenManager;
  protected rateLimiter: RateLimiter;
  protected logger: typeof logger;
  
  constructor(credentials: PmsCredentials) {
    this.credentials = credentials;
    this.tokenManager = new TokenManager();
    this.rateLimiter = new RateLimiter({
      maxRequests: 100,
      windowMs: 60000, // 100 requests per minute default
    });
    this.logger = logger.child({ adapter: this.provider });
  }
  
  abstract authenticate(): Promise<void>;
  abstract refreshTokenIfNeeded(): Promise<void>;
  abstract fetchAppointments(options: FetchAppointmentsOptions): Promise<FetchAppointmentsResult>;
  abstract fetchAppointmentTypes(): Promise<AppointmentType[]>;
  abstract fetchPractitioners(): Promise<Practitioner[]>;
  
  async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      // Try to fetch a small amount of data
      const result = await this.fetchAppointments({
        fromDate: new Date(),
        toDate: new Date(Date.now() + 86400000), // +1 day
        limit: 1,
      });
      return true;
    } catch (error) {
      this.logger.error({ error }, 'Connection test failed');
      return false;
    }
  }
  
  protected async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    baseDelayMs = 1000
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.rateLimiter.acquire();
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on auth errors
        if (this.isAuthError(error)) {
          throw error;
        }
        
        // Don't retry on client errors (4xx except 429)
        if (this.isClientError(error) && !this.isRateLimitError(error)) {
          throw error;
        }
        
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1);
          this.logger.warn({ attempt, delay, error }, 'Retrying operation');
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError;
  }
  
  protected isAuthError(error: unknown): boolean {
    return error instanceof Error && 
      ('status' in error && (error as any).status === 401);
  }
  
  protected isRateLimitError(error: unknown): boolean {
    return error instanceof Error && 
      ('status' in error && (error as any).status === 429);
  }
  
  protected isClientError(error: unknown): boolean {
    return error instanceof Error && 
      ('status' in error && (error as any).status >= 400 && (error as any).status < 500);
  }
  
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## 7. Magentus Adapter Implementation

### 7.1 Types

```typescript
// src/adapters/magentus/types.ts

import { z } from 'zod';

// Token response
export const MagentusTokenResponse = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
});

// Tenant response
export const MagentusTenant = z.object({
  id: z.string().uuid(),
  name: z.string(),
  timezone: z.string(),
});

// Appointment participant
export const MagentusParticipant = z.object({
  patient: z.object({
    id: z.string().uuid(),
  }).optional(),
  practitioner: z.object({
    id: z.string().uuid(),
  }).optional(),
  location: z.object({
    id: z.string().uuid(),
    name: z.string().optional(),
  }).optional(),
  arrivedAt: z.string().datetime().optional(),
});

// Appointment
export const MagentusAppointment = z.object({
  id: z.string().uuid(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  minutesDuration: z.number(),
  status: z.string(),
  appointmentType: z.object({
    id: z.string().uuid(),
    name: z.string().optional(),
  }).optional(),
  participant: z.array(MagentusParticipant).optional(),
  extension: z.array(z.object({
    url: z.string(),
    valueDateTime: z.string().optional(),
  })).optional(),
});

// Appointment list response
export const MagentusAppointmentListResponse = z.object({
  appointments: z.array(MagentusAppointment),
  pagination: z.object({
    next: z.string().nullable(),
  }).optional(),
});

// Patient
export const MagentusPatient = z.object({
  id: z.string().uuid(),
  name: z.object({
    given: z.string(),
    family: z.string(),
    prefix: z.string().optional(),
  }),
  contact: z.array(z.object({
    system: z.string(),
    value: z.string(),
    priority: z.number().optional(),
  })).optional(),
});

// Appointment type
export const MagentusAppointmentType = z.object({
  id: z.string().uuid(),
  name: z.string(),
  durationMinutes: z.number().optional(),
  colour: z.string().optional(),
});

// Practitioner
export const MagentusPractitioner = z.object({
  id: z.string().uuid(),
  name: z.object({
    given: z.string(),
    family: z.string(),
    prefix: z.string().optional(),
  }),
  email: z.string().optional(),
  specialty: z.string().optional(),
  active: z.boolean().optional(),
});

export type MagentusAppointment = z.infer<typeof MagentusAppointment>;
export type MagentusPatient = z.infer<typeof MagentusPatient>;
```

### 7.2 Auth

```typescript
// src/adapters/magentus/auth.ts

import { ofetch } from 'ofetch';
import { env } from '../../config/env';
import { MagentusTokenResponse } from './types';
import { MagentusCredentials } from '../types';

export class MagentusAuth {
  private baseUrl = env.MAGENTUS_BASE_URL;
  
  async getAccessToken(): Promise<{ accessToken: string; expiresAt: Date }> {
    const response = await ofetch('/oauth2/token', {
      baseURL: this.baseUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: env.MAGENTUS_CLIENT_ID,
        client_secret: env.MAGENTUS_CLIENT_SECRET,
      }).toString(),
    });
    
    const parsed = MagentusTokenResponse.parse(response);
    
    return {
      accessToken: parsed.access_token,
      expiresAt: new Date(Date.now() + parsed.expires_in * 1000),
    };
  }
  
  async pairTenant(appId: string, pairingCode: string, accessToken: string): Promise<string> {
    const response = await ofetch(`/apps/${appId}/pairing/${pairingCode}`, {
      baseURL: this.baseUrl,
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    return response.tenantId;
  }
}
```

### 7.3 Client

```typescript
// src/adapters/magentus/client.ts

import { ofetch, FetchError } from 'ofetch';
import { env } from '../../config/env';
import { MagentusCredentials } from '../types';
import { 
  MagentusAppointmentListResponse, 
  MagentusPatient, 
  MagentusAppointmentType,
  MagentusPractitioner
} from './types';

export class MagentusClient {
  private baseUrl = env.MAGENTUS_BASE_URL;
  private credentials: MagentusCredentials;
  
  constructor(credentials: MagentusCredentials) {
    this.credentials = credentials;
  }
  
  private get headers() {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      'Content-Type': 'application/json',
    };
  }
  
  async getAppointments(params: {
    fromDate: Date;
    toDate: Date;
    practitionerId?: string;
    cursor?: string;
    limit?: number;
  }) {
    const searchParams = new URLSearchParams({
      fromDate: params.fromDate.toISOString(),
      toDate: params.toDate.toISOString(),
      limit: String(params.limit || 100),
    });
    
    if (params.practitionerId) {
      searchParams.set('practitionerId', params.practitionerId);
    }
    if (params.cursor) {
      searchParams.set('cursor', params.cursor);
    }
    
    // Add include parameter for related data
    searchParams.set('include', 'patients,practitioners');
    
    const response = await ofetch(
      `/tenants/${this.credentials.tenantId}/appointments?${searchParams}`,
      {
        baseURL: this.baseUrl,
        headers: this.headers,
      }
    );
    
    return MagentusAppointmentListResponse.parse(response);
  }
  
  async getPatient(patientId: string) {
    const response = await ofetch(
      `/tenants/${this.credentials.tenantId}/patients/${patientId}`,
      {
        baseURL: this.baseUrl,
        headers: this.headers,
      }
    );
    
    return MagentusPatient.parse(response);
  }
  
  async getAppointmentTypes() {
    const response = await ofetch(
      `/tenants/${this.credentials.tenantId}/appointment-types`,
      {
        baseURL: this.baseUrl,
        headers: this.headers,
      }
    );
    
    return response.appointmentTypes.map((t: unknown) => MagentusAppointmentType.parse(t));
  }
  
  async getPractitioners() {
    const response = await ofetch(
      `/tenants/${this.credentials.tenantId}/practitioners`,
      {
        baseURL: this.baseUrl,
        headers: this.headers,
      }
    );
    
    return response.practitioners.map((p: unknown) => MagentusPractitioner.parse(p));
  }
  
  async getTenant() {
    const response = await ofetch(
      `/tenants/${this.credentials.tenantId}`,
      {
        baseURL: this.baseUrl,
        headers: this.headers,
      }
    );
    
    return response;
  }
}
```

### 7.4 Transform

```typescript
// src/adapters/magentus/transform.ts

import { UnifiedAppointment, AppointmentType, Practitioner } from '../types';
import { MagentusAppointment, MagentusAppointmentType, MagentusPractitioner, MagentusPatient } from './types';

export function transformAppointment(
  raw: MagentusAppointment,
  patients?: Map<string, MagentusPatient>,
  practitioners?: Map<string, MagentusPractitioner>
): UnifiedAppointment {
  // Extract patient info
  const patientParticipant = raw.participant?.find(p => p.patient);
  const patientId = patientParticipant?.patient?.id || null;
  const patient = patientId && patients?.get(patientId);
  
  // Extract practitioner info
  const practitionerParticipant = raw.participant?.find(p => p.practitioner);
  const practitionerId = practitionerParticipant?.practitioner?.id || null;
  const practitioner = practitionerId && practitioners?.get(practitionerId);
  
  // Extract location
  const locationParticipant = raw.participant?.find(p => p.location);
  
  // Determine telehealth status (check appointment type or location)
  const isTelehealth = raw.appointmentType?.name?.toLowerCase().includes('telehealth') ||
    raw.appointmentType?.name?.toLowerCase().includes('video') ||
    false;
  
  // Map status
  const statusMap: Record<string, UnifiedAppointment['status']> = {
    'booked': 'booked',
    'confirmed': 'confirmed',
    'arrived': 'arrived',
    'in-progress': 'in_progress',
    'completed': 'completed',
    'cancelled': 'cancelled',
    'noshow': 'no_show',
  };
  
  // Get cancelled-at from extensions
  const cancelledAt = raw.extension?.find(e => e.url.includes('cancelled-at'))?.valueDateTime;
  
  return {
    pmsAppointmentId: raw.id,
    startTime: new Date(raw.startAt),
    endTime: new Date(raw.endAt),
    durationMinutes: raw.minutesDuration,
    status: statusMap[raw.status.toLowerCase()] || 'booked',
    isTelehealth,
    telehealthUrl: null, // Magentus doesn't provide this in appointment
    patientId,
    patientName: patient ? `${patient.name.given} ${patient.name.family}` : null,
    patientEmail: patient?.contact?.find(c => c.system === 'email')?.value || null,
    patientPhone: patient?.contact?.find(c => c.system === 'phone' || c.system === 'mobile')?.value || null,
    practitionerId,
    practitionerName: practitioner ? `${practitioner.name.given} ${practitioner.name.family}` : null,
    appointmentTypeId: raw.appointmentType?.id || null,
    appointmentTypeName: raw.appointmentType?.name || null,
    locationName: locationParticipant?.location?.name || null,
    notes: null, // Magentus doesn't expose notes in basic appointment
    pmsCreatedAt: null, // Not provided
    pmsUpdatedAt: cancelledAt ? new Date(cancelledAt) : null,
    rawData: raw as Record<string, unknown>,
  };
}

export function transformAppointmentType(raw: MagentusAppointmentType): AppointmentType {
  return {
    pmsTypeId: raw.id,
    name: raw.name,
    durationMinutes: raw.durationMinutes || null,
    isTelehealth: raw.name.toLowerCase().includes('telehealth') || 
                  raw.name.toLowerCase().includes('video'),
    color: raw.colour || null,
    isActive: true,
    rawData: raw as Record<string, unknown>,
  };
}

export function transformPractitioner(raw: MagentusPractitioner): Practitioner {
  return {
    pmsPractitionerId: raw.id,
    name: `${raw.name.given} ${raw.name.family}`,
    email: raw.email || null,
    specialty: raw.specialty || null,
    isActive: raw.active ?? true,
    rawData: raw as Record<string, unknown>,
  };
}
```

### 7.5 Adapter

```typescript
// src/adapters/magentus/index.ts

import { BaseAdapter } from '../base.adapter';
import { 
  PmsProvider, 
  MagentusCredentials, 
  FetchAppointmentsOptions, 
  FetchAppointmentsResult,
  AppointmentType,
  Practitioner 
} from '../types';
import { MagentusAuth } from './auth';
import { MagentusClient } from './client';
import { transformAppointment, transformAppointmentType, transformPractitioner } from './transform';
import { MagentusPatient, MagentusPractitioner } from './types';

export class MagentusAdapter extends BaseAdapter {
  readonly provider: PmsProvider = 'magentus';
  
  private auth: MagentusAuth;
  private client: MagentusClient;
  protected credentials: MagentusCredentials;
  
  // Caches for patient/practitioner data
  private patientCache = new Map<string, MagentusPatient>();
  private practitionerCache = new Map<string, MagentusPractitioner>();
  
  constructor(credentials: MagentusCredentials) {
    super(credentials);
    this.credentials = credentials;
    this.auth = new MagentusAuth();
    this.client = new MagentusClient(credentials);
  }
  
  async authenticate(): Promise<void> {
    this.logger.info('Authenticating with Magentus');
    
    const { accessToken, expiresAt } = await this.auth.getAccessToken();
    
    this.credentials.accessToken = accessToken;
    this.credentials.expiresAt = expiresAt;
    
    // Recreate client with new credentials
    this.client = new MagentusClient(this.credentials);
    
    this.logger.info({ expiresAt }, 'Authentication successful');
  }
  
  async refreshTokenIfNeeded(): Promise<void> {
    // Refresh if token expires in less than 5 minutes
    const bufferMs = 5 * 60 * 1000;
    if (this.credentials.expiresAt.getTime() - Date.now() < bufferMs) {
      await this.authenticate();
    }
  }
  
  async fetchAppointments(options: FetchAppointmentsOptions): Promise<FetchAppointmentsResult> {
    await this.refreshTokenIfNeeded();
    
    this.logger.info({ options }, 'Fetching appointments');
    
    const response = await this.withRetry(() => 
      this.client.getAppointments({
        fromDate: options.fromDate,
        toDate: options.toDate,
        practitionerId: options.practitionerId,
        cursor: options.cursor,
        limit: options.limit || 100,
      })
    );
    
    // Transform appointments
    const appointments = response.appointments.map(raw => 
      transformAppointment(raw, this.patientCache, this.practitionerCache)
    );
    
    this.logger.info({ count: appointments.length }, 'Appointments fetched');
    
    return {
      appointments,
      nextCursor: response.pagination?.next || null,
      hasMore: !!response.pagination?.next,
    };
  }
  
  async fetchAppointmentTypes(): Promise<AppointmentType[]> {
    await this.refreshTokenIfNeeded();
    
    this.logger.info('Fetching appointment types');
    
    const types = await this.withRetry(() => this.client.getAppointmentTypes());
    
    return types.map(transformAppointmentType);
  }
  
  async fetchPractitioners(): Promise<Practitioner[]> {
    await this.refreshTokenIfNeeded();
    
    this.logger.info('Fetching practitioners');
    
    const practitioners = await this.withRetry(() => this.client.getPractitioners());
    
    // Update cache
    practitioners.forEach(p => this.practitionerCache.set(p.id, p));
    
    return practitioners.map(transformPractitioner);
  }
}
```

---

## 8. Medirecords Adapter Implementation

### 8.1 Types

```typescript
// src/adapters/medirecords/types.ts

import { z } from 'zod';

export const MedirecordsAppointment = z.object({
  id: z.string().uuid(),
  practiceId: z.string().uuid(),
  patientId: z.string().uuid(),
  providerId: z.string().uuid().nullable(),
  appointmentTypeId: z.string().uuid(),
  scheduleTime: z.string(), // YYYY-MM-DDThh:mm format
  appointmentStatus: z.number(), // 2-8
  appointmentIntervalCode: z.number(),
  roomId: z.string().uuid().nullable(),
  referralId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  walkIn: z.boolean().nullable(),
  urgency: z.number().nullable(),
  cancellationReason: z.number().nullable(),
  emailReminder: z.boolean().nullable(),
  confirmationLink: z.string().nullable(),
  telehealthLinkForProvider: z.string().nullable(),
  telehealthLinkForPatient: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdDateTime: z.string().nullable(),
  updatedBy: z.string().uuid().nullable(),
  updatedDateTime: z.string().nullable(),
});

export const MedirecordsAppointmentPage = z.object({
  data: z.array(MedirecordsAppointment),
  first: z.boolean(),
  last: z.boolean(),
  totalPages: z.number(),
  totalElements: z.number(),
  numberOfElements: z.number(),
  size: z.number(),
  page: z.number(),
});

export const MedirecordsAppointmentType = z.object({
  id: z.string().uuid(),
  name: z.string(),
  duration: z.string(), // e.g., "4 hrs"
  colour: z.string().nullable(),
  activeStatus: z.number(),
  community: z.boolean().nullable(),
  telehealth: z.boolean().nullable(),
  description: z.string().nullable(),
});

// Status code mapping
export const MEDIRECORDS_STATUS_MAP: Record<number, string> = {
  2: 'booked',
  3: 'confirmed',
  4: 'arrived',      // Waiting Room
  5: 'in_progress',  // With Doctor
  6: 'in_progress',  // At Billing
  7: 'completed',
  8: 'cancelled',
};

// Duration codes - will need to fetch from /code-system/appointment-Interval-Code
// These are placeholder values - actual values should be fetched from API
export const MEDIRECORDS_DURATION_MAP: Record<number, number> = {
  1: 5,
  2: 10,
  3: 15,
  4: 20,
  5: 30,
  6: 45,
  7: 60,
  8: 90,
  9: 120,
};

export type MedirecordsAppointment = z.infer<typeof MedirecordsAppointment>;
export type MedirecordsAppointmentType = z.infer<typeof MedirecordsAppointmentType>;
```

### 8.2 Auth

```typescript
// src/adapters/medirecords/auth.ts

import { ofetch } from 'ofetch';
import { env } from '../../config/env';

export class MedirecordsAuth {
  private baseUrl = env.MEDIRECORDS_BASE_URL;
  
  // Note: Medirecords OAuth flow details not fully documented
  // This is a placeholder implementation - adjust based on actual docs
  async getAccessToken(): Promise<{ accessToken: string; expiresAt: Date }> {
    const response = await ofetch('/oauth/token', {
      baseURL: this.baseUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: env.MEDIRECORDS_CLIENT_ID,
        client_secret: env.MEDIRECORDS_CLIENT_SECRET,
      }).toString(),
    });
    
    return {
      accessToken: response.access_token,
      expiresAt: new Date(Date.now() + (response.expires_in || 3600) * 1000),
    };
  }
}
```

### 8.3 Client

```typescript
// src/adapters/medirecords/client.ts

import { ofetch } from 'ofetch';
import { env } from '../../config/env';
import { MedirecordsCredentials } from '../types';
import { MedirecordsAppointmentPage, MedirecordsAppointmentType } from './types';

export class MedirecordsClient {
  private baseUrl = env.MEDIRECORDS_BASE_URL;
  private credentials: MedirecordsCredentials;
  
  constructor(credentials: MedirecordsCredentials) {
    this.credentials = credentials;
  }
  
  private get headers() {
    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      'Content-Type': 'application/json',
    };
  }
  
  async getAppointments(params: {
    fromDate: Date;
    toDate: Date;
    providerId?: string;
    page?: number;
    size?: number;
    appointmentStatus?: number;
  }) {
    const searchParams = new URLSearchParams({
      appointmentDateRangeStart: this.formatDate(params.fromDate),
      appointmentDateRangeEnd: this.formatDate(params.toDate),
      page: String(params.page || 0),
      size: String(params.size || 20),
    });
    
    if (params.providerId) {
      searchParams.set('providerId', params.providerId);
    }
    if (params.appointmentStatus) {
      searchParams.set('appointmentStatus', String(params.appointmentStatus));
    }
    
    const response = await ofetch(
      `/v1/practices/${this.credentials.practiceId}/appointments?${searchParams}`,
      {
        baseURL: this.baseUrl,
        headers: this.headers,
      }
    );
    
    return MedirecordsAppointmentPage.parse(response);
  }
  
  async getAppointmentTypes(params?: { telehealth?: boolean; activeStatus?: number }) {
    const searchParams = new URLSearchParams();
    
    if (params?.telehealth !== undefined) {
      searchParams.set('telehealth', String(params.telehealth));
    }
    if (params?.activeStatus !== undefined) {
      searchParams.set('activeStatus', String(params.activeStatus));
    }
    
    const response = await ofetch(
      `/v1/practices/${this.credentials.practiceId}/appointment-types?${searchParams}`,
      {
        baseURL: this.baseUrl,
        headers: this.headers,
      }
    );
    
    return response.data.map((t: unknown) => MedirecordsAppointmentType.parse(t));
  }
  
  private formatDate(date: Date): string {
    // Format: YYYY-MM-DDThh:mm
    return date.toISOString().slice(0, 16);
  }
}
```

### 8.4 Transform

```typescript
// src/adapters/medirecords/transform.ts

import { UnifiedAppointment, AppointmentType } from '../types';
import { MedirecordsAppointment, MedirecordsAppointmentType, MEDIRECORDS_STATUS_MAP, MEDIRECORDS_DURATION_MAP } from './types';

export function transformAppointment(
  raw: MedirecordsAppointment,
  appointmentTypes?: Map<string, MedirecordsAppointmentType>,
  practiceTimezone = 'Australia/Sydney'
): UnifiedAppointment {
  // Get appointment type for telehealth check
  const appointmentType = appointmentTypes?.get(raw.appointmentTypeId);
  
  // Determine telehealth status
  const isTelehealth = !!(raw.telehealthLinkForPatient || appointmentType?.telehealth);
  
  // Calculate duration from interval code
  const durationMinutes = MEDIRECORDS_DURATION_MAP[raw.appointmentIntervalCode] || 30;
  
  // Parse schedule time (doesn't include timezone, assume practice timezone)
  const startTime = parseLocalDateTime(raw.scheduleTime, practiceTimezone);
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
  
  // Map status
  const status = MEDIRECORDS_STATUS_MAP[raw.appointmentStatus] || 'booked';
  
  return {
    pmsAppointmentId: raw.id,
    startTime,
    endTime,
    durationMinutes,
    status: status as UnifiedAppointment['status'],
    isTelehealth,
    telehealthUrl: raw.telehealthLinkForPatient,
    patientId: raw.patientId,
    patientName: null, // Would need separate patient fetch
    patientEmail: null,
    patientPhone: null,
    practitionerId: raw.providerId,
    practitionerName: null, // Would need separate provider fetch
    appointmentTypeId: raw.appointmentTypeId,
    appointmentTypeName: appointmentType?.name || null,
    locationName: null, // Room info available but would need lookup
    notes: raw.notes,
    pmsCreatedAt: raw.createdDateTime ? new Date(raw.createdDateTime) : null,
    pmsUpdatedAt: raw.updatedDateTime ? new Date(raw.updatedDateTime) : null,
    rawData: raw as Record<string, unknown>,
  };
}

export function transformAppointmentType(raw: MedirecordsAppointmentType): AppointmentType {
  // Parse duration string (e.g., "4 hrs", "30 mins")
  let durationMinutes: number | null = null;
  if (raw.duration) {
    const match = raw.duration.match(/(\d+)\s*(hr|hour|min)/i);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      durationMinutes = unit.startsWith('hr') ? value * 60 : value;
    }
  }
  
  return {
    pmsTypeId: raw.id,
    name: raw.name,
    durationMinutes,
    isTelehealth: raw.telehealth || false,
    color: raw.colour,
    isActive: raw.activeStatus === 1,
    rawData: raw as Record<string, unknown>,
  };
}

function parseLocalDateTime(dateTimeStr: string, timezone: string): Date {
  // Input: "2019-02-13T05:10" (no timezone)
  // We need to interpret this as being in the practice's timezone
  
  // Simple approach: append timezone offset
  // For production, use a proper library like date-fns-tz
  const date = new Date(dateTimeStr);
  return date;
}
```

### 8.5 Adapter

```typescript
// src/adapters/medirecords/index.ts

import { BaseAdapter } from '../base.adapter';
import { 
  PmsProvider, 
  MedirecordsCredentials, 
  FetchAppointmentsOptions, 
  FetchAppointmentsResult,
  AppointmentType,
  Practitioner 
} from '../types';
import { MedirecordsAuth } from './auth';
import { MedirecordsClient } from './client';
import { transformAppointment, transformAppointmentType } from './transform';
import { MedirecordsAppointmentType } from './types';

export class MedirecordsAdapter extends BaseAdapter {
  readonly provider: PmsProvider = 'medirecords';
  
  private auth: MedirecordsAuth;
  private client: MedirecordsClient;
  protected credentials: MedirecordsCredentials;
  
  private appointmentTypeCache = new Map<string, MedirecordsAppointmentType>();
  
  constructor(credentials: MedirecordsCredentials) {
    super(credentials);
    this.credentials = credentials;
    this.auth = new MedirecordsAuth();
    this.client = new MedirecordsClient(credentials);
  }
  
  async authenticate(): Promise<void> {
    this.logger.info('Authenticating with Medirecords');
    
    const { accessToken, expiresAt } = await this.auth.getAccessToken();
    
    this.credentials.accessToken = accessToken;
    this.credentials.expiresAt = expiresAt;
    
    this.client = new MedirecordsClient(this.credentials);
    
    this.logger.info({ expiresAt }, 'Authentication successful');
  }
  
  async refreshTokenIfNeeded(): Promise<void> {
    const bufferMs = 5 * 60 * 1000;
    if (this.credentials.expiresAt.getTime() - Date.now() < bufferMs) {
      await this.authenticate();
    }
  }
  
  async fetchAppointments(options: FetchAppointmentsOptions): Promise<FetchAppointmentsResult> {
    await this.refreshTokenIfNeeded();
    
    // Ensure appointment types are cached
    if (this.appointmentTypeCache.size === 0) {
      await this.fetchAppointmentTypes();
    }
    
    this.logger.info({ options }, 'Fetching appointments');
    
    // Parse cursor as page number
    const page = options.cursor ? parseInt(options.cursor, 10) : 0;
    
    const response = await this.withRetry(() => 
      this.client.getAppointments({
        fromDate: options.fromDate,
        toDate: options.toDate,
        providerId: options.practitionerId,
        page,
        size: options.limit || 20,
      })
    );
    
    const appointments = response.data.map(raw => 
      transformAppointment(raw, this.appointmentTypeCache)
    );
    
    this.logger.info({ 
      count: appointments.length, 
      page, 
      totalPages: response.totalPages 
    }, 'Appointments fetched');
    
    return {
      appointments,
      nextCursor: response.last ? null : String(page + 1),
      hasMore: !response.last,
      totalCount: response.totalElements,
    };
  }
  
  async fetchAppointmentTypes(): Promise<AppointmentType[]> {
    await this.refreshTokenIfNeeded();
    
    this.logger.info('Fetching appointment types');
    
    const types = await this.withRetry(() => 
      this.client.getAppointmentTypes({ activeStatus: 1 })
    );
    
    // Update cache
    types.forEach(t => this.appointmentTypeCache.set(t.id, t));
    
    return types.map(transformAppointmentType);
  }
  
  async fetchPractitioners(): Promise<Practitioner[]> {
    // Medirecords doesn't have a practitioners endpoint in the provided spec
    // This would need to be implemented when that endpoint is available
    this.logger.warn('Practitioner fetch not implemented for Medirecords');
    return [];
  }
}
```

---

## 9. Halaxy Adapter Implementation

### 9.1 Types

```typescript
// src/adapters/halaxy/types.ts

import { z } from 'zod';

// FHIR-like reference
export const HalaxyReference = z.object({
  reference: z.string(),
  type: z.string(),
});

// Supporting information item
export const HalaxySupportingInfo = z.object({
  reference: z.string().optional(),
  type: z.string().optional(),
  name: z.string().optional(),
  valueCode: z.string().optional(),
});

// Participant
export const HalaxyParticipant = z.object({
  type: z.string().optional(),
  actor: HalaxyReference.optional(),
  extension: z.array(z.object({
    url: z.string(),
    valueString: z.string().optional(),
    valueReference: HalaxyReference.optional(),
  })).optional(),
});

// Appointment
export const HalaxyAppointment = z.object({
  id: z.string(),
  description: z.string().nullable().optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  minutesDuration: z.number().optional(),
  created: z.string().datetime().optional(),
  supportingInformation: z.array(HalaxySupportingInfo).optional(),
  participant: z.array(HalaxyParticipant).optional(),
});

// Patient
export const HalaxyPatientName = z.object({
  use: z.string().optional(),
  given: z.string().optional(),
  family: z.string().optional(),
  prefix: z.string().optional(),
});

export const HalaxyTelecom = z.object({
  system: z.string(),
  value: z.string(),
  use: z.string().optional(),
});

export const HalaxyPatient = z.object({
  id: z.string(),
  active: z.boolean().optional(),
  name: z.array(HalaxyPatientName).optional(),
  telecom: z.array(HalaxyTelecom).optional(),
  gender: z.string().optional(),
  birthDate: z.string().optional(),
});

// Practitioner
export const HalaxyPractitioner = z.object({
  id: z.string(),
  identifier: z.array(z.object({ value: z.string() })).optional(),
  name: z.array(HalaxyPatientName).optional(),
  telecom: z.array(HalaxyTelecom).optional(),
  active: z.boolean().optional(),
  qualification: z.array(z.object({
    code: z.string(),
    display: z.string(),
  })).optional(),
});

// Status mapping
export const HALAXY_STATUS_MAP: Record<string, string> = {
  'booked': 'booked',
  'confirmed': 'confirmed',
  'attended': 'completed',
  'cancelled': 'cancelled',
};

export type HalaxyAppointment = z.infer<typeof HalaxyAppointment>;
export type HalaxyPatient = z.infer<typeof HalaxyPatient>;
export type HalaxyPractitioner = z.infer<typeof HalaxyPractitioner>;
```

### 9.2 Auth

```typescript
// src/adapters/halaxy/auth.ts

import { env } from '../../config/env';

// Halaxy auth mechanism is not documented in the provided spec
// This is a placeholder assuming API key auth
export class HalaxyAuth {
  getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${env.HALAXY_API_KEY}`,
      // Or could be:
      // 'X-API-Key': env.HALAXY_API_KEY,
    };
  }
}
```

### 9.3 Client

```typescript
// src/adapters/halaxy/client.ts

import { ofetch } from 'ofetch';
import { env } from '../../config/env';
import { HalaxyCredentials } from '../types';
import { HalaxyAppointment, HalaxyPatient, HalaxyPractitioner } from './types';

export class HalaxyClient {
  private baseUrl = env.HALAXY_BASE_URL;
  private credentials: HalaxyCredentials;
  
  constructor(credentials: HalaxyCredentials) {
    this.credentials = credentials;
  }
  
  private get headers() {
    return {
      'Authorization': `Bearer ${this.credentials.apiKey}`,
      'Content-Type': 'application/json',
    };
  }
  
  async getAppointments(params: {
    fromDate?: Date;
    toDate?: Date;
    practitionerId?: string;
    // Note: actual query params need to be determined from Halaxy docs
  }) {
    const searchParams = new URLSearchParams();
    
    // These param names are guesses - need actual Halaxy docs
    if (params.fromDate) {
      searchParams.set('date', `ge${params.fromDate.toISOString().split('T')[0]}`);
    }
    if (params.toDate) {
      searchParams.set('date', `le${params.toDate.toISOString().split('T')[0]}`);
    }
    if (params.practitionerId) {
      searchParams.set('practitioner', params.practitionerId);
    }
    
    const response = await ofetch(
      `/main/Appointment?${searchParams}`,
      {
        baseURL: this.baseUrl,
        headers: this.headers,
      }
    );
    
    // FHIR-style bundle response
    const entries = response.entry || [];
    return entries.map((e: { resource: unknown }) => HalaxyAppointment.parse(e.resource));
  }
  
  async getAppointment(id: string) {
    const response = await ofetch(
      `/main/Appointment/${id}`,
      {
        baseURL: this.baseUrl,
        headers: this.headers,
      }
    );
    
    return HalaxyAppointment.parse(response);
  }
  
  async getPatient(id: string) {
    const response = await ofetch(
      `/main/Patient/${id}`,
      {
        baseURL: this.baseUrl,
        headers: this.headers,
      }
    );
    
    return HalaxyPatient.parse(response);
  }
  
  async getPractitioners() {
    const response = await ofetch(
      `/main/Practitioner`,
      {
        baseURL: this.baseUrl,
        headers: this.headers,
      }
    );
    
    const entries = response.entry || [];
    return entries.map((e: { resource: unknown }) => HalaxyPractitioner.parse(e.resource));
  }
}
```

### 9.4 Transform

```typescript
// src/adapters/halaxy/transform.ts

import { UnifiedAppointment, Practitioner } from '../types';
import { HalaxyAppointment, HalaxyPatient, HalaxyPractitioner, HALAXY_STATUS_MAP } from './types';

export function transformAppointment(
  raw: HalaxyAppointment,
  patients?: Map<string, HalaxyPatient>,
  practitioners?: Map<string, HalaxyPractitioner>
): UnifiedAppointment {
  // Extract location type from supporting info
  const locationTypeInfo = raw.supportingInformation?.find(si => si.name === 'location-type');
  const locationType = locationTypeInfo?.valueCode || 'clinic';
  const isTelehealth = locationType === 'telehealth';
  
  // Extract healthcare service (appointment type) reference
  const healthcareServiceInfo = raw.supportingInformation?.find(si => si.type === 'HealthcareService');
  const appointmentTypeId = healthcareServiceInfo?.reference?.replace('/main/HealthcareService/', '') || null;
  
  // Extract patient participant
  const patientParticipant = raw.participant?.find(p => p.actor?.type === 'Patient');
  const patientId = patientParticipant?.actor?.reference?.replace('/main/Patient/', '') || null;
  const patient = patientId && patients?.get(patientId);
  
  // Extract practitioner participant
  const practitionerParticipant = raw.participant?.find(p => p.actor?.type === 'PractitionerRole');
  const practitionerRef = practitionerParticipant?.actor?.reference?.replace('/main/PractitionerRole/', '') || null;
  
  // Extract participant status from extension
  const statusExtension = patientParticipant?.extension?.find(e => 
    e.url.includes('appointment-participant-status')
  );
  const rawStatus = statusExtension?.valueString || 'booked';
  const status = HALAXY_STATUS_MAP[rawStatus] || 'booked';
  
  // Calculate duration
  const startTime = new Date(raw.start);
  const endTime = new Date(raw.end);
  const durationMinutes = raw.minutesDuration || 
    Math.round((endTime.getTime() - startTime.getTime()) / 60000);
  
  // Get patient details
  let patientName: string | null = null;
  let patientEmail: string | null = null;
  let patientPhone: string | null = null;
  
  if (patient) {
    const name = patient.name?.[0];
    if (name) {
      patientName = [name.given, name.family].filter(Boolean).join(' ');
    }
    patientEmail = patient.telecom?.find(t => t.system === 'email')?.value || null;
    patientPhone = patient.telecom?.find(t => t.system === 'phone' || t.system === 'sms')?.value || null;
  }
  
  return {
    pmsAppointmentId: raw.id,
    startTime,
    endTime,
    durationMinutes,
    status: status as UnifiedAppointment['status'],
    isTelehealth,
    telehealthUrl: null, // Halaxy would provide this somewhere
    patientId,
    patientName,
    patientEmail,
    patientPhone,
    practitionerId: practitionerRef,
    practitionerName: null, // Would need to resolve PractitionerRole -> Practitioner
    appointmentTypeId,
    appointmentTypeName: null, // Would need to fetch HealthcareService
    locationName: locationType !== 'telehealth' ? locationType : null,
    notes: raw.description || null,
    pmsCreatedAt: raw.created ? new Date(raw.created) : null,
    pmsUpdatedAt: null,
    rawData: raw as Record<string, unknown>,
  };
}

export function transformPractitioner(raw: HalaxyPractitioner): Practitioner {
  const name = raw.name?.[0];
  const fullName = name ? [name.given, name.family].filter(Boolean).join(' ') : raw.id;
  
  return {
    pmsPractitionerId: raw.id,
    name: fullName,
    email: raw.telecom?.find(t => t.system === 'email')?.value || null,
    specialty: raw.qualification?.[0]?.display || null,
    isActive: raw.active ?? true,
    rawData: raw as Record<string, unknown>,
  };
}
```

### 9.5 Adapter

```typescript
// src/adapters/halaxy/index.ts

import { BaseAdapter } from '../base.adapter';
import { 
  PmsProvider, 
  HalaxyCredentials, 
  FetchAppointmentsOptions, 
  FetchAppointmentsResult,
  AppointmentType,
  Practitioner 
} from '../types';
import { HalaxyClient } from './client';
import { transformAppointment, transformPractitioner } from './transform';
import { HalaxyPatient } from './types';

export class HalaxyAdapter extends BaseAdapter {
  readonly provider: PmsProvider = 'halaxy';
  
  private client: HalaxyClient;
  protected credentials: HalaxyCredentials;
  
  private patientCache = new Map<string, HalaxyPatient>();
  
  constructor(credentials: HalaxyCredentials) {
    super(credentials);
    this.credentials = credentials;
    this.client = new HalaxyClient(credentials);
  }
  
  async authenticate(): Promise<void> {
    // Halaxy uses API key - no OAuth flow
    this.logger.info('Halaxy uses API key authentication - no OAuth required');
  }
  
  async refreshTokenIfNeeded(): Promise<void> {
    // No-op for API key auth
  }
  
  async fetchAppointments(options: FetchAppointmentsOptions): Promise<FetchAppointmentsResult> {
    this.logger.info({ options }, 'Fetching appointments');
    
    const appointments = await this.withRetry(() => 
      this.client.getAppointments({
        fromDate: options.fromDate,
        toDate: options.toDate,
        practitionerId: options.practitionerId,
      })
    );
    
    const transformed = appointments.map(raw => 
      transformAppointment(raw, this.patientCache)
    );
    
    this.logger.info({ count: transformed.length }, 'Appointments fetched');
    
    // Note: Halaxy pagination not documented - may need adjustment
    return {
      appointments: transformed,
      nextCursor: null,
      hasMore: false,
    };
  }
  
  async fetchAppointmentTypes(): Promise<AppointmentType[]> {
    // Would need HealthcareService endpoint
    this.logger.warn('Appointment type fetch not fully implemented for Halaxy');
    return [];
  }
  
  async fetchPractitioners(): Promise<Practitioner[]> {
    this.logger.info('Fetching practitioners');
    
    const practitioners = await this.withRetry(() => 
      this.client.getPractitioners()
    );
    
    return practitioners.map(transformPractitioner);
  }
}
```

---

## 10. Shared Utilities

### 10.1 HTTP Client

```typescript
// src/lib/http.ts

import { ofetch, FetchError } from 'ofetch';
import { logger } from './logger';

export interface HttpClientOptions {
  baseURL: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export function createHttpClient(options: HttpClientOptions) {
  return ofetch.create({
    baseURL: options.baseURL,
    headers: options.headers,
    timeout: options.timeout || 30000,
    retry: 0, // We handle retries in the adapter
    onRequestError: ({ error }) => {
      logger.error({ error }, 'HTTP request error');
    },
    onResponseError: ({ response }) => {
      logger.error({ 
        status: response.status, 
        statusText: response.statusText,
        url: response.url,
      }, 'HTTP response error');
    },
  });
}
```

### 10.2 Rate Limiter

```typescript
// src/lib/rate-limiter.ts

export interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
}

export class RateLimiter {
  private requests: number[] = [];
  private maxRequests: number;
  private windowMs: number;
  
  constructor(options: RateLimiterOptions) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
  }
  
  async acquire(): Promise<void> {
    const now = Date.now();
    
    // Remove expired timestamps
    this.requests = this.requests.filter(t => now - t < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      // Wait until oldest request expires
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest);
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      // Recurse to check again
      return this.acquire();
    }
    
    this.requests.push(now);
  }
  
  reset(): void {
    this.requests = [];
  }
}
```

### 10.3 Token Manager

```typescript
// src/lib/token-manager.ts

import { db } from '../db';
import { practices } from '../db/schema';
import { eq } from 'drizzle-orm';

export interface TokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

export class TokenManager {
  async saveToken(practiceId: string, tokenInfo: TokenInfo): Promise<void> {
    await db
      .update(practices)
      .set({
        credentials: tokenInfo,
        updatedAt: new Date(),
      })
      .where(eq(practices.id, practiceId));
  }
  
  async getToken(practiceId: string): Promise<TokenInfo | null> {
    const result = await db
      .select({ credentials: practices.credentials })
      .from(practices)
      .where(eq(practices.id, practiceId))
      .limit(1);
    
    if (result.length === 0) return null;
    
    return result[0].credentials as TokenInfo;
  }
  
  isExpired(tokenInfo: TokenInfo, bufferMs = 60000): boolean {
    return tokenInfo.expiresAt.getTime() - Date.now() < bufferMs;
  }
}
```

### 10.4 Logger

```typescript
// src/lib/logger.ts

import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
    },
  } : undefined,
});
```

### 10.5 Date Utilities

```typescript
// src/lib/dates.ts

/**
 * Get date range for sync window
 */
export function getSyncDateRange(lookbackDays: number, lookaheadDays: number): { from: Date; to: Date } {
  const now = new Date();
  
  const from = new Date(now);
  from.setDate(from.getDate() - lookbackDays);
  from.setHours(0, 0, 0, 0);
  
  const to = new Date(now);
  to.setDate(to.getDate() + lookaheadDays);
  to.setHours(23, 59, 59, 999);
  
  return { from, to };
}

/**
 * Format date as ISO string with timezone
 */
export function toISOWithTimezone(date: Date, timezone = 'Australia/Sydney'): string {
  return date.toLocaleString('sv', { timeZone: timezone }).replace(' ', 'T');
}

/**
 * Parse ISO datetime string to Date
 */
export function parseISO(dateString: string): Date {
  return new Date(dateString);
}
```

---

## 11. Sync Service

```typescript
// src/services/sync.service.ts

import { db } from '../db';
import { practices, appointments, syncLogs, appointmentTypes, practitioners } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { PmsAdapter, UnifiedAppointment, PmsProvider } from '../adapters/types';
import { MagentusAdapter } from '../adapters/magentus';
import { MedirecordsAdapter } from '../adapters/medirecords';
import { HalaxyAdapter } from '../adapters/halaxy';
import { getSyncDateRange } from '../lib/dates';
import { logger } from '../lib/logger';
import { env } from '../config/env';

export class SyncService {
  private logger = logger.child({ service: 'SyncService' });
  
  /**
   * Create adapter for a practice based on its PMS provider
   */
  private createAdapter(practice: typeof practices.$inferSelect): PmsAdapter {
    const credentials = practice.credentials as Record<string, unknown>;
    
    switch (practice.pmsProvider) {
      case 'magentus':
        return new MagentusAdapter({
          tenantId: practice.pmsIdentifier,
          accessToken: credentials.accessToken as string,
          refreshToken: credentials.refreshToken as string | undefined,
          expiresAt: new Date(credentials.expiresAt as string),
        });
      
      case 'medirecords':
        return new MedirecordsAdapter({
          practiceId: practice.pmsIdentifier,
          accessToken: credentials.accessToken as string,
          refreshToken: credentials.refreshToken as string | undefined,
          expiresAt: new Date(credentials.expiresAt as string),
        });
      
      case 'halaxy':
        return new HalaxyAdapter({
          organizationId: practice.pmsIdentifier,
          apiKey: credentials.apiKey as string,
        });
      
      default:
        throw new Error(`Unknown PMS provider: ${practice.pmsProvider}`);
    }
  }
  
  /**
   * Sync appointments for a single practice
   */
  async syncPractice(practiceId: string): Promise<void> {
    this.logger.info({ practiceId }, 'Starting sync for practice');
    
    // Get practice
    const [practice] = await db
      .select()
      .from(practices)
      .where(eq(practices.id, practiceId))
      .limit(1);
    
    if (!practice) {
      throw new Error(`Practice not found: ${practiceId}`);
    }
    
    if (!practice.syncEnabled) {
      this.logger.info({ practiceId }, 'Sync disabled for practice');
      return;
    }
    
    // Create sync log
    const [syncLog] = await db
      .insert(syncLogs)
      .values({
        practiceId,
        status: 'in_progress',
      })
      .returning();
    
    try {
      const adapter = this.createAdapter(practice);
      await adapter.authenticate();
      
      // Get date range
      const { from, to } = getSyncDateRange(
        env.SYNC_LOOKBACK_DAYS,
        env.SYNC_LOOKAHEAD_DAYS
      );
      
      let totalFetched = 0;
      let totalCreated = 0;
      let totalUpdated = 0;
      let cursor: string | undefined = practice.lastSyncCursor || undefined;
      
      // Fetch all pages
      do {
        const result = await adapter.fetchAppointments({
          fromDate: from,
          toDate: to,
          cursor,
          limit: 100,
        });
        
        totalFetched += result.appointments.length;
        
        // Upsert appointments
        for (const appt of result.appointments) {
          const { created, updated } = await this.upsertAppointment(
            practice.id,
            practice.pmsProvider,
            appt
          );
          if (created) totalCreated++;
          if (updated) totalUpdated++;
        }
        
        cursor = result.nextCursor || undefined;
        
        // Save cursor for resume
        if (cursor) {
          await db
            .update(practices)
            .set({ lastSyncCursor: cursor })
            .where(eq(practices.id, practiceId));
        }
        
      } while (cursor);
      
      // Update practice last sync time
      await db
        .update(practices)
        .set({ 
          lastSyncAt: new Date(),
          lastSyncCursor: null, // Clear cursor on successful complete sync
        })
        .where(eq(practices.id, practiceId));
      
      // Update sync log
      await db
        .update(syncLogs)
        .set({
          status: 'completed',
          completedAt: new Date(),
          appointmentsFetched: totalFetched,
          appointmentsCreated: totalCreated,
          appointmentsUpdated: totalUpdated,
          syncFromDate: from,
          syncToDate: to,
        })
        .where(eq(syncLogs.id, syncLog.id));
      
      this.logger.info({
        practiceId,
        fetched: totalFetched,
        created: totalCreated,
        updated: totalUpdated,
      }, 'Sync completed');
      
    } catch (error) {
      this.logger.error({ practiceId, error }, 'Sync failed');
      
      await db
        .update(syncLogs)
        .set({
          status: 'failed',
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorDetails: error instanceof Error ? { stack: error.stack } : {},
        })
        .where(eq(syncLogs.id, syncLog.id));
      
      throw error;
    }
  }
  
  /**
   * Upsert a single appointment
   */
  private async upsertAppointment(
    practiceId: string,
    pmsProvider: PmsProvider,
    appt: UnifiedAppointment
  ): Promise<{ created: boolean; updated: boolean }> {
    // Check if exists
    const [existing] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(
        eq(appointments.practiceId, practiceId),
        eq(appointments.pmsProvider, pmsProvider),
        eq(appointments.pmsAppointmentId, appt.pmsAppointmentId)
      ))
      .limit(1);
    
    const values = {
      practiceId,
      pmsProvider,
      pmsAppointmentId: appt.pmsAppointmentId,
      startTime: appt.startTime,
      endTime: appt.endTime,
      durationMinutes: appt.durationMinutes,
      status: appt.status,
      isTelehealth: appt.isTelehealth,
      telehealthUrl: appt.telehealthUrl,
      patientId: appt.patientId,
      patientName: appt.patientName,
      patientEmail: appt.patientEmail,
      patientPhone: appt.patientPhone,
      practitionerId: appt.practitionerId,
      practitionerName: appt.practitionerName,
      appointmentTypeId: appt.appointmentTypeId,
      appointmentTypeName: appt.appointmentTypeName,
      locationName: appt.locationName,
      notes: appt.notes,
      rawData: appt.rawData,
      pmsCreatedAt: appt.pmsCreatedAt,
      pmsUpdatedAt: appt.pmsUpdatedAt,
      updatedAt: new Date(),
    };
    
    if (existing) {
      await db
        .update(appointments)
        .set(values)
        .where(eq(appointments.id, existing.id));
      
      return { created: false, updated: true };
    } else {
      await db.insert(appointments).values(values);
      return { created: true, updated: false };
    }
  }
  
  /**
   * Sync all enabled practices
   */
  async syncAll(): Promise<void> {
    this.logger.info('Starting sync for all practices');
    
    const allPractices = await db
      .select()
      .from(practices)
      .where(eq(practices.syncEnabled, true));
    
    this.logger.info({ count: allPractices.length }, 'Found practices to sync');
    
    for (const practice of allPractices) {
      try {
        await this.syncPractice(practice.id);
      } catch (error) {
        // Log but continue with other practices
        this.logger.error({ practiceId: practice.id, error }, 'Failed to sync practice');
      }
    }
    
    this.logger.info('Completed sync for all practices');
  }
  
  /**
   * Sync appointment types for a practice
   */
  async syncAppointmentTypes(practiceId: string): Promise<void> {
    const [practice] = await db
      .select()
      .from(practices)
      .where(eq(practices.id, practiceId))
      .limit(1);
    
    if (!practice) {
      throw new Error(`Practice not found: ${practiceId}`);
    }
    
    const adapter = this.createAdapter(practice);
    await adapter.authenticate();
    
    const types = await adapter.fetchAppointmentTypes();
    
    for (const type of types) {
      await db
        .insert(appointmentTypes)
        .values({
          practiceId,
          pmsTypeId: type.pmsTypeId,
          name: type.name,
          durationMinutes: type.durationMinutes,
          isTelehealth: type.isTelehealth,
          color: type.color,
          isActive: type.isActive,
          rawData: type.rawData,
        })
        .onConflictDoUpdate({
          target: [appointmentTypes.practiceId, appointmentTypes.pmsTypeId],
          set: {
            name: type.name,
            durationMinutes: type.durationMinutes,
            isTelehealth: type.isTelehealth,
            color: type.color,
            isActive: type.isActive,
            rawData: type.rawData,
            updatedAt: new Date(),
          },
        });
    }
    
    this.logger.info({ practiceId, count: types.length }, 'Synced appointment types');
  }
  
  /**
   * Sync practitioners for a practice
   */
  async syncPractitioners(practiceId: string): Promise<void> {
    const [practice] = await db
      .select()
      .from(practices)
      .where(eq(practices.id, practiceId))
      .limit(1);
    
    if (!practice) {
      throw new Error(`Practice not found: ${practiceId}`);
    }
    
    const adapter = this.createAdapter(practice);
    await adapter.authenticate();
    
    const practs = await adapter.fetchPractitioners();
    
    for (const pract of practs) {
      await db
        .insert(practitioners)
        .values({
          practiceId,
          pmsPractitionerId: pract.pmsPractitionerId,
          name: pract.name,
          email: pract.email,
          specialty: pract.specialty,
          isActive: pract.isActive,
          rawData: pract.rawData,
        })
        .onConflictDoUpdate({
          target: [practitioners.practiceId, practitioners.pmsPractitionerId],
          set: {
            name: pract.name,
            email: pract.email,
            specialty: pract.specialty,
            isActive: pract.isActive,
            rawData: pract.rawData,
            updatedAt: new Date(),
          },
        });
    }
    
    this.logger.info({ practiceId, count: practs.length }, 'Synced practitioners');
  }
}

export const syncService = new SyncService();
```

---

## 12. API Endpoints

### 12.1 Hono App Setup

```typescript
// src/api/index.ts

import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { cors } from 'hono/cors';
import { appointmentsRouter } from './routes/appointments';
import { practicesRouter } from './routes/practices';
import { syncRouter } from './routes/sync';

export const app = new Hono();

// Middleware
app.use('*', honoLogger());
app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Routes
app.route('/api/appointments', appointmentsRouter);
app.route('/api/practices', practicesRouter);
app.route('/api/sync', syncRouter);

// Error handler
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});
```

### 12.2 Appointments Routes

```typescript
// src/api/routes/appointments.ts

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../../db';
import { appointments } from '../../db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

export const appointmentsRouter = new Hono();

const listQuerySchema = z.object({
  practiceId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  isTelehealth: z.enum(['true', 'false']).optional(),
  status: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

// List appointments
appointmentsRouter.get('/', zValidator('query', listQuerySchema), async (c) => {
  const query = c.req.valid('query');
  
  let conditions = [];
  
  if (query.practiceId) {
    conditions.push(eq(appointments.practiceId, query.practiceId));
  }
  if (query.from) {
    conditions.push(gte(appointments.startTime, new Date(query.from)));
  }
  if (query.to) {
    conditions.push(lte(appointments.startTime, new Date(query.to)));
  }
  if (query.isTelehealth) {
    conditions.push(eq(appointments.isTelehealth, query.isTelehealth === 'true'));
  }
  if (query.status) {
    conditions.push(eq(appointments.status, query.status as any));
  }
  
  const results = await db
    .select()
    .from(appointments)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(appointments.startTime))
    .limit(query.limit)
    .offset(query.offset);
  
  return c.json({
    data: results,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      count: results.length,
    },
  });
});

// Get single appointment
appointmentsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  
  const [appointment] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, id))
    .limit(1);
  
  if (!appointment) {
    return c.json({ error: 'Appointment not found' }, 404);
  }
  
  return c.json(appointment);
});

// Get telehealth appointments
appointmentsRouter.get('/telehealth/upcoming', async (c) => {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  
  const results = await db
    .select()
    .from(appointments)
    .where(and(
      eq(appointments.isTelehealth, true),
      gte(appointments.startTime, now),
      lte(appointments.startTime, endOfDay)
    ))
    .orderBy(appointments.startTime);
  
  return c.json(results);
});
```

### 12.3 Practices Routes

```typescript
// src/api/routes/practices.ts

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../../db';
import { practices } from '../../db/schema';
import { eq } from 'drizzle-orm';

export const practicesRouter = new Hono();

const createPracticeSchema = z.object({
  pmsProvider: z.enum(['magentus', 'medirecords', 'halaxy']),
  pmsIdentifier: z.string(),
  pmsPracticeName: z.string().optional(),
  credentials: z.record(z.unknown()),
  timezone: z.string().default('Australia/Sydney'),
});

// List practices
practicesRouter.get('/', async (c) => {
  const results = await db.select().from(practices);
  
  // Don't expose credentials
  const sanitized = results.map(p => ({
    ...p,
    credentials: undefined,
  }));
  
  return c.json(sanitized);
});

// Create practice
practicesRouter.post('/', zValidator('json', createPracticeSchema), async (c) => {
  const body = c.req.valid('json');
  
  const [practice] = await db
    .insert(practices)
    .values({
      pmsProvider: body.pmsProvider,
      pmsIdentifier: body.pmsIdentifier,
      pmsPracticeName: body.pmsPracticeName,
      credentials: body.credentials,
      timezone: body.timezone,
    })
    .returning();
  
  return c.json(practice, 201);
});

// Get practice
practicesRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  
  const [practice] = await db
    .select()
    .from(practices)
    .where(eq(practices.id, id))
    .limit(1);
  
  if (!practice) {
    return c.json({ error: 'Practice not found' }, 404);
  }
  
  return c.json({
    ...practice,
    credentials: undefined,
  });
});

// Update practice
practicesRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  
  const [practice] = await db
    .update(practices)
    .set({
      ...body,
      updatedAt: new Date(),
    })
    .where(eq(practices.id, id))
    .returning();
  
  if (!practice) {
    return c.json({ error: 'Practice not found' }, 404);
  }
  
  return c.json({
    ...practice,
    credentials: undefined,
  });
});

// Delete practice
practicesRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  
  await db.delete(practices).where(eq(practices.id, id));
  
  return c.json({ success: true });
});
```

### 12.4 Sync Routes

```typescript
// src/api/routes/sync.ts

import { Hono } from 'hono';
import { syncService } from '../../services/sync.service';
import { db } from '../../db';
import { syncLogs } from '../../db/schema';
import { eq, desc } from 'drizzle-orm';

export const syncRouter = new Hono();

// Trigger sync for all practices
syncRouter.post('/all', async (c) => {
  // Run async, don't wait
  syncService.syncAll().catch(err => {
    console.error('Background sync failed:', err);
  });
  
  return c.json({ message: 'Sync started for all practices' });
});

// Trigger sync for single practice
syncRouter.post('/practice/:id', async (c) => {
  const id = c.req.param('id');
  
  try {
    await syncService.syncPractice(id);
    return c.json({ message: 'Sync completed' });
  } catch (error) {
    return c.json({ 
      error: error instanceof Error ? error.message : 'Sync failed' 
    }, 500);
  }
});

// Sync appointment types for a practice
syncRouter.post('/practice/:id/appointment-types', async (c) => {
  const id = c.req.param('id');
  
  try {
    await syncService.syncAppointmentTypes(id);
    return c.json({ message: 'Appointment types synced' });
  } catch (error) {
    return c.json({ 
      error: error instanceof Error ? error.message : 'Sync failed' 
    }, 500);
  }
});

// Sync practitioners for a practice
syncRouter.post('/practice/:id/practitioners', async (c) => {
  const id = c.req.param('id');
  
  try {
    await syncService.syncPractitioners(id);
    return c.json({ message: 'Practitioners synced' });
  } catch (error) {
    return c.json({ 
      error: error instanceof Error ? error.message : 'Sync failed' 
    }, 500);
  }
});

// Get sync logs
syncRouter.get('/logs', async (c) => {
  const practiceId = c.req.query('practiceId');
  
  let query = db.select().from(syncLogs).orderBy(desc(syncLogs.startedAt)).limit(50);
  
  if (practiceId) {
    query = query.where(eq(syncLogs.practiceId, practiceId)) as typeof query;
  }
  
  const logs = await query;
  
  return c.json(logs);
});
```

---

## 13. Application Entry Point

```typescript
// src/index.ts

import { serve } from '@hono/node-server';
import { app } from './api';
import { env } from './config/env';
import { logger } from './lib/logger';
import { syncService } from './services/sync.service';
import cron from 'node-cron';

async function main() {
  logger.info({ env: env.NODE_ENV }, 'Starting PMS Integration Prototype');
  
  // Start scheduled sync job
  if (env.NODE_ENV !== 'test') {
    const cronExpression = `*/${env.SYNC_INTERVAL_MINUTES} * * * *`;
    
    cron.schedule(cronExpression, async () => {
      logger.info('Running scheduled sync');
      try {
        await syncService.syncAll();
      } catch (error) {
        logger.error({ error }, 'Scheduled sync failed');
      }
    });
    
    logger.info({ interval: env.SYNC_INTERVAL_MINUTES }, 'Scheduled sync job started');
  }
  
  // Start HTTP server
  serve({
    fetch: app.fetch,
    port: env.PORT,
  });
  
  logger.info({ port: env.PORT }, 'HTTP server started');
}

main().catch((error) => {
  logger.error({ error }, 'Failed to start application');
  process.exit(1);
});
```

---

## 14. Database Connection

```typescript
// src/db/index.ts

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { env } from '../config/env';
import * as schema from './schema';

const sql = neon(env.DATABASE_URL);
export const db = drizzle(sql, { schema });
```

---

## 15. Configuration Files

### 15.1 package.json

```json
{
  "name": "pms-integration-prototype",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "lint": "biome check .",
    "lint:fix": "biome check --apply .",
    "test": "vitest"
  },
  "dependencies": {
    "@hono/node-server": "^1.8.0",
    "@hono/zod-validator": "^0.2.0",
    "@neondatabase/serverless": "^0.9.0",
    "dotenv": "^16.4.0",
    "drizzle-orm": "^0.30.0",
    "hono": "^4.0.0",
    "node-cron": "^3.0.3",
    "ofetch": "^1.3.0",
    "pino": "^8.18.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.5.0",
    "@types/node": "^20.11.0",
    "@types/node-cron": "^3.0.11",
    "drizzle-kit": "^0.20.0",
    "pino-pretty": "^10.3.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0",
    "vitest": "^1.2.0"
  }
}
```

### 15.2 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 15.3 drizzle.config.ts

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### 15.4 biome.json

```json
{
  "$schema": "https://biomejs.dev/schemas/1.5.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  }
}
```

---

## 16. Setup Instructions

### 16.1 Initial Setup

```bash
# 1. Create project directory
mkdir pms-integration-prototype
cd pms-integration-prototype

# 2. Initialize project
npm init -y

# 3. Install dependencies
npm install hono @hono/node-server @hono/zod-validator \
  drizzle-orm @neondatabase/serverless \
  ofetch zod pino node-cron dotenv

npm install -D typescript tsx @types/node @types/node-cron \
  drizzle-kit vitest @biomejs/biome pino-pretty

# 4. Copy all source files from this spec

# 5. Create .env file from .env.example
cp .env.example .env

# 6. Update .env with actual values
# - DATABASE_URL from Neon dashboard
# - API credentials from each PMS vendor

# 7. Generate and run migrations
npm run db:generate
npm run db:push

# 8. Start development server
npm run dev
```

### 16.2 Neon Database Setup

1. Create account at https://neon.tech
2. Create new project
3. Copy connection string to `.env` as `DATABASE_URL`
4. Ensure `?sslmode=require` is appended to URL

### 16.3 Testing the Setup

```bash
# Health check
curl http://localhost:3000/health

# Create a test practice (Magentus example)
curl -X POST http://localhost:3000/api/practices \
  -H "Content-Type: application/json" \
  -d '{
    "pmsProvider": "magentus",
    "pmsIdentifier": "test-tenant-id",
    "pmsPracticeName": "Test Clinic",
    "credentials": {
      "accessToken": "your-token",
      "expiresAt": "2024-12-31T00:00:00Z"
    }
  }'

# Trigger sync
curl -X POST http://localhost:3000/api/sync/practice/{practice-id}

# Get appointments
curl http://localhost:3000/api/appointments
```

---

## 17. Implementation Order

For an AI agent implementing this specification:

### Phase 1: Foundation (Day 1)
1. Set up project structure and install dependencies
2. Create configuration module (`src/config/env.ts`)
3. Set up database connection (`src/db/index.ts`)
4. Create database schema (`src/db/schema.ts`)
5. Run migrations
6. Set up logger (`src/lib/logger.ts`)

### Phase 2: Shared Utilities (Day 1-2)
1. Implement rate limiter (`src/lib/rate-limiter.ts`)
2. Implement token manager (`src/lib/token-manager.ts`)
3. Implement date utilities (`src/lib/dates.ts`)
4. Create base adapter (`src/adapters/base.adapter.ts`)
5. Define adapter types (`src/adapters/types.ts`)

### Phase 3: First Adapter - Magentus (Day 2-3)
1. Implement Magentus types
2. Implement Magentus auth
3. Implement Magentus client
4. Implement Magentus transform
5. Implement Magentus adapter
6. Test with sandbox

### Phase 4: Second Adapter - Medirecords (Day 3-4)
1. Implement Medirecords types
2. Implement Medirecords auth
3. Implement Medirecords client
4. Implement Medirecords transform
5. Implement Medirecords adapter
6. Test with sandbox

### Phase 5: Third Adapter - Halaxy (Day 4-5)
1. Implement Halaxy types
2. Implement Halaxy auth
3. Implement Halaxy client
4. Implement Halaxy transform
5. Implement Halaxy adapter
6. Test with sandbox

### Phase 6: Services & API (Day 5-6)
1. Implement sync service
2. Set up Hono app
3. Implement appointments routes
4. Implement practices routes
5. Implement sync routes
6. Add scheduled sync job

### Phase 7: Testing & Polish (Day 6-7)
1. Test end-to-end flow for each adapter
2. Add error handling edge cases
3. Document any discovered issues
4. Create sample data fixtures

---

## 18. Notes for AI Agent

### Critical Implementation Details

1. **Database**: Use Neon's serverless driver with Drizzle ORM. The `@neondatabase/serverless` package handles connection pooling automatically.

2. **Error Handling**: Always wrap API calls in the `withRetry` method from the base adapter. This handles transient failures and rate limits.

3. **Token Refresh**: Check token expiry before every API call. Refresh proactively (5 minutes before expiry).

4. **Pagination**: Each PMS uses different pagination. Magentus uses cursors, Medirecords uses page numbers, Halaxy's approach needs discovery.

5. **Telehealth Detection**: 
   - Magentus: Check appointment type name for "telehealth" or "video"
   - Medirecords: Check `telehealthLinkForPatient` or appointment type's `telehealth` flag
   - Halaxy: Check `location-type` in `supportingInformation`

6. **Timezone Handling**: Always store timestamps with timezone. Magentus provides ISO 8601 with offset. Medirecords doesn't include timezone - assume practice timezone. Halaxy uses ISO 8601.

7. **Credentials Storage**: For this prototype, credentials are stored as JSON in the database. In production, these would be encrypted.

8. **Rate Limiting**: Implement conservative defaults (100 req/min) and adjust based on observed limits.

### Known Unknowns

These require discovery during implementation:

1. **Medirecords OAuth**: Token endpoint URL not documented
2. **Halaxy Auth**: Authentication mechanism not specified
3. **Halaxy Pagination**: Not documented in provided spec
4. **Duration Codes**: Medirecords interval codes need lookup from `/code-system/appointment-Interval-Code`
5. **Rate Limits**: None of the APIs document their limits

### Testing Strategy

1. Create mock responses for each PMS in `__fixtures__/`
2. Use Vitest for unit tests on transform functions
3. Integration test with sandbox environments
4. Log raw responses during development for spec sheet documentation

---

*End of Technical Specification*
