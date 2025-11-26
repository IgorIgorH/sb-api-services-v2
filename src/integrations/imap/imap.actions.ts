import { ActionContext, FunctionFactory } from '../../integrations/actions/types';
import { fetchInbox, readEmail, searchEmails } from './imap.service';

interface GetInboxArgs {
  limit?: number;
}

interface ReadEmailArgs {
  emailId: number;
}

interface SearchEmailsArgs {
  searchQuery: string;
  limit?: number;
}

export const createImapActions = (context: ActionContext): FunctionFactory => ({
  getInbox: {
    description: 'Fetch recent emails from the inbox. Returns a list of emails with ID, sender, subject, date, preview, and attachment info.',
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
      console.log(`📧 [IMAP Actions] getInbox called with args:`, args);

      const limit = args.limit && args.limit > 0 && args.limit <= 50 ? args.limit : 20;

      try {
        const result = await fetchInbox(context.companyId, limit);

        if (!result.success) {
          console.error('getInbox: Error fetching inbox', result.error);
          return {
            error: 'Failed to fetch inbox',
            message: result.error || 'An error occurred while fetching emails from the inbox.',
          };
        }

        console.log(`✅ [IMAP Actions] getInbox: Fetched ${result.emails?.length || 0} emails`);

        return {
          success: true,
          count: result.emails?.length || 0,
          emails: result.emails || [],
          message: `Successfully fetched ${result.emails?.length || 0} emails from inbox.`,
        };
      } catch (error: any) {
        console.error('getInbox: Unexpected error', error);
        return {
          error: 'Failed to fetch inbox',
          message: error.message || 'An unexpected error occurred while fetching emails.',
        };
      }
    },
  },

  readEmail: {
    description: 'Read a specific email by its ID. Returns full email details including from, to, subject, date, body (text and HTML), and attachments.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        emailId: {
          type: 'number',
          description: 'The ID of the email to read (from getInbox results)',
        },
      },
      required: ['emailId'],
      additionalProperties: false,
    },
    function: async (args: ReadEmailArgs) => {
      console.log(`📧 [IMAP Actions] readEmail called with args:`, args);

      const { emailId } = args;

      // Validate emailId
      if (!Number.isInteger(emailId) || emailId <= 0) {
        console.error('readEmail: Invalid emailId', emailId);
        return {
          error: 'Invalid email ID',
          message: 'The email ID must be a positive integer.',
        };
      }

      try {
        const result = await readEmail(context.companyId, emailId);

        if (!result.success) {
          console.error('readEmail: Error reading email', result.error);
          return {
            error: 'Failed to read email',
            message: result.error || 'An error occurred while reading the email.',
          };
        }

        console.log(`✅ [IMAP Actions] readEmail: Successfully read email ${emailId}`);

        return {
          success: true,
          email: result.email,
          message: `Successfully read email with ID ${emailId}.`,
        };
      } catch (error: any) {
        console.error('readEmail: Unexpected error', error);
        return {
          error: 'Failed to read email',
          message: error.message || 'An unexpected error occurred while reading the email.',
        };
      }
    },
  },

  searchEmails: {
    description: 'Search for emails matching a query string. Searches in email subjects. Returns matching emails with ID, sender, subject, date, preview, and attachment info.',
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
      console.log(`📧 [IMAP Actions] searchEmails called with args:`, args);

      const { searchQuery } = args;
      const limit = args.limit && args.limit > 0 && args.limit <= 50 ? args.limit : 20;

      // Validate searchQuery
      if (typeof searchQuery !== 'string' || searchQuery.trim().length === 0) {
        console.error('searchEmails: Invalid searchQuery', searchQuery);
        return {
          error: 'Invalid search query',
          message: 'The search query must be a non-empty string.',
        };
      }

      try {
        const result = await searchEmails(context.companyId, searchQuery.trim(), limit);

        if (!result.success) {
          console.error('searchEmails: Error searching emails', result.error);
          return {
            error: 'Failed to search emails',
            message: result.error || 'An error occurred while searching emails.',
          };
        }

        console.log(`✅ [IMAP Actions] searchEmails: Found ${result.emails?.length || 0} matching emails`);

        return {
          success: true,
          count: result.emails?.length || 0,
          emails: result.emails || [],
          message: `Found ${result.emails?.length || 0} emails matching "${searchQuery}".`,
        };
      } catch (error: any) {
        console.error('searchEmails: Unexpected error', error);
        return {
          error: 'Failed to search emails',
          message: error.message || 'An unexpected error occurred while searching emails.',
        };
      }
    },
  },
});
