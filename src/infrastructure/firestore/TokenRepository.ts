import { Firestore } from '@google-cloud/firestore';

export interface UserToken {
  userId: string;
  accessToken: string;
  teamId: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Token TTL in milliseconds (4 hours)
 * Long enough for yearly summary generation to complete
 */
const TOKEN_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * Repository for storing and retrieving user OAuth tokens
 * Tokens are cached with TTL for security - users re-authorize periodically
 */
export class TokenRepository {
  private readonly db: Firestore;
  private readonly collectionName = 'slack_user_tokens';

  constructor() {
    // Firestore will use Application Default Credentials in Cloud Run
    this.db = new Firestore();
  }

  /**
   * Save a user's OAuth token with TTL
   */
  async saveToken(params: { userId: string; accessToken: string; teamId: string }): Promise<void> {
    const { userId, accessToken, teamId } = params;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

    await this.db.collection(this.collectionName).doc(userId).set({
      userId,
      accessToken,
      teamId,
      createdAt: now,
      expiresAt,
    });

    console.log(`Token saved for user: ${userId}, expires at: ${expiresAt.toISOString()}`);
  }

  /**
   * Get a user's OAuth token if valid (not expired)
   * Returns null if no token exists or token is expired
   */
  async getToken(userId: string): Promise<UserToken | null> {
    const doc = await this.db.collection(this.collectionName).doc(userId).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    if (!data) {
      return null;
    }

    const expiresAt = data.expiresAt?.toDate() ?? new Date(0);
    const now = new Date();

    // Check if token is expired
    if (expiresAt <= now) {
      console.log(`Token expired for user: ${userId}`);
      // Delete expired token
      await this.deleteToken(userId);
      return null;
    }

    return {
      userId: data.userId,
      accessToken: data.accessToken,
      teamId: data.teamId,
      createdAt: data.createdAt?.toDate() ?? new Date(),
      expiresAt,
    };
  }

  /**
   * Delete a user's token
   */
  async deleteToken(userId: string): Promise<void> {
    await this.db.collection(this.collectionName).doc(userId).delete();
    console.log(`Token deleted for user: ${userId}`);
  }

  /**
   * Check if a user has a valid (non-expired) token
   */
  async hasValidToken(userId: string): Promise<boolean> {
    const token = await this.getToken(userId);
    return token !== null;
  }

  /**
   * Extend token expiration (refresh on use)
   */
  async refreshToken(userId: string): Promise<void> {
    const doc = await this.db.collection(this.collectionName).doc(userId).get();
    if (doc.exists) {
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
      await doc.ref.update({ expiresAt });
      console.log(`Token refreshed for user: ${userId}, new expiry: ${expiresAt.toISOString()}`);
    }
  }
}
