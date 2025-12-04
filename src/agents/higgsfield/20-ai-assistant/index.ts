/**
 * AI Assistant Agent
 *
 * Intelligent conversational AI assistant with memory and multi-modal capabilities.
 * Provides personalized assistance across various domains.
 *
 * Features:
 * - Contextual conversation memory
 * - Multi-modal understanding (text, images, documents)
 * - Task orchestration
 * - Knowledge retrieval
 * - Personalized responses
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const PersonalitySchema = z.enum([
  'professional',
  'friendly',
  'concise',
  'detailed',
  'creative',
  'analytical',
]);

const DomainSchema = z.enum([
  'general',
  'coding',
  'writing',
  'research',
  'creative',
  'business',
  'education',
  'support',
]);

const AssistantInputSchema = z.object({
  message: z.string().describe('User message'),
  conversationId: z.string().optional().describe('Conversation ID for memory'),
  attachments: z.array(z.object({
    type: z.enum(['image', 'document', 'url']),
    url: z.string(),
    mimeType: z.string().optional(),
  })).optional(),
  context: z.object({
    domain: DomainSchema.optional(),
    personality: PersonalitySchema.optional(),
    userId: z.string().optional(),
    preferences: z.record(z.string()).optional(),
  }).optional(),
});

const AssistantOutputSchema = z.object({
  success: z.boolean(),
  response: z.string(),
  conversationId: z.string(),
  suggestedActions: z.array(z.object({
    action: z.string(),
    description: z.string(),
  })).optional(),
  attachments: z.array(z.object({
    type: z.string(),
    url: z.string(),
    description: z.string(),
  })).optional(),
  processingTime: z.number(),
  tokensUsed: z.number().optional(),
  error: z.string().optional(),
});

// =============================================================================
// IN-MEMORY STORES (would be database in production)
// =============================================================================

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: Array<{ type: string; url: string }>;
}

interface Conversation {
  id: string;
  userId?: string;
  messages: ConversationMessage[];
  context: {
    domain?: string;
    personality?: string;
    preferences?: Record<string, string>;
  };
  createdAt: Date;
  updatedAt: Date;
}

const conversations = new Map<string, Conversation>();
const userPreferences = new Map<string, Record<string, unknown>>();

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function createConversation(
  ctx: AgentContext,
  params: {
    userId?: string;
    domain?: z.infer<typeof DomainSchema>;
    personality?: z.infer<typeof PersonalitySchema>;
    initialContext?: string;
  }
): Promise<{
  conversationId: string;
  createdAt: string;
}> {
  const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const conversation: Conversation = {
    id: conversationId,
    userId: params.userId,
    messages: [],
    context: {
      domain: params.domain,
      personality: params.personality,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (params.initialContext) {
    conversation.messages.push({
      role: 'assistant',
      content: `Context established: ${params.initialContext}`,
      timestamp: new Date(),
    });
  }

  conversations.set(conversationId, conversation);

  logger.info('conversation_created', {
    conversationId,
    domain: params.domain,
  });

  return {
    conversationId,
    createdAt: conversation.createdAt.toISOString(),
  };
}

async function getConversationHistory(
  ctx: AgentContext,
  params: {
    conversationId: string;
    limit?: number;
  }
): Promise<{
  messages: Array<{
    role: string;
    content: string;
    timestamp: string;
  }>;
  totalMessages: number;
}> {
  const conversation = conversations.get(params.conversationId);

  if (!conversation) {
    return { messages: [], totalMessages: 0 };
  }

  const limit = params.limit || 50;
  const messages = conversation.messages.slice(-limit);

  return {
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp.toISOString(),
    })),
    totalMessages: conversation.messages.length,
  };
}

async function addMessage(
  ctx: AgentContext,
  params: {
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    attachments?: Array<{ type: string; url: string }>;
  }
): Promise<{
  messageIndex: number;
  timestamp: string;
}> {
  let conversation = conversations.get(params.conversationId);

  if (!conversation) {
    conversation = {
      id: params.conversationId,
      messages: [],
      context: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    conversations.set(params.conversationId, conversation);
  }

  const message: ConversationMessage = {
    role: params.role,
    content: params.content,
    timestamp: new Date(),
    attachments: params.attachments,
  };

  conversation.messages.push(message);
  conversation.updatedAt = new Date();

  return {
    messageIndex: conversation.messages.length - 1,
    timestamp: message.timestamp.toISOString(),
  };
}

async function summarizeConversation(
  ctx: AgentContext,
  params: { conversationId: string }
): Promise<{
  summary: string;
  keyTopics: string[];
  messageCount: number;
  duration: string;
}> {
  const conversation = conversations.get(params.conversationId);

  if (!conversation || conversation.messages.length === 0) {
    return {
      summary: 'No conversation history found.',
      keyTopics: [],
      messageCount: 0,
      duration: '0 seconds',
    };
  }

  // In production, would use LLM to generate summary
  const userMessages = conversation.messages.filter(m => m.role === 'user');
  const topics = new Set<string>();

  // Simple keyword extraction
  for (const msg of userMessages) {
    const words = msg.content.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 5) topics.add(word);
    }
  }

  const firstMsg = conversation.messages[0];
  const lastMsg = conversation.messages[conversation.messages.length - 1];
  const durationMs = lastMsg.timestamp.getTime() - firstMsg.timestamp.getTime();
  const durationMins = Math.floor(durationMs / 60000);

  return {
    summary: `Conversation with ${conversation.messages.length} messages covering various topics.`,
    keyTopics: Array.from(topics).slice(0, 5),
    messageCount: conversation.messages.length,
    duration: durationMins > 0 ? `${durationMins} minutes` : `${Math.floor(durationMs / 1000)} seconds`,
  };
}

async function updateUserPreferences(
  ctx: AgentContext,
  params: {
    userId: string;
    preferences: Record<string, unknown>;
  }
): Promise<{
  updated: boolean;
  preferences: Record<string, unknown>;
}> {
  const existing = userPreferences.get(params.userId) || {};
  const updated = { ...existing, ...params.preferences };
  userPreferences.set(params.userId, updated);

  logger.info('preferences_updated', { userId: params.userId });

  return {
    updated: true,
    preferences: updated,
  };
}

async function getUserPreferences(
  ctx: AgentContext,
  params: { userId: string }
): Promise<{
  preferences: Record<string, unknown>;
  hasPreferences: boolean;
}> {
  const prefs = userPreferences.get(params.userId);

  return {
    preferences: prefs || {},
    hasPreferences: !!prefs,
  };
}

async function searchKnowledge(
  ctx: AgentContext,
  params: {
    query: string;
    domain?: z.infer<typeof DomainSchema>;
    limit?: number;
  }
): Promise<{
  results: Array<{
    title: string;
    content: string;
    relevance: number;
    source: string;
  }>;
  totalFound: number;
}> {
  logger.info('knowledge_search', {
    query: params.query,
    domain: params.domain,
  });

  // In production, would search vector DB or knowledge base
  // Simulated results
  return {
    results: [
      {
        title: 'Relevant Information',
        content: `Information related to: ${params.query}`,
        relevance: 0.85,
        source: 'knowledge_base',
      },
    ],
    totalFound: 1,
  };
}

async function executeTask(
  ctx: AgentContext,
  params: {
    taskType: 'summarize' | 'translate' | 'analyze' | 'generate' | 'extract';
    input: string;
    options?: Record<string, unknown>;
  }
): Promise<{
  result: string;
  taskType: string;
  processingTime: number;
}> {
  const startTime = Date.now();

  logger.info('task_execution_started', {
    taskType: params.taskType,
    inputLength: params.input.length,
  });

  // Simulated task execution
  let result: string;
  switch (params.taskType) {
    case 'summarize':
      result = `Summary of input (${params.input.length} chars): ${params.input.substring(0, 100)}...`;
      break;
    case 'translate':
      result = `Translation: ${params.input}`;
      break;
    case 'analyze':
      result = `Analysis of input: Contains ${params.input.split(/\s+/).length} words`;
      break;
    case 'generate':
      result = `Generated content based on: ${params.input.substring(0, 50)}`;
      break;
    case 'extract':
      result = `Extracted information from: ${params.input.substring(0, 50)}`;
      break;
    default:
      result = 'Unknown task type';
  }

  return {
    result,
    taskType: params.taskType,
    processingTime: Date.now() - startTime,
  };
}

async function orchestrateAgents(
  ctx: AgentContext,
  params: {
    task: string;
    requiredCapabilities: string[];
    priority: 'low' | 'medium' | 'high';
  }
): Promise<{
  plan: Array<{
    step: number;
    agentType: string;
    action: string;
    dependencies: number[];
  }>;
  estimatedDuration: number;
}> {
  logger.info('agent_orchestration_started', {
    task: params.task,
    capabilities: params.requiredCapabilities,
  });

  // Map capabilities to agents
  const capabilityToAgent: Record<string, string> = {
    'image_generation': 'image-generator',
    'video_generation': 'video-generator',
    'voice_synthesis': 'voice-cloner',
    'face_swap': 'face-swap-video',
    'music_generation': 'music-generator',
    'avatar_creation': 'avatar-generator',
    'storyboard': 'storyboard-generator',
    'motion_graphics': 'motion-graphics',
  };

  const plan = params.requiredCapabilities.map((cap, index) => ({
    step: index + 1,
    agentType: capabilityToAgent[cap] || 'general-assistant',
    action: `Execute ${cap} for: ${params.task.substring(0, 50)}`,
    dependencies: index > 0 ? [index] : [],
  }));

  return {
    plan,
    estimatedDuration: plan.length * 30, // 30 seconds per step estimate
  };
}

async function provideSuggestions(
  ctx: AgentContext,
  params: {
    conversationId: string;
    currentTopic?: string;
  }
): Promise<{
  suggestions: Array<{
    type: 'question' | 'action' | 'topic';
    text: string;
    confidence: number;
  }>;
}> {
  const conversation = conversations.get(params.conversationId);

  // Generate contextual suggestions
  const suggestions: Array<{ type: 'question' | 'action' | 'topic'; text: string; confidence: number }> = [];

  if (conversation && conversation.messages.length > 0) {
    const lastMessage = conversation.messages[conversation.messages.length - 1];

    if (lastMessage.content.includes('image')) {
      suggestions.push({
        type: 'action',
        text: 'Generate an image based on this description',
        confidence: 0.8,
      });
    }

    if (lastMessage.content.includes('video')) {
      suggestions.push({
        type: 'action',
        text: 'Create a video from this concept',
        confidence: 0.8,
      });
    }
  }

  // Default suggestions
  suggestions.push(
    { type: 'question', text: 'Can you tell me more about this?', confidence: 0.6 },
    { type: 'topic', text: 'Explore related topics', confidence: 0.5 }
  );

  return { suggestions };
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const aiAssistantAgent = defineAgent({
  name: 'ai-assistant',
  description: 'Intelligent conversational AI assistant with memory and multi-modal capabilities',
  version: '1.0.0',

  inputSchema: AssistantInputSchema,
  outputSchema: AssistantOutputSchema,

  tools: {
    create_conversation: {
      description: 'Create a new conversation with optional context',
      parameters: z.object({
        userId: z.string().optional(),
        domain: DomainSchema.optional(),
        personality: PersonalitySchema.optional(),
        initialContext: z.string().optional(),
      }),
      returns: z.object({
        conversationId: z.string(),
        createdAt: z.string(),
      }),
      execute: createConversation,
      timeoutMs: 5000,
    },

    get_history: {
      description: 'Get conversation history',
      parameters: z.object({
        conversationId: z.string(),
        limit: z.number().optional(),
      }),
      returns: z.object({
        messages: z.array(z.object({
          role: z.string(),
          content: z.string(),
          timestamp: z.string(),
        })),
        totalMessages: z.number(),
      }),
      execute: getConversationHistory,
      timeoutMs: 10000,
    },

    add_message: {
      description: 'Add a message to conversation',
      parameters: z.object({
        conversationId: z.string(),
        role: z.enum(['user', 'assistant']),
        content: z.string(),
        attachments: z.array(z.object({
          type: z.string(),
          url: z.string(),
        })).optional(),
      }),
      returns: z.object({
        messageIndex: z.number(),
        timestamp: z.string(),
      }),
      execute: addMessage,
      sideEffectful: true,
      timeoutMs: 5000,
    },

    summarize: {
      description: 'Summarize a conversation',
      parameters: z.object({
        conversationId: z.string(),
      }),
      returns: z.object({
        summary: z.string(),
        keyTopics: z.array(z.string()),
        messageCount: z.number(),
        duration: z.string(),
      }),
      execute: summarizeConversation,
      timeoutMs: 30000,
    },

    update_preferences: {
      description: 'Update user preferences',
      parameters: z.object({
        userId: z.string(),
        preferences: z.record(z.unknown()),
      }),
      returns: z.object({
        updated: z.boolean(),
        preferences: z.record(z.unknown()),
      }),
      execute: updateUserPreferences,
      sideEffectful: true,
      timeoutMs: 5000,
    },

    get_preferences: {
      description: 'Get user preferences',
      parameters: z.object({
        userId: z.string(),
      }),
      returns: z.object({
        preferences: z.record(z.unknown()),
        hasPreferences: z.boolean(),
      }),
      execute: getUserPreferences,
      timeoutMs: 5000,
    },

    search_knowledge: {
      description: 'Search knowledge base',
      parameters: z.object({
        query: z.string(),
        domain: DomainSchema.optional(),
        limit: z.number().optional(),
      }),
      returns: z.object({
        results: z.array(z.object({
          title: z.string(),
          content: z.string(),
          relevance: z.number(),
          source: z.string(),
        })),
        totalFound: z.number(),
      }),
      execute: searchKnowledge,
      timeoutMs: 30000,
    },

    execute_task: {
      description: 'Execute a specific task',
      parameters: z.object({
        taskType: z.enum(['summarize', 'translate', 'analyze', 'generate', 'extract']),
        input: z.string(),
        options: z.record(z.unknown()).optional(),
      }),
      returns: z.object({
        result: z.string(),
        taskType: z.string(),
        processingTime: z.number(),
      }),
      execute: executeTask,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    orchestrate_agents: {
      description: 'Plan multi-agent task execution',
      parameters: z.object({
        task: z.string(),
        requiredCapabilities: z.array(z.string()),
        priority: z.enum(['low', 'medium', 'high']),
      }),
      returns: z.object({
        plan: z.array(z.object({
          step: z.number(),
          agentType: z.string(),
          action: z.string(),
          dependencies: z.array(z.number()),
        })),
        estimatedDuration: z.number(),
      }),
      execute: orchestrateAgents,
      timeoutMs: 30000,
    },

    get_suggestions: {
      description: 'Get contextual suggestions',
      parameters: z.object({
        conversationId: z.string(),
        currentTopic: z.string().optional(),
      }),
      returns: z.object({
        suggestions: z.array(z.object({
          type: z.enum(['question', 'action', 'topic']),
          text: z.string(),
          confidence: z.number(),
        })),
      }),
      execute: provideSuggestions,
      timeoutMs: 10000,
    },
  },

  systemPrompt: `You are an intelligent AI assistant with memory and multi-modal capabilities.

Your core capabilities:
- Maintain conversation context and memory
- Understand text, images, and documents
- Execute various tasks (summarize, translate, analyze, etc.)
- Orchestrate other specialized agents
- Provide personalized responses based on user preferences

Personality modes:
- professional: Formal, structured responses
- friendly: Warm, conversational tone
- concise: Brief, to-the-point answers
- detailed: Comprehensive explanations
- creative: Imaginative, exploratory responses
- analytical: Data-driven, logical approach

Domains of expertise:
- general: Broad knowledge assistance
- coding: Software development help
- writing: Content creation and editing
- research: Information gathering and analysis
- creative: Artistic and creative projects
- business: Professional and business tasks
- education: Learning and teaching support
- support: Customer service assistance

Best practices:
- Remember context from earlier in conversation
- Adapt tone to user's personality preference
- Proactively suggest helpful actions
- Orchestrate specialized agents when needed
- Provide sources and references when available
- Respect user privacy and data preferences

When orchestrating other agents:
- Identify required capabilities from user request
- Create execution plan with dependencies
- Monitor progress and handle failures
- Combine results coherently

Available agent capabilities:
- image_generation: Create images from descriptions
- video_generation: Generate video content
- voice_synthesis: Clone and synthesize voices
- face_swap: Swap faces in videos (requires consent)
- music_generation: Create music and sound effects
- avatar_creation: Generate avatar images
- storyboard: Create visual storyboards
- motion_graphics: Animated text and graphics`,

  config: {
    maxTurns: 20,
    temperature: 0.7,
    maxTokens: 4096,
  },
});

export default aiAssistantAgent;
