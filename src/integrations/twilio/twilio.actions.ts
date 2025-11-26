/**
 * Twilio Actions for AI Agents
 * Function calling definitions for Twilio SMS, Voice, and WhatsApp
 */

import { ActionContext, FunctionFactory } from '../actions/types';
import {
  sendSMS,
  getSMSHistory,
  makeCall,
  getCallLogs,
  sendWhatsApp,
} from './twilio.service';

export const createTwilioActions = (context: ActionContext): FunctionFactory => ({
  sendSMS: {
    description: 'Send an SMS message to a phone number using Twilio. Use for text messaging to mobile phones.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient phone number in E.164 format (e.g., +1234567890)',
        },
        message: {
          type: 'string',
          description: 'The SMS message content to send',
        },
      },
      required: ['to', 'message'],
      additionalProperties: false,
    },
    function: async (args: { to: string; message: string }) => {
      console.log(`📞 [Twilio Actions] sendSMS called`);

      try {
        const result = await sendSMS(context.companyId, args.to, args.message);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to send SMS',
          };
        }

        return {
          success: true,
          data: {
            messageSid: result.messageSid,
            message: `SMS sent successfully to ${args.to}`,
          },
        };
      } catch (error: any) {
        console.error('sendSMS: Unexpected error', error);
        return {
          success: false,
          error: error.message || 'An unexpected error occurred while sending SMS',
        };
      }
    },
  },

  getSMSHistory: {
    description: 'Get recent SMS message history from Twilio. Returns sent and received messages.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of messages to retrieve (default: 20, max: 50)',
        },
      },
      required: [],
      additionalProperties: false,
    },
    function: async (args: { limit?: number }) => {
      console.log(`📞 [Twilio Actions] getSMSHistory called`);

      const limit = args.limit && args.limit > 0 && args.limit <= 50 ? args.limit : 20;

      try {
        const result = await getSMSHistory(context.companyId, limit);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to get SMS history',
          };
        }

        return {
          success: true,
          data: {
            count: result.messages?.length || 0,
            messages: result.messages || [],
            message: `Retrieved ${result.messages?.length || 0} SMS messages`,
          },
        };
      } catch (error: any) {
        console.error('getSMSHistory: Unexpected error', error);
        return {
          success: false,
          error: error.message || 'An unexpected error occurred while retrieving SMS history',
        };
      }
    },
  },

  makeCall: {
    description: 'Make a voice call using Twilio. Requires a TwiML URL for call instructions.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient phone number in E.164 format (e.g., +1234567890)',
        },
        twimlUrl: {
          type: 'string',
          description: 'URL pointing to TwiML instructions for the call',
        },
      },
      required: ['to', 'twimlUrl'],
      additionalProperties: false,
    },
    function: async (args: { to: string; twimlUrl: string }) => {
      console.log(`📞 [Twilio Actions] makeCall called`);

      try {
        const result = await makeCall(context.companyId, args.to, args.twimlUrl);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to make call',
          };
        }

        return {
          success: true,
          data: {
            callSid: result.callSid,
            message: `Call initiated to ${args.to}`,
          },
        };
      } catch (error: any) {
        console.error('makeCall: Unexpected error', error);
        return {
          success: false,
          error: error.message || 'An unexpected error occurred while making call',
        };
      }
    },
  },

  getCallLogs: {
    description: 'Get recent voice call logs from Twilio. Returns call history with status and duration.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of call logs to retrieve (default: 20, max: 50)',
        },
      },
      required: [],
      additionalProperties: false,
    },
    function: async (args: { limit?: number }) => {
      console.log(`📞 [Twilio Actions] getCallLogs called`);

      const limit = args.limit && args.limit > 0 && args.limit <= 50 ? args.limit : 20;

      try {
        const result = await getCallLogs(context.companyId, limit);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to get call logs',
          };
        }

        return {
          success: true,
          data: {
            count: result.calls?.length || 0,
            calls: result.calls || [],
            message: `Retrieved ${result.calls?.length || 0} call logs`,
          },
        };
      } catch (error: any) {
        console.error('getCallLogs: Unexpected error', error);
        return {
          success: false,
          error: error.message || 'An unexpected error occurred while retrieving call logs',
        };
      }
    },
  },

  sendWhatsApp: {
    description: 'Send a WhatsApp message using Twilio WhatsApp Business API.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient WhatsApp number in E.164 format (e.g., +1234567890)',
        },
        message: {
          type: 'string',
          description: 'The WhatsApp message content to send',
        },
      },
      required: ['to', 'message'],
      additionalProperties: false,
    },
    function: async (args: { to: string; message: string }) => {
      console.log(`📞 [Twilio Actions] sendWhatsApp called`);

      try {
        const result = await sendWhatsApp(context.companyId, args.to, args.message);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to send WhatsApp message',
          };
        }

        return {
          success: true,
          data: {
            messageSid: result.messageSid,
            message: `WhatsApp message sent successfully to ${args.to}`,
          },
        };
      } catch (error: any) {
        console.error('sendWhatsApp: Unexpected error', error);
        return {
          success: false,
          error: error.message || 'An unexpected error occurred while sending WhatsApp message',
        };
      }
    },
  },
});
