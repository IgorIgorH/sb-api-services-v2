/**
 * WhatsApp-Jira Bridge Service
 *
 * Orchestrates the workflow:
 * 1. Receive WhatsApp audio message
 * 2. Transcribe using Google Speech-to-Text
 * 3. Analyze transcript with LLM to detect action items
 * 4. Create Jira tasks for identified action items
 * 5. Send confirmation back to WhatsApp
 */

import { transcribeAudioGoogle } from './speech.recognition.service';
import { createJiraTicket } from '../integrations/jira/jira.service';
import { getApiKey } from './api.key.service';
import OpenAI from 'openai';

interface ActionItem {
  title: string;
  description: string;
  priority: 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';
  type: 'Bug' | 'Task' | 'Story' | 'Epic';
  assignee?: string;
  labels?: string[];
}

interface AnalysisResult {
  hasActionItems: boolean;
  confidence: number;
  summary: string;
  actionItems: ActionItem[];
}

interface AudioMetadata {
  sender: string;
  senderName?: string;
  groupName?: string;
  groupId?: string;
  audioUrl: string;
  timestamp: Date;
  messageId: string;
}

interface ProcessingResult {
  success: boolean;
  transcript?: string;
  tasksCreated?: number;
  taskIds?: string[];
  summary?: string;
  error?: string;
}

/**
 * Analyze transcript with LLM to detect action items
 */
export const analyzeTranscriptForTasks = async (
  transcript: string,
  metadata: AudioMetadata,
  companyId: string
): Promise<AnalysisResult> => {
  console.log(`\n🤖 [WhatsApp-Jira] Analyzing transcript for action items...`);
  console.log(`📝 Transcript length: ${transcript.length} characters`);

  try {
    // Get OpenAI API key
    const openaiKey = await getApiKey(companyId, 'openai_api_key');
    if (!openaiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const openai = new OpenAI({ apiKey: openaiKey });

    const systemPrompt = `You are an AI assistant specialized in analyzing WhatsApp audio message transcripts to identify actionable work items.

Your task: Extract tasks, bugs, features, and action items from casual conversation transcripts.

Guidelines:
1. EXPLICIT TASKS: "create a ticket", "we need to fix", "TODO", "action item"
2. IMPLICIT BUGS: "not working", "broken", "issue with", "failing"
3. FEATURES: "would be nice", "can we add", "implement"
4. URGENT ITEMS: Keywords like "urgent", "ASAP", "critical", "blocker" indicate HIGH priority

For each action item extract:
- Title: Clear, concise, actionable (max 100 chars)
- Description: Details from the conversation with context
- Priority: Highest/High/Medium/Low/Lowest (based on urgency mentioned)
- Type: Bug/Task/Story/Epic
- Assignee: If someone's name is mentioned for this task
- Labels: Relevant tags like "whatsapp-audio", "urgent", "mobile", etc.

IMPORTANT FILTERING:
- IGNORE: Status updates, questions without actions, casual chat, greetings
- ONLY RETURN: Actual work items that require action
- Be CONSERVATIVE: When uncertain, don't create a task

Output must be valid JSON following this schema:
{
  "hasActionItems": boolean,
  "confidence": number (0-1),
  "summary": "brief summary of discussion",
  "actionItems": [
    {
      "title": "string",
      "description": "string",
      "priority": "High",
      "type": "Bug",
      "assignee": "name or null",
      "labels": ["label1", "label2"]
    }
  ]
}`;

    const userPrompt = `Analyze this WhatsApp audio message transcript and identify action items.

**Transcript:**
"${transcript}"

**Metadata:**
- Speaker: ${metadata.senderName || metadata.sender}
- Group: ${metadata.groupName || 'Direct Message'}
- Time: ${metadata.timestamp.toISOString()}

Extract all actionable items and return as JSON.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Lower temperature for more consistent extraction
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No response from LLM');
    }

    const analysis: AnalysisResult = JSON.parse(content);

    console.log(`✅ [WhatsApp-Jira] Analysis complete:`);
    console.log(`   Has action items: ${analysis.hasActionItems}`);
    console.log(`   Confidence: ${analysis.confidence}`);
    console.log(`   Action items found: ${analysis.actionItems?.length || 0}`);

    return analysis;

  } catch (error: any) {
    console.error(`❌ [WhatsApp-Jira] Error analyzing transcript:`, error);

    // Return empty result on error
    return {
      hasActionItems: false,
      confidence: 0,
      summary: `Error analyzing transcript: ${error.message}`,
      actionItems: []
    };
  }
};

/**
 * Create Jira tasks from detected action items
 */
export const createJiraTasksFromActionItems = async (
  actionItems: ActionItem[],
  transcript: string,
  metadata: AudioMetadata,
  companyId: string
): Promise<{ success: boolean; taskIds: string[]; error?: string }> => {
  console.log(`\n📋 [WhatsApp-Jira] Creating ${actionItems.length} Jira tasks...`);

  const taskIds: string[] = [];

  try {
    // Get Jira project key from company configuration
    const projectKey = await getApiKey(companyId, 'jira_project_key');
    if (!projectKey) {
      throw new Error('Jira project key not configured. Please set jira_project_key in company settings.');
    }

    for (const item of actionItems) {
      console.log(`   Creating task: "${item.title}"`);

      const description = `**Created from WhatsApp Audio Message**

**Full Transcript:**
\`\`\`
${transcript}
\`\`\`

**Task Details:**
${item.description}

---
**Metadata:**
- Speaker: ${metadata.senderName || metadata.sender}
- Group: ${metadata.groupName || 'Direct Message'}
- Timestamp: ${metadata.timestamp.toISOString()}
- Audio URL: ${metadata.audioUrl}
- Message ID: ${metadata.messageId}

**Labels:** ${[
  'whatsapp-audio',
  ...(item.labels || []),
  metadata.groupName ? `group-${metadata.groupName.replace(/\s+/g, '-').toLowerCase()}` : 'direct-message'
].join(', ')}`;

      const result = await createJiraTicket(
        metadata.messageId, // sessionId
        companyId,
        {
          summary: item.title,
          description: description,
          projectKey: projectKey,
          issueType: item.type
        }
      );

      if (result.success && result.data) {
        const issueKey = result.data.key;
        taskIds.push(issueKey);
        console.log(`   ✅ Created: ${issueKey}`);
      } else {
        console.error(`   ❌ Failed to create task: ${result.error}`);
      }
    }

    console.log(`✅ [WhatsApp-Jira] Successfully created ${taskIds.length}/${actionItems.length} tasks`);

    return {
      success: true,
      taskIds
    };

  } catch (error: any) {
    console.error(`❌ [WhatsApp-Jira] Error creating Jira tasks:`, error);
    return {
      success: false,
      taskIds,
      error: error.message
    };
  }
};

/**
 * Main orchestration: Process WhatsApp audio message end-to-end
 */
export const processWhatsAppAudioMessage = async (
  audioUrl: string,
  metadata: AudioMetadata,
  companyId: string
): Promise<ProcessingResult> => {
  console.log(`\n🎤 [WhatsApp-Jira] ===== PROCESSING AUDIO MESSAGE =====`);
  console.log(`📞 From: ${metadata.senderName || metadata.sender}`);
  console.log(`👥 Group: ${metadata.groupName || 'Direct'}`);
  console.log(`🔗 Audio URL: ${audioUrl}`);

  try {
    // Step 1: Transcribe audio
    console.log(`\n📝 [WhatsApp-Jira] Step 1: Transcribing audio...`);
    const transcript = await transcribeAudioGoogle(audioUrl, 'en-US');

    if (!transcript || transcript.trim().length === 0) {
      console.log(`⚠️  [WhatsApp-Jira] Transcription empty or failed`);
      return {
        success: false,
        error: 'Failed to transcribe audio - empty result'
      };
    }

    console.log(`✅ [WhatsApp-Jira] Transcription successful (${transcript.length} chars)`);
    console.log(`   Preview: "${transcript.substring(0, 100)}..."`);

    // Step 2: Analyze transcript for action items
    console.log(`\n🤖 [WhatsApp-Jira] Step 2: Analyzing for action items...`);
    const analysis = await analyzeTranscriptForTasks(transcript, metadata, companyId);

    if (!analysis.hasActionItems || analysis.actionItems.length === 0) {
      console.log(`ℹ️  [WhatsApp-Jira] No action items detected`);
      return {
        success: true,
        transcript,
        tasksCreated: 0,
        summary: `📝 Audio transcribed. No action items detected.\n\n${analysis.summary}`
      };
    }

    // Step 3: Create Jira tasks
    console.log(`\n📋 [WhatsApp-Jira] Step 3: Creating Jira tasks...`);
    const jiraResult = await createJiraTasksFromActionItems(
      analysis.actionItems,
      transcript,
      metadata,
      companyId
    );

    if (!jiraResult.success) {
      return {
        success: false,
        transcript,
        error: `Failed to create Jira tasks: ${jiraResult.error}`
      };
    }

    // Step 4: Generate summary
    const summary = generateSummary(transcript, analysis, jiraResult.taskIds);

    console.log(`✅ [WhatsApp-Jira] ===== PROCESSING COMPLETE =====`);
    console.log(`   Transcript: ${transcript.length} chars`);
    console.log(`   Tasks Created: ${jiraResult.taskIds.length}`);
    console.log(`   Task IDs: ${jiraResult.taskIds.join(', ')}`);

    return {
      success: true,
      transcript,
      tasksCreated: jiraResult.taskIds.length,
      taskIds: jiraResult.taskIds,
      summary
    };

  } catch (error: any) {
    console.error(`❌ [WhatsApp-Jira] Processing failed:`, error);
    return {
      success: false,
      error: error.message || 'Unknown error during processing'
    };
  }
};

/**
 * Generate user-friendly summary message
 */
function generateSummary(
  transcript: string,
  analysis: AnalysisResult,
  taskIds: string[]
): string {
  const lines: string[] = [];

  lines.push(`🎤 *Audio Message Processed*`);
  lines.push('');

  if (taskIds.length > 0) {
    lines.push(`✅ Created ${taskIds.length} Jira task${taskIds.length > 1 ? 's' : ''}:`);
    taskIds.forEach((taskId, index) => {
      const task = analysis.actionItems[index];
      lines.push(`   ${index + 1}. *${taskId}*: ${task?.title || 'Task'}`);
    });
    lines.push('');
  }

  lines.push(`📝 *Transcript:*`);
  const preview = transcript.length > 300
    ? transcript.substring(0, 300) + '...'
    : transcript;
  lines.push(preview);

  if (analysis.summary) {
    lines.push('');
    lines.push(`💡 *Summary:* ${analysis.summary}`);
  }

  return lines.join('\n');
}
