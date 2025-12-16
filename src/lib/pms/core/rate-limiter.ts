import type { PMSType } from '../types';

interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
}

interface RateLimitState {
  minuteRequests: number[];
  hourRequests: number[];
}

const rateLimits: Record<PMSType, RateLimitConfig> = {
  gentu: { requestsPerMinute: 60, requestsPerHour: 1000 },
  medirecords: { requestsPerMinute: 60, requestsPerHour: 1000 },
  halaxy: { requestsPerMinute: 60, requestsPerHour: 1000 },
};

/**
 * Rate limiter for PMS API requests
 * Uses sliding window algorithm to track requests per minute and hour
 */
export class RateLimiter {
  private state: Map<PMSType, RateLimitState> = new Map();

  constructor() {
    // Initialize state for all PMS types
    for (const pmsType of Object.keys(rateLimits) as PMSType[]) {
      this.state.set(pmsType, {
        minuteRequests: [],
        hourRequests: [],
      });
    }
  }

  /**
   * Clean up old request timestamps from the state
   */
  private cleanupState(state: RateLimitState): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;

    // Remove timestamps older than 1 minute
    state.minuteRequests = state.minuteRequests.filter(ts => ts > oneMinuteAgo);

    // Remove timestamps older than 1 hour
    state.hourRequests = state.hourRequests.filter(ts => ts > oneHourAgo);
  }

  /**
   * Calculate time to wait before next request is allowed
   */
  private getWaitTime(pmsType: PMSType): number {
    const config = rateLimits[pmsType];
    const state = this.state.get(pmsType);

    if (!state) {
      return 0;
    }

    this.cleanupState(state);

    const now = Date.now();

    // Check minute limit
    if (state.minuteRequests.length >= config.requestsPerMinute) {
      const oldestMinuteRequest = state.minuteRequests[0];
      const waitForMinute = oldestMinuteRequest + 60 * 1000 - now;

      if (waitForMinute > 0) {
        return waitForMinute;
      }
    }

    // Check hour limit
    if (state.hourRequests.length >= config.requestsPerHour) {
      const oldestHourRequest = state.hourRequests[0];
      const waitForHour = oldestHourRequest + 60 * 60 * 1000 - now;

      if (waitForHour > 0) {
        return waitForHour;
      }
    }

    return 0;
  }

  /**
   * Acquire a slot to make a request
   * Waits if rate limit is exceeded
   */
  async acquire(pmsType: PMSType): Promise<void> {
    const waitTime = this.getWaitTime(pmsType);

    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Record this request
    const state = this.state.get(pmsType);
    if (state) {
      const now = Date.now();
      state.minuteRequests.push(now);
      state.hourRequests.push(now);
    }
  }

  /**
   * Release a slot (call if request failed and shouldn't count against limit)
   */
  release(pmsType: PMSType): void {
    const state = this.state.get(pmsType);
    if (state) {
      // Remove the most recent request from both arrays
      state.minuteRequests.pop();
      state.hourRequests.pop();
    }
  }

  /**
   * Handle rate limit response from server (e.g., 429 Too Many Requests)
   */
  async handleRateLimitResponse(pmsType: PMSType, retryAfter?: number): Promise<void> {
    // Default to 60 seconds if no retry-after header
    const waitMs = (retryAfter ?? 60) * 1000;

    // Release the failed request (it shouldn't count against limit)
    this.release(pmsType);

    // Wait for the specified time
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  /**
   * Get current rate limit status
   */
  getStatus(pmsType: PMSType): {
    minuteRequests: number;
    hourRequests: number;
    minuteLimit: number;
    hourLimit: number;
  } {
    const config = rateLimits[pmsType];
    const state = this.state.get(pmsType);

    if (!state) {
      return {
        minuteRequests: 0,
        hourRequests: 0,
        minuteLimit: config.requestsPerMinute,
        hourLimit: config.requestsPerHour,
      };
    }

    this.cleanupState(state);

    return {
      minuteRequests: state.minuteRequests.length,
      hourRequests: state.hourRequests.length,
      minuteLimit: config.requestsPerMinute,
      hourLimit: config.requestsPerHour,
    };
  }
}

// Singleton instance for use across the application
export const rateLimiter = new RateLimiter();
