import { IAssistant } from '../../models/Assistant';
import { processTemplate } from '../template.service';
import { SupportedLanguage } from '../discovery.service';
import { getCurrentDateTime } from '../time.service';
import { createFunctionFactory } from '../../integrations/actions/loaders';
import { executeFunctionCall } from '../../integrations/actions/executors';
import { FunctionCall } from '../../integrations/actions/types';
import { getApiKey } from '../api.key.service';
import { downloadFile } from '../file-downloader.service';
import axios from 'axios';
import {
  calculateCost,
  logCostTracking,
  CostTrackingInfo,
} from '../../utils/cost-tracking';
import {
  generateText,
  tool,
  streamText,
  ModelMessage,
  StreamTextResult,
  Tool,
  ImagePart,
  TextPart,
  generateObject,
  stepCountIs,
} from 'ai';
import { z, ZodTypeAny } from 'zod';
import { trimToWindow } from '../../utils/tokenWindow';
import { getProvider } from './provider.service';
// import { getSessionOrStatelessContext } from '../session.service'; // This utility was merged into getSessionById

// Helper function to clean action annotations from text
const cleanActionAnnotations = (text: string): string => {
  return text
    .replace(/\[Action:\s*[^\]]+\]/gi, '')
    .replace(/\[.*?action.*?\]/gi, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
};

// Helper function for Zod parsing diagnostics
function logParse(
  result: z.SafeParseReturnType<any, any>,
  fnName: string,
  raw: any,
) {
  if (!result.success) {
    console.error(`[ToolArgError] ${fnName} args failed Zod parse`, {
      raw,
      issues: result.error.issues,
    });
  }
}

// Helper function to generate unique message IDs
const generateMessageId = (): string => {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Helper function to extract JSON string from potential markdown code blocks
const extractJsonFromString = (text: string): string => {
  const trimmedText = text.trim();
  // Regex to find ```json ... ``` or ``` ... ```
  const markdownRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/;
  const match = trimmedText.match(markdownRegex);
  if (match && match[1]) {
    return match[1].trim();
  }
  return trimmedText; // Return original text if no markdown block found
};

// Helper function to attempt to fix truncated JSON
const attemptJsonRepair = (jsonString: string): any | null => {
  try {
    // First try parsing as-is
    return JSON.parse(jsonString);
  } catch (e) {
    // Try to fix common truncation issues
    let fixed = jsonString;

    // Count open/close braces and brackets
    const openBraces = (fixed.match(/{/g) || []).length;
    const closeBraces = (fixed.match(/}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/]/g) || []).length;

    // Add missing closing characters
    if (openBrackets > closeBrackets) {
      // Close any incomplete string first
      if (fixed.match(/"[^"]*$/)) {
        fixed += '"';
      }
      // Add missing brackets
      for (let i = 0; i < openBrackets - closeBrackets; i++) {
        fixed += ']';
      }
    }

    if (openBraces > closeBraces) {
      // Close any incomplete string first
      if (fixed.match(/"[^"]*$/)) {
        fixed += '"';
      }
      // Add missing braces
      for (let i = 0; i < openBraces - closeBraces; i++) {
        fixed += '}';
      }
    }

    try {
      return JSON.parse(fixed);
    } catch (e2) {
      // If still fails, try to extract the valid portion
      // Find the last complete object or array
      const lastValidBrace = fixed.lastIndexOf('"}');
      const lastValidBracket = fixed.lastIndexOf('"]');
      const lastValid = Math.max(lastValidBrace, lastValidBracket);

      if (lastValid > 0) {
        let truncated = fixed.substring(0, lastValid + 2);
        // Close any open structures
        const openCount =
          (truncated.match(/{/g) || []).length -
          (truncated.match(/}/g) || []).length;
        const bracketCount =
          (truncated.match(/\[/g) || []).length -
          (truncated.match(/]/g) || []).length;

        for (let i = 0; i < bracketCount; i++) truncated += ']';
        for (let i = 0; i < openCount; i++) truncated += '}';

        try {
          const result = JSON.parse(truncated);
          // Mark that this was truncated
          if (typeof result === 'object' && result !== null) {
            result._truncated = true;
            result._truncation_note =
              'Response was cut off and partially recovered';
          }
          return result;
        } catch (e3) {
          return null;
        }
      }

      return null;
    }
  }
};

interface ResponseFormat {
  type: 'json_object' | 'json_schema';
  schema?: z.ZodSchema<any>; // For json_schema type
}

interface Attachment {
  fileId?: string;
  url?: string;
  data?: string; // Base64 encoded data
  mimeType: string;
  fileName: string;
}

interface ActionResult {
  success: boolean;
  data?: any;
  error?: string | Record<string, any>; // Allow error to be an object too
}

// Simple in-memory cache for toolsForSdk
const toolsCache = new Map<string, Record<string, Tool<any, any>>>();

export const executeAssistantStateless = async (
  assistant: IAssistant,
  userInput: string,
  companyId: string,
  userId: string, // Added userId for context if needed by tools
  attachments?: Attachment[],
  responseFormat?: ResponseFormat, // Add responseFormat parameter
  metadata?: Record<string, string>,
  promptOverride?: string, // Add promptOverride parameter
): Promise<
  | string
  | StreamTextResult<Record<string, Tool<any, any>>, unknown>
  | Record<string, any>
> => {
  console.log(
    `Executing stateless assistant ${assistant.name} (ID: ${assistant._id}) for company ${companyId}`,
  );

  const providerKey = assistant.llmProvider;
  const userMessageContentParts: (TextPart | ImagePart)[] = [
    { type: 'text', text: userInput },
  ];

  if (attachments && attachments.length > 0) {
    for (const attachment of attachments) {
      if (attachment.mimeType.startsWith('image/')) {
        try {
          let imageBuffer: Buffer;

          if (attachment.data) {
            // Handle base64 encoded image data
            imageBuffer = Buffer.from(attachment.data, 'base64');
          } else if (attachment.url) {
            // Handle URL-based image (existing behavior)
            const response = await axios.get(attachment.url, {
              responseType: 'arraybuffer',
            });
            imageBuffer = Buffer.from(response.data);
          } else {
            throw new Error('Image attachment must have either data or url');
          }

          userMessageContentParts.push({
            type: 'image',
            image: new Uint8Array(imageBuffer),
          } as ImagePart);
        } catch (error) {
          console.error(
            `Error processing image ${attachment.fileName}:`,
            error,
          );
          (userMessageContentParts[0] as TextPart).text +=
            `\n\n[Could not load image: ${attachment.fileName}]`;
        }
      } else if (attachment.url || attachment.data) {
        // Handle non-image files (CSV, PDF, TXT, etc.)
        try {
          let fileBuffer: Buffer;
          let base64Data: string;
          let fileContent: string | null = null;

          // Determine if file is text-based or binary
          const isTextFile =
            attachment.mimeType.startsWith('text/') ||
            attachment.mimeType === 'application/json' ||
            attachment.mimeType === 'application/xml' ||
            attachment.mimeType === 'application/javascript' ||
            attachment.fileName.endsWith('.csv') ||
            attachment.fileName.endsWith('.txt') ||
            attachment.fileName.endsWith('.json') ||
            attachment.fileName.endsWith('.xml') ||
            attachment.fileName.endsWith('.md');

          if (attachment.data) {
            // Handle base64 encoded file data
            fileBuffer = Buffer.from(attachment.data, 'base64');
            base64Data = attachment.data;
          } else if (attachment.url) {
            // Handle URL-based file - download and convert to base64
            console.log(`Downloading file from URL: ${attachment.url}`);
            fileBuffer = await downloadFile(attachment.url);
            // Convert downloaded content to base64 for consistent handling
            base64Data = fileBuffer.toString('base64');
          } else {
            throw new Error('File attachment must have either data or url');
          }

          // Only try to convert to UTF-8 for text files
          if (isTextFile) {
            try {
              fileContent = fileBuffer.toString('utf-8');
              // Limit console output for large files
              const displayLength =
                fileContent.length > 10000
                  ? `${Math.round(fileContent.length / 1000)}K chars`
                  : `${fileContent.length} characters`;
              console.log(
                `Processed text file ${attachment.fileName}: ${displayLength}`,
              );
            } catch (err) {
              console.warn(
                `Could not decode ${attachment.fileName} as UTF-8, treating as binary`,
              );
            }
          } else {
            const displaySize =
              fileBuffer.length > 10000
                ? `${Math.round(fileBuffer.length / 1024)}KB`
                : `${fileBuffer.length} bytes`;
            console.log(
              `Processed binary file ${attachment.fileName}: ${displaySize}`,
            );
          }

          // Add file information to the message
          (userMessageContentParts[0] as TextPart).text +=
            `\n\n[File Attachment: ${attachment.fileName} (${attachment.mimeType})]`;

          if (fileContent) {
            // For text files, include the actual content
            (userMessageContentParts[0] as TextPart).text +=
              `\n\nFile Content:\n${fileContent}`;
          } else {
            // For binary files, just note the size
            (userMessageContentParts[0] as TextPart).text +=
              `\n\n[Binary file: ${fileBuffer.length} bytes]`;
          }

          // Always provide base64 representation for tools that need it
          (userMessageContentParts[0] as TextPart).text +=
            `\n\nFor processing this file programmatically, use the following attachment data:\n${JSON.stringify(
              {
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                data: base64Data,
              },
              null,
              2,
            )}`;
        } catch (error) {
          console.error(`Error processing file ${attachment.fileName}:`, error);
          (userMessageContentParts[0] as TextPart).text +=
            `\n\n[Error loading file: ${attachment.fileName}]`;
        }
      }
    }
  }

  const actionContext = {
    sessionId: 'stateless_execution',
    companyId,
    language: assistant.language as SupportedLanguage,
    userId, // Pass userId
    assistantId: assistant._id.toString(),
    isStateless: true,
    // getSession method removed from ActionContext
  };
  const cacheKey = `${assistant._id.toString()}-${JSON.stringify(
    assistant.allowedActions.slice().sort(),
  )}`;
  let toolsForSdk: Record<string, Tool<any, any>>;

  if (toolsCache.has(cacheKey)) {
    toolsForSdk = toolsCache.get(cacheKey)!;
  } else {
    toolsForSdk = {};
    const functionFactory = await createFunctionFactory(
      actionContext,
      assistant.allowedActions,
    );
    for (const funcName in functionFactory) {
      const funcDef = functionFactory[funcName];
      const zodShape: Record<string, ZodTypeAny> = {};
      let saneRequiredParams: string[] = [];

      if (
        funcDef.parameters?.required &&
        Array.isArray(funcDef.parameters.required) &&
        funcDef.parameters.properties
      ) {
        saneRequiredParams = funcDef.parameters.required.filter(
          (reqParam) =>
            typeof reqParam === 'string' &&
            reqParam.trim() !== '' &&
            funcDef.parameters.properties!.hasOwnProperty(reqParam),
        );
      }

      if (funcDef.parameters && funcDef.parameters.properties) {
        for (const paramName in funcDef.parameters.properties) {
          const paramDef = funcDef.parameters.properties[paramName] as any;
          let zodType: ZodTypeAny;
          switch (paramDef.type) {
            case 'string':
              zodType = z.string();
              break;
            case 'number':
              zodType = z.number();
              break;
            case 'integer':
              zodType = z.number().int();
              break;
            case 'boolean':
              zodType = z.boolean();
              break;
            case 'array':
              if (paramDef.items && typeof paramDef.items === 'object') {
                if (
                  paramDef.items.type === 'object' &&
                  paramDef.items.properties
                ) {
                  // Handle array of objects, like the 'attributes' array
                  const itemZodShape: Record<string, ZodTypeAny> = {};
                  for (const itemPropName in paramDef.items.properties) {
                    const itemPropDef = paramDef.items.properties[
                      itemPropName
                    ] as any;
                    let itemZodType: ZodTypeAny;
                    switch (itemPropDef.type) {
                      case 'string':
                        itemZodType = z.string();
                        break;
                      case 'number':
                        itemZodType = z.number();
                        break;
                      case 'boolean':
                        itemZodType = z.boolean();
                        break;
                      case 'array':
                        itemZodType = z.array(z.any());
                        break; // Nested arrays
                      case 'object':
                        itemZodType = z.record(z.string(), z.any());
                        break; // Nested objects
                      default:
                        itemZodType = z.any();
                    }
                    if (itemPropDef.description)
                      itemZodType = itemZodType.describe(
                        itemPropDef.description,
                      );
                    if (
                      paramDef.items.required &&
                      !paramDef.items.required.includes(itemPropName)
                    ) {
                      itemZodType = itemZodType.optional();
                    }
                    itemZodShape[itemPropName] = itemZodType;
                  }
                  zodType = z.array(z.object(itemZodShape));
                } else if (paramDef.items.type === 'string') {
                  zodType = z.array(z.string());
                } else if (paramDef.items.type === 'number') {
                  zodType = z.array(z.number());
                } else if (paramDef.items.type === 'boolean') {
                  zodType = z.array(z.boolean());
                } else {
                  zodType = z.array(z.any()); // Fallback for other primitive types or if type is not specified
                }
              } else {
                zodType = z.array(z.any()); // Default if items is not defined or not an object
              }
              break;
            case 'object':
              if (paramDef.additionalProperties === true) {
                // open spec: any JSON value
                zodType = z.record(z.string(), z.any());
              } else if (typeof paramDef.additionalProperties === 'object') {
                const t = paramDef.additionalProperties.type;
                zodType =
                  t === 'string'
                    ? z.record(z.string(), z.string())
                    : t === 'number'
                      ? z.record(z.string(), z.number())
                      : t === 'boolean'
                        ? z.record(z.string(), z.boolean())
                        : z.record(z.string(), z.any());
              } else {
                zodType = z.record(z.string(), z.any());
              }
              break;
            default:
              zodType = z.any();
          }
          if (paramDef.description)
            zodType = zodType.describe(paramDef.description);
          if (!saneRequiredParams.includes(paramName)) {
            zodType = zodType.optional();
          }
          zodShape[paramName] = zodType;
        }
      }
      const zodSchema =
        Object.keys(zodShape).length > 0 ? z.object(zodShape) : z.object({});
      const currentFuncName = funcName;

      // Type cast to avoid deep instantiation error
      toolsForSdk[currentFuncName] = (tool as any)({
        description: funcDef.description,
        inputSchema: zodSchema as z.ZodType<any>,
        execute: async (args: any) => {
          console.log(
            `[Stateless Tool Execution] Attempting to execute function: ${currentFuncName} with args:`,
            args,
          );

          // Continue with validation...
          const parseResult = zodSchema.safeParse(args);
          logParse(parseResult, currentFuncName, args);
          if (!parseResult.success) {
            const errorMessage = `Invalid arguments for tool ${currentFuncName}: ${JSON.stringify(
              parseResult.error.issues,
            )}`;
            console.error(`[Stateless Tool Execution] ${errorMessage}`);
            // Return an error object that the LLM can process as a tool result
            return { success: false, error: errorMessage };
          }

          // Directly use the functionFactory created with the stateless actionContext
          const factoryForStateless = await createFunctionFactory(
            actionContext,
            assistant.allowedActions,
          );
          if (factoryForStateless[currentFuncName]) {
            try {
              // The functions in functionFactory expect ActionContext as their first argument if they need it,
              // but the Vercel AI SDK's tool.execute doesn't pass it directly.
              // The functions created by createFunctionFactory are already bound with their context or designed to use it.
              // The 'executeFunctionCall' service handles context internally. Here, we are bypassing it.
              // We need to ensure functions from createFunctionFactory can run with just 'args'.
              // Most action functions from createFunctionFactory are of type (args: any) => Promise<ActionResult>
              // Let's assume they are structured to receive args directly.
              const toolResult = (await factoryForStateless[
                currentFuncName
              ].function(args)) as ActionResult;

              if (
                toolResult &&
                typeof toolResult === 'object' &&
                'success' in toolResult
              ) {
                if (!toolResult.success) {
                  const errorMessage =
                    typeof toolResult.error === 'string'
                      ? toolResult.error
                      : JSON.stringify(toolResult.error);
                  console.error(
                    `Error in stateless tool ${currentFuncName} execution:`,
                    errorMessage,
                  );
                  // Return a string representation of the error for the LLM
                  return `Error: ${errorMessage || 'Action failed'}`;
                }
                return toolResult.data; // Return data on success
              }
              // If the result is not in the expected { success, data/error } format, return it as is.
              return toolResult; // This might happen if a tool returns a primitive or unexpected structure
            } catch (e: any) {
              console.error(
                `Exception during stateless tool ${currentFuncName} execution:`,
                e,
              );
              return `Exception: ${
                e.message || 'Tool execution failed with an exception'
              }`;
            }
          } else {
            console.error(
              `Function ${currentFuncName} not found in stateless factory.`,
            );
            return `Error: Function ${currentFuncName} not implemented.`;
          }
        },
      });
    }
    toolsCache.set(cacheKey, toolsForSdk);
  }

  let modelIdentifier = assistant.llmModel || 'gpt-4.1-mini';
  const llmApiKey = await getApiKey(companyId, `${providerKey}_api_key`);
  if (!llmApiKey)
    throw new Error(`${providerKey} API key not found for company.`);

  if (
    providerKey === 'google' &&
    modelIdentifier &&
    !modelIdentifier.startsWith('models/')
  ) {
    modelIdentifier = `models/${modelIdentifier}`;
  }

  const shouldStream = metadata?.['X-Experimental-Stream'] === 'true';

  // Check if we should use structured output
  const useStructuredOutput =
    responseFormat &&
    (responseFormat.type === 'json_object' ||
      responseFormat.type === 'json_schema');

  // For stateless execution, we'll use the prompt directly without template processing
  // or provide basic context if needed
  // Use promptOverride if provided, otherwise use the assistant's default prompt
  const basePrompt =
    promptOverride || assistant.llmPrompt || 'You are a helpful assistant.';

  // Prepend current date/time so AI knows the actual current date
  const currentDateTime = await getCurrentDateTime();
  const systemPrompt = `Current date and time: ${currentDateTime}\n\n${basePrompt}`;

  const userMessageForLlm: ModelMessage = {
    role: 'user',
    content: userMessageContentParts,
  };

  // For stateless, history is just the current user message.
  // If you need to allow passing a short history, this would be the place to inject it.
  const messagesForLlm: ModelMessage[] = [userMessageForLlm];

  // Use the assistant's configured maxTokens for input window
  const maxPromptTokens: number = assistant.maxTokens || 25000;
  console.log(
    `[Stateless Execution] Using max prompt tokens: ${maxPromptTokens} for assistant ${assistant.name}`,
  );

  let { trimmedMessages } = trimToWindow(messagesForLlm, maxPromptTokens);

  // If after trimming, messagesForLlm is empty, it means the initial content was too large.
  // This can happen if userInput + appended files exceed maxPromptTokens significantly.
  if (trimmedMessages.length === 0 && messagesForLlm.length > 0) {
    console.error(
      `All messages were trimmed. This usually means the content (e.g., an attached file) exceeded the token limit of ${maxPromptTokens}.`,
    );
    throw new Error(
      `The content provided (e.g., an attached file) is too large to process. Please reduce the size and try again. Max token limit: ${maxPromptTokens}`,
    );
  }

  if (providerKey === 'anthropic') {
    trimmedMessages = [
      { role: 'system', content: systemPrompt },
      ...trimmedMessages.filter((m) => m.role !== 'system'),
    ];
  }

  try {
    const llm = getProvider(providerKey, modelIdentifier, llmApiKey as string);
    const relevantTools = toolsForSdk; // For stateless, all tools of the assistant are relevant

    if (shouldStream) {
      const streamCallOptions: Parameters<typeof streamText>[0] = {
        model: llm,
        messages: trimmedMessages,
        tools: relevantTools,
        stopWhen: stepCountIs(3), // Consider making this configurable per assistant or request
      };
      if (systemPrompt !== undefined && providerKey !== 'anthropic') {
        // Anthropic handles system prompt in messages
        streamCallOptions.system = systemPrompt;
      }
      const streamResult = await streamText(streamCallOptions);
      // The route handler will process the stream. We just return it.
      // We also need to return tool calls and results if any, for the route to save.
      // This requires a slight modification to how streamResult is consumed or what this function returns.
      // For now, let's assume the route handles the full stream object.
      return streamResult;
    } else if (useStructuredOutput) {
      // Use generateObject for structured JSON output
      if (responseFormat.type === 'json_schema' && responseFormat.schema) {
        // Use provided schema
        const objectResult = await (generateObject as any)({
          model: llm,
          messages: trimmedMessages,
          schema: responseFormat.schema,
          system: providerKey !== 'anthropic' ? systemPrompt : undefined,
        });

        return {
          id: generateMessageId(),
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: { value: "Structured JSON response. See 'data' field." },
            },
          ],
          created_at: Math.floor(Date.now() / 1000),
          assistant_id: assistant._id.toString(),
          message_type: 'json',
          data: { json: objectResult.object },
        };
      } else {
        // Use json mode (less strict, but ensures valid JSON)
        const generateTextOptions: Parameters<typeof generateText>[0] = {
          model: llm,
          messages: trimmedMessages,
          tools: relevantTools,
          stopWhen: stepCountIs(3),
          system: providerKey !== 'anthropic' ? systemPrompt : undefined,
        };

        if (providerKey === 'openai') {
          // @ts-expect-error TODO: Properly type OpenAI-specific params if not in generic GenerateTextOptions
          generateTextOptions.response_format = { type: 'json_object' };
        }
        // For other providers like Google or Anthropic, specific JSON mode flags might differ
        // or might need to be set when the model instance `llm` is created in `getProvider`.
        // Anthropic typically uses tool calling for structured JSON, which `generateObject` handles.
        // Google's Gemini can be instructed via prompt or might have a responseMimeType config.

        const startTime = Date.now();
        const result = await generateText(generateTextOptions);
        const duration = Date.now() - startTime;

        // Log cost tracking for JSON format
        if (result.usage) {
          const costs = calculateCost(
            modelIdentifier,
            result.usage.inputTokens || 0,
            result.usage.outputTokens || 0,
          );

          const costInfo: CostTrackingInfo = {
            companyId: companyId?.toString() || 'unknown',
            assistantId: assistant._id.toString(),
            sessionId: 'stateless-json',
            userId: userId || 'unknown',
            provider: providerKey,
            model: modelIdentifier,
            inputTokens: result.usage.inputTokens || 0,
            outputTokens: result.usage.outputTokens || 0,
            totalTokens:
              result.usage.totalTokens ||
              (result.usage.inputTokens || 0) +
                (result.usage.outputTokens || 0),
            inputCost: costs.inputCost,
            outputCost: costs.outputCost,
            totalCost: costs.totalCost,
            timestamp: new Date(),
            duration,
            toolCalls: 0,
            cached: false,
            requestType: 'stateless',
          };

          await logCostTracking(costInfo);
        }

        // Parse the JSON response
        let jsonContent;
        const rawText = result.text;
        const potentialJsonString = extractJsonFromString(rawText);

        // Try to parse or repair the JSON
        jsonContent = attemptJsonRepair(potentialJsonString);

        if (jsonContent === null) {
          // Complete failure to parse
          console.error(
            'Failed to parse JSON response. Response length:',
            potentialJsonString.length,
            'First 500 chars:',
            potentialJsonString.substring(0, 500),
          );

          // Check if it looks like truncated JSON
          const looksLikeJson =
            potentialJsonString.trim().startsWith('{') ||
            potentialJsonString.trim().startsWith('[');

          jsonContent = {
            error: 'Failed to parse response as JSON',
            truncated:
              looksLikeJson &&
              !potentialJsonString.trim().endsWith('}') &&
              !potentialJsonString.trim().endsWith(']'),
            raw:
              rawText.length > 1000
                ? rawText.substring(0, 1000) +
                  '... (truncated in error response)'
                : rawText,
          };
        } else if (jsonContent._truncated) {
          console.warn('JSON response was truncated and partially recovered');
        }

        return {
          id: generateMessageId(),
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: { value: "JSON response. See 'data' field." },
            },
          ],
          created_at: Math.floor(Date.now() / 1000),
          assistant_id: assistant._id.toString(),
          message_type: 'json',
          data: { json: jsonContent },
        };
      }
    } else {
      const generateCallOptions: Parameters<typeof generateText>[0] = {
        model: llm,
        messages: trimmedMessages,
        tools: relevantTools,
        stopWhen: stepCountIs(3),
      };
      if (systemPrompt !== undefined && providerKey !== 'anthropic') {
        generateCallOptions.system = systemPrompt;
      }
      const startTime = Date.now();
      const result = await generateText(generateCallOptions);
      const duration = Date.now() - startTime;

      // Log cost tracking for stateless execution
      if (result.usage) {
        const costs = calculateCost(
          modelIdentifier,
          result.usage.inputTokens || 0,
          result.usage.outputTokens || 0,
        );

        const costInfo: CostTrackingInfo = {
          companyId: companyId?.toString() || 'unknown',
          assistantId: assistant._id.toString(),
          sessionId: 'stateless',
          userId: userId || 'unknown',
          provider: providerKey,
          model: modelIdentifier,
          inputTokens: result.usage.inputTokens || 0,
          outputTokens: result.usage.outputTokens || 0,
          totalTokens:
            result.usage.totalTokens ||
            (result.usage.inputTokens || 0) + (result.usage.outputTokens || 0),
          inputCost: costs.inputCost,
          outputCost: costs.outputCost,
          totalCost: costs.totalCost,
          timestamp: new Date(),
          duration,
          toolCalls: result.toolCalls?.length || 0,
          cached: false,
          requestType: 'stateless',
        };

        await logCostTracking(costInfo);
      }

      const cleanedResponse = cleanActionAnnotations(result.text);
      // Skip template processing for stateless execution
      const processedResponse = cleanedResponse;

      const responsePayload: Record<string, any> = {
        id: generateMessageId(),
        role: 'assistant',
        content: [{ type: 'text', text: { value: processedResponse } }],
        created_at: Math.floor(Date.now() / 1000),
        assistant_id: assistant._id.toString(),
        message_type: 'text',
        data: {},
      };

      if (result.toolCalls && result.toolCalls.length > 0) {
        responsePayload.message_type = 'tool_calls';
        responsePayload.data.toolCalls = result.toolCalls;
      }
      if (result.toolResults && result.toolResults.length > 0) {
        if (responsePayload.message_type !== 'tool_calls') {
          responsePayload.message_type = 'tool_results';
        }
        responsePayload.data.toolResults = result.toolResults;
      }
      return responsePayload;
    }
  } catch (error: any) {
    console.error(
      'Error during stateless LLM processing or tool execution:',
      error,
    );
    throw error;
  }
};
