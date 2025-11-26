import { Company } from '../models/Company';
import { decryptData } from './encryption.service';
import NodeCache from 'node-cache';
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export type ApiKeyType =
  | 'openai_api_key'
  | 'labs11_api_key'
  | 'google_api_key'
  | 'anthropic_api_key' // Added anthropic_api_key
  | 'twilio_api_key'
  | 'twilio_account_sid' // Added for Twilio integration
  | 'twilio_auth_token' // Added for Twilio integration
  | 'twilio_phone_number' // Added for Twilio integration
  | 'jsonbin_api_key'
  | 'getimg_api_key'
  | 'perplexity_api_key'
  | 'sendgrid_api_key'
  | 'photoroom_api_key'
  | 'telegram_bot_api_key'
  | 'linear_api_key'
  | 'replicate_api_key'
  | 'executor_agent_url'
  | 'executor_agent_token'
  | 'jira_api_token'
  | 'jira_domain'
  | 'jira_email'
  | 'jira_project_key' // Added for WhatsApp-Jira bridge
  | 'google_client_id'
  | 'google_client_secret'
  | 'google_refresh_token'
  | 'imap_email'
  | 'imap_password'
  | 'imap_host'
  | 'imap_port'
  | 'imap_tls';

// Initialize cache with a 15-minute TTL (time to live)
const apiKeyCache = new NodeCache({ stdTTL: 900 });

export const getApiKey = async (
  companyId: string,
  keyType: ApiKeyType,
): Promise<string | null> => {
  const cacheKey = `${companyId}:${keyType}`;

  // Check cache first
  const cachedKey = apiKeyCache.get<string>(cacheKey);
  if (cachedKey) {
    return cachedKey;
  }

  // If not in cache, fetch from database
  const company = await Company.findById(companyId);
  if (!company) {
    throw new Error('Company not found');
  }

  const apiKey = company.api_keys.find(
    (key) => key.key === keyType,
  );
  if (!apiKey) {
    return null;
  }

  let decryptedKey: string;
  try {
    decryptedKey = decryptData({
      value: apiKey.value,
      iv: apiKey.iv,
      tag: apiKey.tag,
    });
  } catch (decryptError) {
    // Try to fallback to environment variable
    const envKeyName = keyType.toUpperCase().replace(/_API_KEY$/, '_API_KEY');
    const envKey = process.env[envKeyName];
    if (envKey) {
      console.warn(`⚠️  [API KEY SERVICE] Could not decrypt API key '${keyType}' for company ${companyId}. Using environment variable ${envKeyName}.`);
      apiKeyCache.set(cacheKey, envKey);
      return envKey;
    }
    console.warn(`⚠️  [API KEY SERVICE] Could not decrypt API key '${keyType}' for company ${companyId} and no environment variable found. Using null.`);
    return null;
  }

  // Store in cache
  apiKeyCache.set(cacheKey, decryptedKey);

  return decryptedKey;
};

export const setApiKey = async (
  companyId: string,
  keyType: ApiKeyType,
  apiKey: string,
): Promise<void> => {
  const company = await Company.findById(companyId);
  if (!company) {
    throw new Error('Company not found');
  }

  // Implementation of encryption and saving the API key
  // This part depends on your encryption service and how you store API keys
  // ...

  await company.save();

  // Update cache
  updateApiKeyCache(companyId, keyType, apiKey);
};

export const updateApiKeyCache = (
  companyId: string,
  keyType: ApiKeyType,
  apiKey: string,
): void => {
  const cacheKey = `${companyId}:${keyType}`;
  apiKeyCache.set(cacheKey, apiKey);
};

export const invalidateApiKeyCache = (
  companyId: string,
  keyType: ApiKeyType,
): void => {
  const cacheKey = `${companyId}:${keyType}`;
  apiKeyCache.del(cacheKey);
};

export const refreshApiKeyCache = async (companyId: string): Promise<void> => {
  const company = await Company.findById(companyId);
  if (!company) {
    throw new Error('Company not found');
  }

  for (const apiKey of company.api_keys) {
    const keyType = apiKey.key as ApiKeyType;
    try {
      const decryptedKey = decryptData({
        value: apiKey.value,
        iv: apiKey.iv,
        tag: apiKey.tag,
      });
      updateApiKeyCache(companyId, keyType, decryptedKey);
    } catch (decryptError) {
      // Try to fallback to environment variable
      const envKeyName = keyType.toUpperCase().replace(/_API_KEY$/, '_API_KEY');
      const envKey = process.env[envKeyName];
      if (envKey) {
        console.warn(`⚠️  [API KEY SERVICE] Could not decrypt API key '${keyType}' for company ${companyId} during cache refresh. Using environment variable ${envKeyName}.`);
        updateApiKeyCache(companyId, keyType, envKey);
      } else {
        console.warn(`⚠️  [API KEY SERVICE] Could not decrypt API key '${keyType}' for company ${companyId} during cache refresh and no environment variable found. Skipping.`);
      }
    }
  }
};

export const validateApiKeys = (requiredKeys: ApiKeyType[]) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    const missingKeys: ApiKeyType[] = [];

    for (const keyType of requiredKeys) {
      const apiKey = await getApiKey(req.company._id, keyType);
      if (apiKey === null) {
        missingKeys.push(keyType);
      }
    }

    if (missingKeys.length > 0) {
      return res.status(400).json({
        error: 'Missing API keys',
        missingKeys,
      });
    }

    next();
  };
};
