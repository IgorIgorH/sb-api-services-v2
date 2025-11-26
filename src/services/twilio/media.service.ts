/**
 * Twilio Media Service
 * Downloads audio files from Twilio Media URLs
 */

import axios from 'axios';
import { getApiKey } from '../api.key.service';

interface TwilioCredentials {
  accountSid: string;
  authToken: string;
}

/**
 * Get Twilio credentials for a company
 */
const getTwilioCredentials = async (companyId: string): Promise<TwilioCredentials> => {
  const accountSid = await getApiKey(companyId, 'twilio_account_sid');
  const authToken = await getApiKey(companyId, 'twilio_auth_token');

  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured');
  }

  return { accountSid, authToken };
};

/**
 * Download audio file from Twilio Media URL
 *
 * Twilio Media URLs format:
 * https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages/{MessageSid}/Media/{MediaSid}
 */
export const downloadTwilioMedia = async (
  mediaUrl: string,
  companyId: string
): Promise<Buffer> => {
  console.log(`\n📥 [Twilio Media] Downloading audio from: ${mediaUrl}`);

  try {
    const { accountSid, authToken } = await getTwilioCredentials(companyId);

    // Download media with Twilio authentication
    const response = await axios({
      method: 'GET',
      url: mediaUrl,
      auth: {
        username: accountSid,
        password: authToken
      },
      responseType: 'arraybuffer'
    });

    const audioBuffer = Buffer.from(response.data);
    console.log(`✅ [Twilio Media] Downloaded ${audioBuffer.length} bytes`);

    return audioBuffer;

  } catch (error: any) {
    console.error(`❌ [Twilio Media] Error downloading:`, error.message);
    throw new Error(`Failed to download Twilio media: ${error.message}`);
  }
};

/**
 * Get media URL from Twilio webhook payload
 *
 * Webhook provides MediaUrl0, MediaUrl1, etc. for multiple media attachments
 */
export const extractMediaUrls = (webhookBody: any): string[] => {
  const mediaUrls: string[] = [];
  const numMedia = parseInt(webhookBody.NumMedia || '0', 10);

  for (let i = 0; i < numMedia; i++) {
    const mediaUrl = webhookBody[`MediaUrl${i}`];
    if (mediaUrl) {
      mediaUrls.push(mediaUrl);
    }
  }

  return mediaUrls;
};

/**
 * Check if webhook contains audio media
 */
export const hasAudioMedia = (webhookBody: any): boolean => {
  const numMedia = parseInt(webhookBody.NumMedia || '0', 10);

  for (let i = 0; i < numMedia; i++) {
    const contentType = webhookBody[`MediaContentType${i}`];
    if (contentType && contentType.startsWith('audio/')) {
      return true;
    }
  }

  return false;
};

/**
 * Get audio media URLs only (filter out images, videos)
 */
export const getAudioMediaUrls = (webhookBody: any): string[] => {
  const audioUrls: string[] = [];
  const numMedia = parseInt(webhookBody.NumMedia || '0', 10);

  for (let i = 0; i < numMedia; i++) {
    const contentType = webhookBody[`MediaContentType${i}`];
    const mediaUrl = webhookBody[`MediaUrl${i}`];

    if (contentType && contentType.startsWith('audio/') && mediaUrl) {
      audioUrls.push(mediaUrl);
    }
  }

  return audioUrls;
};

/**
 * Save audio buffer to temporary file (if needed for Google STT)
 */
export const saveAudioToTemp = async (audioBuffer: Buffer, filename: string): Promise<string> => {
  const fs = require('fs').promises;
  const path = require('path');
  const os = require('os');

  const tempDir = os.tmpdir();
  const tempPath = path.join(tempDir, filename);

  await fs.writeFile(tempPath, audioBuffer);
  console.log(`💾 [Twilio Media] Saved to temp: ${tempPath}`);

  return tempPath;
};
