/**
 * Customer Support Bot Agent
 *
 * AI-powered customer support agent that handles inquiries,
 * provides contextual responses, manages escalations, and
 * learns from knowledge bases.
 *
 * Capabilities:
 * - Intent classification and routing
 * - Knowledge base search and retrieval
 * - Sentiment analysis for escalation
 * - Multi-turn conversation handling
 * - Response templating with personalization
 * - Ticket creation and handoff
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const IntentSchema = z.object({
  intent: z.enum([
    'greeting',
    'product_inquiry',
    'order_status',
    'return_refund',
    'technical_support',
    'billing',
    'complaint',
    'feedback',
    'other',
  ]),
  confidence: z.number().min(0).max(1),
  entities: z.record(z.string(), z.string()).optional(),
});

const SentimentSchema = z.object({
  sentiment: z.enum(['positive', 'neutral', 'negative', 'frustrated', 'angry']),
  score: z.number().min(-1).max(1),
  requiresEscalation: z.boolean(),
  escalationReason: z.string().optional(),
});

const KnowledgeArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  category: z.string(),
  relevanceScore: z.number().min(0).max(1),
  lastUpdated: z.string().optional(),
});

const ConversationContextSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  previousInteractions: z.number().default(0),
  openTickets: z.number().default(0),
  customerTier: z.enum(['standard', 'premium', 'enterprise']).default('standard'),
  preferredLanguage: z.string().default('en'),
});

const TicketSchema = z.object({
  id: z.string(),
  subject: z.string(),
  description: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  category: z.string(),
  status: z.enum(['open', 'pending', 'escalated', 'resolved']),
  assignedTo: z.string().optional(),
  createdAt: z.string(),
});

// Input/Output Schemas
const SupportRequestInputSchema = z.object({
  message: z.string().describe('Customer message'),
  conversationHistory: z.array(z.object({
    role: z.enum(['customer', 'agent']),
    message: z.string(),
    timestamp: z.string().optional(),
  })).optional().default([]),
  customerContext: ConversationContextSchema.optional(),
  knowledgeBase: z.array(z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    category: z.string(),
  })).optional().describe('Knowledge base articles for reference'),
});

const SupportResponseOutputSchema = z.object({
  response: z.string(),
  intent: IntentSchema,
  sentiment: SentimentSchema,
  suggestedActions: z.array(z.object({
    action: z.string(),
    description: z.string(),
    priority: z.enum(['low', 'medium', 'high']),
  })),
  referencedArticles: z.array(z.object({
    id: z.string(),
    title: z.string(),
    relevance: z.number(),
  })),
  ticket: TicketSchema.optional(),
  escalated: z.boolean(),
  followUpRequired: z.boolean(),
  metadata: z.object({
    responseTime: z.number(),
    confidence: z.number(),
    tokensUsed: z.number().optional(),
  }),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const INTENT_KEYWORDS: Record<string, string[]> = {
  greeting: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'],
  product_inquiry: ['product', 'item', 'feature', 'specification', 'how does', 'what is', 'tell me about'],
  order_status: ['order', 'shipping', 'delivery', 'tracking', 'where is', 'when will'],
  return_refund: ['return', 'refund', 'exchange', 'money back', 'cancel order'],
  technical_support: ['not working', 'error', 'bug', 'issue', 'problem', 'help', 'broken', 'fix'],
  billing: ['bill', 'charge', 'payment', 'invoice', 'subscription', 'credit'],
  complaint: ['unhappy', 'disappointed', 'terrible', 'awful', 'worst', 'unacceptable'],
  feedback: ['suggestion', 'feedback', 'improve', 'recommend', 'love', 'great'],
};

const SENTIMENT_INDICATORS = {
  positive: ['thank', 'thanks', 'great', 'awesome', 'excellent', 'love', 'perfect', 'wonderful'],
  negative: ['bad', 'poor', 'terrible', 'awful', 'hate', 'disappointed', 'unhappy', 'frustrated'],
  angry: ['angry', 'furious', 'outraged', 'unacceptable', 'ridiculous', 'worst', 'never again'],
};

function classifyIntentBasic(message: string): IntentSchema['_output'] {
  const lowerMessage = message.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    scores[intent] = 0;
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword)) {
        scores[intent] += 1;
      }
    }
  }

  const maxScore = Math.max(...Object.values(scores));
  const topIntent = Object.entries(scores)
    .find(([_, score]) => score === maxScore)?.[0] || 'other';

  // Calculate confidence based on keyword matches
  const confidence = maxScore > 0 ? Math.min(0.3 + maxScore * 0.2, 0.9) : 0.3;

  return {
    intent: topIntent as IntentSchema['_output']['intent'],
    confidence,
  };
}

function analyzeSentimentBasic(message: string): SentimentSchema['_output'] {
  const lowerMessage = message.toLowerCase();

  let positiveScore = 0;
  let negativeScore = 0;
  let angryScore = 0;

  for (const word of SENTIMENT_INDICATORS.positive) {
    if (lowerMessage.includes(word)) positiveScore++;
  }
  for (const word of SENTIMENT_INDICATORS.negative) {
    if (lowerMessage.includes(word)) negativeScore++;
  }
  for (const word of SENTIMENT_INDICATORS.angry) {
    if (lowerMessage.includes(word)) angryScore++;
  }

  let sentiment: SentimentSchema['_output']['sentiment'];
  let score: number;

  if (angryScore >= 2) {
    sentiment = 'angry';
    score = -0.9;
  } else if (negativeScore > positiveScore + 1) {
    sentiment = negativeScore >= 3 ? 'frustrated' : 'negative';
    score = -0.5 - negativeScore * 0.1;
  } else if (positiveScore > negativeScore + 1) {
    sentiment = 'positive';
    score = 0.5 + positiveScore * 0.1;
  } else {
    sentiment = 'neutral';
    score = 0;
  }

  const requiresEscalation = sentiment === 'angry' || sentiment === 'frustrated';

  return {
    sentiment,
    score: Math.max(-1, Math.min(1, score)),
    requiresEscalation,
    escalationReason: requiresEscalation ? `Customer appears ${sentiment}` : undefined,
  };
}

function searchKnowledgeBase(
  query: string,
  articles: Array<{ id: string; title: string; content: string; category: string }>
): KnowledgeArticleSchema['_output'][] {
  const queryWords = query.toLowerCase().split(/\s+/);

  return articles
    .map(article => {
      const titleWords = article.title.toLowerCase().split(/\s+/);
      const contentWords = article.content.toLowerCase().split(/\s+/);

      let score = 0;
      for (const word of queryWords) {
        if (word.length < 3) continue;
        if (titleWords.some(tw => tw.includes(word))) score += 3;
        if (contentWords.some(cw => cw.includes(word))) score += 1;
      }

      return {
        ...article,
        relevanceScore: Math.min(score / 10, 1),
      };
    })
    .filter(a => a.relevanceScore > 0.1)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 5);
}

function generateTicketId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `TKT-${timestamp}-${random}`.toUpperCase();
}

function determinePriority(
  sentiment: SentimentSchema['_output'],
  intent: IntentSchema['_output'],
  customerTier: string
): 'low' | 'medium' | 'high' | 'urgent' {
  if (sentiment.sentiment === 'angry' || sentiment.requiresEscalation) {
    return customerTier === 'enterprise' ? 'urgent' : 'high';
  }

  if (intent.intent === 'complaint') {
    return customerTier === 'enterprise' ? 'high' : 'medium';
  }

  if (customerTier === 'enterprise') {
    return 'medium';
  }

  if (intent.intent === 'billing' || intent.intent === 'technical_support') {
    return 'medium';
  }

  return 'low';
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function classifyIntent(
  ctx: AgentContext,
  params: { message: string; conversationHistory?: Array<{ role: string; message: string }> }
): Promise<IntentSchema['_output']> {
  // Use basic classification as a starting point
  const basicIntent = classifyIntentBasic(params.message);

  // In a production system, this would use the LLM for better classification
  // For now, we'll enhance with conversation context
  if (params.conversationHistory && params.conversationHistory.length > 0) {
    const lastAgentMessage = params.conversationHistory
      .filter(h => h.role === 'agent')
      .slice(-1)[0];

    // If there was a previous agent message, the current message is likely a follow-up
    if (lastAgentMessage && basicIntent.intent === 'other') {
      // Try to infer from context
      const combinedContext = `${lastAgentMessage.message} ${params.message}`;
      return classifyIntentBasic(combinedContext);
    }
  }

  logger.info('intent_classified', {
    intent: basicIntent.intent,
    confidence: basicIntent.confidence,
  });

  return basicIntent;
}

async function analyzeSentiment(
  ctx: AgentContext,
  params: { message: string; conversationHistory?: Array<{ role: string; message: string }> }
): Promise<SentimentSchema['_output']> {
  const sentiment = analyzeSentimentBasic(params.message);

  // Check conversation history for escalating frustration
  if (params.conversationHistory && params.conversationHistory.length > 2) {
    const recentCustomerMessages = params.conversationHistory
      .filter(h => h.role === 'customer')
      .slice(-3);

    let negativeTrend = 0;
    for (const msg of recentCustomerMessages) {
      const msgSentiment = analyzeSentimentBasic(msg.message);
      if (msgSentiment.score < 0) negativeTrend++;
    }

    // If customer has been negative multiple times, escalate
    if (negativeTrend >= 2 && !sentiment.requiresEscalation) {
      sentiment.requiresEscalation = true;
      sentiment.escalationReason = 'Customer showing persistent dissatisfaction';
    }
  }

  logger.info('sentiment_analyzed', {
    sentiment: sentiment.sentiment,
    score: sentiment.score,
    requiresEscalation: sentiment.requiresEscalation,
  });

  return sentiment;
}

async function searchKnowledge(
  ctx: AgentContext,
  params: {
    query: string;
    knowledgeBase: Array<{ id: string; title: string; content: string; category: string }>;
  }
): Promise<KnowledgeArticleSchema['_output'][]> {
  const results = searchKnowledgeBase(params.query, params.knowledgeBase);

  logger.info('knowledge_searched', {
    query: params.query.substring(0, 50),
    resultsFound: results.length,
  });

  return results;
}

async function generateResponse(
  ctx: AgentContext,
  params: {
    intent: IntentSchema['_output'];
    sentiment: SentimentSchema['_output'];
    customerContext?: ConversationContextSchema['_output'];
    knowledgeResults: KnowledgeArticleSchema['_output'][];
    originalMessage: string;
  }
): Promise<{ response: string; suggestedActions: Array<{ action: string; description: string; priority: 'low' | 'medium' | 'high' }> }> {
  const greeting = params.customerContext?.customerName
    ? `Hi ${params.customerContext.customerName}, `
    : 'Hello, ';

  let response = greeting;
  const suggestedActions: Array<{ action: string; description: string; priority: 'low' | 'medium' | 'high' }> = [];

  // Handle based on sentiment first
  if (params.sentiment.sentiment === 'angry' || params.sentiment.sentiment === 'frustrated') {
    response += "I sincerely apologize for any frustration you're experiencing. ";
    suggestedActions.push({
      action: 'escalate_to_supervisor',
      description: 'Consider escalating to a supervisor for immediate attention',
      priority: 'high',
    });
  }

  // Generate response based on intent
  switch (params.intent.intent) {
    case 'greeting':
      response += "Thank you for reaching out! How can I help you today?";
      break;

    case 'product_inquiry':
      if (params.knowledgeResults.length > 0) {
        response += `I'd be happy to help you with that. ${params.knowledgeResults[0].content.substring(0, 200)}...`;
        suggestedActions.push({
          action: 'send_product_details',
          description: 'Send detailed product information',
          priority: 'medium',
        });
      } else {
        response += "I'd be happy to help you learn more about our products. Could you tell me which specific product or feature you're interested in?";
      }
      break;

    case 'order_status':
      response += "I can help you check on your order. Could you please provide your order number? You can find it in your confirmation email.";
      suggestedActions.push({
        action: 'lookup_order',
        description: 'Look up order status in system',
        priority: 'medium',
      });
      break;

    case 'return_refund':
      response += "I understand you'd like to process a return or refund. Our return policy allows returns within 30 days of purchase. ";
      if (params.knowledgeResults.length > 0) {
        response += params.knowledgeResults[0].content.substring(0, 150);
      }
      suggestedActions.push({
        action: 'initiate_return',
        description: 'Start return/refund process',
        priority: 'high',
      });
      break;

    case 'technical_support':
      response += "I'm sorry to hear you're experiencing technical difficulties. ";
      if (params.knowledgeResults.length > 0) {
        response += `Here's what might help: ${params.knowledgeResults[0].content.substring(0, 200)}`;
      } else {
        response += "Could you describe the issue you're facing in more detail?";
      }
      suggestedActions.push({
        action: 'create_support_ticket',
        description: 'Create technical support ticket',
        priority: 'medium',
      });
      break;

    case 'billing':
      response += "I can help you with your billing inquiry. For security purposes, I'll need to verify some information. ";
      suggestedActions.push({
        action: 'verify_account',
        description: 'Verify customer account before discussing billing',
        priority: 'high',
      });
      break;

    case 'complaint':
      response += "I'm truly sorry to hear about your experience. Your feedback is important to us, and I want to make this right. ";
      suggestedActions.push({
        action: 'log_complaint',
        description: 'Document complaint in customer record',
        priority: 'high',
      });
      suggestedActions.push({
        action: 'offer_compensation',
        description: 'Consider offering appropriate compensation',
        priority: 'medium',
      });
      break;

    case 'feedback':
      if (params.sentiment.score > 0) {
        response += "Thank you so much for your positive feedback! We really appreciate hearing from satisfied customers.";
      } else {
        response += "Thank you for taking the time to share your feedback. We're always looking for ways to improve.";
      }
      suggestedActions.push({
        action: 'record_feedback',
        description: 'Log feedback for product team review',
        priority: 'low',
      });
      break;

    default:
      response += "Thank you for your message. I'm here to help. Could you provide a bit more detail about what you need assistance with?";
  }

  // Add closing based on customer tier
  if (params.customerContext?.customerTier === 'enterprise') {
    response += " As a valued enterprise customer, you have access to priority support.";
  } else if (params.customerContext?.customerTier === 'premium') {
    response += " As a premium member, we're committed to providing you with excellent service.";
  }

  return { response, suggestedActions };
}

async function createTicket(
  ctx: AgentContext,
  params: {
    intent: IntentSchema['_output'];
    sentiment: SentimentSchema['_output'];
    customerContext?: ConversationContextSchema['_output'];
    message: string;
  }
): Promise<TicketSchema['_output']> {
  const priority = determinePriority(
    params.sentiment,
    params.intent,
    params.customerContext?.customerTier || 'standard'
  );

  const ticket: TicketSchema['_output'] = {
    id: generateTicketId(),
    subject: `${params.intent.intent.replace(/_/g, ' ').toUpperCase()}: ${params.message.substring(0, 50)}...`,
    description: params.message,
    priority,
    category: params.intent.intent,
    status: params.sentiment.requiresEscalation ? 'escalated' : 'open',
    createdAt: new Date().toISOString(),
  };

  logger.info('ticket_created', {
    ticketId: ticket.id,
    priority: ticket.priority,
    category: ticket.category,
  });

  return ticket;
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const customerSupportBotAgent = defineAgent({
  name: 'customer-support-bot',
  description: 'AI-powered customer support agent that handles inquiries, provides contextual responses, and manages escalations',
  version: '1.0.0',

  inputSchema: SupportRequestInputSchema,
  outputSchema: SupportResponseOutputSchema,

  tools: {
    classify_intent: {
      description: 'Classify the intent of a customer message',
      parameters: z.object({
        message: z.string(),
        conversationHistory: z.array(z.object({
          role: z.string(),
          message: z.string(),
        })).optional(),
      }),
      returns: IntentSchema,
      execute: classifyIntent,
      timeoutMs: 10000,
    },

    analyze_sentiment: {
      description: 'Analyze the sentiment of a customer message',
      parameters: z.object({
        message: z.string(),
        conversationHistory: z.array(z.object({
          role: z.string(),
          message: z.string(),
        })).optional(),
      }),
      returns: SentimentSchema,
      execute: analyzeSentiment,
      timeoutMs: 10000,
    },

    search_knowledge: {
      description: 'Search the knowledge base for relevant articles',
      parameters: z.object({
        query: z.string(),
        knowledgeBase: z.array(z.object({
          id: z.string(),
          title: z.string(),
          content: z.string(),
          category: z.string(),
        })),
      }),
      returns: z.array(KnowledgeArticleSchema),
      execute: searchKnowledge,
      timeoutMs: 15000,
    },

    generate_response: {
      description: 'Generate a contextual response based on analysis',
      parameters: z.object({
        intent: IntentSchema,
        sentiment: SentimentSchema,
        customerContext: ConversationContextSchema.optional(),
        knowledgeResults: z.array(KnowledgeArticleSchema),
        originalMessage: z.string(),
      }),
      returns: z.object({
        response: z.string(),
        suggestedActions: z.array(z.object({
          action: z.string(),
          description: z.string(),
          priority: z.enum(['low', 'medium', 'high']),
        })),
      }),
      execute: generateResponse,
      timeoutMs: 15000,
    },

    create_ticket: {
      description: 'Create a support ticket for tracking',
      parameters: z.object({
        intent: IntentSchema,
        sentiment: SentimentSchema,
        customerContext: ConversationContextSchema.optional(),
        message: z.string(),
      }),
      returns: TicketSchema,
      execute: createTicket,
      sideEffectful: true,
      timeoutMs: 10000,
    },
  },

  systemPrompt: `You are an empathetic and professional customer support agent. Your role is to:

1. Understand what the customer needs (classify their intent)
2. Gauge their emotional state (analyze sentiment)
3. Find relevant information from the knowledge base
4. Provide helpful, personalized responses
5. Create tickets when needed for follow-up

Guidelines:
- Always be polite and professional
- Show empathy, especially when customers are frustrated
- Provide clear, actionable information
- Escalate appropriately when sentiment is very negative
- Personalize responses when customer context is available
- Keep responses concise but complete

For angry or frustrated customers:
- Acknowledge their feelings first
- Apologize for any inconvenience
- Focus on solutions, not excuses
- Offer to escalate if needed`,

  config: {
    maxTurns: 10,
    temperature: 0.4,
    maxTokens: 2048,
  },
});

export default customerSupportBotAgent;
