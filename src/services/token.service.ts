/// file_path: src/services/token.service.ts
import jwt from 'jsonwebtoken';
import { Company } from '../models/Company';
import { User, IUser } from '../models/User';
import { decryptData } from './encryption.service';

export const verifyToken = async (token: string): Promise<{ user: IUser; company: any; decryptedApiKey: string }> => {
  try {
    console.log('🔍 [TOKEN DEBUG] Starting token verification...');
    console.log('🔍 [TOKEN DEBUG] JWT_SECRET exists:', !!process.env.JWT_SECRET);
    console.log('🔍 [TOKEN DEBUG] JWT_SECRET length:', process.env.JWT_SECRET?.length || 0);
    console.log('🔍 [TOKEN DEBUG] JWT_SECRET first 10 chars:', process.env.JWT_SECRET?.substring(0, 10));

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: string; email: string; companyId: string };
    console.log('✅ [TOKEN DEBUG] JWT decoded successfully:', decoded);

    const user = await User.findById(decoded.userId);
    console.log('🔍 [TOKEN DEBUG] User query result:', user ? 'FOUND' : 'NOT FOUND');
    if (!user) {
      console.error('❌ [TOKEN DEBUG] User not found with ID:', decoded.userId);
      throw new Error('User not found');
    }
    console.log('✅ [TOKEN DEBUG] User found:', user.email);

    const company = await Company.findById(decoded.companyId);
    console.log('🔍 [TOKEN DEBUG] Company query result:', company ? 'FOUND' : 'NOT FOUND');
    if (!company) {
      console.error('❌ [TOKEN DEBUG] Company not found with ID:', decoded.companyId);
      throw new Error('Company not found');
    }
    console.log('✅ [TOKEN DEBUG] Company found:', company.name);

    let decryptedApiKey = 'not set';
    const apiKey = company.api_keys.find(key => key.key === 'openai_api_key');
    if (apiKey) {
      try {
        decryptedApiKey = decryptData({ 'value': apiKey.value, 'iv': apiKey.iv, 'tag': apiKey.tag });
        console.log('✅ [TOKEN DEBUG] API key decrypted successfully');
      } catch (decryptError) {
        console.warn('⚠️  [TOKEN DEBUG] Could not decrypt API key (likely different ENCRYPTION_KEY). Using environment variable instead.');
        decryptedApiKey = process.env.OPENAI_API_KEY || 'not set';
      }
    }

    console.log('✅ [TOKEN DEBUG] Token verification successful!');
    return { user, company, decryptedApiKey };
  } catch (error) {
    console.error('❌ [TOKEN DEBUG] Token verification failed:', error);
    throw new Error('Invalid token');
  }
};

export const extractTokenFromHeader = (authHeader: string | undefined): string => {
  console.log('[AUTH DEBUG] authHeader:', authHeader);
  if (!authHeader) {
    throw new Error('No authorization header provided');
  }
  const parts = authHeader.split(' ');
  console.log('[AUTH DEBUG] parts.length:', parts.length, 'parts[0]:', parts[0]);
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    console.error('[AUTH DEBUG] Invalid format - parts:', parts);
    throw new Error('Invalid authorization header format');
  }
  console.log('[AUTH DEBUG] Token extracted, length:', parts[1].length);
  return parts[1];
};

