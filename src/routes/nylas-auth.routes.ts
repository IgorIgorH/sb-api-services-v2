/**
 * Nylas Authentication Routes
 *
 * Handles:
 * - Receiving grant data from V3 microservice after OAuth callback
 * - Linking Nylas grants to users
 * - Managing user grants
 */

import express, { Request, Response } from 'express';
import { UserGrantService } from '../services/user-grant.service';
import { InviteService } from '../services/invite.service';
import { User } from '../models/User';
import { verifyTokenMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';

const nylasAuthRouter = express.Router();

/**
 * POST /api/nylas-auth/link-grant
 * Called by V3 microservice after successful OAuth to link grant to user
 *
 * This endpoint creates or updates a user with their Nylas grant
 */
nylasAuthRouter.post('/link-grant', async (req: Request, res: Response) => {
  try {
    const {
      inviteToken,
      grantId,
      email,
      provider,
      scopes,
      companyId,
      userId,
    } = req.body;

    console.log(`[nylas-auth] Link grant request: email=${email}, grantId=${grantId?.substring(0, 8)}...`);

    // Validate required fields
    if (!grantId || !email) {
      return res.status(400).json({
        success: false,
        error: 'grantId and email are required',
      });
    }

    let user;

    // Case 1: Invite token provided - find invite and create/update user
    if (inviteToken) {
      const invite = await InviteService.findByToken(inviteToken);

      if (!invite) {
        return res.status(404).json({
          success: false,
          error: 'Invalid or expired invite token',
        });
      }

      // Check if user already exists
      user = await User.findOne({ email: email.toLowerCase() });

      if (!user) {
        // Create new user from invite
        user = await User.create({
          email: email.toLowerCase(),
          name: invite.name || email.split('@')[0],
          companyId: invite.companyId,
          role: invite.role || 'CompanyUser',
          identifiers: [{ key: 'email', value: email.toLowerCase() }],
        });

        console.log(`[nylas-auth] Created new user ${user._id} from invite`);
      }

      // Accept the invite
      await InviteService.acceptInvite(invite._id.toString());
      console.log(`[nylas-auth] Accepted invite for ${email}`);
    }
    // Case 2: User ID provided - update existing user
    else if (userId) {
      user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }
    }
    // Case 3: Company ID + email - find existing user
    else if (companyId) {
      user = await UserGrantService.getUserByEmailAndCompany(email, companyId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found in company',
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Must provide inviteToken, userId, or companyId',
      });
    }

    // Store the Nylas grant for the user
    await UserGrantService.storeNylasGrant(user._id.toString(), {
      grantId,
      email,
      provider: provider || 'unknown',
      scopes: scopes || ['email', 'calendar', 'contacts'],
    });

    console.log(`[nylas-auth] Stored Nylas grant for user ${user._id}`);

    res.json({
      success: true,
      userId: user._id.toString(),
      email: user.email,
    });
  } catch (error: any) {
    console.error('[nylas-auth] Error linking grant:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to link grant',
    });
  }
});

/**
 * POST /webhooks/nylas/callback
 * Receives forwarded webhook events from V3 microservice
 */
nylasAuthRouter.post('/webhooks/nylas/callback', async (req: Request, res: Response) => {
  try {
    const { source, type, data } = req.body;

    console.log(`[nylas-webhook] Received event: ${type}`);

    if (source !== 'nylas') {
      return res.status(400).json({ error: 'Invalid source' });
    }

    switch (type) {
      case 'nylas.grant.created':
        // Process the grant - create/update user with grant
        console.log(`[nylas-webhook] Grant created: ${data.grantId}, email: ${data.email}`);

        if (data.grantId && data.email) {
          try {
            let user;

            // If inviteToken provided, find invite and create user
            if (data.inviteToken) {
              const invite = await InviteService.findByToken(data.inviteToken);
              if (invite) {
                user = await User.findOne({ email: data.email.toLowerCase() });
                if (!user) {
                  user = await User.create({
                    email: data.email.toLowerCase(),
                    name: invite.name || data.email.split('@')[0],
                    companyId: invite.companyId,
                    role: invite.role || 'CompanyUser',
                    identifiers: [{ key: 'email', value: data.email.toLowerCase() }],
                  });
                  console.log(`[nylas-webhook] Created user ${user._id} from invite`);
                }
                await InviteService.acceptInvite(invite._id.toString());
              }
            } else if (data.userId) {
              user = await User.findById(data.userId);
            } else if (data.companyId) {
              user = await UserGrantService.getUserByEmailAndCompany(data.email, data.companyId);
            }

            if (user) {
              await UserGrantService.storeNylasGrant(user._id.toString(), {
                grantId: data.grantId,
                email: data.email,
                provider: data.provider || 'unknown',
                scopes: data.scopes || ['email', 'calendar', 'contacts'],
              });
              console.log(`[nylas-webhook] Stored grant for user ${user._id}`);
            } else {
              console.warn(`[nylas-webhook] No user found to store grant for email: ${data.email}`);
            }
          } catch (grantError: any) {
            console.error(`[nylas-webhook] Error storing grant: ${grantError.message}`);
          }
        }
        break;

      case 'nylas.grant.updated':
        console.log(`[nylas-webhook] Grant updated: ${data.grantId}`);
        break;

      case 'nylas.grant.expired':
        await UserGrantService.markGrantExpired(data.grantId || data.grant_id);
        console.log(`[nylas-webhook] Grant expired: ${data.grantId || data.grant_id}`);
        break;

      case 'nylas.grant.deleted':
        await UserGrantService.markGrantExpired(data.grantId || data.grant_id);
        console.log(`[nylas-webhook] Grant deleted: ${data.grantId || data.grant_id}`);
        break;

      default:
        console.log(`[nylas-webhook] Unknown event type: ${type}`);
    }

    res.json({ status: 'processed', type });
  } catch (error: any) {
    console.error('[nylas-webhook] Error processing webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/nylas-auth/grant
 * Get current user's Nylas grant status (requires auth)
 */
nylasAuthRouter.get(
  '/grant',
  verifyTokenMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const grant = await UserGrantService.getUserGrant(userId);

      if (!grant) {
        return res.json({
          hasGrant: false,
          grant: null,
        });
      }

      res.json({
        hasGrant: true,
        grant: {
          email: grant.email,
          provider: grant.provider,
          status: grant.status,
          scopes: grant.scopes,
          createdAt: grant.createdAt,
        },
      });
    } catch (error: any) {
      console.error('[nylas-auth] Error getting grant:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

/**
 * DELETE /api/nylas-auth/grant
 * Revoke current user's Nylas grant (requires auth)
 */
nylasAuthRouter.delete(
  '/grant',
  verifyTokenMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?._id?.toString();
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      await UserGrantService.revokeGrant(userId);

      res.json({ success: true, message: 'Grant revoked' });
    } catch (error: any) {
      console.error('[nylas-auth] Error revoking grant:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

/**
 * GET /api/nylas-auth/company-grants
 * Get all Nylas grants for the company (admin only)
 */
nylasAuthRouter.get(
  '/company-grants',
  verifyTokenMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const companyId = req.user?.companyId?.toString();
      if (!companyId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Optional: Check if user is admin
      // if (req.user?.role !== 'Admin') {
      //   return res.status(403).json({ error: 'Admin access required' });
      // }

      const grants = await UserGrantService.getCompanyUsersWithGrants(companyId);

      res.json({
        count: grants.length,
        grants,
      });
    } catch (error: any) {
      console.error('[nylas-auth] Error getting company grants:', error);
      res.status(500).json({ error: error.message });
    }
  },
);

export default nylasAuthRouter;
