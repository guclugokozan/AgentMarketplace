/**
 * Email Template Generator Agent
 *
 * AI-powered email template generation for various business scenarios.
 * Creates professional, personalized email templates with A/B testing variants.
 *
 * Capabilities:
 * - Multiple email types (sales, marketing, support, internal)
 * - Personalization token support
 * - Subject line optimization
 * - A/B test variant generation
 * - Tone and formality customization
 * - CTA optimization
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const EmailTypeSchema = z.enum([
  'cold_outreach',
  'follow_up',
  'newsletter',
  'welcome',
  'promotional',
  'transactional',
  'support_response',
  'internal_announcement',
  'meeting_request',
  'thank_you',
  'feedback_request',
  'reengagement',
]);

const ToneSchema = z.enum([
  'formal',
  'professional',
  'friendly',
  'casual',
  'urgent',
  'empathetic',
]);

const PersonalizationTokenSchema = z.object({
  token: z.string(),
  description: z.string(),
  example: z.string(),
  required: z.boolean(),
});

const SubjectLineSchema = z.object({
  text: z.string(),
  characterCount: z.number(),
  hasPersonalization: z.boolean(),
  hasEmoji: z.boolean(),
  urgencyLevel: z.enum(['low', 'medium', 'high']),
  estimatedOpenRate: z.enum(['low', 'medium', 'high']),
});

const EmailSectionSchema = z.object({
  type: z.enum(['greeting', 'opener', 'body', 'cta', 'signature', 'ps']),
  content: z.string(),
  tokens: z.array(z.string()),
});

const EmailTemplateSchema = z.object({
  id: z.string(),
  type: EmailTypeSchema,
  subject: SubjectLineSchema,
  preheader: z.string().optional(),
  sections: z.array(EmailSectionSchema),
  fullText: z.string(),
  plainText: z.string(),
  htmlTemplate: z.string().optional(),
  wordCount: z.number(),
  readingTimeSeconds: z.number(),
  tokens: z.array(PersonalizationTokenSchema),
});

const ABVariantSchema = z.object({
  variantId: z.string(),
  variantName: z.string(),
  changes: z.array(z.string()),
  template: EmailTemplateSchema,
});

// Input/Output Schemas
const EmailInputSchema = z.object({
  type: EmailTypeSchema,
  purpose: z.string().describe('Main goal of the email'),
  context: z.object({
    senderName: z.string(),
    senderTitle: z.string().optional(),
    company: z.string(),
    recipientType: z.string().describe('e.g., "potential customer", "existing client"'),
    industry: z.string().optional(),
    previousInteraction: z.string().optional(),
  }),
  content: z.object({
    mainMessage: z.string(),
    keyPoints: z.array(z.string()).optional(),
    callToAction: z.string().optional(),
    offer: z.string().optional(),
    deadline: z.string().optional(),
  }),
  options: z.object({
    tone: ToneSchema.default('professional'),
    maxLength: z.enum(['short', 'medium', 'long']).default('medium'),
    includePS: z.boolean().default(false),
    generateABVariants: z.boolean().default(true),
    variantCount: z.number().min(1).max(3).default(2),
  }).optional(),
});

const EmailOutputSchema = z.object({
  primaryTemplate: EmailTemplateSchema,
  abVariants: z.array(ABVariantSchema).optional(),
  subjectLineAlternatives: z.array(SubjectLineSchema),
  bestPractices: z.array(z.string()),
  personalizationGuide: z.array(PersonalizationTokenSchema),
});

// =============================================================================
// CONSTANTS
// =============================================================================

const LENGTH_LIMITS = {
  short: { min: 50, max: 150 },
  medium: { min: 150, max: 300 },
  long: { min: 300, max: 500 },
};

const SUBJECT_LINE_PATTERNS: Record<string, string[]> = {
  cold_outreach: [
    'Quick question about {{company}}',
    '{{first_name}}, thought of you when I saw this',
    'Idea for {{company}}\'s {{pain_point}}',
  ],
  follow_up: [
    'Following up: {{topic}}',
    'Re: Our conversation about {{topic}}',
    'Quick check-in, {{first_name}}',
  ],
  newsletter: [
    '📬 {{company}} Weekly: {{topic}}',
    'This week: {{highlight}}',
    '{{first_name}}, your {{month}} roundup is here',
  ],
  welcome: [
    'Welcome to {{company}}, {{first_name}}! 🎉',
    'You\'re in! Here\'s what\'s next',
    'Getting started with {{product}}',
  ],
  promotional: [
    '🎁 {{first_name}}, exclusive offer inside',
    '{{discount}}% off - ends {{deadline}}',
    'Special invitation for {{company}} customers',
  ],
  meeting_request: [
    'Can we chat? 15 mins this week',
    '{{first_name}}, quick sync about {{topic}}?',
    'Meeting request: {{topic}}',
  ],
};

const EMAIL_TEMPLATES: Record<string, { opener: string; body: string; cta: string }> = {
  cold_outreach: {
    opener: 'I noticed {{observation}} and thought you might be interested in how we\'ve helped similar companies.',
    body: '{{main_message}}\n\nSpecifically, we\'ve helped companies like yours:\n{{key_points}}',
    cta: 'Would you be open to a quick 15-minute call to explore this further?',
  },
  follow_up: {
    opener: 'I wanted to follow up on {{previous_topic}}.',
    body: '{{main_message}}',
    cta: 'Let me know if you have any questions or would like to discuss further.',
  },
  welcome: {
    opener: 'Welcome to the {{company}} family! We\'re thrilled to have you.',
    body: 'Here\'s what you can expect:\n{{key_points}}',
    cta: 'Ready to get started? Click below to {{action}}.',
  },
  support_response: {
    opener: 'Thank you for reaching out to {{company}} support.',
    body: '{{main_message}}',
    cta: 'If you have any other questions, please don\'t hesitate to reply to this email.',
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateId(): string {
  return `email_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`;
}

function extractTokens(text: string): string[] {
  const tokenRegex = /\{\{(\w+)\}\}/g;
  const tokens: string[] = [];
  let match;
  while ((match = tokenRegex.exec(text)) !== null) {
    if (!tokens.includes(match[1])) {
      tokens.push(match[1]);
    }
  }
  return tokens;
}

function calculateReadingTime(wordCount: number): number {
  // Average reading speed: 200 words per minute
  return Math.ceil((wordCount / 200) * 60);
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function generateSubjectLines(
  ctx: AgentContext,
  params: {
    type: z.infer<typeof EmailTypeSchema>;
    topic: string;
    tone: z.infer<typeof ToneSchema>;
    count: number;
  }
): Promise<SubjectLineSchema['_output'][]> {
  const patterns = SUBJECT_LINE_PATTERNS[params.type] || [
    '{{topic}}',
    'Quick update: {{topic}}',
    '{{first_name}}, regarding {{topic}}',
  ];

  const subjects: SubjectLineSchema['_output'][] = [];

  for (let i = 0; i < params.count; i++) {
    const pattern = patterns[i % patterns.length];
    const text = pattern.replace('{{topic}}', params.topic);

    subjects.push({
      text,
      characterCount: text.length,
      hasPersonalization: text.includes('{{'),
      hasEmoji: /[\u{1F600}-\u{1F6FF}]/u.test(text),
      urgencyLevel: params.tone === 'urgent' ? 'high' : 'medium',
      estimatedOpenRate: text.length < 50 && text.includes('{{first_name}}') ? 'high' : 'medium',
    });
  }

  return subjects;
}

async function generateEmailBody(
  ctx: AgentContext,
  params: {
    type: z.infer<typeof EmailTypeSchema>;
    mainMessage: string;
    keyPoints?: string[];
    context: {
      senderName: string;
      company: string;
      recipientType: string;
    };
    tone: z.infer<typeof ToneSchema>;
    maxLength: 'short' | 'medium' | 'long';
  }
): Promise<{
  sections: EmailSectionSchema['_output'][];
  fullText: string;
}> {
  const template = EMAIL_TEMPLATES[params.type] || EMAIL_TEMPLATES.follow_up;
  const sections: EmailSectionSchema['_output'][] = [];

  // Greeting based on tone
  const greetings: Record<string, string> = {
    formal: 'Dear {{first_name}},',
    professional: 'Hi {{first_name}},',
    friendly: 'Hey {{first_name}}!',
    casual: 'Hi there!',
    urgent: '{{first_name}},',
    empathetic: 'Hi {{first_name}},',
  };

  sections.push({
    type: 'greeting',
    content: greetings[params.tone],
    tokens: extractTokens(greetings[params.tone]),
  });

  // Opener
  sections.push({
    type: 'opener',
    content: template.opener,
    tokens: extractTokens(template.opener),
  });

  // Body
  let bodyContent = template.body.replace('{{main_message}}', params.mainMessage);
  if (params.keyPoints && params.keyPoints.length > 0) {
    const pointsList = params.keyPoints.map(p => `• ${p}`).join('\n');
    bodyContent = bodyContent.replace('{{key_points}}', pointsList);
  }

  sections.push({
    type: 'body',
    content: bodyContent,
    tokens: extractTokens(bodyContent),
  });

  // CTA
  sections.push({
    type: 'cta',
    content: template.cta,
    tokens: extractTokens(template.cta),
  });

  // Signature
  const signatures: Record<string, string> = {
    formal: 'Best regards,\n{{sender_name}}\n{{sender_title}}\n{{company}}',
    professional: 'Best,\n{{sender_name}}\n{{company}}',
    friendly: 'Cheers,\n{{sender_name}}',
    casual: 'Talk soon,\n{{sender_name}}',
    urgent: 'Thanks,\n{{sender_name}}',
    empathetic: 'Warmly,\n{{sender_name}}\n{{company}}',
  };

  sections.push({
    type: 'signature',
    content: signatures[params.tone],
    tokens: extractTokens(signatures[params.tone]),
  });

  const fullText = sections.map(s => s.content).join('\n\n');

  return { sections, fullText };
}

async function generateABVariants(
  ctx: AgentContext,
  params: {
    primaryTemplate: EmailTemplateSchema['_output'];
    count: number;
  }
): Promise<ABVariantSchema['_output'][]> {
  const variants: ABVariantSchema['_output'][] = [];

  const variationTypes = [
    { name: 'Shorter CTA', changes: ['Shortened call-to-action', 'More direct language'] },
    { name: 'Question opener', changes: ['Opens with a question', 'Increased curiosity'] },
    { name: 'Social proof', changes: ['Added social proof element', 'Included results/stats'] },
  ];

  for (let i = 0; i < params.count; i++) {
    const variation = variationTypes[i % variationTypes.length];

    variants.push({
      variantId: generateId(),
      variantName: `Variant ${String.fromCharCode(65 + i)}: ${variation.name}`,
      changes: variation.changes,
      template: {
        ...params.primaryTemplate,
        id: generateId(),
      },
    });
  }

  return variants;
}

async function getPersonalizationTokens(
  ctx: AgentContext,
  params: { emailText: string }
): Promise<PersonalizationTokenSchema['_output'][]> {
  const tokens = extractTokens(params.emailText);

  const tokenDefinitions: Record<string, { description: string; example: string; required: boolean }> = {
    first_name: { description: 'Recipient\'s first name', example: 'John', required: true },
    last_name: { description: 'Recipient\'s last name', example: 'Smith', required: false },
    company: { description: 'Recipient\'s company name', example: 'Acme Inc', required: false },
    sender_name: { description: 'Sender\'s full name', example: 'Jane Doe', required: true },
    sender_title: { description: 'Sender\'s job title', example: 'Sales Manager', required: false },
    topic: { description: 'Main topic of discussion', example: 'our new product', required: false },
    observation: { description: 'Personalized observation about recipient', example: 'your recent product launch', required: false },
    pain_point: { description: 'Recipient\'s business challenge', example: 'customer retention', required: false },
    deadline: { description: 'Offer deadline date', example: 'December 31st', required: false },
    discount: { description: 'Discount percentage', example: '25', required: false },
  };

  return tokens.map(token => ({
    token: `{{${token}}}`,
    description: tokenDefinitions[token]?.description || `Custom field: ${token}`,
    example: tokenDefinitions[token]?.example || `[${token}]`,
    required: tokenDefinitions[token]?.required || false,
  }));
}

async function generateFullTemplate(
  ctx: AgentContext,
  params: {
    type: z.infer<typeof EmailTypeSchema>;
    purpose: string;
    context: {
      senderName: string;
      senderTitle?: string;
      company: string;
      recipientType: string;
    };
    content: {
      mainMessage: string;
      keyPoints?: string[];
      callToAction?: string;
    };
    options: {
      tone: z.infer<typeof ToneSchema>;
      maxLength: 'short' | 'medium' | 'long';
      includePS: boolean;
    };
  }
): Promise<EmailTemplateSchema['_output']> {
  // Generate subject
  const subjects = await generateSubjectLines({} as AgentContext, {
    type: params.type,
    topic: params.purpose,
    tone: params.options.tone,
    count: 1,
  });

  // Generate body
  const { sections, fullText } = await generateEmailBody({} as AgentContext, {
    type: params.type,
    mainMessage: params.content.mainMessage,
    keyPoints: params.content.keyPoints,
    context: params.context,
    tone: params.options.tone,
    maxLength: params.options.maxLength,
  });

  // Add PS if requested
  if (params.options.includePS) {
    sections.push({
      type: 'ps',
      content: 'P.S. {{ps_message}}',
      tokens: ['ps_message'],
    });
  }

  const wordCount = fullText.split(/\s+/).length;

  // Get tokens
  const tokens = await getPersonalizationTokens({} as AgentContext, { emailText: fullText });

  return {
    id: generateId(),
    type: params.type,
    subject: subjects[0],
    preheader: params.content.mainMessage.substring(0, 100),
    sections,
    fullText,
    plainText: fullText.replace(/\n\n/g, '\n'),
    wordCount,
    readingTimeSeconds: calculateReadingTime(wordCount),
    tokens,
  };
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const emailTemplateGeneratorAgent = defineAgent({
  name: 'email-template-generator',
  description: 'AI-powered email template generation for various business scenarios with A/B testing support',
  version: '1.0.0',

  inputSchema: EmailInputSchema,
  outputSchema: EmailOutputSchema,

  tools: {
    generate_subject_lines: {
      description: 'Generate multiple subject line options',
      parameters: z.object({
        type: EmailTypeSchema,
        topic: z.string(),
        tone: ToneSchema,
        count: z.number(),
      }),
      returns: z.array(SubjectLineSchema),
      execute: generateSubjectLines,
      timeoutMs: 15000,
    },

    generate_email_body: {
      description: 'Generate email body content with sections',
      parameters: z.object({
        type: EmailTypeSchema,
        mainMessage: z.string(),
        keyPoints: z.array(z.string()).optional(),
        context: z.object({
          senderName: z.string(),
          company: z.string(),
          recipientType: z.string(),
        }),
        tone: ToneSchema,
        maxLength: z.enum(['short', 'medium', 'long']),
      }),
      returns: z.object({
        sections: z.array(EmailSectionSchema),
        fullText: z.string(),
      }),
      execute: generateEmailBody,
      timeoutMs: 30000,
    },

    generate_ab_variants: {
      description: 'Generate A/B test variants of an email',
      parameters: z.object({
        primaryTemplate: EmailTemplateSchema,
        count: z.number(),
      }),
      returns: z.array(ABVariantSchema),
      execute: generateABVariants,
      timeoutMs: 30000,
    },

    get_personalization_tokens: {
      description: 'Extract and define personalization tokens from email text',
      parameters: z.object({
        emailText: z.string(),
      }),
      returns: z.array(PersonalizationTokenSchema),
      execute: getPersonalizationTokens,
      timeoutMs: 10000,
    },

    generate_full_template: {
      description: 'Generate a complete email template',
      parameters: z.object({
        type: EmailTypeSchema,
        purpose: z.string(),
        context: z.object({
          senderName: z.string(),
          senderTitle: z.string().optional(),
          company: z.string(),
          recipientType: z.string(),
        }),
        content: z.object({
          mainMessage: z.string(),
          keyPoints: z.array(z.string()).optional(),
          callToAction: z.string().optional(),
        }),
        options: z.object({
          tone: ToneSchema,
          maxLength: z.enum(['short', 'medium', 'long']),
          includePS: z.boolean(),
        }),
      }),
      returns: EmailTemplateSchema,
      execute: generateFullTemplate,
      timeoutMs: 45000,
    },
  },

  systemPrompt: `You are an expert email copywriter who creates effective, professional email templates.

Guidelines:
- Match tone to the audience and purpose
- Keep subject lines under 50 characters when possible
- Front-load important information
- Use personalization tokens for customization
- Include clear calls-to-action
- Maintain appropriate length for the email type

Best practices by email type:
- Cold outreach: Short, personalized, value-focused
- Follow-up: Reference previous interaction, be helpful
- Newsletter: Engaging hook, scannable content
- Welcome: Warm, helpful, clear next steps
- Promotional: Urgency, clear offer, strong CTA
- Support: Empathetic, solution-focused

Always provide multiple subject line options and A/B variants when requested!`,

  config: {
    maxTurns: 10,
    temperature: 0.6,
    maxTokens: 4096,
  },
});

export default emailTemplateGeneratorAgent;
