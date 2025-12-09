/**
 * Nylas Remote Microservice Types
 *
 * Types for communication with the Nylas V3 microservice
 */

// ==========================================
// Email Types
// ==========================================

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface SendEmailParams {
  to: EmailRecipient[];
  subject: string;
  body: string;
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  replyToMessageId?: string;
}

export interface GetMessagesParams {
  limit?: number;
  unread?: boolean;
  subject?: string;
  from?: string;
  to?: string;
  threadId?: string;
}

export interface EmailMessage {
  id: string;
  from: EmailRecipient[];
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  subject: string;
  body?: string;
  snippet?: string;
  date: number;
  unread: boolean;
  threadId?: string;
}

export interface EmailThread {
  id: string;
  subject: string;
  participants: EmailRecipient[];
  messageIds: string[];
  lastMessageTimestamp: number;
}

// ==========================================
// Calendar Types
// ==========================================

export interface Calendar {
  id: string;
  name: string;
  isPrimary: boolean;
  timezone?: string;
}

export interface EventWhen {
  startTime: number;
  endTime: number;
  timezone?: string;
}

export interface EventParticipant {
  email: string;
  name?: string;
  status?: 'yes' | 'no' | 'maybe' | 'noreply';
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  when: EventWhen;
  participants?: EventParticipant[];
  busy?: boolean;
}

export interface ListEventsParams {
  calendarId?: string;
  start?: number;
  end?: number;
  limit?: number;
}

export interface CreateEventParams {
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  when: {
    startTime: number;
    endTime: number;
    timezone?: string;
  };
  participants?: EventParticipant[];
  busy?: boolean;
}

export interface UpdateEventParams {
  calendarId: string;
  title?: string;
  description?: string;
  location?: string;
  when?: {
    startTime: number;
    endTime: number;
    timezone?: string;
  };
  participants?: EventParticipant[];
  busy?: boolean;
}

export interface AvailabilityParams {
  emails: string[];
  startTime: number;
  endTime: number;
  durationMinutes: number;
  intervalMinutes?: number;
}

export interface FreeBusyParams {
  emails: string[];
  startTime: number;
  endTime: number;
}

// ==========================================
// Contact Types
// ==========================================

export interface ContactEmail {
  email: string;
  type?: string;
}

export interface ContactPhoneNumber {
  number: string;
  type?: string;
}

export interface ContactWebPage {
  url: string;
  type?: string;
}

export interface ContactPhysicalAddress {
  type?: string;
  streetAddress?: string;
  city?: string;
  postalCode?: string;
  state?: string;
  country?: string;
}

export interface Contact {
  id: string;
  givenName?: string;
  surname?: string;
  emails?: ContactEmail[];
  phoneNumbers?: ContactPhoneNumber[];
  companyName?: string;
  jobTitle?: string;
  notes?: string;
  webPages?: ContactWebPage[];
  physicalAddresses?: ContactPhysicalAddress[];
}

export interface ListContactsParams {
  limit?: number;
  offset?: number;
  email?: string;
  group?: string;
}

export interface CreateContactParams {
  givenName?: string;
  surname?: string;
  emails?: ContactEmail[];
  phoneNumbers?: ContactPhoneNumber[];
  companyName?: string;
  jobTitle?: string;
  notes?: string;
  webPages?: ContactWebPage[];
  physicalAddresses?: ContactPhysicalAddress[];
}

export interface UpdateContactParams {
  givenName?: string;
  surname?: string;
  emails?: ContactEmail[];
  phoneNumbers?: ContactPhoneNumber[];
  companyName?: string;
  jobTitle?: string;
  notes?: string;
  webPages?: ContactWebPage[];
  physicalAddresses?: ContactPhysicalAddress[];
}

export interface ContactGroup {
  id: string;
  name: string;
}

// ==========================================
// Response Types
// ==========================================

export interface MicroserviceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ListResponse<T> {
  data: T[];
  requestId?: string;
}
