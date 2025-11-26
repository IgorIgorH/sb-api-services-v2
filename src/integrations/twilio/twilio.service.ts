/**
 * Twilio Integration Service
 * Provides SMS, Voice Call, and WhatsApp messaging capabilities
 */

import { Twilio } from 'twilio';
import { getApiKey } from '../../services/api.key.service';

interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

/**
 * Get Twilio credentials for a company
 */
const getTwilioCredentials = async (companyId: string): Promise<TwilioCredentials> => {
  console.log(`\n📞 [Twilio Service] Getting credentials for company ${companyId}`);

  const accountSid = await getApiKey(companyId, 'twilio_account_sid');
  const authToken = await getApiKey(companyId, 'twilio_auth_token');
  const phoneNumber = await getApiKey(companyId, 'twilio_phone_number');

  if (!accountSid || !authToken || !phoneNumber) {
    throw new Error(
      'Twilio credentials not configured. Please add twilio_account_sid, twilio_auth_token, and twilio_phone_number to your company API keys.'
    );
  }

  return { accountSid, authToken, phoneNumber };
};

/**
 * Get initialized Twilio client
 */
const getTwilioClient = async (companyId: string): Promise<Twilio> => {
  const { accountSid, authToken } = await getTwilioCredentials(companyId);
  return new Twilio(accountSid, authToken);
};

/**
 * Send SMS message
 */
export const sendSMS = async (
  companyId: string,
  to: string,
  message: string
): Promise<{ success: boolean; messageSid?: string; error?: string }> => {
  console.log(`\n📞 [Twilio Service] Sending SMS to ${to}`);

  try {
    const { phoneNumber } = await getTwilioCredentials(companyId);
    const client = await getTwilioClient(companyId);

    const messageResponse = await client.messages.create({
      body: message,
      from: phoneNumber,
      to: to,
    });

    console.log(`✅ [Twilio Service] SMS sent successfully. SID: ${messageResponse.sid}`);

    return {
      success: true,
      messageSid: messageResponse.sid,
    };
  } catch (error: any) {
    console.error(`❌ [Twilio Service] Error sending SMS:`, error);
    return {
      success: false,
      error: error.message || 'Failed to send SMS',
    };
  }
};

/**
 * Get SMS message history
 */
export const getSMSHistory = async (
  companyId: string,
  limit: number = 20
): Promise<{ success: boolean; messages?: any[]; error?: string }> => {
  console.log(`\n📞 [Twilio Service] Getting SMS history (limit: ${limit})`);

  try {
    const client = await getTwilioClient(companyId);

    const messages = await client.messages.list({ limit });

    const formattedMessages = messages.map((msg) => ({
      sid: msg.sid,
      from: msg.from,
      to: msg.to,
      body: msg.body,
      status: msg.status,
      direction: msg.direction,
      dateCreated: msg.dateCreated,
      dateSent: msg.dateSent,
    }));

    console.log(`✅ [Twilio Service] Retrieved ${formattedMessages.length} SMS messages`);

    return {
      success: true,
      messages: formattedMessages,
    };
  } catch (error: any) {
    console.error(`❌ [Twilio Service] Error getting SMS history:`, error);
    return {
      success: false,
      error: error.message || 'Failed to get SMS history',
    };
  }
};

/**
 * Make voice call
 */
export const makeCall = async (
  companyId: string,
  to: string,
  twimlUrl: string
): Promise<{ success: boolean; callSid?: string; error?: string }> => {
  console.log(`\n📞 [Twilio Service] Making call to ${to}`);

  try {
    const { phoneNumber } = await getTwilioCredentials(companyId);
    const client = await getTwilioClient(companyId);

    const call = await client.calls.create({
      url: twimlUrl,
      to: to,
      from: phoneNumber,
    });

    console.log(`✅ [Twilio Service] Call initiated. SID: ${call.sid}`);

    return {
      success: true,
      callSid: call.sid,
    };
  } catch (error: any) {
    console.error(`❌ [Twilio Service] Error making call:`, error);
    return {
      success: false,
      error: error.message || 'Failed to make call',
    };
  }
};

/**
 * Get call logs
 */
export const getCallLogs = async (
  companyId: string,
  limit: number = 20
): Promise<{ success: boolean; calls?: any[]; error?: string }> => {
  console.log(`\n📞 [Twilio Service] Getting call logs (limit: ${limit})`);

  try {
    const client = await getTwilioClient(companyId);

    const calls = await client.calls.list({ limit });

    const formattedCalls = calls.map((call) => ({
      sid: call.sid,
      from: call.from,
      to: call.to,
      status: call.status,
      direction: call.direction,
      duration: call.duration,
      startTime: call.startTime,
      endTime: call.endTime,
    }));

    console.log(`✅ [Twilio Service] Retrieved ${formattedCalls.length} call logs`);

    return {
      success: true,
      calls: formattedCalls,
    };
  } catch (error: any) {
    console.error(`❌ [Twilio Service] Error getting call logs:`, error);
    return {
      success: false,
      error: error.message || 'Failed to get call logs',
    };
  }
};

/**
 * Send WhatsApp message
 */
export const sendWhatsApp = async (
  companyId: string,
  to: string,
  message: string
): Promise<{ success: boolean; messageSid?: string; error?: string }> => {
  console.log(`\n📞 [Twilio Service] Sending WhatsApp message to ${to}`);

  try {
    const { phoneNumber } = await getTwilioCredentials(companyId);
    const client = await getTwilioClient(companyId);

    // WhatsApp numbers must be prefixed with 'whatsapp:'
    const whatsappTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const whatsappFrom = phoneNumber.startsWith('whatsapp:') ? phoneNumber : `whatsapp:${phoneNumber}`;

    const messageResponse = await client.messages.create({
      body: message,
      from: whatsappFrom,
      to: whatsappTo,
    });

    console.log(`✅ [Twilio Service] WhatsApp message sent. SID: ${messageResponse.sid}`);

    return {
      success: true,
      messageSid: messageResponse.sid,
    };
  } catch (error: any) {
    console.error(`❌ [Twilio Service] Error sending WhatsApp message:`, error);
    return {
      success: false,
      error: error.message || 'Failed to send WhatsApp message',
    };
  }
};
