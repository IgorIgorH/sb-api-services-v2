import { Assistant } from '../models/Assistant';
import { ISession, Session } from '../models/Session';
import { CustomError, NotFoundError } from '../utils/errors';
// OpenAI thread service calls removed as it's deprecated in favor of Vercel AI
import { ChannelType } from '../types/ChannelType';
import { getApiKey, ApiKeyType } from './api.key.service';
import { SupportedLanguage } from './discovery.service';
import mongoose from 'mongoose'; // Added for ObjectId generation

export const sessionFriendlyAggreationQuery = [
  {
    $lookup: {
      from: 'users',
      localField: 'userId',
      foreignField: '_id',
      as: 'userDetails',
    },
  },
  {
    $unwind: '$userDetails',
  },
  {
    $lookup: {
      from: 'assistants',
      localField: 'assistantId',
      foreignField: '_id',
      as: 'assistantDetails',
    },
  },
  {
    $unwind: '$assistantDetails',
  },
  {
    $lookup: {
      from: 'companies',
      localField: 'companyId',
      foreignField: '_id',
      as: 'companyDetails',
    },
  },
  {
    $unwind: '$companyDetails',
  },
  {
    $project: {
      assistantId: 1,
      userId: 1,
      companyId: 1,
      userName: '$userDetails.name',
      assistantName: '$assistantDetails.name',
      companyName: '$companyDetails.name',
      threadId: 1,
      active: 1,
      channel: 1,
      language: 1,
    },
  },
];

export const updateSessionAssistant = async (
  sessionId: string,
  assistantId: string,
  companyId: string
): Promise<ISession | null> => {
  const session = await Session.findOneAndUpdate(
    { _id: sessionId, companyId: companyId },
    { assistantId },
    { new: true }
  );

  if (!session) {
    throw new NotFoundError('Session not found');
  }

  return session;
};

export const updateSessionLanguage = async (
  sessionId: string,
  language: string
): Promise<ISession | null> => {
  const session = await Session.findByIdAndUpdate(
    sessionId,
    { language },
    { new: true }
  );

  if (!session) {
    throw new NotFoundError('Session not found');
  }

  return session;
};

export const getSessionById = async (sessionId: string): Promise<ISession> => {
  const session = await Session.findById(sessionId);
  if (!session) {
    throw new NotFoundError('Session not found');
  }
  return session;
};

export const getSessionOrCreate = async (
  apiKey: string,
  userId: string,
  companyId: string,
  channel: ChannelType = ChannelType.WEB,
  language: string = 'en',
  lastAssistantId?: string // Added lastAssistantId parameter
) => {

  const findSession = async () => {
    const session = await Session.findOne({ userId, companyId, channel, active: true });
    if (session) {      
      return session;
    }
    return null;
  };

  let session = await findSession();

  if (session) {
    return {
      _id: session._id,
      assistantId: session.assistantId,
      channel: session.channel,
      language: session.language,
    };
  }

  console.log('No existing session found. Attempting to create a new one.');

  let assistantToUseId;
  if (lastAssistantId) {
    // Validate if the lastAssistantId is a valid assistant for the company
    const assistant = await Assistant.findOne({ _id: lastAssistantId, companyId });
    if (assistant) {
      assistantToUseId = assistant._id;
    } else {
      console.warn(`Last assistant ID ${lastAssistantId} not found or not valid for company ${companyId}. Falling back to default.`);
    }
  }

  if (!assistantToUseId) {
    console.log(`🔍 [SESSION DEBUG] Searching for assistant with companyId: ${companyId} (type: ${typeof companyId})`);
    const defaultAssistant = await Assistant.findOne({ companyId });
    console.log(`🔍 [SESSION DEBUG] Query result:`, defaultAssistant ? `FOUND ${defaultAssistant.name}` : 'NOT FOUND');
    if (!defaultAssistant) {
      // Try with ObjectId conversion
      const objectIdCompanyId = new mongoose.Types.ObjectId(companyId);
      console.log(`🔍 [SESSION DEBUG] Retry with ObjectId: ${objectIdCompanyId}`);
      const retryAssistant = await Assistant.findOne({ companyId: objectIdCompanyId });
      console.log(`🔍 [SESSION DEBUG] Retry result:`, retryAssistant ? `FOUND ${retryAssistant.name}` : 'NOT FOUND');
      if (retryAssistant) {
        assistantToUseId = retryAssistant._id;
      } else {
        console.error(`No default assistant available for companyId: ${companyId}`);
        throw new Error('No default assistant available for this company');
      }
    } else {
      assistantToUseId = defaultAssistant._id;
    }
  }

  // Generate a unique ID for threadId instead of getting it from OpenAI
  const threadId = new mongoose.Types.ObjectId().toString();

  try {
    session = await Session.create({
      userId,
      companyId,
      assistantId: assistantToUseId, // Use determined assistantId
      active: true,
      threadId, // Use the locally generated threadId
      channel,
      language,
    });
    console.log(`New session created: ${session._id} with assistant ${assistantToUseId}`);
  } catch (error: any) {
    if (error.code === 11000) {
      console.log('Duplicate key error encountered. Attempting to fetch existing session.');
      session = await findSession();
      if (!session) {
        console.error('Failed to retrieve session after duplicate key error');
        throw new Error('Failed to create or retrieve session after duplicate key error');
      }
      console.log(`Existing session retrieved after duplicate key error: ${session._id}`);
    } else {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  return {
    _id: session._id,
    assistantId: session.assistantId,
    channel: session.channel,
    language: session.language,
  };
};

export const endSession = async (apiKey: string, sessionId: string): Promise<boolean> => {
  const session = await Session.findOne({ _id: sessionId, active: true });
  
  if (!session) {
    throw new NotFoundError('Active session');
  }

  try {
    // OpenAI thread deletion removed as it's deprecated in favor of Vercel AI
    session.active = false;
    await session.save();

    console.log(`Session ended locally, sessionId: ${sessionId}, userId: ${session.userId}, channel: ${session.channel}`);
    return true;
  } catch (error: any) {
    console.error('Error ending session:', error);
    throw new CustomError('Failed to end session', 500);
  }
};

// Function to ensure the correct index is created
export const ensureSessionIndex = async () => {
  try {
    await Session.collection.dropIndexes();
    await Session.collection.createIndex(
      { companyId: 1, userId: 1, channel: 1 },
      { unique: true, partialFilterExpression: { active: true } }
    );
    console.log('Session index updated successfully');
  } catch (error) {
    console.error('Error updating session index:', error);
  }
};

// Moved from integration.routes.ts
export async function getSessionLanguage(
  userId: string,
  companyId: string,
): Promise<SupportedLanguage> {
  try {
    const apiKey = await getApiKey(companyId, 'openai_api_key' as ApiKeyType);

    if (!apiKey) {
      console.log('OpenAI API key not found, defaulting to English');
      return 'en';
    }

    const session = await getSessionOrCreate(
      apiKey,
      userId,
      companyId,
      ChannelType.WEB,
      'en', // Default language
    );
    
    return session.language as SupportedLanguage;
  } catch (error) {
    console.error('Error getting session language:', error);
    return 'en'; // Default to English if there's an error
  }
}
