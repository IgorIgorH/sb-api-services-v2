import { ActionContext, FunctionFactory } from '../../integrations/actions/types';
import {
  fetchInbox,
  readEmail,
  searchEmails,
  sendEmail,
  replyToEmail,
  replyAllToEmail,
  forwardEmail,
  createDraft,
  updateDraft,
  sendDraft,
  deleteDraft,
  listDrafts,
  markAsRead,
  markAsUnread,
  archiveEmail,
  trashEmail,
  deleteEmail,
  starEmail,
  moveToFolder,
  listLabels,
  createLabel,
  deleteLabel,
  applyLabel,
  removeLabel,
  updateLabel,
  getEmailThread,
  downloadAttachment,
  batchModifyEmails,
  batchDeleteEmails,
} from './gmail.service';

interface GetInboxArgs {
  limit?: number;
}

interface ReadEmailArgs {
  emailId: string;
}

interface SearchEmailsArgs {
  searchQuery: string;
  limit?: number;
}

export const createGmailActions = (context: ActionContext): FunctionFactory => ({
  getInbox: {
    description: 'Fetch recent emails from Gmail inbox. Returns a list of emails with ID, sender, subject, date, preview, and attachment info.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of emails to fetch (default: 20, max: 50)',
        },
      },
      required: [],
      additionalProperties: false,
    },
    function: async (args: GetInboxArgs) => {
      console.log(`📧 [Gmail Actions] getInbox called with args:`, args);

      const limit = args.limit && args.limit > 0 && args.limit <= 50 ? args.limit : 20;

      try {
        const result = await fetchInbox(context.companyId, limit);

        if (!result.success) {
          console.error('getInbox: Error fetching inbox', result.error);
          return {
            success: false,
            error: result.error || 'An error occurred while fetching emails from Gmail inbox.',
          };
        }

        console.log(`✅ [Gmail Actions] getInbox: Fetched ${result.emails?.length || 0} emails`);

        return {
          success: true,
          data: {
            count: result.emails?.length || 0,
            emails: result.emails || [],
            message: `Successfully fetched ${result.emails?.length || 0} emails from Gmail inbox.`,
          }
        };
      } catch (error: any) {
        console.error('getInbox: Unexpected error', error);
        return {
          success: false,
          error: error.message || 'An unexpected error occurred while fetching emails.',
        };
      }
    },
  },

  readEmail: {
    description: 'Read a specific Gmail email by its ID. Returns full email details including from, to, subject, date, body (text and HTML), and attachments.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        emailId: {
          type: 'string',
          description: 'The ID of the email to read (from getInbox results)',
        },
      },
      required: ['emailId'],
      additionalProperties: false,
    },
    function: async (args: ReadEmailArgs) => {
      console.log(`📧 [Gmail Actions] readEmail called with args:`, args);

      const { emailId } = args;

      // Validate emailId
      if (typeof emailId !== 'string' || emailId.trim().length === 0) {
        console.error('readEmail: Invalid emailId', emailId);
        return {
          success: false,
          error: 'The email ID must be a non-empty string.',
        };
      }

      try {
        const result = await readEmail(context.companyId, emailId);

        if (!result.success) {
          console.error('readEmail: Error reading email', result.error);
          return {
            success: false,
            error: result.error || 'An error occurred while reading the email.',
          };
        }

        console.log(`✅ [Gmail Actions] readEmail: Successfully read email ${emailId}`);

        return {
          success: true,
          data: {
            email: result.email,
            message: `Successfully read email with ID ${emailId}.`,
          }
        };
      } catch (error: any) {
        console.error('readEmail: Unexpected error', error);
        return {
          success: false,
          error: error.message || 'An unexpected error occurred while reading the email.',
        };
      }
    },
  },

  searchEmails: {
    description: 'Search for Gmail emails matching a query string. Searches in email subjects. Returns matching emails with ID, sender, subject, date, preview, and attachment info.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        searchQuery: {
          type: 'string',
          description: 'The search query to match against email subjects',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of emails to return (default: 20, max: 50)',
        },
      },
      required: ['searchQuery'],
      additionalProperties: false,
    },
    function: async (args: SearchEmailsArgs) => {
      console.log(`📧 [Gmail Actions] searchEmails called with args:`, args);

      const { searchQuery } = args;
      const limit = args.limit && args.limit > 0 && args.limit <= 50 ? args.limit : 20;

      // Validate searchQuery
      if (typeof searchQuery !== 'string' || searchQuery.trim().length === 0) {
        console.error('searchEmails: Invalid searchQuery', searchQuery);
        return {
          success: false,
          error: 'The search query must be a non-empty string.',
        };
      }

      try {
        const result = await searchEmails(context.companyId, searchQuery.trim(), limit);

        if (!result.success) {
          console.error('searchEmails: Error searching emails', result.error);
          return {
          success: false,
          error: result.error || 'An error occurred while searching emails.',
        };
        }

        console.log(`✅ [Gmail Actions] searchEmails: Found ${result.emails?.length || 0} matching emails`);

        return {
          success: true,
          data: {
            count: result.emails?.length || 0,
            emails: result.emails || [],
            message: `Found ${result.emails?.length || 0} emails matching "${searchQuery}".`,
          }
        };
      } catch (error: any) {
        console.error('searchEmails: Unexpected error', error);
        return {
          success: false,
          error: error.message || 'An unexpected error occurred while searching emails.',
        };
      }
    },
  },

  // ============================================================================
  // SENDING & COMPOSING ACTIONS
  // ============================================================================

  sendEmail: {
    description: 'Send a new email via Gmail. Supports HTML content, CC, BCC, and multiple recipients.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address(es), comma-separated for multiple recipients',
        },
        subject: {
          type: 'string',
          description: 'Email subject line',
        },
        body: {
          type: 'string',
          description: 'Email body content (plain text or HTML)',
        },
        cc: {
          type: 'string',
          description: 'CC recipients, comma-separated (optional)',
        },
        bcc: {
          type: 'string',
          description: 'BCC recipients, comma-separated (optional)',
        },
        isHtml: {
          type: 'boolean',
          description: 'Whether the body is HTML formatted (default: false)',
        },
      },
      required: ['to', 'subject', 'body'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      console.log(`📧 [Gmail Actions] sendEmail called`);

      try {
        const result = await sendEmail(context.companyId, {
          to: args.to.includes(',') ? args.to.split(',').map((e: string) => e.trim()) : args.to,
          subject: args.subject,
          body: args.body,
          cc: args.cc ? (args.cc.includes(',') ? args.cc.split(',').map((e: string) => e.trim()) : args.cc) : undefined,
          bcc: args.bcc ? (args.bcc.includes(',') ? args.bcc.split(',').map((e: string) => e.trim()) : args.bcc) : undefined,
          isHtml: args.isHtml || false,
        });

        if (!result.success) {
          return {
          success: false,
          error: result.error || 'An error occurred while sending the email.',
        };
        }

        return {
          success: true,
          messageId: result.messageId,
          message: `Email sent successfully to ${args.to}.`,
        };
      } catch (error: any) {
        console.error('sendEmail: Unexpected error', error);
        return {
          error: 'Failed to send email',
          message: error.message,
        };
      }
    },
  },

  replyToEmail: {
    description: 'Reply to a specific email by its ID.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        emailId: {
          type: 'string',
          description: 'The ID of the email to reply to',
        },
        body: {
          type: 'string',
          description: 'Reply message body',
        },
        isHtml: {
          type: 'boolean',
          description: 'Whether the body is HTML formatted (default: false)',
        },
      },
      required: ['emailId', 'body'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await replyToEmail(context.companyId, args.emailId, args.body, args.isHtml || false);

        if (!result.success) {
          return {
          success: false,
          error: result.error || 'An error occurred while sending the reply.',
        };
        }

        return {
          success: true,
          data: {
            messageId: result.messageId,
          message: `Reply sent successfully.`,
          }
        };
      } catch (error: any) {
        return {
          error: 'Failed to send reply',
          message: error.message,
        };
      }
    },
  },

  replyAllToEmail: {
    description: 'Reply to all recipients of an email.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        emailId: {
          type: 'string',
          description: 'The ID of the email to reply to',
        },
        body: {
          type: 'string',
          description: 'Reply message body',
        },
        isHtml: {
          type: 'boolean',
          description: 'Whether the body is HTML formatted (default: false)',
        },
      },
      required: ['emailId', 'body'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await replyAllToEmail(context.companyId, args.emailId, args.body, args.isHtml || false);

        if (!result.success) {
          return {
            error: 'Failed to send reply all',
            message: result.error,
          };
        }

        return {
          success: true,
          data: {
            messageId: result.messageId,
          message: `Reply all sent successfully.`,
          }
        };
      } catch (error: any) {
        return {
          error: 'Failed to send reply all',
          message: error.message,
        };
      }
    },
  },

  forwardEmail: {
    description: 'Forward an email to recipient(s).',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        emailId: {
          type: 'string',
          description: 'The ID of the email to forward',
        },
        to: {
          type: 'string',
          description: 'Recipient email address(es), comma-separated',
        },
        body: {
          type: 'string',
          description: 'Forward message (appears before original email)',
        },
        isHtml: {
          type: 'boolean',
          description: 'Whether the body is HTML formatted (default: false)',
        },
      },
      required: ['emailId', 'to', 'body'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const toAddresses = args.to.includes(',') ? args.to.split(',').map((e: string) => e.trim()) : args.to;
        const result = await forwardEmail(context.companyId, args.emailId, toAddresses, args.body, args.isHtml || false);

        if (!result.success) {
          return {
            error: 'Failed to forward email',
            message: result.error,
          };
        }

        return {
          success: true,
          messageId: result.messageId,
          message: `Email forwarded successfully to ${args.to}.`,
        };
      } catch (error: any) {
        return {
          error: 'Failed to forward email',
          message: error.message,
        };
      }
    },
  },

  // ============================================================================
  // DRAFT MANAGEMENT ACTIONS
  // ============================================================================

  createDraft: {
    description: 'Create a draft email.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address(es), comma-separated (optional)',
        },
        subject: {
          type: 'string',
          description: 'Email subject line (optional)',
        },
        body: {
          type: 'string',
          description: 'Email body content (optional)',
        },
        cc: {
          type: 'string',
          description: 'CC recipients, comma-separated (optional)',
        },
        bcc: {
          type: 'string',
          description: 'BCC recipients, comma-separated (optional)',
        },
        isHtml: {
          type: 'boolean',
          description: 'Whether the body is HTML formatted (default: false)',
        },
      },
      required: [],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await createDraft(context.companyId, {
          to: args.to ? (args.to.includes(',') ? args.to.split(',').map((e: string) => e.trim()) : args.to) : undefined,
          subject: args.subject,
          body: args.body,
          cc: args.cc ? (args.cc.includes(',') ? args.cc.split(',').map((e: string) => e.trim()) : args.cc) : undefined,
          bcc: args.bcc ? (args.bcc.includes(',') ? args.bcc.split(',').map((e: string) => e.trim()) : args.bcc) : undefined,
          isHtml: args.isHtml || false,
        });

        if (!result.success) {
          return {
            error: 'Failed to create draft',
            message: result.error,
          };
        }

        return {
          success: true,
          data: {
            draftId: result.draftId,
          message: `Draft created successfully.`,
          }
        };
      } catch (error: any) {
        return {
          error: 'Failed to create draft',
          message: error.message,
        };
      }
    },
  },

  updateDraft: {
    description: 'Update an existing draft email.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        draftId: {
          type: 'string',
          description: 'The ID of the draft to update',
        },
        to: {
          type: 'string',
          description: 'Recipient email address(es) (optional)',
        },
        subject: {
          type: 'string',
          description: 'Email subject line (optional)',
        },
        body: {
          type: 'string',
          description: 'Email body content (optional)',
        },
        cc: {
          type: 'string',
          description: 'CC recipients (optional)',
        },
        bcc: {
          type: 'string',
          description: 'BCC recipients (optional)',
        },
        isHtml: {
          type: 'boolean',
          description: 'Whether the body is HTML formatted',
        },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await updateDraft(context.companyId, args.draftId, {
          to: args.to,
          subject: args.subject,
          body: args.body,
          cc: args.cc,
          bcc: args.bcc,
          isHtml: args.isHtml,
        });

        if (!result.success) {
          return {
            error: 'Failed to update draft',
            message: result.error,
          };
        }

        return {
          success: true,
          data: {
            message: `Draft updated successfully.`,
          }
        };
      } catch (error: any) {
        return {
          error: 'Failed to update draft',
          message: error.message,
        };
      }
    },
  },

  sendDraft: {
    description: 'Send a draft email by its ID.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        draftId: {
          type: 'string',
          description: 'The ID of the draft to send',
        },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await sendDraft(context.companyId, args.draftId);

        if (!result.success) {
          return {
            error: 'Failed to send draft',
            message: result.error,
          };
        }

        return {
          success: true,
          data: {
            messageId: result.messageId,
          message: `Draft sent successfully.`,
          }
        };
      } catch (error: any) {
        return {
          error: 'Failed to send draft',
          message: error.message,
        };
      }
    },
  },

  deleteDraft: {
    description: 'Delete a draft email by its ID.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        draftId: {
          type: 'string',
          description: 'The ID of the draft to delete',
        },
      },
      required: ['draftId'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await deleteDraft(context.companyId, args.draftId);

        if (!result.success) {
          return {
            error: 'Failed to delete draft',
            message: result.error,
          };
        }

        return {
          success: true,
          data: {
            message: `Draft deleted successfully.`,
          }
        };
      } catch (error: any) {
        return {
          error: 'Failed to delete draft',
          message: error.message,
        };
      }
    },
  },

  listDrafts: {
    description: 'List all draft emails.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of drafts to return (default: 20, max: 50)',
        },
      },
      required: [],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const limit = args.limit && args.limit > 0 && args.limit <= 50 ? args.limit : 20;
        const result = await listDrafts(context.companyId, limit);

        if (!result.success) {
          return {
            error: 'Failed to list drafts',
            message: result.error,
          };
        }

        return {
          success: true,
          count: result.drafts?.length || 0,
          drafts: result.drafts || [],
          message: `Found ${result.drafts?.length || 0} drafts.`,
        };
      } catch (error: any) {
        return {
          error: 'Failed to list drafts',
          message: error.message,
        };
      }
    },
  },

  // ============================================================================
  // EMAIL MANAGEMENT ACTIONS
  // ============================================================================

  markAsRead: {
    description: 'Mark one or more emails as read.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        emailIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of email IDs to mark as read',
        },
      },
      required: ['emailIds'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await markAsRead(context.companyId, args.emailIds);

        if (!result.success) {
          return {
            error: 'Failed to mark emails as read',
            message: result.error,
          };
        }

        return {
          success: true,
          message: `Marked ${args.emailIds.length} email(s) as read.`,
        };
      } catch (error: any) {
        return {
          error: 'Failed to mark emails as read',
          message: error.message,
        };
      }
    },
  },

  markAsUnread: {
    description: 'Mark one or more emails as unread.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        emailIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of email IDs to mark as unread',
        },
      },
      required: ['emailIds'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await markAsUnread(context.companyId, args.emailIds);

        if (!result.success) {
          return {
            error: 'Failed to mark emails as unread',
            message: result.error,
          };
        }

        return {
          success: true,
          message: `Marked ${args.emailIds.length} email(s) as unread.`,
        };
      } catch (error: any) {
        return {
          error: 'Failed to mark emails as unread',
          message: error.message,
        };
      }
    },
  },

  archiveEmail: {
    description: 'Archive one or more emails (removes from inbox but keeps in All Mail).',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        emailIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of email IDs to archive',
        },
      },
      required: ['emailIds'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await archiveEmail(context.companyId, args.emailIds);

        if (!result.success) {
          return {
            error: 'Failed to archive emails',
            message: result.error,
          };
        }

        return {
          success: true,
          message: `Archived ${args.emailIds.length} email(s).`,
        };
      } catch (error: any) {
        return {
          error: 'Failed to archive emails',
          message: error.message,
        };
      }
    },
  },

  trashEmail: {
    description: 'Move one or more emails to trash.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        emailIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of email IDs to move to trash',
        },
      },
      required: ['emailIds'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await trashEmail(context.companyId, args.emailIds);

        if (!result.success) {
          return {
            error: 'Failed to trash emails',
            message: result.error,
          };
        }

        return {
          success: true,
          message: `Moved ${args.emailIds.length} email(s) to trash.`,
        };
      } catch (error: any) {
        return {
          error: 'Failed to trash emails',
          message: error.message,
        };
      }
    },
  },

  deleteEmail: {
    description: 'Permanently delete one or more emails.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        emailIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of email IDs to permanently delete',
        },
      },
      required: ['emailIds'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await deleteEmail(context.companyId, args.emailIds);

        if (!result.success) {
          return {
            error: 'Failed to delete emails',
            message: result.error,
          };
        }

        return {
          success: true,
          message: `Permanently deleted ${args.emailIds.length} email(s).`,
        };
      } catch (error: any) {
        return {
          error: 'Failed to delete emails',
          message: error.message,
        };
      }
    },
  },

  starEmail: {
    description: 'Star or unstar one or more emails.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        emailIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of email IDs to star/unstar',
        },
        star: {
          type: 'boolean',
          description: 'True to star, false to unstar (default: true)',
        },
      },
      required: ['emailIds'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const star = args.star !== undefined ? args.star : true;
        const result = await starEmail(context.companyId, args.emailIds, star);

        if (!result.success) {
          return {
            error: `Failed to ${star ? 'star' : 'unstar'} emails`,
            message: result.error,
          };
        }

        return {
          success: true,
          message: `${star ? 'Starred' : 'Unstarred'} ${args.emailIds.length} email(s).`,
        };
      } catch (error: any) {
        return {
          error: 'Failed to star/unstar emails',
          message: error.message,
        };
      }
    },
  },

  moveToFolder: {
    description: 'Move one or more emails to a folder/label.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        emailIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of email IDs to move',
        },
        labelId: {
          type: 'string',
          description: 'The label/folder ID to move emails to',
        },
      },
      required: ['emailIds', 'labelId'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await moveToFolder(context.companyId, args.emailIds, args.labelId);

        if (!result.success) {
          return {
            error: 'Failed to move emails',
            message: result.error,
          };
        }

        return {
          success: true,
          message: `Moved ${args.emailIds.length} email(s) to folder.`,
        };
      } catch (error: any) {
        return {
          error: 'Failed to move emails',
          message: error.message,
        };
      }
    },
  },

  // ============================================================================
  // LABEL MANAGEMENT ACTIONS
  // ============================================================================

  listLabels: {
    description: 'List all Gmail labels/folders.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    function: async () => {
      try {
        const result = await listLabels(context.companyId);

        if (!result.success) {
          return {
            error: 'Failed to list labels',
            message: result.error,
          };
        }

        return {
          success: true,
          count: result.labels?.length || 0,
          labels: result.labels || [],
          message: `Found ${result.labels?.length || 0} labels.`,
        };
      } catch (error: any) {
        return {
          error: 'Failed to list labels',
          message: error.message,
        };
      }
    },
  },

  createLabel: {
    description: 'Create a new Gmail label/folder.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        labelName: {
          type: 'string',
          description: 'Name of the new label',
        },
      },
      required: ['labelName'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await createLabel(context.companyId, args.labelName);

        if (!result.success) {
          return {
            error: 'Failed to create label',
            message: result.error,
          };
        }

        return {
          success: true,
          labelId: result.labelId,
          message: `Label "${args.labelName}" created successfully.`,
        };
      } catch (error: any) {
        return {
          error: 'Failed to create label',
          message: error.message,
        };
      }
    },
  },

  deleteLabel: {
    description: 'Delete a Gmail label/folder by its ID.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        labelId: {
          type: 'string',
          description: 'The ID of the label to delete',
        },
      },
      required: ['labelId'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await deleteLabel(context.companyId, args.labelId);

        if (!result.success) {
          return {
            error: 'Failed to delete label',
            message: result.error,
          };
        }

        return {
          success: true,
          data: {
            message: `Label deleted successfully.`,
          }
        };
      } catch (error: any) {
        return {
          error: 'Failed to delete label',
          message: error.message,
        };
      }
    },
  },

  applyLabel: {
    description: 'Apply a label to one or more emails.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        emailIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of email IDs',
        },
        labelId: {
          type: 'string',
          description: 'The label ID to apply',
        },
      },
      required: ['emailIds', 'labelId'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await applyLabel(context.companyId, args.emailIds, args.labelId);

        if (!result.success) {
          return {
            error: 'Failed to apply label',
            message: result.error,
          };
        }

        return {
          success: true,
          message: `Applied label to ${args.emailIds.length} email(s).`,
        };
      } catch (error: any) {
        return {
          error: 'Failed to apply label',
          message: error.message,
        };
      }
    },
  },

  removeLabel: {
    description: 'Remove a label from one or more emails.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        emailIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of email IDs',
        },
        labelId: {
          type: 'string',
          description: 'The label ID to remove',
        },
      },
      required: ['emailIds', 'labelId'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await removeLabel(context.companyId, args.emailIds, args.labelId);

        if (!result.success) {
          return {
            error: 'Failed to remove label',
            message: result.error,
          };
        }

        return {
          success: true,
          message: `Removed label from ${args.emailIds.length} email(s).`,
        };
      } catch (error: any) {
        return {
          error: 'Failed to remove label',
          message: error.message,
        };
      }
    },
  },

  updateLabel: {
    description: 'Update properties of an existing label.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        labelId: {
          type: 'string',
          description: 'The ID of the label to update',
        },
        name: {
          type: 'string',
          description: 'New name for the label (optional)',
        },
      },
      required: ['labelId'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const updates: any = {};
        if (args.name) updates.name = args.name;

        const result = await updateLabel(context.companyId, args.labelId, updates);

        if (!result.success) {
          return {
            error: 'Failed to update label',
            message: result.error,
          };
        }

        return {
          success: true,
          data: {
            message: `Label updated successfully.`,
          }
        };
      } catch (error: any) {
        return {
          error: 'Failed to update label',
          message: error.message,
        };
      }
    },
  },

  // ============================================================================
  // ADVANCED OPERATIONS
  // ============================================================================

  getEmailThread: {
    description: 'Get an entire email thread/conversation by thread ID.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'The thread ID',
        },
      },
      required: ['threadId'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await getEmailThread(context.companyId, args.threadId);

        if (!result.success) {
          return {
            error: 'Failed to get email thread',
            message: result.error,
          };
        }

        return {
          success: true,
          data: {
            thread: result.thread,
          message: `Thread retrieved successfully.`,
          }
        };
      } catch (error: any) {
        return {
          error: 'Failed to get email thread',
          message: error.message,
        };
      }
    },
  },

  downloadAttachment: {
    description: 'Download an email attachment by message ID and attachment ID.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        messageId: {
          type: 'string',
          description: 'The email message ID',
        },
        attachmentId: {
          type: 'string',
          description: 'The attachment ID',
        },
      },
      required: ['messageId', 'attachmentId'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await downloadAttachment(context.companyId, args.messageId, args.attachmentId);

        if (!result.success) {
          return {
            error: 'Failed to download attachment',
            message: result.error,
          };
        }

        return {
          success: true,
          data: result.data,
          message: `Attachment downloaded successfully (base64 encoded).`,
        };
      } catch (error: any) {
        return {
          error: 'Failed to download attachment',
          message: error.message,
        };
      }
    },
  },

  batchModifyEmails: {
    description: 'Batch modify multiple emails by adding/removing labels.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        emailIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of email IDs to modify',
        },
        addLabelIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Label IDs to add (optional)',
        },
        removeLabelIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Label IDs to remove (optional)',
        },
      },
      required: ['emailIds'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await batchModifyEmails(context.companyId, args.emailIds, args.addLabelIds, args.removeLabelIds);

        if (!result.success) {
          return {
            error: 'Failed to batch modify emails',
            message: result.error,
          };
        }

        return {
          success: true,
          message: `Batch modified ${args.emailIds.length} email(s).`,
        };
      } catch (error: any) {
        return {
          error: 'Failed to batch modify emails',
          message: error.message,
        };
      }
    },
  },

  batchDeleteEmails: {
    description: 'Batch delete multiple emails permanently.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        emailIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of email IDs to delete',
        },
      },
      required: ['emailIds'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      try {
        const result = await batchDeleteEmails(context.companyId, args.emailIds);

        if (!result.success) {
          return {
            error: 'Failed to batch delete emails',
            message: result.error,
          };
        }

        return {
          success: true,
          message: `Batch deleted ${args.emailIds.length} email(s).`,
        };
      } catch (error: any) {
        return {
          error: 'Failed to batch delete emails',
          message: error.message,
        };
      }
    },
  },
});
