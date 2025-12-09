/**
 * Nylas Remote Microservice Actions
 *
 * AI-callable actions for Email, Calendar, and Contacts via the Nylas V3 microservice.
 * These actions mirror the direct Nylas integration but route through the centralized microservice.
 */

import {
  ActionContext,
  FunctionFactory,
  StandardActionResult,
} from '../actions/types';
import {
  // Email
  sendEmail as sendEmailService,
  getMessages as getMessagesService,
  getMessageById as getMessageByIdService,
  getThreads as getThreadsService,
  // Calendar
  listCalendars as listCalendarsService,
  listEvents as listEventsService,
  getEventById as getEventByIdService,
  createEvent as createEventService,
  updateEvent as updateEventService,
  deleteEvent as deleteEventService,
  checkAvailability as checkAvailabilityService,
  getFreeBusy as getFreeBusyService,
  // Contacts
  listContacts as listContactsService,
  getContactById as getContactByIdService,
  createContact as createContactService,
  updateContact as updateContactService,
  deleteContact as deleteContactService,
  // Status
  checkStatus as checkStatusService,
} from './nylas-remote.service';
import { executeAction } from '../actions/executor';
import { ActionValidationError } from '../../utils/actionErrors';
import { InviteService } from '../../services/invite.service';
import { InvitationEmailService } from '../../services/invitation-email.service';
import { InviteSource } from '../../models/Invite';
import { User } from '../../models/User';

const SERVICE_NAME = 'nylasRemoteService';

// ==========================================
// Helper Functions
// ==========================================

/**
 * Resolve userId from email address within a company
 * Used to look up user-specific Nylas grants
 */
async function resolveUserIdFromEmail(
  userEmail: string | undefined,
  companyId: string,
): Promise<string | undefined> {
  if (!userEmail) return undefined;

  try {
    const user = await User.findOne({
      email: userEmail.toLowerCase(),
      companyId,
    });
    return user?._id?.toString();
  } catch (error) {
    console.warn(`[nylas-remote-actions] Could not resolve user for email ${userEmail}:`, error);
    return undefined;
  }
}

// ==========================================
// Response Interfaces
// ==========================================

interface EmailData {
  id: string;
  from: { email: string; name?: string }[];
  to: { email: string; name?: string }[];
  subject: string;
  body?: string;
  snippet?: string;
  date: number;
  unread: boolean;
}

interface EventData {
  id: string;
  calendarId?: string;
  title: string;
  description?: string;
  location?: string;
  startTime: number;
  endTime: number;
  participants?: { email: string; name?: string }[];
}

interface CalendarData {
  id: string;
  name: string;
  isPrimary: boolean;
}

interface ContactData {
  id: string;
  givenName?: string;
  surname?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  notes?: string;
}

interface ServiceCallLambdaResponse<T> {
  success: boolean;
  data: T;
  description?: string;
}

// ==========================================
// Action Factory
// ==========================================

export const createNylasRemoteActions = (
  context: ActionContext,
): FunctionFactory => ({
  // ==========================================
  // EMAIL ACTIONS
  // ==========================================

  /**
   * Get emails from the connected account
   */
  nylasRemoteGetEmails: {
    description:
      'Retrieve emails from a team member\'s connected email account. Specify userEmail to access a specific user\'s mailbox.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        userEmail: {
          type: 'string',
          description: 'Email of the team member whose emails to access. If not provided, uses company default.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of emails to return (default: 10)',
        },
        unread: {
          type: 'boolean',
          description: 'Filter to only return unread emails',
        },
      },
      required: [],
      additionalProperties: false,
    },
    function: async (args: {
      userEmail?: string;
      limit?: number;
      unread?: boolean;
    }): Promise<StandardActionResult<EmailData[]>> => {
      const { userEmail, limit = 10, unread } = args;

      if (!context.companyId) {
        throw new ActionValidationError('Company ID is missing from context.');
      }

      // Resolve userId from email if provided
      const userId = await resolveUserIdFromEmail(userEmail, context.companyId!);

      return executeAction<EmailData[], ServiceCallLambdaResponse<EmailData[]>>(
        'nylasRemoteGetEmails',
        async () => {
          const response = await getMessagesService(context.companyId!, {
            limit,
            unread,
          }, userId);
          return {
            success: true,
            data: (response.data || []).map((e) => ({
              id: e.id,
              from: e.from,
              to: e.to,
              subject: e.subject,
              snippet: e.snippet,
              date: e.date,
              unread: e.unread,
            })),
          };
        },
        { serviceName: SERVICE_NAME },
      );
    },
  },

  /**
   * Get a specific email by ID
   */
  nylasRemoteGetEmail: {
    description:
      'Retrieve a specific email by its ID, including the full body content.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        userEmail: {
          type: 'string',
          description: 'Email of the team member whose mailbox to access. If not provided, uses company default.',
        },
        messageId: {
          type: 'string',
          description: 'The ID of the email message to retrieve',
        },
      },
      required: ['messageId'],
      additionalProperties: false,
    },
    function: async (args: {
      userEmail?: string;
      messageId: string;
    }): Promise<StandardActionResult<EmailData>> => {
      const { userEmail, messageId } = args;

      if (!context.companyId) {
        throw new ActionValidationError('Company ID is missing from context.');
      }

      if (!messageId || typeof messageId !== 'string') {
        throw new ActionValidationError('messageId is required');
      }

      // Resolve userId from email if provided
      const userId = await resolveUserIdFromEmail(userEmail, context.companyId!);

      return executeAction<EmailData, ServiceCallLambdaResponse<EmailData>>(
        'nylasRemoteGetEmail',
        async () => {
          const response = await getMessageByIdService(
            context.companyId!,
            messageId,
            userId,
          );
          const email = response.data;
          return {
            success: true,
            data: {
              id: email.id,
              from: email.from,
              to: email.to,
              subject: email.subject,
              body: email.body,
              snippet: email.snippet,
              date: email.date,
              unread: email.unread,
            },
          };
        },
        { serviceName: SERVICE_NAME },
      );
    },
  },

  /**
   * Send an email
   */
  nylasRemoteSendEmail: {
    description: 'Send an email using a team member\'s connected email account.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        userEmail: {
          type: 'string',
          description: 'Email of the team member to send from. If not provided, uses company default.',
        },
        to: {
          type: 'string',
          description:
            'Recipient email address. For multiple recipients, use comma-separated values.',
        },
        subject: {
          type: 'string',
          description: 'The subject of the email',
        },
        body: {
          type: 'string',
          description: 'The body content of the email (can be HTML)',
        },
        cc: {
          type: 'string',
          description:
            'CC recipients (optional). For multiple, use comma-separated values.',
        },
        bcc: {
          type: 'string',
          description:
            'BCC recipients (optional). For multiple, use comma-separated values.',
        },
      },
      required: ['to', 'subject', 'body'],
      additionalProperties: false,
    },
    function: async (args: {
      userEmail?: string;
      to: string;
      subject: string;
      body: string;
      cc?: string;
      bcc?: string;
    }): Promise<StandardActionResult<{ id: string; threadId?: string }>> => {
      const { userEmail, to, subject, body, cc, bcc } = args;

      if (!context.companyId) {
        throw new ActionValidationError('Company ID is missing from context.');
      }

      // Resolve userId from email if provided
      const userId = await resolveUserIdFromEmail(userEmail, context.companyId!);

      // Parse comma-separated emails into array
      const parseEmails = (str: string) =>
        str
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean)
          .map((email) => ({ email }));

      return executeAction<
        { id: string; threadId?: string },
        ServiceCallLambdaResponse<{ id: string; threadId?: string }>
      >(
        'nylasRemoteSendEmail',
        async () => {
          const result = await sendEmailService(context.companyId!, {
            to: parseEmails(to),
            subject,
            body,
            cc: cc ? parseEmails(cc) : undefined,
            bcc: bcc ? parseEmails(bcc) : undefined,
          }, userId);
          return {
            success: true,
            data: result,
            description: `Email sent successfully to ${to}`,
          };
        },
        { serviceName: SERVICE_NAME },
      );
    },
  },

  // ==========================================
  // CALENDAR ACTIONS
  // ==========================================

  /**
   * List all calendars
   */
  nylasRemoteListCalendars: {
    description: 'List all calendars from a team member\'s connected account.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        userEmail: {
          type: 'string',
          description: 'Email of the team member whose calendars to list. If not provided, uses company default.',
        },
      },
      required: [],
      additionalProperties: false,
    },
    function: async (args: {
      userEmail?: string;
    }): Promise<StandardActionResult<CalendarData[]>> => {
      const { userEmail } = args;

      if (!context.companyId) {
        throw new ActionValidationError('Company ID is missing from context.');
      }

      // Resolve userId from email if provided
      const userId = await resolveUserIdFromEmail(userEmail, context.companyId!);

      return executeAction<
        CalendarData[],
        ServiceCallLambdaResponse<CalendarData[]>
      >(
        'nylasRemoteListCalendars',
        async () => {
          const response = await listCalendarsService(context.companyId!, userId);
          return {
            success: true,
            data: (response.data || []).map((c) => ({
              id: c.id,
              name: c.name,
              isPrimary: c.isPrimary,
            })),
          };
        },
        { serviceName: SERVICE_NAME },
      );
    },
  },

  /**
   * Get calendar events
   */
  nylasRemoteGetEvents: {
    description:
      'Retrieve calendar events from a team member\'s connected account. By default returns events from the past week to 30 days ahead.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        userEmail: {
          type: 'string',
          description: 'Email of the team member whose calendar to access. If not provided, uses company default.',
        },
        calendarId: {
          type: 'string',
          description:
            'Calendar ID to query (optional, uses primary calendar if not specified)',
        },
        start: {
          type: 'number',
          description: 'Start time as Unix timestamp (optional)',
        },
        end: {
          type: 'number',
          description: 'End time as Unix timestamp (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events to return (default: 20)',
        },
      },
      required: [],
      additionalProperties: false,
    },
    function: async (args: {
      userEmail?: string;
      calendarId?: string;
      start?: number;
      end?: number;
      limit?: number;
    }): Promise<StandardActionResult<EventData[]>> => {
      const { userEmail, calendarId, start, end, limit = 20 } = args;

      if (!context.companyId) {
        throw new ActionValidationError('Company ID is missing from context.');
      }

      // Resolve userId from email if provided
      const userId = await resolveUserIdFromEmail(userEmail, context.companyId!);

      return executeAction<EventData[], ServiceCallLambdaResponse<EventData[]>>(
        'nylasRemoteGetEvents',
        async () => {
          const response = await listEventsService(context.companyId!, {
            calendarId,
            start,
            end,
            limit,
          }, userId);
          return {
            success: true,
            data: (response.data || []).map((e) => ({
              id: e.id,
              calendarId: e.calendarId,
              title: e.title,
              description: e.description,
              location: e.location,
              startTime: e.when.startTime,
              endTime: e.when.endTime,
              participants: e.participants,
            })),
          };
        },
        { serviceName: SERVICE_NAME },
      );
    },
  },

  /**
   * Create a calendar event
   */
  nylasRemoteCreateEvent: {
    description: 'Create a new calendar event on a team member\'s calendar.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        userEmail: {
          type: 'string',
          description: 'Email of the team member whose calendar to use. If not provided, uses company default.',
        },
        title: {
          type: 'string',
          description: 'The title of the event',
        },
        description: {
          type: 'string',
          description: 'Description or notes for the event (optional)',
        },
        startTime: {
          type: 'string',
          description:
            'Start time in ISO format (e.g., "2024-01-15T09:00:00Z") or Unix timestamp',
        },
        endTime: {
          type: 'string',
          description:
            'End time in ISO format (e.g., "2024-01-15T10:00:00Z") or Unix timestamp',
        },
        location: {
          type: 'string',
          description: 'Location of the event (optional)',
        },
        participants: {
          type: 'string',
          description:
            'Comma-separated list of participant email addresses (optional)',
        },
        calendarId: {
          type: 'string',
          description:
            'Calendar ID to create event in (optional, uses primary calendar)',
        },
      },
      required: ['title', 'startTime', 'endTime'],
      additionalProperties: false,
    },
    function: async (args: {
      userEmail?: string;
      title: string;
      description?: string;
      startTime: string;
      endTime: string;
      location?: string;
      participants?: string;
      calendarId?: string;
    }): Promise<StandardActionResult<EventData>> => {
      const {
        userEmail,
        title,
        description,
        startTime,
        endTime,
        location,
        participants,
        calendarId,
      } = args;

      if (!context.companyId) {
        throw new ActionValidationError('Company ID is missing from context.');
      }

      // Resolve userId from email if provided
      const userId = await resolveUserIdFromEmail(userEmail, context.companyId!);

      // Convert ISO strings to Unix timestamps
      const startTimestamp =
        typeof startTime === 'string' && startTime.includes('T')
          ? Math.floor(new Date(startTime).getTime() / 1000)
          : parseInt(startTime);
      const endTimestamp =
        typeof endTime === 'string' && endTime.includes('T')
          ? Math.floor(new Date(endTime).getTime() / 1000)
          : parseInt(endTime);

      // Parse participants
      const participantList = participants
        ? participants
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean)
            .map((email) => ({ email }))
        : undefined;

      return executeAction<EventData, ServiceCallLambdaResponse<EventData>>(
        'nylasRemoteCreateEvent',
        async () => {
          // First get calendars if no calendarId specified
          let targetCalendarId = calendarId;
          if (!targetCalendarId) {
            const calendars = await listCalendarsService(context.companyId!, userId);
            const primary =
              calendars.data?.find((c) => c.isPrimary) || calendars.data?.[0];
            if (!primary) {
              throw new Error('No calendars found');
            }
            targetCalendarId = primary.id;
          }

          const response = await createEventService(context.companyId!, {
            calendarId: targetCalendarId,
            title,
            description,
            location,
            when: {
              startTime: startTimestamp,
              endTime: endTimestamp,
            },
            participants: participantList,
          }, userId);
          const event = response.data;
          return {
            success: true,
            data: {
              id: event.id,
              calendarId: event.calendarId,
              title: event.title,
              description: event.description,
              location: event.location,
              startTime: event.when.startTime,
              endTime: event.when.endTime,
              participants: event.participants,
            },
            description: `Event "${title}" created successfully`,
          };
        },
        { serviceName: SERVICE_NAME },
      );
    },
  },

  /**
   * Update a calendar event
   */
  nylasRemoteUpdateEvent: {
    description: 'Update an existing calendar event on a team member\'s calendar.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        userEmail: {
          type: 'string',
          description: 'Email of the team member whose calendar to access. If not provided, uses company default.',
        },
        eventId: {
          type: 'string',
          description: 'The ID of the event to update',
        },
        calendarId: {
          type: 'string',
          description: 'The calendar ID containing the event',
        },
        title: {
          type: 'string',
          description: 'New title for the event (optional)',
        },
        description: {
          type: 'string',
          description: 'New description (optional)',
        },
        startTime: {
          type: 'string',
          description: 'New start time in ISO format (optional)',
        },
        endTime: {
          type: 'string',
          description: 'New end time in ISO format (optional)',
        },
        location: {
          type: 'string',
          description: 'New location (optional)',
        },
      },
      required: ['eventId', 'calendarId'],
      additionalProperties: false,
    },
    function: async (args: {
      userEmail?: string;
      eventId: string;
      calendarId: string;
      title?: string;
      description?: string;
      startTime?: string;
      endTime?: string;
      location?: string;
    }): Promise<StandardActionResult<EventData>> => {
      const { userEmail, eventId, calendarId, title, description, startTime, endTime, location } =
        args;

      if (!context.companyId) {
        throw new ActionValidationError('Company ID is missing from context.');
      }

      // Resolve userId from email if provided
      const userId = await resolveUserIdFromEmail(userEmail, context.companyId!);

      const updateParams: any = { calendarId };
      if (title) updateParams.title = title;
      if (description) updateParams.description = description;
      if (location) updateParams.location = location;

      if (startTime && endTime) {
        updateParams.when = {
          startTime:
            typeof startTime === 'string' && startTime.includes('T')
              ? Math.floor(new Date(startTime).getTime() / 1000)
              : parseInt(startTime),
          endTime:
            typeof endTime === 'string' && endTime.includes('T')
              ? Math.floor(new Date(endTime).getTime() / 1000)
              : parseInt(endTime),
        };
      }

      return executeAction<EventData, ServiceCallLambdaResponse<EventData>>(
        'nylasRemoteUpdateEvent',
        async () => {
          const response = await updateEventService(
            context.companyId!,
            eventId,
            updateParams,
            userId,
          );
          const event = response.data;
          return {
            success: true,
            data: {
              id: event.id,
              calendarId: event.calendarId,
              title: event.title,
              description: event.description,
              location: event.location,
              startTime: event.when.startTime,
              endTime: event.when.endTime,
              participants: event.participants,
            },
            description: `Event updated successfully`,
          };
        },
        { serviceName: SERVICE_NAME },
      );
    },
  },

  /**
   * Delete a calendar event
   */
  nylasRemoteDeleteEvent: {
    description: 'Delete a calendar event from a team member\'s calendar.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        userEmail: {
          type: 'string',
          description: 'Email of the team member whose calendar to access. If not provided, uses company default.',
        },
        eventId: {
          type: 'string',
          description: 'The ID of the event to delete',
        },
        calendarId: {
          type: 'string',
          description: 'The calendar ID containing the event',
        },
      },
      required: ['eventId', 'calendarId'],
      additionalProperties: false,
    },
    function: async (args: {
      userEmail?: string;
      eventId: string;
      calendarId: string;
    }): Promise<StandardActionResult<{ deleted: boolean }>> => {
      const { userEmail, eventId, calendarId } = args;

      if (!context.companyId) {
        throw new ActionValidationError('Company ID is missing from context.');
      }

      // Resolve userId from email if provided
      const userId = await resolveUserIdFromEmail(userEmail, context.companyId!);

      return executeAction<
        { deleted: boolean },
        ServiceCallLambdaResponse<{ deleted: boolean }>
      >(
        'nylasRemoteDeleteEvent',
        async () => {
          await deleteEventService(context.companyId!, eventId, calendarId, userId);
          return {
            success: true,
            data: { deleted: true },
            description: `Event deleted successfully`,
          };
        },
        { serviceName: SERVICE_NAME },
      );
    },
  },

  /**
   * Check availability
   */
  nylasRemoteCheckAvailability: {
    description:
      'Check availability for participants to find open time slots.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        userEmail: {
          type: 'string',
          description: 'Email of the team member whose calendar to check against. If not provided, uses company default.',
        },
        emails: {
          type: 'string',
          description: 'Comma-separated list of participant email addresses',
        },
        startTime: {
          type: 'number',
          description: 'Start time range as Unix timestamp',
        },
        endTime: {
          type: 'number',
          description: 'End time range as Unix timestamp',
        },
        durationMinutes: {
          type: 'number',
          description: 'Desired meeting duration in minutes',
        },
      },
      required: ['emails', 'startTime', 'endTime', 'durationMinutes'],
      additionalProperties: false,
    },
    function: async (args: {
      userEmail?: string;
      emails: string;
      startTime: number;
      endTime: number;
      durationMinutes: number;
    }): Promise<StandardActionResult<any>> => {
      const { userEmail, emails, startTime, endTime, durationMinutes } = args;

      if (!context.companyId) {
        throw new ActionValidationError('Company ID is missing from context.');
      }

      // Resolve userId from email if provided
      const userId = await resolveUserIdFromEmail(userEmail, context.companyId!);

      const emailList = emails
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);

      return executeAction<any, ServiceCallLambdaResponse<any>>(
        'nylasRemoteCheckAvailability',
        async () => {
          const result = await checkAvailabilityService(context.companyId!, {
            emails: emailList,
            startTime,
            endTime,
            durationMinutes,
          }, userId);
          return {
            success: true,
            data: result,
          };
        },
        { serviceName: SERVICE_NAME },
      );
    },
  },

  // ==========================================
  // CONTACT ACTIONS
  // ==========================================

  /**
   * List contacts
   */
  nylasRemoteGetContacts: {
    description:
      'Retrieve contacts from a team member\'s connected account. Optionally filter by email.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        userEmail: {
          type: 'string',
          description: 'Email of the team member whose contacts to access. If not provided, uses company default.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of contacts to return (default: 50)',
        },
        email: {
          type: 'string',
          description: 'Filter contacts by email address (optional)',
        },
      },
      required: [],
      additionalProperties: false,
    },
    function: async (args: {
      userEmail?: string;
      limit?: number;
      email?: string;
    }): Promise<StandardActionResult<ContactData[]>> => {
      const { userEmail, limit = 50, email } = args;

      if (!context.companyId) {
        throw new ActionValidationError('Company ID is missing from context.');
      }

      // Resolve userId from email if provided
      const userId = await resolveUserIdFromEmail(userEmail, context.companyId!);

      return executeAction<
        ContactData[],
        ServiceCallLambdaResponse<ContactData[]>
      >(
        'nylasRemoteGetContacts',
        async () => {
          const response = await listContactsService(context.companyId!, {
            limit,
            email,
          }, userId);
          return {
            success: true,
            data: (response.data || []).map((c) => ({
              id: c.id,
              givenName: c.givenName,
              surname: c.surname,
              email: c.emails?.[0]?.email,
              phone: c.phoneNumbers?.[0]?.number,
              companyName: c.companyName,
              notes: c.notes,
            })),
          };
        },
        { serviceName: SERVICE_NAME },
      );
    },
  },

  /**
   * Create a contact
   */
  nylasRemoteCreateContact: {
    description: 'Create a new contact in a team member\'s contacts.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        userEmail: {
          type: 'string',
          description: 'Email of the team member whose contacts to add to. If not provided, uses company default.',
        },
        givenName: {
          type: 'string',
          description: 'First name of the contact',
        },
        surname: {
          type: 'string',
          description: 'Last name of the contact',
        },
        email: {
          type: 'string',
          description: 'Email address of the contact',
        },
        phone: {
          type: 'string',
          description: 'Phone number of the contact (optional)',
        },
        companyName: {
          type: 'string',
          description: 'Company name (optional)',
        },
        jobTitle: {
          type: 'string',
          description: 'Job title (optional)',
        },
        notes: {
          type: 'string',
          description: 'Notes about the contact (optional)',
        },
      },
      required: ['email'],
      additionalProperties: false,
    },
    function: async (args: {
      userEmail?: string;
      givenName?: string;
      surname?: string;
      email: string;
      phone?: string;
      companyName?: string;
      jobTitle?: string;
      notes?: string;
    }): Promise<StandardActionResult<ContactData>> => {
      const { userEmail, givenName, surname, email, phone, companyName, jobTitle, notes } =
        args;

      if (!context.companyId) {
        throw new ActionValidationError('Company ID is missing from context.');
      }

      // Resolve userId from email if provided
      const userId = await resolveUserIdFromEmail(userEmail, context.companyId!);

      return executeAction<ContactData, ServiceCallLambdaResponse<ContactData>>(
        'nylasRemoteCreateContact',
        async () => {
          const response = await createContactService(context.companyId!, {
            givenName,
            surname,
            emails: [{ email, type: 'work' }],
            phoneNumbers: phone ? [{ number: phone, type: 'work' }] : undefined,
            companyName,
            jobTitle,
            notes,
          }, userId);
          const contact = response.data;
          return {
            success: true,
            data: {
              id: contact.id,
              givenName: contact.givenName,
              surname: contact.surname,
              email: contact.emails?.[0]?.email,
              phone: contact.phoneNumbers?.[0]?.number,
              companyName: contact.companyName,
              notes: contact.notes,
            },
            description: `Contact created: ${givenName || ''} ${surname || ''} (${email})`,
          };
        },
        { serviceName: SERVICE_NAME },
      );
    },
  },

  /**
   * Update a contact
   */
  nylasRemoteUpdateContact: {
    description: 'Update an existing contact in a team member\'s contacts.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        userEmail: {
          type: 'string',
          description: 'Email of the team member whose contacts to update. If not provided, uses company default.',
        },
        contactId: {
          type: 'string',
          description: 'The ID of the contact to update',
        },
        givenName: {
          type: 'string',
          description: 'New first name (optional)',
        },
        surname: {
          type: 'string',
          description: 'New last name (optional)',
        },
        email: {
          type: 'string',
          description: 'New email address (optional)',
        },
        phone: {
          type: 'string',
          description: 'New phone number (optional)',
        },
        companyName: {
          type: 'string',
          description: 'New company name (optional)',
        },
        notes: {
          type: 'string',
          description: 'New notes (optional)',
        },
      },
      required: ['contactId'],
      additionalProperties: false,
    },
    function: async (args: {
      userEmail?: string;
      contactId: string;
      givenName?: string;
      surname?: string;
      email?: string;
      phone?: string;
      companyName?: string;
      notes?: string;
    }): Promise<StandardActionResult<ContactData>> => {
      const { userEmail, contactId, givenName, surname, email, phone, companyName, notes } =
        args;

      if (!context.companyId) {
        throw new ActionValidationError('Company ID is missing from context.');
      }

      // Resolve userId from email if provided
      const userId = await resolveUserIdFromEmail(userEmail, context.companyId!);

      const updateParams: any = {};
      if (givenName) updateParams.givenName = givenName;
      if (surname) updateParams.surname = surname;
      if (email) updateParams.emails = [{ email, type: 'work' }];
      if (phone) updateParams.phoneNumbers = [{ number: phone, type: 'work' }];
      if (companyName) updateParams.companyName = companyName;
      if (notes) updateParams.notes = notes;

      return executeAction<ContactData, ServiceCallLambdaResponse<ContactData>>(
        'nylasRemoteUpdateContact',
        async () => {
          const response = await updateContactService(
            context.companyId!,
            contactId,
            updateParams,
            userId,
          );
          const contact = response.data;
          return {
            success: true,
            data: {
              id: contact.id,
              givenName: contact.givenName,
              surname: contact.surname,
              email: contact.emails?.[0]?.email,
              phone: contact.phoneNumbers?.[0]?.number,
              companyName: contact.companyName,
              notes: contact.notes,
            },
            description: `Contact updated successfully`,
          };
        },
        { serviceName: SERVICE_NAME },
      );
    },
  },

  /**
   * Delete a contact
   */
  nylasRemoteDeleteContact: {
    description: 'Delete a contact from a team member\'s contacts.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        userEmail: {
          type: 'string',
          description: 'Email of the team member whose contacts to delete from. If not provided, uses company default.',
        },
        contactId: {
          type: 'string',
          description: 'The ID of the contact to delete',
        },
      },
      required: ['contactId'],
      additionalProperties: false,
    },
    function: async (args: {
      userEmail?: string;
      contactId: string;
    }): Promise<StandardActionResult<{ deleted: boolean }>> => {
      const { userEmail, contactId } = args;

      if (!context.companyId) {
        throw new ActionValidationError('Company ID is missing from context.');
      }

      // Resolve userId from email if provided
      const userId = await resolveUserIdFromEmail(userEmail, context.companyId!);

      return executeAction<
        { deleted: boolean },
        ServiceCallLambdaResponse<{ deleted: boolean }>
      >(
        'nylasRemoteDeleteContact',
        async () => {
          await deleteContactService(context.companyId!, contactId, userId);
          return {
            success: true,
            data: { deleted: true },
            description: `Contact deleted successfully`,
          };
        },
        { serviceName: SERVICE_NAME },
      );
    },
  },

  // ==========================================
  // STATUS ACTION
  // ==========================================

  /**
   * Check microservice status
   */
  nylasRemoteStatus: {
    description:
      'Check the status of the Nylas microservice and its configuration.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    function: async (): Promise<
      StandardActionResult<{ status: string; configured: boolean }>
    > => {
      if (!context.companyId) {
        throw new ActionValidationError('Company ID is missing from context.');
      }

      return executeAction<
        { status: string; configured: boolean },
        ServiceCallLambdaResponse<{ status: string; configured: boolean }>
      >(
        'nylasRemoteStatus',
        async () => {
          const result = await checkStatusService(context.companyId!);
          return {
            success: true,
            data: result,
          };
        },
        { serviceName: SERVICE_NAME },
      );
    },
  },

  // ==========================================
  // INVITATION ACTION
  // ==========================================

  /**
   * Send an invitation email to connect a user's email/calendar/contacts
   * This creates an invite in the system and sends a proper OAuth invitation email
   */
  nylasRemoteSendInvitation: {
    description:
      'Send an invitation email to a user so they can connect their email, calendar, and contacts to the service. The user will receive an email with a link to authorize access via Google OAuth.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'The email address to send the invitation to',
        },
        name: {
          type: 'string',
          description: 'Name of the person being invited (optional)',
        },
        role: {
          type: 'string',
          description: 'Role to assign: "Admin" or "CompanyUser" (default: CompanyUser)',
        },
      },
      required: ['email'],
      additionalProperties: false,
    },
    function: async (args: {
      email: string;
      name?: string;
      role?: 'Admin' | 'CompanyUser';
    }): Promise<StandardActionResult<{
      inviteId: string;
      email: string;
      status: string;
      expiresAt: Date;
      authUrl: string;
    }>> => {
      const { email, name, role = 'CompanyUser' } = args;

      if (!context.companyId) {
        throw new ActionValidationError('Company ID is missing from context.');
      }

      if (!context.userId) {
        throw new ActionValidationError('User ID is missing from context.');
      }

      // Validate email
      if (!email || !email.includes('@')) {
        throw new ActionValidationError('Valid email address is required');
      }

      return executeAction<
        {
          inviteId: string;
          email: string;
          status: string;
          expiresAt: Date;
          authUrl: string;
        },
        ServiceCallLambdaResponse<{
          inviteId: string;
          email: string;
          status: string;
          expiresAt: Date;
          authUrl: string;
        }>
      >(
        'nylasRemoteSendInvitation',
        async () => {
          // Create invite and send email using the proper invite service
          // Using API as source since it's coming from the assistant action
          const invite = await InviteService.createInvite(
            email,
            context.companyId!,
            context.userId!,
            name,
            role,
            { source: InviteSource.API },
            true // Send email = true
          );

          // Generate the auth URL for reference
          const authUrl = await InvitationEmailService.generateNylasAuthUrl(invite);

          return {
            success: true,
            data: {
              inviteId: invite._id.toString(),
              email: invite.email,
              status: invite.status,
              expiresAt: invite.expiresAt,
              authUrl: authUrl,
            },
            description: `Invitation sent to ${email}. They will receive an email with a link to connect their Google account.`,
          };
        },
        { serviceName: SERVICE_NAME },
      );
    },
  },
});
