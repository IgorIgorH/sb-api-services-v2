/**
 * Nylas Remote Microservice Service
 *
 * HTTP client for communicating with the Nylas V3 microservice (sb-api-services-v3)
 * This service abstracts all HTTP calls to the centralized Nylas microservice.
 *
 * Supports per-user grants: When userId is provided, the service attempts to resolve
 * the user's personal Nylas grant. Falls back to company default if no user grant exists.
 */

import axios from 'axios';
import { getApiKey } from '../../services/api.key.service';
import { UserGrantService } from '../../services/user-grant.service';
import {
  SendEmailParams,
  GetMessagesParams,
  EmailMessage,
  EmailThread,
  Calendar,
  CalendarEvent,
  ListEventsParams,
  CreateEventParams,
  UpdateEventParams,
  AvailabilityParams,
  FreeBusyParams,
  Contact,
  ListContactsParams,
  CreateContactParams,
  UpdateContactParams,
  ContactGroup,
  ListResponse,
} from './nylas-remote.types';

// ==========================================
// Grant Resolution
// ==========================================

export interface GrantResolution {
  grantId?: string;
  source: 'user' | 'company' | 'none';
  email?: string;
}

/**
 * Resolve the Nylas grant ID to use for API calls
 * Priority: 1. User-specific grant, 2. Company default grant (from microservice)
 */
async function resolveGrantId(
  companyId: string,
  userId?: string,
): Promise<GrantResolution> {
  // If userId provided, try to get user-specific grant
  if (userId) {
    try {
      const userGrant = await UserGrantService.getUserGrant(userId);
      if (userGrant && userGrant.status === 'active' && userGrant.grantId) {
        console.log(`[nylas-remote] Using user grant for ${userId}: ${userGrant.grantId.substring(0, 8)}...`);
        return {
          grantId: userGrant.grantId,
          source: 'user',
          email: userGrant.email,
        };
      }
    } catch (error: any) {
      console.warn(`[nylas-remote] Could not get user grant for ${userId}:`, error.message);
    }
  }

  // Fall back to company default (microservice will use its configured grant)
  console.log(`[nylas-remote] Using company default grant for ${companyId}`);
  return {
    grantId: undefined, // Let microservice use its default
    source: 'company',
  };
}

// ==========================================
// HTTP Client Setup
// ==========================================

/**
 * Get the microservice base URL from company configuration
 * Falls back to NYLAS_MICROSERVICE_URL environment variable if not configured per-company
 */
async function getMicroserviceUrl(companyId: string): Promise<string> {
  // Try company-specific configuration first
  const url = await getApiKey(companyId, 'nylas_microservice_url');
  if (url) {
    return url.replace(/\/$/, ''); // Remove trailing slash
  }

  // Fall back to environment variable
  const envUrl = process.env.NYLAS_MICROSERVICE_URL;
  if (envUrl) {
    console.log('[nylas-remote] Using NYLAS_MICROSERVICE_URL from environment');
    return envUrl.replace(/\/$/, '');
  }

  throw new Error(
    'Nylas microservice URL not configured. Set nylas_microservice_url in company settings or NYLAS_MICROSERVICE_URL environment variable.',
  );
}

/**
 * Get authentication token for GCP IAM (production) or skip for development
 */
async function getAuthToken(): Promise<string | null> {
  // In development, no token needed (microservice allows unauthenticated access)
  if (process.env.NODE_ENV === 'development') {
    return null;
  }

  // In production, use GCP identity token
  // This requires the google-auth-library to be installed
  try {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth();
    const client = await auth.getIdTokenClient(
      process.env.NYLAS_MICROSERVICE_AUDIENCE || '',
    );
    const headers = await client.getRequestHeaders();
    return headers.Authorization?.replace('Bearer ', '') || null;
  } catch (error: any) {
    console.warn(
      '[nylas-remote] Could not get GCP identity token:',
      error.message,
    );
    return null;
  }
}

/**
 * Make an HTTP request to the Nylas microservice
 * @param companyId - Company ID for configuration lookup
 * @param method - HTTP method
 * @param endpoint - API endpoint (without /api/v1/nylas prefix)
 * @param data - Request body data
 * @param userId - Optional user ID to resolve per-user grant
 */
async function callMicroservice<T>(
  companyId: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  data?: any,
  userId?: string,
): Promise<T> {
  const baseUrl = await getMicroserviceUrl(companyId);
  const token = await getAuthToken();

  // Resolve grant ID (user-specific or company default)
  const grantResolution = await resolveGrantId(companyId, userId);

  // Add grantId to URL query params if we have a user-specific grant
  let url = `${baseUrl}/api/v1/nylas${endpoint}`;
  if (grantResolution.grantId) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}grantId=${grantResolution.grantId}`;
  }

  console.log(`[nylas-remote] ${method} ${url} (grant: ${grantResolution.source})`);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Add grantId to request body for POST/PUT requests if present
    let requestData = data;
    if (grantResolution.grantId && data && (method === 'POST' || method === 'PUT')) {
      requestData = { ...data, grantId: grantResolution.grantId };
    }

    const response = await axios({
      method,
      url,
      headers,
      data: requestData,
      timeout: 30000, // 30 second timeout
    });

    return response.data;
  } catch (error: any) {
    const status = error.response?.status;
    const errorData = error.response?.data;

    let errorMessage = `Nylas microservice request failed: ${status || error.message}`;

    if (errorData?.error) {
      errorMessage =
        typeof errorData.error === 'string'
          ? errorData.error
          : JSON.stringify(errorData.error);
    } else if (errorData?.message) {
      errorMessage = errorData.message;
    }

    console.error('[nylas-remote] Error:', {
      status,
      url,
      error: errorData || error.message,
    });

    throw new Error(errorMessage);
  }
}

// ==========================================
// Email Functions
// ==========================================

/**
 * Send an email via the microservice
 * @param companyId - Company ID
 * @param params - Email parameters
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function sendEmail(
  companyId: string,
  params: SendEmailParams,
  userId?: string,
): Promise<{ id: string; threadId?: string }> {
  return callMicroservice(companyId, 'POST', '/email/messages/send', params, userId);
}

/**
 * Get email messages
 * @param companyId - Company ID
 * @param params - Query parameters
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function getMessages(
  companyId: string,
  params: GetMessagesParams = {},
  userId?: string,
): Promise<ListResponse<EmailMessage>> {
  const queryParams = new URLSearchParams();

  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.unread !== undefined)
    queryParams.set('unread', params.unread.toString());
  if (params.subject) queryParams.set('subject', params.subject);
  if (params.from) queryParams.set('from', params.from);
  if (params.to) queryParams.set('to', params.to);
  if (params.threadId) queryParams.set('threadId', params.threadId);

  const query = queryParams.toString();
  return callMicroservice(
    companyId,
    'GET',
    `/email/messages${query ? `?${query}` : ''}`,
    undefined,
    userId,
  );
}

/**
 * Get a specific email message by ID
 * @param companyId - Company ID
 * @param messageId - Message ID
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function getMessageById(
  companyId: string,
  messageId: string,
  userId?: string,
): Promise<{ data: EmailMessage }> {
  return callMicroservice(companyId, 'GET', `/email/messages/${messageId}`, undefined, userId);
}

/**
 * Get email threads
 * @param companyId - Company ID
 * @param params - Query parameters
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function getThreads(
  companyId: string,
  params: { limit?: number } = {},
  userId?: string,
): Promise<ListResponse<EmailThread>> {
  const queryParams = new URLSearchParams();
  if (params.limit) queryParams.set('limit', params.limit.toString());

  const query = queryParams.toString();
  return callMicroservice(
    companyId,
    'GET',
    `/email/threads${query ? `?${query}` : ''}`,
    undefined,
    userId,
  );
}

/**
 * Get a specific email thread by ID
 * @param companyId - Company ID
 * @param threadId - Thread ID
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function getThreadById(
  companyId: string,
  threadId: string,
  userId?: string,
): Promise<{ data: EmailThread }> {
  return callMicroservice(companyId, 'GET', `/email/threads/${threadId}`, undefined, userId);
}

/**
 * List email folders
 * @param companyId - Company ID
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function getFolders(
  companyId: string,
  userId?: string,
): Promise<ListResponse<{ id: string; name: string }>> {
  return callMicroservice(companyId, 'GET', '/email/folders', undefined, userId);
}

// ==========================================
// Calendar Functions
// ==========================================

/**
 * List all calendars
 * @param companyId - Company ID
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function listCalendars(
  companyId: string,
  userId?: string,
): Promise<ListResponse<Calendar>> {
  return callMicroservice(companyId, 'GET', '/calendar/calendars', undefined, userId);
}

/**
 * Get a specific calendar by ID
 * @param companyId - Company ID
 * @param calendarId - Calendar ID
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function getCalendarById(
  companyId: string,
  calendarId: string,
  userId?: string,
): Promise<{ data: Calendar }> {
  return callMicroservice(companyId, 'GET', `/calendar/calendars/${calendarId}`, undefined, userId);
}

/**
 * List calendar events
 * @param companyId - Company ID
 * @param params - Query parameters
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function listEvents(
  companyId: string,
  params: ListEventsParams = {},
  userId?: string,
): Promise<ListResponse<CalendarEvent>> {
  const queryParams = new URLSearchParams();

  if (params.calendarId) queryParams.set('calendarId', params.calendarId);
  if (params.start) queryParams.set('start', params.start.toString());
  if (params.end) queryParams.set('end', params.end.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());

  const query = queryParams.toString();
  return callMicroservice(companyId, 'GET', `/calendar/events${query ? `?${query}` : ''}`, undefined, userId);
}

/**
 * Get a specific event by ID
 * @param companyId - Company ID
 * @param eventId - Event ID
 * @param calendarId - Calendar ID
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function getEventById(
  companyId: string,
  eventId: string,
  calendarId: string,
  userId?: string,
): Promise<{ data: CalendarEvent }> {
  return callMicroservice(
    companyId,
    'GET',
    `/calendar/events/${eventId}?calendarId=${calendarId}`,
    undefined,
    userId,
  );
}

/**
 * Create a new calendar event
 * @param companyId - Company ID
 * @param params - Event parameters
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function createEvent(
  companyId: string,
  params: CreateEventParams,
  userId?: string,
): Promise<{ data: CalendarEvent }> {
  return callMicroservice(companyId, 'POST', '/calendar/events', params, userId);
}

/**
 * Update an existing calendar event
 * @param companyId - Company ID
 * @param eventId - Event ID
 * @param params - Update parameters
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function updateEvent(
  companyId: string,
  eventId: string,
  params: UpdateEventParams,
  userId?: string,
): Promise<{ data: CalendarEvent }> {
  return callMicroservice(companyId, 'PUT', `/calendar/events/${eventId}`, params, userId);
}

/**
 * Delete a calendar event
 * @param companyId - Company ID
 * @param eventId - Event ID
 * @param calendarId - Calendar ID
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function deleteEvent(
  companyId: string,
  eventId: string,
  calendarId: string,
  userId?: string,
): Promise<void> {
  return callMicroservice(
    companyId,
    'DELETE',
    `/calendar/events/${eventId}?calendarId=${calendarId}`,
    undefined,
    userId,
  );
}

/**
 * Check availability for participants
 * @param companyId - Company ID
 * @param params - Availability query parameters
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function checkAvailability(
  companyId: string,
  params: AvailabilityParams,
  userId?: string,
): Promise<any> {
  return callMicroservice(companyId, 'POST', '/calendar/availability', params, userId);
}

/**
 * Get free/busy information
 * @param companyId - Company ID
 * @param params - Free/busy query parameters
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function getFreeBusy(
  companyId: string,
  params: FreeBusyParams,
  userId?: string,
): Promise<any> {
  return callMicroservice(companyId, 'POST', '/calendar/free-busy', params, userId);
}

// ==========================================
// Contact Functions
// ==========================================

/**
 * List contacts
 * @param companyId - Company ID
 * @param params - Query parameters
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function listContacts(
  companyId: string,
  params: ListContactsParams = {},
  userId?: string,
): Promise<ListResponse<Contact>> {
  const queryParams = new URLSearchParams();

  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.offset) queryParams.set('offset', params.offset.toString());
  if (params.email) queryParams.set('email', params.email);
  if (params.group) queryParams.set('group', params.group);

  const query = queryParams.toString();
  return callMicroservice(
    companyId,
    'GET',
    `/contacts${query ? `?${query}` : ''}`,
    undefined,
    userId,
  );
}

/**
 * Get a specific contact by ID
 * @param companyId - Company ID
 * @param contactId - Contact ID
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function getContactById(
  companyId: string,
  contactId: string,
  userId?: string,
): Promise<{ data: Contact }> {
  return callMicroservice(companyId, 'GET', `/contacts/${contactId}`, undefined, userId);
}

/**
 * Create a new contact
 * @param companyId - Company ID
 * @param params - Contact parameters
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function createContact(
  companyId: string,
  params: CreateContactParams,
  userId?: string,
): Promise<{ data: Contact }> {
  return callMicroservice(companyId, 'POST', '/contacts', params, userId);
}

/**
 * Update an existing contact
 * @param companyId - Company ID
 * @param contactId - Contact ID
 * @param params - Update parameters
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function updateContact(
  companyId: string,
  contactId: string,
  params: UpdateContactParams,
  userId?: string,
): Promise<{ data: Contact }> {
  return callMicroservice(companyId, 'PUT', `/contacts/${contactId}`, params, userId);
}

/**
 * Delete a contact
 * @param companyId - Company ID
 * @param contactId - Contact ID
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function deleteContact(
  companyId: string,
  contactId: string,
  userId?: string,
): Promise<void> {
  return callMicroservice(companyId, 'DELETE', `/contacts/${contactId}`, undefined, userId);
}

/**
 * List contact groups
 * @param companyId - Company ID
 * @param userId - Optional user ID for per-user grant resolution
 */
export async function listContactGroups(
  companyId: string,
  userId?: string,
): Promise<ListResponse<ContactGroup>> {
  return callMicroservice(companyId, 'GET', '/contacts/groups', undefined, userId);
}

// ==========================================
// Health Check
// ==========================================

/**
 * Check microservice status
 */
export async function checkStatus(
  companyId: string,
): Promise<{ status: string; configured: boolean }> {
  return callMicroservice(companyId, 'GET', '/status');
}

// ==========================================
// Exported helper for grant resolution
// ==========================================

/**
 * Export resolveGrantId for use by other services that need to check grant status
 */
export { resolveGrantId };
