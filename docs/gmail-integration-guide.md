# Gmail Integration Guide

## Overview

The Gmail integration enables AI agents to interact with Gmail accounts through the full Gmail API v1. This integration provides comprehensive email management capabilities including reading, sending, organizing, searching, and managing emails, labels, drafts, and attachments.

## Features

### Core Capabilities
- **Email Management**: Read, send, reply, forward, archive, delete emails
- **Search & Filter**: Advanced Gmail search with full query syntax support
- **Label Management**: Create, delete, apply, and remove labels
- **Draft Management**: Create, update, send, and delete drafts
- **Thread Support**: Access complete email threads/conversations
- **Attachments**: Download and handle email attachments
- **Batch Operations**: Perform operations on multiple emails at once
- **Internationalization**: Full support for English and Hebrew

### Available Actions (32 total)

#### Reading & Searching
- `getInbox` - Fetch recent emails from inbox
- `readEmail` - Read full email content by ID
- `searchEmails` - Search emails with Gmail query syntax
- `getEmailThread` - Get complete email thread/conversation

#### Sending & Composing
- `sendEmail` - Send new email (HTML/plain text, CC, BCC)
- `replyToEmail` - Reply to an email
- `replyAllToEmail` - Reply to all recipients
- `forwardEmail` - Forward an email

#### Draft Management
- `createDraft` - Create a new draft
- `updateDraft` - Update existing draft
- `sendDraft` - Send a draft email
- `deleteDraft` - Delete a draft
- `listDrafts` - List all drafts

#### Email Management
- `markAsRead` - Mark email as read
- `markAsUnread` - Mark email as unread
- `archiveEmail` - Archive an email
- `trashEmail` - Move email to trash
- `deleteEmail` - Permanently delete email
- `starEmail` - Star/unstar an email
- `moveToFolder` - Move email to a label/folder

#### Label Management
- `listLabels` - List all labels
- `createLabel` - Create a new label
- `deleteLabel` - Delete a label
- `applyLabel` - Apply label to email(s)
- `removeLabel` - Remove label from email(s)
- `updateLabel` - Update label properties

#### Advanced Operations
- `downloadAttachment` - Download email attachment
- `batchModifyEmails` - Batch modify multiple emails (add/remove labels, mark read/unread)
- `batchDeleteEmails` - Batch delete multiple emails

## Setup

### Prerequisites

1. **Google Cloud Project**
   - Create a project at https://console.cloud.google.com
   - Enable Gmail API
   - Create OAuth 2.0 credentials (Web application type)
   - Add authorized redirect URIs (e.g., `http://localhost:3000/auth/callback`)

2. **Required Scopes**
   ```
   https://www.googleapis.com/auth/gmail.readonly
   https://www.googleapis.com/auth/gmail.send
   https://www.googleapis.com/auth/gmail.modify
   https://www.googleapis.com/auth/gmail.compose
   https://www.googleapis.com/auth/gmail.labels
   ```

### Configuration

#### 1. Environment Variables

Add to your `.env` file:
```env
# MongoDB and other existing variables...

# Gmail OAuth credentials are stored encrypted in MongoDB per company
# No environment variables needed for Gmail API keys
```

#### 2. Company API Keys

The Gmail integration requires three encrypted API keys per company in MongoDB:

- `google_client_id` - OAuth 2.0 Client ID
- `google_client_secret` - OAuth 2.0 Client Secret
- `google_refresh_token` - OAuth 2.0 Refresh Token

**Important**: These keys are stored encrypted in the `companies` collection using AES-256-GCM encryption. Never commit credentials to the repository.

#### 3. OAuth Flow

To obtain a refresh token for a company:

1. **Create OAuth consent screen** in Google Cloud Console
2. **Set up redirect URI** to match your application
3. **Generate authorization URL**:
   ```javascript
   const { google } = require('googleapis');

   const oauth2Client = new google.auth.OAuth2(
     CLIENT_ID,
     CLIENT_SECRET,
     REDIRECT_URI
   );

   const authUrl = oauth2Client.generateAuthUrl({
     access_type: 'offline',
     scope: SCOPES,
     prompt: 'consent'
   });
   ```

4. **User authorizes** your application
5. **Exchange authorization code** for tokens
6. **Store refresh token** encrypted in MongoDB

### Adding Gmail to an Assistant

1. **Navigate to Assistant Settings** in the SB Agent Portal
2. **Add Allowed Actions** - Select Gmail actions from the list:
   - `gmail.getInbox`
   - `gmail.readEmail`
   - `gmail.sendEmail`
   - (and any other actions needed)
3. **Configure Company API Keys** - Ensure the company has Gmail OAuth credentials configured
4. **Test the Integration** - Use the assistant to perform Gmail operations

## Usage Examples

### Example 1: Reading Inbox

**User**: "Show me my recent emails"

**Assistant calls**:
```json
{
  "function": "gmail_getInbox",
  "arguments": {
    "limit": 20
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "count": 5,
    "emails": [
      {
        "id": "18b2c3d4e5f6g7h8",
        "from": "sender@example.com",
        "subject": "Meeting Tomorrow",
        "date": "Nov 26, 2025",
        "preview": "Let's discuss the project...",
        "hasAttachments": false
      }
    ]
  }
}
```

### Example 2: Sending Email

**User**: "Send an email to team@example.com about the project update"

**Assistant calls**:
```json
{
  "function": "gmail_sendEmail",
  "arguments": {
    "to": "team@example.com",
    "subject": "Project Update",
    "body": "Hello team,\n\nHere's the latest update...",
    "isHtml": false
  }
}
```

### Example 3: Advanced Search

**User**: "Find all unread emails from john@example.com"

**Assistant calls**:
```json
{
  "function": "gmail_searchEmails",
  "arguments": {
    "searchQuery": "from:john@example.com is:unread",
    "limit": 50
  }
}
```

## Gmail Query Syntax

The `searchEmails` action supports full Gmail search operators:

- `from:sender@example.com` - Emails from specific sender
- `to:recipient@example.com` - Emails to specific recipient
- `subject:"meeting notes"` - Emails with specific subject
- `is:unread` - Unread emails only
- `is:starred` - Starred emails only
- `has:attachment` - Emails with attachments
- `label:work` - Emails with specific label
- `after:2025/01/01` - Emails after date
- `before:2025/12/31` - Emails before date

Combine operators with spaces (AND) or `OR`:
```
from:john@example.com OR from:jane@example.com subject:urgent is:unread
```

## Security Best Practices

### Never Commit Credentials
- ❌ Do not hardcode OAuth credentials in code
- ❌ Do not commit `.env` files
- ❌ Do not commit setup scripts with credentials
- ✅ Use environment variables
- ✅ Store credentials encrypted in MongoDB
- ✅ Use `.gitignore` to exclude sensitive files

### Credential Encryption
All Gmail credentials are encrypted using AES-256-GCM before storage:
```typescript
import { encryptData } from './services/encryption.service';

const encrypted = encryptData(refreshToken);
// Returns: { value: '...', iv: '...', tag: '...' }
```

### Access Control
- OAuth refresh tokens grant full access to the Gmail account
- Use principle of least privilege - only enable necessary actions
- Regularly rotate OAuth credentials
- Monitor API usage in Google Cloud Console

## Troubleshooting

### "Gmail credentials not configured"
**Cause**: Company doesn't have required API keys
**Solution**: Configure `google_client_id`, `google_client_secret`, and `google_refresh_token` in the company's API keys

### "Invalid credentials" or "Token expired"
**Cause**: Refresh token is invalid or revoked
**Solution**: Re-run OAuth flow to obtain new refresh token

### "Gmail API not enabled"
**Cause**: Gmail API not enabled in Google Cloud project
**Solution**: Enable Gmail API in Google Cloud Console

### "Quota exceeded"
**Cause**: Exceeded Gmail API quota limits
**Solution**: Check quota usage in Google Cloud Console, request quota increase if needed

### "Insufficient permissions"
**Cause**: OAuth scopes don't include required permissions
**Solution**: Re-run OAuth flow with all required scopes

## API Rate Limits

Gmail API has the following rate limits:
- **Queries per day**: 1,000,000,000
- **Queries per 100 seconds per user**: 250
- **Queries per 100 seconds**: 25,000

The integration handles rate limiting automatically with exponential backoff.

## Architecture

### File Structure
```
src/integrations/gmail/
├── gmail.service.ts           # Core business logic
├── gmail.actions.ts           # Action definitions for AI agents
├── integration.config.json    # Integration metadata
└── translations/
    ├── en.json               # English translations
    └── he.json               # Hebrew translations
```

### Service Layer
`gmail.service.ts` provides:
- OAuth client initialization
- API key retrieval and decryption
- Gmail API client creation
- Email parsing and formatting
- Error handling

### Action Layer
`gmail.actions.ts` wraps service functions:
- Parameter validation
- JSON Schema definitions
- Error handling
- Response formatting

## Development

### Adding New Actions

1. Add function to `gmail.service.ts`:
```typescript
export const newGmailAction = async (
  companyId: string,
  params: ActionParams
): Promise<{ success: boolean; data?: any; error?: string }> => {
  // Implementation
};
```

2. Add action to `gmail.actions.ts`:
```typescript
export const createGmailActions = (context: ActionContext): FunctionFactory => ({
  // ... existing actions
  newAction: {
    description: 'Description of the new action',
    strict: true,
    parameters: {
      type: 'object',
      properties: { /* ... */ },
      required: ['param1'],
      additionalProperties: false,
    },
    function: async (args: any) => {
      const result = await newGmailAction(context.companyId, args);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return { success: true, data: result.data };
    },
  },
});
```

3. Add translations to `translations/en.json` and `translations/he.json`

### Testing

Test your Gmail integration:
```typescript
// Test OAuth flow
const gmail = await getGmailClient(companyId);

// Test inbox fetch
const inbox = await fetchInbox(companyId, 10);
console.log(inbox);

// Test sending email
const sent = await sendEmail(companyId, {
  to: 'test@example.com',
  subject: 'Test',
  body: 'Test message',
  isHtml: false,
});
console.log(sent);
```

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Gmail API documentation: https://developers.google.com/gmail/api
3. Check the project's main documentation in `/docs`
4. Submit an issue on GitHub

## License

This integration is part of the SB Agent Portal project and follows the same MIT license.
