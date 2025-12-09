/**
 * Invitation Email Service
 *
 * Sends invitation emails to team members using the Nylas microservice.
 * The email contains a link to Nylas Hosted Authentication where the user
 * can connect their email account to grant the AI agent access.
 */

import { IInvite } from '../models/Invite';
import { sendEmail } from '../integrations/nylas-remote/nylas-remote.service';

// Environment variables for URLs
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const NYLAS_MICROSERVICE_URL = process.env.NYLAS_MICROSERVICE_URL || 'http://localhost:3001';

export interface InvitationEmailParams {
  companyId: string;
  invite: IInvite;
  companyName: string;
  inviterName: string;
}

export class InvitationEmailService {
  /**
   * Generate the Nylas authentication URL for an invite
   * Calls V3's initiate endpoint to get the correct Nylas OAuth URL
   */
  static async generateNylasAuthUrl(invite: IInvite): Promise<string> {
    // Build state data to pass through the OAuth flow
    const stateData = {
      inviteToken: invite.inviteToken,
      companyId: invite.companyId.toString(),
      email: invite.email,
      successRedirectUrl: `${FRONTEND_URL}/auth/nylas/success`,
      errorRedirectUrl: `${FRONTEND_URL}/auth/nylas/error`,
      redirectUri: `${NYLAS_MICROSERVICE_URL}/api/v1/nylas/auth/callback`,
    };

    // Base64url encode the state for safe URL transport
    const encodedState = Buffer.from(JSON.stringify(stateData)).toString('base64url');

    // Build the redirect URI (V3 callback)
    const redirectUri = `${NYLAS_MICROSERVICE_URL}/api/v1/nylas/auth/callback`;

    try {
      // Call V3's initiate endpoint to get the correct Nylas OAuth URL
      const response = await fetch(`${NYLAS_MICROSERVICE_URL}/api/v1/nylas/auth/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          redirectUri,
          state: encodedState,
          loginHint: invite.email,
          provider: 'google',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[InvitationEmailService] V3 initiate failed: ${response.status} ${errorText}`);
        throw new Error(`V3 initiate failed: ${response.status}`);
      }

      const result = await response.json();
      if (result.authUrl) {
        console.log(`[InvitationEmailService] Got auth URL from V3: ${result.authUrl.substring(0, 80)}...`);
        return result.authUrl;
      }

      throw new Error('No authUrl in V3 response');
    } catch (error: any) {
      console.error(`[InvitationEmailService] Failed to get auth URL from V3: ${error.message}`);
      // Fall back to frontend URL
      return this.generateFrontendAuthUrl(invite);
    }
  }

  /**
   * Fallback: Generate frontend URL for auth flow
   * Used when V3's initiate endpoint is not available
   */
  static generateFrontendAuthUrl(invite: IInvite): string {
    const stateData = {
      inviteToken: invite.inviteToken,
      companyId: invite.companyId.toString(),
      email: invite.email,
      successRedirectUrl: `${FRONTEND_URL}/auth/nylas/success`,
      errorRedirectUrl: `${FRONTEND_URL}/auth/nylas/error`,
      redirectUri: `${NYLAS_MICROSERVICE_URL}/api/v1/nylas/auth/callback`,
    };

    const encodedState = Buffer.from(JSON.stringify(stateData)).toString('base64url');
    return `${FRONTEND_URL}/auth/nylas/connect?state=${encodedState}&email=${encodeURIComponent(invite.email)}`;
  }

  /**
   * Generate HTML email content for the invitation
   */
  static generateEmailHtml(
    inviterName: string,
    companyName: string,
    authUrl: string,
    expiresAt: Date,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 30px;">
        <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">
          ${inviterName} invited you to join ${companyName}
        </h1>

        <p style="color: #666; font-size: 16px; line-height: 1.6;">
          You've been invited to connect your Google account to enable AI-powered assistance
          for email, calendar, and contacts.
        </p>

        <p style="color: #666; font-size: 16px; line-height: 1.6;">
          Click the button below to securely connect your Google account:
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${authUrl}"
             style="display: inline-block; background-color: #4285F4; color: #ffffff;
                    text-decoration: none; padding: 14px 32px; border-radius: 8px;
                    font-size: 16px; font-weight: 600;">
            Connect Your Google Account
          </a>
        </div>

        <p style="color: #999; font-size: 14px; line-height: 1.6;">
          This invitation expires on <strong>${expiresAt.toLocaleDateString()}</strong>.
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #999; font-size: 12px; line-height: 1.6;">
          If you didn't expect this invitation, you can safely ignore this email.
        </p>

        <p style="color: #999; font-size: 12px; line-height: 1.6;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${authUrl}" style="color: #4285F4; word-break: break-all;">${authUrl}</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`;
  }

  /**
   * Generate plain text email content
   */
  static generateEmailText(
    inviterName: string,
    companyName: string,
    authUrl: string,
    expiresAt: Date,
  ): string {
    return `
You've been invited to join ${companyName}

${inviterName} has invited you to connect your email, calendar, and contacts to enable AI-powered assistance.

Click the link below to securely connect your account:
${authUrl}

This invitation expires on ${expiresAt.toLocaleDateString()}.

If you didn't expect this invitation, you can safely ignore this email.
`;
  }

  /**
   * Send an invitation email via Nylas
   */
  static async sendInvitationEmail(params: InvitationEmailParams): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    const { companyId, invite, companyName, inviterName } = params;

    console.log(`[InvitationEmailService] Preparing invitation email for ${invite.email}`);
    console.log(`[InvitationEmailService] Company: ${companyName}, Inviter: ${inviterName}`);

    const authUrl = await this.generateNylasAuthUrl(invite);
    console.log(`[InvitationEmailService] Generated auth URL: ${authUrl.substring(0, 100)}...`);

    const html = this.generateEmailHtml(inviterName, companyName, authUrl, invite.expiresAt);
    const text = this.generateEmailText(inviterName, companyName, authUrl, invite.expiresAt);

    console.log(`[InvitationEmailService] HTML length: ${html.length} chars`);

    try {
      console.log(`[InvitationEmailService] Sending email via Nylas microservice...`);
      const result = await sendEmail(companyId, {
        to: [{ email: invite.email, name: invite.name || undefined }],
        subject: `${inviterName} invited you to join ${companyName}`,
        body: html,
      });

      console.log(`[InvitationEmailService] SUCCESS! Sent invitation to ${invite.email}, messageId: ${result.id}`);

      return {
        success: true,
        messageId: result.id,
      };
    } catch (error: any) {
      console.error(`[InvitationEmailService] FAILED to send invitation to ${invite.email}:`, error.message);
      console.error(`[InvitationEmailService] Error details:`, error);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send a reminder/resend invitation email
   */
  static async resendInvitationEmail(params: InvitationEmailParams): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    const { companyId, invite, companyName, inviterName } = params;

    const authUrl = await this.generateNylasAuthUrl(invite);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 30px;">
        <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">
          Reminder: You're invited to join ${companyName}
        </h1>

        <p style="color: #666; font-size: 16px; line-height: 1.6;">
          This is a reminder that <strong>${inviterName}</strong> has invited you to connect your
          email, calendar, and contacts to enable AI-powered assistance.
        </p>

        <p style="color: #666; font-size: 16px; line-height: 1.6;">
          Click the button below to securely connect your account:
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${authUrl}"
             style="display: inline-block; background-color: #4F46E5; color: #ffffff;
                    text-decoration: none; padding: 14px 32px; border-radius: 8px;
                    font-size: 16px; font-weight: 600;">
            Connect Your Account
          </a>
        </div>

        <p style="color: #999; font-size: 14px; line-height: 1.6;">
          This invitation expires on <strong>${invite.expiresAt.toLocaleDateString()}</strong>.
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #999; font-size: 12px; line-height: 1.6;">
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    try {
      const result = await sendEmail(companyId, {
        to: [{ email: invite.email, name: invite.name || undefined }],
        subject: `Reminder: You're invited to join ${companyName}`,
        body: html,
      });

      console.log(`[InvitationEmailService] Resent invitation to ${invite.email}, messageId: ${result.id}`);

      return {
        success: true,
        messageId: result.id,
      };
    } catch (error: any) {
      console.error(`[InvitationEmailService] Failed to resend invitation to ${invite.email}:`, error.message);

      return {
        success: false,
        error: error.message,
      };
    }
  }
}
