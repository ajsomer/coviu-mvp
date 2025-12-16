export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatusCodes: number[];
  onRetry?: (attempt: number, error: Error) => void;
}

export const defaultRetryOptions: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  // Exponential backoff: base * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter (±25% randomization to prevent thundering herd)
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);

  return Math.floor(cappedDelay + jitter);
}

/**
 * Sleep for the specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown, retryableStatusCodes: number[]): boolean {
  if (error instanceof RetryableError) {
    return true;
  }

  if (error instanceof Error) {
    // Check for network errors
    const networkErrorMessages = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ENETUNREACH',
      'fetch failed',
      'network error',
    ];

    if (networkErrorMessages.some(msg => error.message.toLowerCase().includes(msg.toLowerCase()))) {
      return true;
    }
  }

  // Check if error has a status code
  const statusCode = (error as { statusCode?: number; status?: number })?.statusCode
    || (error as { statusCode?: number; status?: number })?.status;

  if (statusCode && retryableStatusCodes.includes(statusCode)) {
    return true;
  }

  return false;
}

/**
 * Execute an operation with exponential backoff retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const opts: RetryOptions = { ...defaultRetryOptions, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt < opts.maxAttempts - 1 && isRetryableError(error, opts.retryableStatusCodes)) {
        // Calculate delay
        let delay = calculateDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);

        // Check for Retry-After header
        if (error instanceof RetryableError && error.retryAfter) {
          delay = Math.max(delay, error.retryAfter * 1000);
        }

        // Call onRetry callback
        opts.onRetry?.(attempt + 1, lastError);

        // Wait before retrying
        await sleep(delay);
        continue;
      }

      // Not retryable or max attempts reached
      throw lastError;
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError ?? new Error('Max retries exceeded');
}
