import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { pmsConnections } from '@/db/schema';
import type { PMSConnection, PMSAdapter } from '../types';

/**
 * Token manager for PMS OAuth tokens
 * Handles storage, retrieval, and automatic refresh of tokens
 */
export class TokenManager {
  // Buffer time before token expiry to trigger refresh (5 minutes)
  private readonly TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

  /**
   * Store tokens in the database
   */
  async storeTokens(
    connectionId: string,
    tokens: {
      accessToken: string;
      refreshToken?: string;
      expiresAt: Date;
    }
  ): Promise<void> {
    await db
      .update(pmsConnections)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(pmsConnections.id, connectionId));
  }

  /**
   * Get a valid token, refreshing if needed
   * Throws an error if token is invalid and cannot be refreshed
   */
  async getValidToken(
    connectionId: string,
    adapter?: PMSAdapter
  ): Promise<string> {
    // Fetch connection from database
    const connections = await db
      .select()
      .from(pmsConnections)
      .where(eq(pmsConnections.id, connectionId))
      .limit(1);

    const connection = connections[0];
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    if (!connection.accessToken) {
      throw new Error(`No access token for connection: ${connectionId}`);
    }

    // Check if token is expired or about to expire
    if (this.isTokenExpired(connection as PMSConnection)) {
      if (!adapter) {
        throw new Error(`Token expired and no adapter provided for refresh: ${connectionId}`);
      }

      // Refresh the token
      await this.refreshIfNeeded(connection as PMSConnection, adapter);

      // Re-fetch to get new token
      const refreshedConnections = await db
        .select()
        .from(pmsConnections)
        .where(eq(pmsConnections.id, connectionId))
        .limit(1);

      const refreshedConnection = refreshedConnections[0];
      if (!refreshedConnection?.accessToken) {
        throw new Error(`Failed to refresh token for connection: ${connectionId}`);
      }

      return refreshedConnection.accessToken;
    }

    return connection.accessToken;
  }

  /**
   * Check if a token is expired (with buffer)
   */
  isTokenExpired(connection: PMSConnection): boolean {
    if (!connection.tokenExpiresAt) {
      // No expiry set - assume expired to be safe
      return true;
    }

    const expiresAt = new Date(connection.tokenExpiresAt).getTime();
    const now = Date.now();

    // Token is expired if current time is past expiry minus buffer
    return now >= expiresAt - this.TOKEN_EXPIRY_BUFFER_MS;
  }

  /**
   * Proactive refresh before expiry
   */
  async refreshIfNeeded(
    connection: PMSConnection,
    adapter: PMSAdapter
  ): Promise<void> {
    if (!this.isTokenExpired(connection)) {
      return; // Token still valid
    }

    // Attempt to refresh
    const result = await adapter.refreshToken(connection);

    if (!result.success || !result.accessToken) {
      throw new Error(`Token refresh failed: ${result.error || 'Unknown error'}`);
    }

    // Store the new tokens
    await this.storeTokens(connection.id, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt ?? new Date(Date.now() + 3600 * 1000), // Default 1 hour
    });
  }

  /**
   * Clear tokens for a connection (e.g., on disconnect)
   */
  async clearTokens(connectionId: string): Promise<void> {
    await db
      .update(pmsConnections)
      .set({
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(pmsConnections.id, connectionId));
  }

  /**
   * Get connections that need token refresh soon
   * Useful for proactive background refresh
   */
  async getConnectionsNeedingRefresh(): Promise<PMSConnection[]> {
    const bufferTime = new Date(Date.now() + this.TOKEN_EXPIRY_BUFFER_MS);

    // Find connections where token expires within buffer time and sync is enabled
    const connections = await db
      .select()
      .from(pmsConnections)
      .where(eq(pmsConnections.syncEnabled, true));

    return connections.filter(conn => {
      if (!conn.tokenExpiresAt) return false;
      return new Date(conn.tokenExpiresAt) <= bufferTime;
    }) as PMSConnection[];
  }
}
