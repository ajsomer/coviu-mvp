import type { PMSType } from '../types';
import { RateLimiter, rateLimiter } from './rate-limiter';
import { withRetry, RetryableError, defaultRetryOptions, type RetryOptions } from './retry-handler';

export interface HttpClientOptions {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  retryOptions?: Partial<RetryOptions>;
}

export interface RequestOptions extends RequestInit {
  token?: string;
  skipRateLimit?: boolean;
  skipRetry?: boolean;
}

/**
 * HTTP client wrapper with retry and rate limiting for PMS APIs
 */
export class PMSHttpClient {
  private rateLimiterInstance: RateLimiter;

  constructor(
    private pmsType: PMSType,
    private options: HttpClientOptions = {},
    rateLimiterOverride?: RateLimiter
  ) {
    this.rateLimiterInstance = rateLimiterOverride ?? rateLimiter;
  }

  /**
   * Make an HTTP request with retry and rate limiting
   */
  async request<T>(
    url: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { token, skipRateLimit, skipRetry, ...fetchOptions } = options;

    // Build full URL if base URL is set
    const fullUrl = this.options.baseUrl && !url.startsWith('http')
      ? `${this.options.baseUrl}${url}`
      : url;

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.options.defaultHeaders,
      ...(fetchOptions.headers as Record<string, string> || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Prepare fetch options
    const requestInit: RequestInit = {
      ...fetchOptions,
      headers,
    };

    // The actual fetch operation
    const doFetch = async (): Promise<T> => {
      // Apply rate limiting
      if (!skipRateLimit) {
        await this.rateLimiterInstance.acquire(this.pmsType);
      }

      try {
        const response = await fetch(fullUrl, requestInit);

        // Handle rate limit response
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;

          throw new RetryableError(
            'Rate limit exceeded',
            429,
            retryAfterSeconds
          );
        }

        // Handle other error responses
        if (!response.ok) {
          const errorBody = await response.text().catch(() => 'Unknown error');

          // Server errors are retryable
          if (response.status >= 500) {
            throw new RetryableError(
              `Server error: ${response.status} - ${errorBody}`,
              response.status
            );
          }

          // Client errors are not retryable
          throw new Error(`Request failed: ${response.status} - ${errorBody}`);
        }

        // Parse response
        const contentType = response.headers.get('Content-Type');
        if (contentType?.includes('application/json')) {
          return await response.json() as T;
        }

        // Return text for non-JSON responses
        return await response.text() as T;
      } catch (error) {
        // Re-throw if already a RetryableError
        if (error instanceof RetryableError) {
          throw error;
        }

        // Wrap network errors as retryable
        if (error instanceof TypeError && error.message.includes('fetch')) {
          throw new RetryableError(`Network error: ${error.message}`);
        }

        throw error;
      }
    };

    // Apply retry logic
    if (skipRetry) {
      return doFetch();
    }

    return withRetry(doFetch, {
      ...defaultRetryOptions,
      ...this.options.retryOptions,
      onRetry: (attempt, error) => {
        console.warn(
          `[${this.pmsType}] Request to ${fullUrl} failed, attempt ${attempt}: ${error.message}`
        );
      },
    });
  }

  /**
   * GET request
   */
  async get<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T>(
    url: string,
    body: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * PUT request
   */
  async put<T>(
    url: string,
    body: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /**
   * PATCH request
   */
  async patch<T>(
    url: string,
    body: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }

  /**
   * Make a request with form-urlencoded body (for OAuth)
   */
  async postForm<T>(
    url: string,
    body: Record<string, string>,
    options?: RequestOptions
  ): Promise<T> {
    const { token, ...restOptions } = options || {};

    return this.request<T>(url, {
      ...restOptions,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(restOptions.headers as Record<string, string> || {}),
      },
      body: new URLSearchParams(body).toString(),
    });
  }
}
