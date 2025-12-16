// Public types
export type {
  PMSType,
  SyncStatus,
  SyncType,
  AppointmentStatus,
  PMSConnection,
  UnifiedAppointment,
  PMSPractitioner,
  PMSAppointmentType,
  FetchOptions,
  AuthResult,
  HealthCheckResult,
  SyncResult,
  PMSAdapter,
} from './types';

// Adapters
export { getAdapter, GentuAdapter, isAdapterAvailable, getAvailablePmsTypes } from './adapters';

// Core services
export { TokenManager } from './core/token-manager';
export { RateLimiter, rateLimiter } from './core/rate-limiter';
export { withRetry, defaultRetryOptions, RetryableError } from './core/retry-handler';
export type { RetryOptions } from './core/retry-handler';
export { SyncOrchestrator } from './core/sync-orchestrator';
export { DataMapper } from './core/data-mapper';
export { PMSHttpClient } from './core/http-client';
export type { HttpClientOptions, RequestOptions } from './core/http-client';
