import { google } from 'googleapis';
import { getApiKey } from '../../services/api.key.service';

interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  date: string;
  preview: string;
  hasAttachments: boolean;
}

interface EmailDetail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  date: string;
  text: string;
  html: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
  }>;
}

/**
 * Get Gmail OAuth2 client
 */
const getGmailClient = async (companyId: string) => {
  console.log(`\n📧 [Gmail Service] Getting Gmail client for company ${companyId}...`);

  const clientId = await getApiKey(companyId, 'google_client_id');
  const clientSecret = await getApiKey(companyId, 'google_client_secret');
  const refreshToken = await getApiKey(companyId, 'google_refresh_token');

  if (!clientId || !clientSecret || !refreshToken) {
    console.error(`❌ [Gmail Service] Missing required Gmail credentials`);
    throw new Error('Gmail credentials not configured. Please add google_client_id, google_client_secret, and google_refresh_token to your API keys.');
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId as string,
    clientSecret as string,
    'http://localhost:3000/auth/google/callback'
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken as string,
  });

  console.log(`📧 [Gmail Service] OAuth2 client configured`);
  return google.gmail({ version: 'v1', auth: oauth2Client });
};

/**
 * Parse email message to extract headers and body
 */
const parseMessage = (message: any): Partial<EmailDetail> => {
  const headers = message.payload?.headers || [];
  const parts = message.payload?.parts || [];

  // Extract headers
  const from = headers.find((h: any) => h.name === 'From')?.value || '';
  const to = headers.find((h: any) => h.name === 'To')?.value || '';
  const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
  const date = headers.find((h: any) => h.name === 'Date')?.value || '';

  // Extract body
  let text = '';
  let html = '';

  const extractBody = (part: any) => {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      text += Buffer.from(part.body.data, 'base64').toString('utf-8');
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      html += Buffer.from(part.body.data, 'base64').toString('utf-8');
    } else if (part.parts) {
      part.parts.forEach(extractBody);
    }
  };

  // If message has no parts, body might be directly in payload
  if (message.payload?.body?.data) {
    if (message.payload.mimeType === 'text/plain') {
      text = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    } else if (message.payload.mimeType === 'text/html') {
      html = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    }
  }

  parts.forEach(extractBody);

  // Extract attachments
  const attachments = parts
    .filter((part: any) => part.filename && part.filename.length > 0)
    .map((part: any) => ({
      filename: part.filename,
      contentType: part.mimeType || 'application/octet-stream',
      size: part.body?.size || 0,
    }));

  return {
    id: message.id,
    from,
    to: to.split(',').map((email: string) => email.trim()),
    subject,
    date,
    text,
    html,
    attachments,
  };
};

/**
 * Fetch recent emails from inbox
 */
export const fetchInbox = async (
  companyId: string,
  limit: number = 20
): Promise<{ success: boolean; emails?: EmailSummary[]; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== fetchInbox CALLED =====`);
  console.log(`📧 [Gmail Service] Company ID: ${companyId}`);
  console.log(`📧 [Gmail Service] Limit: ${limit}`);

  try {
    const gmail = await getGmailClient(companyId);

    // List messages
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: Math.min(limit, 50),
      labelIds: ['INBOX'],
    });

    const messages = response.data.messages || [];
    console.log(`📧 [Gmail Service] Found ${messages.length} messages`);

    if (messages.length === 0) {
      return { success: true, emails: [] };
    }

    // Fetch message details in parallel
    const emailPromises = messages.map(async (msg) => {
      const msgData = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      });

      const parsed = parseMessage(msgData.data);
      const snippet = msgData.data.snippet || '';

      return {
        id: parsed.id!,
        from: parsed.from!,
        subject: parsed.subject!,
        date: parsed.date!,
        preview: snippet.substring(0, 200),
        hasAttachments: (parsed.attachments?.length || 0) > 0,
      };
    });

    const emails = await Promise.all(emailPromises);

    console.log(`✅ [Gmail Service] Fetched ${emails.length} emails`);
    return { success: true, emails };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in fetchInbox:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Read specific email by ID
 */
export const readEmail = async (
  companyId: string,
  emailId: string
): Promise<{ success: boolean; email?: EmailDetail; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== readEmail CALLED =====`);
  console.log(`📧 [Gmail Service] Company ID: ${companyId}`);
  console.log(`📧 [Gmail Service] Email ID: ${emailId}`);

  try {
    const gmail = await getGmailClient(companyId);

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: emailId,
      format: 'full',
    });

    const email = parseMessage(response.data) as EmailDetail;

    console.log(`✅ [Gmail Service] Email fetched successfully`);
    return { success: true, email };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in readEmail:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Search emails by query
 */
export const searchEmails = async (
  companyId: string,
  searchQuery: string,
  limit: number = 20
): Promise<{ success: boolean; emails?: EmailSummary[]; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== searchEmails CALLED =====`);
  console.log(`📧 [Gmail Service] Company ID: ${companyId}`);
  console.log(`📧 [Gmail Service] Search query: ${searchQuery}`);
  console.log(`📧 [Gmail Service] Limit: ${limit}`);

  try {
    const gmail = await getGmailClient(companyId);

    // Search messages using Gmail query syntax (now supports full syntax, not just subject)
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: Math.min(limit, 50),
      q: searchQuery, // Full Gmail query syntax support
    });

    const messages = response.data.messages || [];
    console.log(`📧 [Gmail Service] Found ${messages.length} matching messages`);

    if (messages.length === 0) {
      return { success: true, emails: [] };
    }

    // Fetch message details in parallel
    const emailPromises = messages.map(async (msg) => {
      const msgData = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      });

      const parsed = parseMessage(msgData.data);
      const snippet = msgData.data.snippet || '';

      return {
        id: parsed.id!,
        from: parsed.from!,
        subject: parsed.subject!,
        date: parsed.date!,
        preview: snippet.substring(0, 200),
        hasAttachments: (parsed.attachments?.length || 0) > 0,
      };
    });

    const emails = await Promise.all(emailPromises);

    console.log(`✅ [Gmail Service] Fetched ${emails.length} emails`);
    return { success: true, emails };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in searchEmails:`, error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// SENDING & COMPOSING FUNCTIONS
// ============================================================================

interface SendEmailParams {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string | string[];
  bcc?: string | string[];
  isHtml?: boolean;
  attachments?: Array<{
    filename: string;
    content: string; // base64 encoded
    mimeType: string;
  }>;
}

/**
 * Send a new email via Gmail API
 */
export const sendEmail = async (
  companyId: string,
  params: SendEmailParams
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== sendEmail CALLED =====`);
  console.log(`📧 [Gmail Service] Company ID: ${companyId}`);
  console.log(`📧 [Gmail Service] To: ${params.to}`);
  console.log(`📧 [Gmail Service] Subject: ${params.subject}`);

  try {
    const gmail = await getGmailClient(companyId);

    // Build RFC 2822 formatted email
    const to = Array.isArray(params.to) ? params.to.join(', ') : params.to;
    const cc = params.cc ? (Array.isArray(params.cc) ? params.cc.join(', ') : params.cc) : '';
    const bcc = params.bcc ? (Array.isArray(params.bcc) ? params.bcc.join(', ') : params.bcc) : '';

    let email = [
      `To: ${to}`,
      cc ? `Cc: ${cc}` : '',
      bcc ? `Bcc: ${bcc}` : '',
      `Subject: ${params.subject}`,
      params.isHtml ? 'Content-Type: text/html; charset=utf-8' : 'Content-Type: text/plain; charset=utf-8',
      '',
      params.body
    ].filter(line => line !== '').join('\r\n');

    // Encode email in base64url format
    const encodedEmail = Buffer.from(email).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail,
      },
    });

    console.log(`✅ [Gmail Service] Email sent successfully, ID: ${response.data.id}`);
    return { success: true, messageId: response.data.id || undefined };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in sendEmail:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Reply to an email
 */
export const replyToEmail = async (
  companyId: string,
  emailId: string,
  body: string,
  isHtml: boolean = false
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== replyToEmail CALLED =====`);
  console.log(`📧 [Gmail Service] Email ID: ${emailId}`);

  try {
    const gmail = await getGmailClient(companyId);

    // Get original message to extract thread ID and headers
    const originalMsg = await gmail.users.messages.get({
      userId: 'me',
      id: emailId,
      format: 'full',
    });

    const headers = originalMsg.data.payload?.headers || [];
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const threadId = originalMsg.data.threadId;

    // Build reply email
    let email = [
      `To: ${from}`,
      `Subject: Re: ${subject.replace(/^Re: /, '')}`,
      `In-Reply-To: ${emailId}`,
      `References: ${emailId}`,
      isHtml ? 'Content-Type: text/html; charset=utf-8' : 'Content-Type: text/plain; charset=utf-8',
      '',
      body
    ].join('\r\n');

    const encodedEmail = Buffer.from(email).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail,
        threadId: threadId || undefined,
      },
    });

    console.log(`✅ [Gmail Service] Reply sent successfully, ID: ${response.data.id}`);
    return { success: true, messageId: response.data.id || undefined };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in replyToEmail:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Reply to all recipients of an email
 */
export const replyAllToEmail = async (
  companyId: string,
  emailId: string,
  body: string,
  isHtml: boolean = false
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== replyAllToEmail CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    const originalMsg = await gmail.users.messages.get({
      userId: 'me',
      id: emailId,
      format: 'full',
    });

    const headers = originalMsg.data.payload?.headers || [];
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const to = headers.find((h: any) => h.name === 'To')?.value || '';
    const cc = headers.find((h: any) => h.name === 'Cc')?.value || '';
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const threadId = originalMsg.data.threadId;

    let email = [
      `To: ${from}`,
      `Cc: ${[to, cc].filter(x => x).join(', ')}`,
      `Subject: Re: ${subject.replace(/^Re: /, '')}`,
      `In-Reply-To: ${emailId}`,
      `References: ${emailId}`,
      isHtml ? 'Content-Type: text/html; charset=utf-8' : 'Content-Type: text/plain; charset=utf-8',
      '',
      body
    ].join('\r\n');

    const encodedEmail = Buffer.from(email).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail,
        threadId: threadId || undefined,
      },
    });

    console.log(`✅ [Gmail Service] Reply all sent successfully, ID: ${response.data.id}`);
    return { success: true, messageId: response.data.id || undefined };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in replyAllToEmail:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Forward an email
 */
export const forwardEmail = async (
  companyId: string,
  emailId: string,
  to: string | string[],
  body: string,
  isHtml: boolean = false
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== forwardEmail CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    const originalMsg = await gmail.users.messages.get({
      userId: 'me',
      id: emailId,
      format: 'full',
    });

    const headers = originalMsg.data.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';

    const toStr = Array.isArray(to) ? to.join(', ') : to;

    let email = [
      `To: ${toStr}`,
      `Subject: Fwd: ${subject.replace(/^Fwd: /, '')}`,
      isHtml ? 'Content-Type: text/html; charset=utf-8' : 'Content-Type: text/plain; charset=utf-8',
      '',
      body
    ].join('\r\n');

    const encodedEmail = Buffer.from(email).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail,
      },
    });

    console.log(`✅ [Gmail Service] Forward sent successfully, ID: ${response.data.id}`);
    return { success: true, messageId: response.data.id || undefined };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in forwardEmail:`, error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// DRAFT MANAGEMENT FUNCTIONS
// ============================================================================

interface DraftData {
  to?: string | string[];
  subject?: string;
  body?: string;
  cc?: string | string[];
  bcc?: string | string[];
  isHtml?: boolean;
}

/**
 * Create a draft email
 */
export const createDraft = async (
  companyId: string,
  draftData: DraftData
): Promise<{ success: boolean; draftId?: string; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== createDraft CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    const to = draftData.to ? (Array.isArray(draftData.to) ? draftData.to.join(', ') : draftData.to) : '';
    const cc = draftData.cc ? (Array.isArray(draftData.cc) ? draftData.cc.join(', ') : draftData.cc) : '';
    const bcc = draftData.bcc ? (Array.isArray(draftData.bcc) ? draftData.bcc.join(', ') : draftData.bcc) : '';

    let email = [
      to ? `To: ${to}` : '',
      cc ? `Cc: ${cc}` : '',
      bcc ? `Bcc: ${bcc}` : '',
      draftData.subject ? `Subject: ${draftData.subject}` : '',
      draftData.isHtml ? 'Content-Type: text/html; charset=utf-8' : 'Content-Type: text/plain; charset=utf-8',
      '',
      draftData.body || ''
    ].filter(line => line !== '').join('\r\n');

    const encodedEmail = Buffer.from(email).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encodedEmail,
        },
      },
    });

    console.log(`✅ [Gmail Service] Draft created successfully, ID: ${response.data.id}`);
    return { success: true, draftId: response.data.id || undefined };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in createDraft:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Update an existing draft
 */
export const updateDraft = async (
  companyId: string,
  draftId: string,
  draftData: DraftData
): Promise<{ success: boolean; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== updateDraft CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    const to = draftData.to ? (Array.isArray(draftData.to) ? draftData.to.join(', ') : draftData.to) : '';
    const cc = draftData.cc ? (Array.isArray(draftData.cc) ? draftData.cc.join(', ') : draftData.cc) : '';
    const bcc = draftData.bcc ? (Array.isArray(draftData.bcc) ? draftData.bcc.join(', ') : draftData.bcc) : '';

    let email = [
      to ? `To: ${to}` : '',
      cc ? `Cc: ${cc}` : '',
      bcc ? `Bcc: ${bcc}` : '',
      draftData.subject ? `Subject: ${draftData.subject}` : '',
      draftData.isHtml ? 'Content-Type: text/html; charset=utf-8' : 'Content-Type: text/plain; charset=utf-8',
      '',
      draftData.body || ''
    ].filter(line => line !== '').join('\r\n');

    const encodedEmail = Buffer.from(email).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.drafts.update({
      userId: 'me',
      id: draftId,
      requestBody: {
        message: {
          raw: encodedEmail,
        },
      },
    });

    console.log(`✅ [Gmail Service] Draft updated successfully`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in updateDraft:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Send a draft email
 */
export const sendDraft = async (
  companyId: string,
  draftId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== sendDraft CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    const response = await gmail.users.drafts.send({
      userId: 'me',
      requestBody: {
        id: draftId,
      },
    });

    console.log(`✅ [Gmail Service] Draft sent successfully, ID: ${response.data.id}`);
    return { success: true, messageId: response.data.id || undefined };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in sendDraft:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Delete a draft email
 */
export const deleteDraft = async (
  companyId: string,
  draftId: string
): Promise<{ success: boolean; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== deleteDraft CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    await gmail.users.drafts.delete({
      userId: 'me',
      id: draftId,
    });

    console.log(`✅ [Gmail Service] Draft deleted successfully`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in deleteDraft:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * List all draft emails
 */
export const listDrafts = async (
  companyId: string,
  limit: number = 20
): Promise<{ success: boolean; drafts?: any[]; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== listDrafts CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    const response = await gmail.users.drafts.list({
      userId: 'me',
      maxResults: Math.min(limit, 50),
    });

    const drafts = response.data.drafts || [];
    console.log(`✅ [Gmail Service] Found ${drafts.length} drafts`);
    return { success: true, drafts };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in listDrafts:`, error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// EMAIL MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Mark email(s) as read
 */
export const markAsRead = async (
  companyId: string,
  emailIds: string[]
): Promise<{ success: boolean; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== markAsRead CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: emailIds,
        removeLabelIds: ['UNREAD'],
      },
    });

    console.log(`✅ [Gmail Service] Marked ${emailIds.length} emails as read`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in markAsRead:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Mark email(s) as unread
 */
export const markAsUnread = async (
  companyId: string,
  emailIds: string[]
): Promise<{ success: boolean; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== markAsUnread CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: emailIds,
        addLabelIds: ['UNREAD'],
      },
    });

    console.log(`✅ [Gmail Service] Marked ${emailIds.length} emails as unread`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in markAsUnread:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Archive email(s)
 */
export const archiveEmail = async (
  companyId: string,
  emailIds: string[]
): Promise<{ success: boolean; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== archiveEmail CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: emailIds,
        removeLabelIds: ['INBOX'],
      },
    });

    console.log(`✅ [Gmail Service] Archived ${emailIds.length} emails`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in archiveEmail:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Move email(s) to trash
 */
export const trashEmail = async (
  companyId: string,
  emailIds: string[]
): Promise<{ success: boolean; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== trashEmail CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    for (const emailId of emailIds) {
      await gmail.users.messages.trash({
        userId: 'me',
        id: emailId,
      });
    }

    console.log(`✅ [Gmail Service] Moved ${emailIds.length} emails to trash`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in trashEmail:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Permanently delete email(s)
 */
export const deleteEmail = async (
  companyId: string,
  emailIds: string[]
): Promise<{ success: boolean; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== deleteEmail CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    for (const emailId of emailIds) {
      await gmail.users.messages.delete({
        userId: 'me',
        id: emailId,
      });
    }

    console.log(`✅ [Gmail Service] Permanently deleted ${emailIds.length} emails`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in deleteEmail:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Star/unstar email(s)
 */
export const starEmail = async (
  companyId: string,
  emailIds: string[],
  star: boolean = true
): Promise<{ success: boolean; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== starEmail CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: emailIds,
        ...(star
          ? { addLabelIds: ['STARRED'] }
          : { removeLabelIds: ['STARRED'] }),
      },
    });

    console.log(`✅ [Gmail Service] ${star ? 'Starred' : 'Unstarred'} ${emailIds.length} emails`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in starEmail:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Move email(s) to folder/label
 */
export const moveToFolder = async (
  companyId: string,
  emailIds: string[],
  labelId: string
): Promise<{ success: boolean; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== moveToFolder CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: emailIds,
        addLabelIds: [labelId],
      },
    });

    console.log(`✅ [Gmail Service] Moved ${emailIds.length} emails to folder ${labelId}`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in moveToFolder:`, error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// LABELS & ORGANIZATION FUNCTIONS
// ============================================================================

/**
 * List all labels
 */
export const listLabels = async (
  companyId: string
): Promise<{ success: boolean; labels?: any[]; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== listLabels CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    const response = await gmail.users.labels.list({
      userId: 'me',
    });

    const labels = response.data.labels || [];
    console.log(`✅ [Gmail Service] Found ${labels.length} labels`);
    return { success: true, labels };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in listLabels:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Create a new label
 */
export const createLabel = async (
  companyId: string,
  labelName: string,
  labelListVisibility: string = 'labelShow',
  messageListVisibility: string = 'show'
): Promise<{ success: boolean; labelId?: string; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== createLabel CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    const response = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: labelName,
        labelListVisibility,
        messageListVisibility,
      },
    });

    console.log(`✅ [Gmail Service] Label created successfully, ID: ${response.data.id}`);
    return { success: true, labelId: response.data.id || undefined };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in createLabel:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Delete a label
 */
export const deleteLabel = async (
  companyId: string,
  labelId: string
): Promise<{ success: boolean; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== deleteLabel CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    await gmail.users.labels.delete({
      userId: 'me',
      id: labelId,
    });

    console.log(`✅ [Gmail Service] Label deleted successfully`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in deleteLabel:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Apply label to email(s)
 */
export const applyLabel = async (
  companyId: string,
  emailIds: string[],
  labelId: string
): Promise<{ success: boolean; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== applyLabel CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: emailIds,
        addLabelIds: [labelId],
      },
    });

    console.log(`✅ [Gmail Service] Applied label to ${emailIds.length} emails`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in applyLabel:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Remove label from email(s)
 */
export const removeLabel = async (
  companyId: string,
  emailIds: string[],
  labelId: string
): Promise<{ success: boolean; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== removeLabel CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: emailIds,
        removeLabelIds: [labelId],
      },
    });

    console.log(`✅ [Gmail Service] Removed label from ${emailIds.length} emails`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in removeLabel:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Update label properties
 */
export const updateLabel = async (
  companyId: string,
  labelId: string,
  updates: {
    name?: string;
    labelListVisibility?: string;
    messageListVisibility?: string;
  }
): Promise<{ success: boolean; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== updateLabel CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    await gmail.users.labels.update({
      userId: 'me',
      id: labelId,
      requestBody: updates,
    });

    console.log(`✅ [Gmail Service] Label updated successfully`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in updateLabel:`, error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// ADVANCED SEARCH, ATTACHMENTS & BATCH OPERATIONS
// ============================================================================

/**
 * Get email thread/conversation
 */
export const getEmailThread = async (
  companyId: string,
  threadId: string
): Promise<{ success: boolean; thread?: any; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== getEmailThread CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    const response = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full',
    });

    console.log(`✅ [Gmail Service] Thread fetched successfully`);
    return { success: true, thread: response.data };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in getEmailThread:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Download attachment by ID
 */
export const downloadAttachment = async (
  companyId: string,
  messageId: string,
  attachmentId: string
): Promise<{ success: boolean; data?: string; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== downloadAttachment CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });

    console.log(`✅ [Gmail Service] Attachment downloaded successfully`);
    return { success: true, data: response.data.data || undefined };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in downloadAttachment:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Batch modify emails (add/remove labels)
 */
export const batchModifyEmails = async (
  companyId: string,
  emailIds: string[],
  addLabelIds?: string[],
  removeLabelIds?: string[]
): Promise<{ success: boolean; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== batchModifyEmails CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    await gmail.users.messages.batchModify({
      userId: 'me',
      requestBody: {
        ids: emailIds,
        addLabelIds: addLabelIds || [],
        removeLabelIds: removeLabelIds || [],
      },
    });

    console.log(`✅ [Gmail Service] Batch modified ${emailIds.length} emails`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in batchModifyEmails:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Batch delete emails
 */
export const batchDeleteEmails = async (
  companyId: string,
  emailIds: string[]
): Promise<{ success: boolean; error?: string }> => {
  console.log(`\n📧 [Gmail Service] ===== batchDeleteEmails CALLED =====`);

  try {
    const gmail = await getGmailClient(companyId);

    await gmail.users.messages.batchDelete({
      userId: 'me',
      requestBody: {
        ids: emailIds,
      },
    });

    console.log(`✅ [Gmail Service] Batch deleted ${emailIds.length} emails`);
    return { success: true };
  } catch (error: any) {
    console.error(`❌ [Gmail Service] Error in batchDeleteEmails:`, error);
    return { success: false, error: error.message };
  }
};
