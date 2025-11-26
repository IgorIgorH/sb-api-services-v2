import { Session } from '../../models/Session';
import { Assistant } from '../../models/Assistant';
import { Message, IMessage } from '../../models/Message'; // Added IMessage
import { processTemplate } from '../template.service';
import { ChannelType } from '../../types/ChannelType';
import { SupportedLanguage } from '../discovery.service'; // Added import
import mongoose from 'mongoose';
import { getMessagesBySessionId } from '../../services/message.service';
import { createFunctionFactory } from '../../integrations/actions/loaders';
import { executeFunctionCall } from '../../integrations/actions/executors';
import { FunctionCall } from '../../integrations/actions/types';
import { getApiKey } from '../api.key.service';
import { fetchGcpFileContent } from '../../integrations/gcp_file_fetcher/gcp_file_fetcher.service';
import axios from 'axios'; // Added axios for fetching image data

// Vercel AI SDK imports
import { generateText, tool, streamText, CoreMessage, StreamTextResult, Tool, ImagePart, TextPart } from 'ai'; 
import { z, ZodTypeAny } from 'zod';
import { trimToWindow } from '../../utils/tokenWindow'; 
import { getProvider } from './provider.service'; 
// import util from 'node:util'; // No longer needed after debug log removal

// Simple in-memory cache for toolsForSdk
const toolsCache = new Map<string, Record<string, Tool<any, any>>>();

// Helper function to clean action annotations from text
const cleanActionAnnotations = (text: string): string => {
  // Remove [Action: ...] annotations and similar patterns
  return text
    .replace(/\[Action:\s*[^\]]+\]/gi, '')
    .replace(/\[.*?action.*?\]/gi, '')
    .replace(/[ \t]+/g, ' ') // Only clean spaces/tabs, preserve newlines for markdown
    .trim();
};

const saveSystemMessage = async (
  sessionId: mongoose.Types.ObjectId,
  assistantId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  content: string,
  messageType: string,
  data?: any
) => {
  const systemMessage = new Message({
    sessionId,
    sender: 'system',
    content,
    assistantId,
    userId,
    timestamp: new Date(),
    messageType,
    data,
  });
  await systemMessage.save();
};

export const handleCustomMessage = async (
  sessionId: string,
  messageType: string,
  content: string,
  data?: any
) => {
  const session = await Session.findById(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const customMessage = new Message({
    sessionId: session._id,
    sender: 'system',
    content,
    assistantId: session.assistantId,
    userId: session.userId,
    timestamp: new Date(),
    messageType,
    data,
  });
  await customMessage.save();
};

export const handleIntegrationActionUpdate = async (
  sessionId: string,
  actionName: string,
  status: 'started' | 'completed' | 'failed',
  result?: any
) => {
  const content = `Integration action '${actionName}' ${status}`;
  await handleCustomMessage(sessionId, 'integration_action_update', content, { actionName, status, result });
};

export const handleProductOffer = async (
  sessionId: string,
  productName: string,
  price: number,
  description: string
) => {
  const content = `New product offer: ${productName}`;
  await handleCustomMessage(sessionId, 'product_offer', content, { productName, price, description });
};

interface Attachment {
  fileId: string;
  url: string;
  mimeType: string;
  fileName: string;
}

type OpenAIImageUrlPart = {
  type: 'image_url';
  image_url: { url: string; detail?: 'low' | 'high' | 'auto' };
};


export const handleSessionMessage = async (
  userInput: string,
  sessionId: string,
  channel: ChannelType = ChannelType.WEB,
  metadata?: Record<string, string>,
  attachments?: Attachment[]
): Promise<string | StreamTextResult<Record<string, Tool<any, any>>, unknown>> => { 
  console.log(`Handling session message for session ${sessionId} on channel ${channel}`);
  const session = await Session.findById(sessionId);
  if (!session || !session.active || session.channel !== channel) {
    throw new Error('Invalid or inactive session, or channel mismatch');
  }

  const assistant = await Assistant.findOne({
    _id: new mongoose.Types.ObjectId(session.assistantId),
  });

  if (!assistant) {
    throw new Error('Assistant not found');
  }
  console.log(`Fetched assistant details: Provider='${assistant.llmProvider}', Model='${assistant.llmModel}'`);
  const providerKey = assistant.llmProvider;
  let processedUserInput = userInput;
  // This will hold the parts for the user's message, including text, image, and file parts
  // Using a flexible type for modern PDF handling
  const userMessageContentParts: (TextPart | ImagePart | any)[] = [{ type: 'text', text: processedUserInput }];

  if (attachments && attachments.length > 0) {
    console.log(`Processing ${attachments.length} attachments for session ${sessionId} with provider ${providerKey}`);
    for (const attachment of attachments) {
      if (attachment.mimeType.startsWith('image/')) {
        try {
          console.log(`Fetching image: ${attachment.fileName} from ${attachment.url}`);
          const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
          const imageBuffer = Buffer.from(response.data);
          
          // Use Uint8Array for all providers (recommended approach)
          userMessageContentParts.push({
            type: 'image',
            image: new Uint8Array(imageBuffer),
            mimeType: attachment.mimeType,
          });
          console.log(`Image attachment processed as Uint8Array for ${providerKey}: ${attachment.fileName}`);
        } catch (error) {
          console.error(`Error fetching or processing image data from URL ${attachment.url} for ${attachment.fileName}:`, error);
          // Append error info to the text part of the user message
          (userMessageContentParts[0] as TextPart).text += `\n\n[Could not load image: ${attachment.fileName}]`;
        }
      } else if (attachment.fileId && attachment.mimeType === 'application/pdf') { // Modern PDF handling
        try {
          console.log(`Fetching PDF content AS BUFFER: ${attachment.fileName} (ID: ${attachment.fileId}) for ${providerKey}`);
          const pdfBufferResult = await fetchGcpFileContent(sessionId, session.companyId.toString(), { fileId: attachment.fileId, returnAs: 'buffer' });

          if (pdfBufferResult.success && pdfBufferResult.data instanceof Buffer) {
            // For now, use text extraction approach for all providers until file parts are fully stable
            const fileContentResult = await fetchGcpFileContent(sessionId, session.companyId.toString(), { fileId: attachment.fileId, returnAs: 'string' });
            if (fileContentResult.success && typeof fileContentResult.data === 'string') {
              let pdfTextToAppend = fileContentResult.data;
              const MAX_PDF_TEXT_CHARS = 7000;
              if (pdfTextToAppend.length > MAX_PDF_TEXT_CHARS) {
                pdfTextToAppend = pdfTextToAppend.substring(0, MAX_PDF_TEXT_CHARS) + "\n\n[...PDF text truncated due to length...]\n";
                console.log(`Truncated extracted PDF text for ${attachment.fileName} to ${MAX_PDF_TEXT_CHARS} characters.`);
              }
              (userMessageContentParts[0] as TextPart).text += `\n\n--- Attached PDF: ${attachment.fileName} ---\n${pdfTextToAppend}\n--- End of File ---`;
              console.log(`${providerKey} PDF attachment processed as text extraction: ${attachment.fileName}`);
            } else {
              // Fallback for unknown providers: text extraction
              const fileContentResult = await fetchGcpFileContent(sessionId, session.companyId.toString(), { fileId: attachment.fileId, returnAs: 'string' });
              if (fileContentResult.success && typeof fileContentResult.data === 'string') {
                (userMessageContentParts[0] as TextPart).text += `\n\n--- Attached PDF (text fallback): ${attachment.fileName} ---\n${fileContentResult.data.slice(0, 7000)}\n--- End of File ---`;
              } else {
                (userMessageContentParts[0] as TextPart).text += `\n\n[PDF omitted: provider ${providerKey} does not support files]`;
              }
              console.log(`PDF processed as text fallback for ${providerKey}: ${attachment.fileName}`);
            }
          } else {
            console.warn(`Could not fetch PDF as buffer: ${attachment.fileName}. Error: ${pdfBufferResult.error || 'Unknown error'}. Falling back to text extraction.`);
            const fileContentResult = await fetchGcpFileContent(sessionId, session.companyId.toString(), { fileId: attachment.fileId, returnAs: 'string' });
            if (fileContentResult.success && typeof fileContentResult.data === 'string') {
              let pdfTextToAppend = fileContentResult.data;
              const MAX_PDF_TEXT_CHARS = 7000;
              if (pdfTextToAppend.length > MAX_PDF_TEXT_CHARS) {
                pdfTextToAppend = pdfTextToAppend.substring(0, MAX_PDF_TEXT_CHARS) + "\n\n[...PDF text truncated due to length...]\n";
                console.log(`Truncated extracted PDF text for ${attachment.fileName} to ${MAX_PDF_TEXT_CHARS} characters.`);
              }
              (userMessageContentParts[0] as TextPart).text += `\n\n--- Attached PDF (text fallback): ${attachment.fileName} ---\n${pdfTextToAppend}\n--- End of File ---`;
            } else {
              (userMessageContentParts[0] as TextPart).text += `\n\n[Could not load PDF content: ${attachment.fileName}]`;
            }
          }
        } catch (error) {
          console.error(`Error fetching/processing PDF ${attachment.fileName}:`, error);
          (userMessageContentParts[0] as TextPart).text += `\n\n[Error loading PDF: ${attachment.fileName}]`;
        }
      } else if (attachment.fileId) { // Other non-image files (TXT, CSV, etc.)
        try {
          console.log(`Fetching non-image file content AS TEXT: ${attachment.fileName} (ID: ${attachment.fileId}) for provider ${providerKey}`);
          const fileContentResult = await fetchGcpFileContent(sessionId, session.companyId.toString(), { fileId: attachment.fileId, returnAs: 'string' });
          
          if (fileContentResult.success && typeof fileContentResult.data === 'string') {
            (userMessageContentParts[0] as TextPart).text += `\n\n--- Attached File: ${attachment.fileName} ---\n${fileContentResult.data}\n--- End of File: ${attachment.fileName} ---`;
            console.log(`Non-image file content (text) appended for ${providerKey}: ${attachment.fileName}`);
          } else {
            console.warn(`Could not fetch content for file: ${attachment.fileName} (ID: ${attachment.fileId}). Result: ${JSON.stringify(fileContentResult)}`);
            (userMessageContentParts[0] as TextPart).text += `\n\n[Could not load content for attached file: ${attachment.fileName}]`;
          }
        } catch (error) {
          console.error(`Error fetching content for file ${attachment.fileName} (ID: ${attachment.fileId}):`, error);
          (userMessageContentParts[0] as TextPart).text += `\n\n[Error loading content for attached file: ${attachment.fileName}]`;
        }
      }
    }
    // IMPORTANT: processedUserInput for DB storage should ideally be the original text part,
    // without appended file contents if the file is sent as a separate blob.
    // The userMessageContentParts[0] is the TextPart.
    // If files were attached as blobs, their text content is NOT in userMessageContentParts[0].text.
    // If files were attached by appending text, their content IS in userMessageContentParts[0].text.
    // For simplicity in this change, we'll keep processedUserInput reflecting the primary text part.
    // The original user input is already stored in metadata.
    processedUserInput = (userMessageContentParts.find(part => part.type === 'text') as TextPart)?.text || userInput;
  }

  const userMessage = new Message({
    sessionId: new mongoose.Types.ObjectId(session._id),
    sender: 'user',
    // Store the user's original typed text, or the text part if it was modified by errors/fallbacks.
    // Avoid storing large extracted PDF text here if the PDF is sent as a blob.
    content: (userMessageContentParts.find(part => part.type === 'text') as TextPart)?.text || userInput,
    assistantId: new mongoose.Types.ObjectId(assistant._id),
    userId: new mongoose.Types.ObjectId(session.userId),
    timestamp: new Date(),
    messageType: attachments && attachments.length > 0 ? 'file_upload_text' : 'text', 
    data: {
      ...(metadata || {}),
      originalUserInput: userInput, 
      attachments: attachments?.map(att => ({ 
        fileName: att.fileName,
        mimeType: att.mimeType,
        fileId: att.fileId,
        url: att.url, 
      }))
    },
  });
  await userMessage.save();

  const dbMessages = await getMessagesBySessionId(sessionId.toString());
  const history: CoreMessage[] = dbMessages
    .filter(msg => (msg.sender === 'user' || msg.sender === 'assistant') && typeof msg.content === 'string')
    .map((msg: IMessage) => ({
      role: msg.sender as 'user' | 'assistant',
      content: msg.content as string, 
    }));

  const actionContext = { sessionId: sessionId.toString(), companyId: session.companyId.toString(), language: session.language as SupportedLanguage };
  
  const cacheKey = `${assistant._id.toString()}-${JSON.stringify(assistant.allowedActions.slice().sort())}`;
  let toolsForSdk: Record<string, Tool<any, any>>;

  if (toolsCache.has(cacheKey)) {
    toolsForSdk = toolsCache.get(cacheKey)!;
    console.log(`Using cached toolsForSdk for assistant ${assistant._id}`);
  } else {
    toolsForSdk = {};
    const functionFactory = await createFunctionFactory(actionContext, assistant.allowedActions);
    console.log(`[Tool Creation] Created function factory with actions:`, Object.keys(functionFactory));
    console.log(`[Tool Creation] Assistant allowedActions:`, assistant.allowedActions);
    for (const funcName in functionFactory) {
      const funcDef = functionFactory[funcName];
      console.log(`[Tool Creation] Processing function: ${funcName}`);
      const zodShape: Record<string, ZodTypeAny> = {};
    let saneRequiredParams: string[] = [];

    if (funcDef.parameters?.required && Array.isArray(funcDef.parameters.required) && funcDef.parameters.properties) {
        saneRequiredParams = funcDef.parameters.required.filter(reqParam => 
            typeof reqParam === 'string' && reqParam.trim() !== '' && funcDef.parameters.properties!.hasOwnProperty(reqParam)
        );
    }

    if (funcDef.parameters && funcDef.parameters.properties) {
      for (const paramName in funcDef.parameters.properties) {
        const paramDef = funcDef.parameters.properties[paramName] as any;
        let zodType: ZodTypeAny;
        switch (paramDef.type) {
          case 'string': zodType = z.string(); break;
          case 'number': zodType = z.number(); break;
          case 'integer': zodType = z.number().int(); break;
          case 'boolean': zodType = z.boolean(); break;
          case 'array':
            if (paramDef.items && paramDef.items.type === 'string') zodType = z.array(z.string());
            else if (paramDef.items && paramDef.items.type === 'number') zodType = z.array(z.number());
            else if (paramDef.items && paramDef.items.type === 'boolean') zodType = z.array(z.boolean());
            else zodType = z.array(z.any());
            break;
          case 'object': zodType = z.record(z.string(), z.any()); break; 
          default: zodType = z.any();
        }
        if (paramDef.description) zodType = zodType.describe(paramDef.description);
        
        if (!saneRequiredParams.includes(paramName)) {
            zodType = zodType.optional();
        }
        zodShape[paramName] = zodType;
      }
    }
    const zodSchema = Object.keys(zodShape).length > 0 ? z.object(zodShape) : z.object({});
    const currentFuncName = funcName;
    
    let executeFunc = async (args: any) => {
      console.log(`\n🔧 [Tool Execution] ===== TOOL CALLED: ${currentFuncName} =====`);
      console.log(`🔧 [Tool Execution] Arguments:`, JSON.stringify(args, null, 2));
      console.log(`🔧 [Tool Execution] SessionId from closure: ${sessionId}`);

      const currentSession = await Session.findById(sessionId);
      if (!currentSession) {
        throw new Error('Session not found during tool execution');
      }
      console.log(`🔧 [Tool Execution] Session ID: ${currentSession._id.toString()}, Company ID: ${currentSession.companyId.toString()}`);

      const functionCallPayload: FunctionCall = { function: { name: currentFuncName, arguments: JSON.stringify(args) } };
      console.log(`🔧 [Tool Execution] Calling executeFunctionCall with payload:`, functionCallPayload);

      const { result, error } = await executeFunctionCall(
        functionCallPayload,
        currentSession._id.toString(),
        currentSession.companyId.toString(),
        assistant.allowedActions
      );

      if (error) {
        console.error(`❌ [Tool Execution] Error in tool ${currentFuncName}:`, error);
        throw new Error(typeof error === 'string' ? error : (error as any)?.message || 'Tool execution failed');
      }

      console.log(`✅ [Tool Execution] Tool ${currentFuncName} completed successfully`);
      console.log(`✅ [Tool Execution] Result:`, JSON.stringify(result, null, 2));
      console.log(`✅ [Tool Execution] ===== END TOOL: ${currentFuncName} =====\n`);

      return result;
    };
    
    if (currentFuncName === 'jira_fetchTickets') { 
      executeFunc = async (args: any) => {
        const currentSession = await Session.findById(sessionId);
        if (!currentSession) {
          throw new Error('Session not found during tool execution');
        }
        
        const { result: rawResult, error } = await executeFunctionCall(
          { function: { name: currentFuncName, arguments: JSON.stringify(args) } }, 
          currentSession._id.toString(), 
          currentSession.companyId.toString(), 
          assistant.allowedActions
        );
        if (error) throw new Error(typeof error === 'string' ? error : (error as any)?.message || 'Tool execution failed');
        if (Array.isArray(rawResult)) return rawResult.map((ticket: any) => ({ key: ticket.key, summary: ticket.fields?.summary, status: ticket.fields?.status?.name }));
        return rawResult;
      };
    }
      console.log(`🔧 [Tool Creation] Registering tool: ${funcName}`);
      toolsForSdk[funcName] = tool({ description: funcDef.description, parameters: zodSchema, execute: executeFunc });
    }
    toolsCache.set(cacheKey, toolsForSdk);
    console.log(`Cached toolsForSdk for assistant ${assistant._id}`);
  }
  
  let modelIdentifier = assistant.llmModel || 'gpt-4o-mini'; 
  const llmApiKey = await getApiKey(session.companyId.toString(), `${providerKey}_api_key`);
  if (!llmApiKey) throw new Error(`${providerKey} API key not found for company.`);

  if (providerKey === 'google' && modelIdentifier && !modelIdentifier.startsWith('models/')) {
    modelIdentifier = `models/${modelIdentifier}`;
    console.log(`Prefixed Google model ID: ${modelIdentifier}`);
  }
    
  console.log(`Using LLM provider: ${providerKey}, model: ${modelIdentifier} for session ${sessionId}`);
  const shouldStream = metadata?.['X-Experimental-Stream'] === 'true';
  console.log(`Should stream: ${shouldStream}`);

  const systemPrompt = await processTemplate(assistant.llmPrompt, sessionId.toString());

  // Construct user message content for LLM
  // The userMessageForLlm will now use the userMessageContentParts array
  const userMessageForLlm: CoreMessage = {
    role: 'user',
    content: userMessageContentParts, // This array contains text and formatted image parts
  };

  const messagesForLlm: CoreMessage[] = [...history, userMessageForLlm];
  console.log('Messages prepared for LLM (content parts might be complex):', 
    messagesForLlm.map(m => ({ 
      role: m.role, 
      contentPreview: Array.isArray(m.content) 
        ? m.content.map(p => p.type === 'text' ? `${p.type}: ${p.text.substring(0,50)}...` : `${p.type}: [${(p as ImagePart).mimeType || 'image data'}]`).join(', ')
        : typeof m.content === 'string' ? m.content.substring(0,100) + '...' : 'Unknown content structure'
    }))
  );
  
  const TOKEN_LIMITS = {
    google: { 'gemini-1.5': 20000, default: 7000 }, 
    openai: { 'gpt-4o': 8000, 'gpt-4': 8000, 'gpt-4-turbo': 8000, default: 7000 }, 
    anthropic: { 
      'claude-3-opus-20240229': 190000, 
      'claude-3-sonnet-20240229': 190000,
      'claude-3-haiku-20240307': 190000,
      default: 100000 
    },
    default: { default: 7000 } 
  } as const;
  
  let maxPromptTokens: number;
  const providerConfig = TOKEN_LIMITS[providerKey as keyof typeof TOKEN_LIMITS] || TOKEN_LIMITS.default;
  
  if (providerKey === 'google') {
    maxPromptTokens = modelIdentifier?.includes('gemini-1.5') 
      ? providerConfig['gemini-1.5' as keyof typeof providerConfig] 
      : providerConfig.default;
  } else if (providerKey === 'openai') {
    if (modelIdentifier?.includes('gpt-4o')) maxPromptTokens = providerConfig['gpt-4o' as keyof typeof providerConfig];
    else if (modelIdentifier?.includes('gpt-4-turbo')) maxPromptTokens = providerConfig['gpt-4-turbo' as keyof typeof providerConfig]; 
    else if (modelIdentifier?.includes('gpt-4')) maxPromptTokens = providerConfig['gpt-4' as keyof typeof providerConfig];
    else maxPromptTokens = providerConfig.default;
  } else if (providerKey === 'anthropic') {
    if (modelIdentifier && providerConfig.hasOwnProperty(modelIdentifier)) {
      maxPromptTokens = providerConfig[modelIdentifier as keyof typeof providerConfig];
    } else {
      maxPromptTokens = providerConfig.default;
    }
  } else {
    maxPromptTokens = providerConfig.default;
  }
  
  let { trimmedMessages, tokensInPrompt: actualTokensInPrompt } = trimToWindow(messagesForLlm, maxPromptTokens); 
  console.log(`Manual trim: Target tokens: ${maxPromptTokens}, Actual: ${actualTokensInPrompt}, Original msgs: ${messagesForLlm.length}, Trimmed msgs: ${trimmedMessages.length}`);

  if (providerKey === 'anthropic') {
    console.log('Anthropic provider: Prepending system prompt to messages array as well.');
    trimmedMessages = [{ role: 'system', content: systemPrompt }, ...trimmedMessages.filter(m => m.role !== 'system')];
  }

  let aggregatedResponse = '';
  let finalLlmResult: Awaited<ReturnType<typeof generateText>> | undefined;

  try {
    const llm = getProvider(providerKey, modelIdentifier, llmApiKey as string);

    const slimToolsForIntent = (input: string, allTools: Record<string, Tool<any, any>>): Record<string, Tool<any, any>> => {
      console.log(`Tool slimming disabled for input: "${input}". Returning all ${Object.keys(allTools).length} tools.`);
      return allTools;
    };
    const relevantTools = slimToolsForIntent(userInput, toolsForSdk);

    if (shouldStream) {
    const streamCallOptions: Parameters<typeof streamText>[0] = {
      model: llm,
      messages: trimmedMessages, // This now contains correctly formatted multimodal messages
      tools: relevantTools,
      maxSteps: 3,
    };
    if (systemPrompt !== undefined) {
      streamCallOptions.system = systemPrompt;
    }
    // No separate experimental_attachments or attachments field needed here if images are part of CoreMessage.content
    console.log('Calling streamText. Multimodal content is part of the messages array.');

    const streamResult = await streamText(streamCallOptions);
      
      (async () => {
        try {
          const finalText = await streamResult.text;
          const toolCalls = await streamResult.toolCalls; 
          const toolResults = await streamResult.toolResults;

          console.log('Stream finished, saving full assistant message to DB.');
          if (finalText) console.log('Final text length:', finalText.length);
          if (toolCalls) console.log('Tool Calls:', JSON.stringify(toolCalls, null, 2));
          if (toolResults) console.log('Tool Results:', JSON.stringify(toolResults, null, 2));
          
          const cleanedText = cleanActionAnnotations(finalText);
          const processedResponse = await processTemplate(cleanedText, sessionId.toString());
          
          const assistantMessageData: Partial<IMessage> = {
            sessionId: new mongoose.Types.ObjectId(session._id),
            sender: 'assistant',
            content: processedResponse,
            assistantId: new mongoose.Types.ObjectId(assistant._id),
            userId: new mongoose.Types.ObjectId(session.userId),
            timestamp: new Date(),
            messageType: 'text', 
            data: {},
          };

          if (toolCalls && toolCalls.length > 0) {
            assistantMessageData.messageType = 'tool_calls'; 
            assistantMessageData.data = { ...assistantMessageData.data, toolCalls: toolCalls };
          }
          if (toolResults && toolResults.length > 0) {
            if (assistantMessageData.messageType !== 'tool_calls') {
                 assistantMessageData.messageType = 'tool_results'; 
            }
            assistantMessageData.data = { ...assistantMessageData.data, toolResults: toolResults };
          }
          
          const assistantMessage = new Message(assistantMessageData);
          await assistantMessage.save();
          console.log('Assistant message from streamed response (with potential tool data) saved to DB.');

        } catch (dbError) {
          console.error('Error saving streamed assistant message to DB:', dbError);
        }
      })().catch(streamProcessingError => {
        console.error('Error processing full streamed text for DB save:', streamProcessingError);
      });

      console.log(`Returning stream object for session ${sessionId} for client consumption.`);
      return streamResult;
    } else {
    const generateCallOptions: Parameters<typeof generateText>[0] = {
      model: llm,
      messages: trimmedMessages, // This now contains correctly formatted multimodal messages
      tools: relevantTools,
      maxSteps: 3,
    };
    if (systemPrompt !== undefined) {
      generateCallOptions.system = systemPrompt;
    }
    // No separate experimental_attachments or attachments field needed here
    console.log('Calling generateText. Multimodal content is part of the messages array.');
    const result = await generateText(generateCallOptions);
    aggregatedResponse = result.text;
    finalLlmResult = result;

      if (finalLlmResult.toolCalls && finalLlmResult.toolCalls.length > 0) {
        console.log('Tool Calls from generateText:', JSON.stringify(finalLlmResult.toolCalls, null, 2));
      }
      if (finalLlmResult.toolResults && finalLlmResult.toolResults.length > 0) {
        console.log('Tool Results from generateText:', JSON.stringify(finalLlmResult.toolResults, null, 2));
      }
    }
  } catch (error: any) { 
    let specificGeminiError = false;
    if (error && error.message) {
        const errorMessage = String(error.message).toLowerCase();
        if (errorMessage.includes('model not found') || 
            errorMessage.includes('permission denied') || 
            errorMessage.includes('api key not valid') ||
            errorMessage.includes('invalid api key')) {
            console.error('Gemini API Error (detected by message):', error);
            specificGeminiError = true;
        }
    }
    if (!specificGeminiError) {
        console.error('Error during LLM processing or tool execution:', error);
    }
    throw error;
  }

  if (!shouldStream) {
    if (!finalLlmResult) { 
        throw new Error('LLM result was not obtained for non-streaming case.');
    }
    
    const cleanedResponse = cleanActionAnnotations(aggregatedResponse);
    const processedResponse = await processTemplate(cleanedResponse, sessionId.toString());
    
    const assistantMessageData: Partial<IMessage> = {
      sessionId: new mongoose.Types.ObjectId(session._id),
      sender: 'assistant',
      content: processedResponse,
      assistantId: new mongoose.Types.ObjectId(assistant._id),
      userId: new mongoose.Types.ObjectId(session.userId),
      timestamp: new Date(),
      messageType: 'text', 
      data: {},
    };

    if (finalLlmResult.toolCalls && finalLlmResult.toolCalls.length > 0) {
      assistantMessageData.messageType = 'tool_calls'; 
      assistantMessageData.data = { ...assistantMessageData.data, toolCalls: finalLlmResult.toolCalls };
    }
    if (finalLlmResult.toolResults && finalLlmResult.toolResults.length > 0) {
      if (assistantMessageData.messageType !== 'tool_calls') {
           assistantMessageData.messageType = 'tool_results'; 
      }
      assistantMessageData.data = { ...assistantMessageData.data, toolResults: finalLlmResult.toolResults };
    }

    const assistantMessage = new Message(assistantMessageData);
    await assistantMessage.save();
    
    return processedResponse; 
  }
  
  if (shouldStream) {
    console.error("Reached end of function in streaming mode without returning stream. This shouldn't happen.");
    throw new Error("Internal error: Failed to return stream in streaming mode.");
  }
  
  throw new Error("Unhandled case in handleSessionMessage");
};
