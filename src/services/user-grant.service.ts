/**
 * User Grant Service
 *
 * Manages per-user Nylas grants for email, calendar, and contacts access.
 * Each user can have their own Nylas grant, allowing the AI agent to access
 * their personal data with their consent.
 */

import { User, INylasGrant } from '../models/User';

export interface StoreGrantParams {
  grantId: string;
  email: string;
  provider?: string;
  scopes?: string[];
  expiresAt?: Date;
}

export class UserGrantService {
  /**
   * Store a Nylas grant for a user
   */
  static async storeNylasGrant(
    userId: string,
    grantData: StoreGrantParams,
  ): Promise<void> {
    const grantRecord: INylasGrant = {
      grantId: grantData.grantId,
      email: grantData.email,
      provider: grantData.provider || 'unknown',
      status: 'active',
      scopes: grantData.scopes || ['email', 'calendar', 'contacts'],
      createdAt: new Date(),
      expiresAt: grantData.expiresAt,
    };

    await User.findByIdAndUpdate(userId, {
      nylasGrant: grantRecord,
    });

    console.log(`[UserGrantService] Stored Nylas grant for user ${userId}: ${grantData.grantId}`);
  }

  /**
   * Get the Nylas grant for a user
   */
  static async getUserGrant(userId: string): Promise<INylasGrant | null> {
    const user = await User.findById(userId).select('nylasGrant');
    return user?.nylasGrant || null;
  }

  /**
   * Get user by their Nylas grant ID
   */
  static async getUserByGrantId(grantId: string): Promise<typeof User.prototype | null> {
    return User.findOne({ 'nylasGrant.grantId': grantId });
  }

  /**
   * Get user by email and company
   */
  static async getUserByEmailAndCompany(
    email: string,
    companyId: string,
  ): Promise<typeof User.prototype | null> {
    return User.findOne({
      email: email.toLowerCase(),
      companyId,
    });
  }

  /**
   * Revoke a user's Nylas grant (marks as revoked, keeps record)
   */
  static async revokeGrant(userId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, {
      'nylasGrant.status': 'revoked',
    });

    console.log(`[UserGrantService] Revoked Nylas grant for user ${userId}`);
  }

  /**
   * Mark a grant as expired (called by webhook)
   */
  static async markGrantExpired(grantId: string): Promise<void> {
    const result = await User.updateOne(
      { 'nylasGrant.grantId': grantId },
      { 'nylasGrant.status': 'expired' },
    );

    if (result.modifiedCount > 0) {
      console.log(`[UserGrantService] Marked grant ${grantId} as expired`);
    }
  }

  /**
   * Remove a user's Nylas grant completely
   */
  static async removeGrant(userId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, {
      $unset: { nylasGrant: 1 },
    });

    console.log(`[UserGrantService] Removed Nylas grant for user ${userId}`);
  }

  /**
   * Check if a user has an active Nylas grant
   */
  static async hasActiveGrant(userId: string): Promise<boolean> {
    const grant = await this.getUserGrant(userId);
    return grant?.status === 'active';
  }

  /**
   * Get all users with active grants in a company
   */
  static async getCompanyUsersWithGrants(companyId: string): Promise<{
    userId: string;
    email: string;
    grantId: string;
    provider: string;
  }[]> {
    const users = await User.find({
      companyId,
      'nylasGrant.status': 'active',
    }).select('_id email nylasGrant');

    return users.map((user) => ({
      userId: user._id.toString(),
      email: user.email,
      grantId: user.nylasGrant!.grantId,
      provider: user.nylasGrant!.provider,
    }));
  }
}
