/**
 * Social Media Caption Generator Agent
 *
 * AI-powered caption generation optimized for different social platforms.
 * Creates engaging, platform-specific captions with hashtags and CTAs.
 *
 * Capabilities:
 * - Platform-specific optimization (Instagram, Twitter/X, LinkedIn, TikTok, Facebook)
 * - Hashtag generation and research
 * - Emoji integration
 * - CTA suggestions
 * - Character count validation
 * - Tone and voice customization
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const PlatformSchema = z.enum([
  'instagram',
  'twitter',
  'linkedin',
  'tiktok',
  'facebook',
  'threads',
  'pinterest',
]);

const ToneSchema = z.enum([
  'professional',
  'casual',
  'humorous',
  'inspirational',
  'educational',
  'promotional',
  'storytelling',
]);

const ContentTypeSchema = z.enum([
  'product_launch',
  'behind_the_scenes',
  'user_generated',
  'educational',
  'promotional',
  'announcement',
  'engagement',
  'lifestyle',
  'testimonial',
]);

const PlatformLimitsSchema = z.object({
  platform: PlatformSchema,
  maxCharacters: z.number(),
  maxHashtags: z.number(),
  supportsLinks: z.boolean(),
  optimalLength: z.object({
    min: z.number(),
    max: z.number(),
  }),
});

const HashtagSchema = z.object({
  tag: z.string(),
  relevance: z.number().min(0).max(1),
  popularity: z.enum(['high', 'medium', 'low', 'niche']),
  category: z.string(),
});

const CaptionSchema = z.object({
  text: z.string(),
  platform: PlatformSchema,
  characterCount: z.number(),
  hashtags: z.array(z.string()),
  emojis: z.array(z.string()),
  cta: z.string().optional(),
  withinLimits: z.boolean(),
});

const CaptionVariationSchema = z.object({
  id: z.string(),
  caption: CaptionSchema,
  tone: ToneSchema,
  focus: z.string(),
});

// Input/Output Schemas
const CaptionInputSchema = z.object({
  content: z.object({
    topic: z.string().describe('Main topic or subject'),
    context: z.string().optional().describe('Additional context or details'),
    productName: z.string().optional(),
    keyPoints: z.array(z.string()).optional(),
    imageDescription: z.string().optional().describe('Description of accompanying image/video'),
  }),
  platforms: z.array(PlatformSchema).default(['instagram']),
  tone: ToneSchema.default('casual'),
  contentType: ContentTypeSchema.default('engagement'),
  options: z.object({
    includeHashtags: z.boolean().default(true),
    hashtagCount: z.number().min(0).max(30).default(10),
    includeEmojis: z.boolean().default(true),
    includeCTA: z.boolean().default(true),
    variationCount: z.number().min(1).max(5).default(3),
    targetAudience: z.string().optional(),
    brandVoice: z.string().optional(),
  }).optional(),
});

const CaptionOutputSchema = z.object({
  captions: z.record(PlatformSchema, z.array(CaptionVariationSchema)),
  suggestedHashtags: z.array(HashtagSchema),
  postingTips: z.array(z.object({
    platform: PlatformSchema,
    tip: z.string(),
  })),
  metadata: z.object({
    generatedAt: z.string(),
    totalVariations: z.number(),
  }),
});

// =============================================================================
// CONSTANTS
// =============================================================================

const PLATFORM_LIMITS: Record<string, PlatformLimitsSchema['_output']> = {
  instagram: {
    platform: 'instagram',
    maxCharacters: 2200,
    maxHashtags: 30,
    supportsLinks: false,
    optimalLength: { min: 125, max: 300 },
  },
  twitter: {
    platform: 'twitter',
    maxCharacters: 280,
    maxHashtags: 3,
    supportsLinks: true,
    optimalLength: { min: 71, max: 100 },
  },
  linkedin: {
    platform: 'linkedin',
    maxCharacters: 3000,
    maxHashtags: 5,
    supportsLinks: true,
    optimalLength: { min: 150, max: 700 },
  },
  tiktok: {
    platform: 'tiktok',
    maxCharacters: 2200,
    maxHashtags: 10,
    supportsLinks: false,
    optimalLength: { min: 50, max: 150 },
  },
  facebook: {
    platform: 'facebook',
    maxCharacters: 63206,
    maxHashtags: 5,
    supportsLinks: true,
    optimalLength: { min: 40, max: 400 },
  },
  threads: {
    platform: 'threads',
    maxCharacters: 500,
    maxHashtags: 5,
    supportsLinks: true,
    optimalLength: { min: 50, max: 300 },
  },
  pinterest: {
    platform: 'pinterest',
    maxCharacters: 500,
    maxHashtags: 20,
    supportsLinks: true,
    optimalLength: { min: 100, max: 300 },
  },
};

const TONE_EMOJIS: Record<string, string[]> = {
  professional: ['📊', '💼', '🎯', '✅', '📈', '🤝'],
  casual: ['😊', '👋', '✨', '🙌', '💪', '🔥'],
  humorous: ['😂', '🤣', '😜', '🙈', '💀', '👀'],
  inspirational: ['🌟', '💫', '🚀', '🌈', '💪', '✨'],
  educational: ['📚', '💡', '🎓', '📝', '🧠', '🔍'],
  promotional: ['🎉', '🔥', '⚡', '🎁', '✨', '💯'],
  storytelling: ['📖', '🌅', '💭', '🎬', '✨', '🌿'],
};

const CTA_TEMPLATES: Record<string, string[]> = {
  engagement: [
    'Double tap if you agree! 👇',
    'What do you think? Drop a comment below!',
    'Tag someone who needs to see this!',
    'Save this for later! 📌',
    'Share your thoughts in the comments!',
  ],
  promotional: [
    'Link in bio! 🔗',
    'Shop now - link in bio!',
    'DM us to learn more!',
    'Tap the link to get started!',
    'Limited time offer - act fast!',
  ],
  educational: [
    'Follow for more tips!',
    'Save this for reference! 📚',
    'Share with someone learning this!',
    'Want more? Follow us!',
    'Bookmark this post!',
  ],
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateId(): string {
  return `cap_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`;
}

function getRandomItems<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function countEmojis(text: string): string[] {
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  return text.match(emojiRegex) || [];
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function getPlatformLimits(
  ctx: AgentContext,
  params: { platform: z.infer<typeof PlatformSchema> }
): Promise<PlatformLimitsSchema['_output']> {
  return PLATFORM_LIMITS[params.platform];
}

async function generateHashtags(
  ctx: AgentContext,
  params: {
    topic: string;
    platform: z.infer<typeof PlatformSchema>;
    count: number;
    niche?: string;
  }
): Promise<HashtagSchema['_output'][]> {
  // In production, this would use hashtag research APIs
  // For now, generate based on topic keywords

  const words = params.topic.toLowerCase().split(/\s+/);
  const hashtags: HashtagSchema['_output'][] = [];

  // Generate hashtags from keywords
  for (const word of words) {
    if (word.length > 3) {
      hashtags.push({
        tag: `#${word}`,
        relevance: 0.9,
        popularity: 'medium',
        category: 'topic',
      });
    }
  }

  // Add common engagement hashtags based on platform
  const platformTags: Record<string, string[]> = {
    instagram: ['#instagood', '#photooftheday', '#love', '#instadaily', '#trending'],
    twitter: ['#trending', '#viral', '#fyp'],
    linkedin: ['#leadership', '#innovation', '#business', '#growth', '#success'],
    tiktok: ['#fyp', '#viral', '#trending', '#foryou', '#foryoupage'],
    facebook: ['#motivation', '#inspiration', '#love', '#life'],
    threads: ['#trending', '#viral', '#fyp'],
    pinterest: ['#inspiration', '#ideas', '#diy', '#homedecor'],
  };

  const platformSpecific = platformTags[params.platform] || [];
  platformSpecific.forEach(tag => {
    hashtags.push({
      tag,
      relevance: 0.7,
      popularity: 'high',
      category: 'engagement',
    });
  });

  // Limit to requested count
  return hashtags.slice(0, params.count);
}

async function generateCaption(
  ctx: AgentContext,
  params: {
    topic: string;
    context?: string;
    platform: z.infer<typeof PlatformSchema>;
    tone: z.infer<typeof ToneSchema>;
    contentType: z.infer<typeof ContentTypeSchema>;
    includeEmojis: boolean;
    includeCTA: boolean;
    targetAudience?: string;
  }
): Promise<CaptionSchema['_output']> {
  const limits = PLATFORM_LIMITS[params.platform];
  const emojis = params.includeEmojis ? getRandomItems(TONE_EMOJIS[params.tone], 3) : [];

  // Build caption based on content type and tone
  let captionText = '';

  // Opening hook based on tone
  const hooks: Record<string, string[]> = {
    professional: ['Here\'s what you need to know:', 'Key insight:', 'Important update:'],
    casual: ['Hey friends!', 'Guess what?', 'So excited to share:'],
    humorous: ['Plot twist:', 'Not me doing this again...', 'POV:'],
    inspirational: ['Remember:', 'Your daily reminder:', 'Believe it:'],
    educational: ['Did you know?', 'Pro tip:', 'Quick lesson:'],
    promotional: ['🚨 Exciting news!', 'You asked, we delivered:', 'Introducing:'],
    storytelling: ['Let me tell you about...', 'Picture this:', 'It all started when...'],
  };

  const hook = getRandomItems(hooks[params.tone], 1)[0];
  captionText = `${hook}\n\n${params.topic}`;

  if (params.context) {
    captionText += `\n\n${params.context}`;
  }

  // Add emojis throughout if enabled
  if (params.includeEmojis && emojis.length > 0) {
    captionText = `${emojis[0]} ${captionText}`;
  }

  // Add CTA if requested
  let cta: string | undefined;
  if (params.includeCTA) {
    const ctaCategory = params.contentType === 'promotional' ? 'promotional' : 'engagement';
    cta = getRandomItems(CTA_TEMPLATES[ctaCategory] || CTA_TEMPLATES.engagement, 1)[0];
    captionText += `\n\n${cta}`;
  }

  // Ensure within limits (truncate if needed)
  if (captionText.length > limits.maxCharacters) {
    captionText = captionText.substring(0, limits.maxCharacters - 3) + '...';
  }

  return {
    text: captionText,
    platform: params.platform,
    characterCount: captionText.length,
    hashtags: [],
    emojis: countEmojis(captionText),
    cta,
    withinLimits: captionText.length <= limits.maxCharacters,
  };
}

async function generateVariations(
  ctx: AgentContext,
  params: {
    baseCaption: CaptionSchema['_output'];
    count: number;
    tones: z.infer<typeof ToneSchema>[];
  }
): Promise<CaptionVariationSchema['_output'][]> {
  const variations: CaptionVariationSchema['_output'][] = [];

  // First variation is the original
  variations.push({
    id: generateId(),
    caption: params.baseCaption,
    tone: params.tones[0] || 'casual',
    focus: 'primary',
  });

  // Generate additional variations with different focuses
  const focuses = ['engagement', 'storytelling', 'direct'];

  for (let i = 1; i < params.count; i++) {
    const focus = focuses[i % focuses.length];
    const modifiedText = params.baseCaption.text; // In production, would actually vary the text

    variations.push({
      id: generateId(),
      caption: {
        ...params.baseCaption,
        text: modifiedText,
      },
      tone: params.tones[i % params.tones.length] || params.tones[0],
      focus,
    });
  }

  return variations;
}

async function addHashtagsToCaption(
  ctx: AgentContext,
  params: {
    caption: CaptionSchema['_output'];
    hashtags: HashtagSchema['_output'][];
    placement: 'inline' | 'end' | 'first_comment';
  }
): Promise<CaptionSchema['_output']> {
  const limits = PLATFORM_LIMITS[params.caption.platform];
  const hashtagText = params.hashtags.slice(0, limits.maxHashtags).map(h => h.tag).join(' ');

  let newText = params.caption.text;

  if (params.placement === 'end') {
    newText = `${params.caption.text}\n\n${hashtagText}`;
  } else if (params.placement === 'inline') {
    // Sprinkle hashtags throughout (simplified - just adds at end for now)
    newText = `${params.caption.text}\n\n${hashtagText}`;
  }

  // Ensure within limits
  if (newText.length > limits.maxCharacters) {
    // Remove some hashtags to fit
    const excessLength = newText.length - limits.maxCharacters;
    const trimmedHashtags = hashtagText.substring(0, hashtagText.length - excessLength - 3).trim();
    newText = `${params.caption.text}\n\n${trimmedHashtags}`;
  }

  return {
    ...params.caption,
    text: newText,
    characterCount: newText.length,
    hashtags: params.hashtags.slice(0, limits.maxHashtags).map(h => h.tag),
    withinLimits: newText.length <= limits.maxCharacters,
  };
}

async function getPostingTips(
  ctx: AgentContext,
  params: { platforms: z.infer<typeof PlatformSchema>[] }
): Promise<Array<{ platform: z.infer<typeof PlatformSchema>; tip: string }>> {
  const tips: Record<string, string[]> = {
    instagram: [
      'Best posting times: 11am-1pm and 7pm-9pm local time',
      'Use carousel posts for higher engagement',
      'Reply to comments within the first hour',
      'Stories boost feed post visibility',
    ],
    twitter: [
      'Tweet during business hours for B2B, evenings for B2C',
      'Include visuals for 150% more retweets',
      'Engage in trending conversations',
      'Thread longer content for better reach',
    ],
    linkedin: [
      'Best days: Tuesday through Thursday',
      'Native documents get 3x more engagement',
      'Ask questions to drive comments',
      'Personal stories outperform company updates',
    ],
    tiktok: [
      'Post 1-3 times per day for optimal growth',
      'Use trending sounds and hashtags',
      'First 3 seconds are crucial',
      'Engage with comments immediately after posting',
    ],
    facebook: [
      'Video content gets highest reach',
      'Post during lunch hours and early evening',
      'Facebook Groups drive more engagement',
      'Use Facebook Live for real-time interaction',
    ],
    threads: [
      'Engage with other creators consistently',
      'Share personal insights and opinions',
      'Cross-post highlights from other platforms',
    ],
    pinterest: [
      'Vertical images (2:3 ratio) perform best',
      'Use keyword-rich descriptions',
      'Pin consistently rather than in batches',
      'Create boards for different topics',
    ],
  };

  return params.platforms.map(platform => ({
    platform,
    tip: getRandomItems(tips[platform] || ['Engage authentically with your audience!'], 1)[0],
  }));
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const socialMediaCaptionGeneratorAgent = defineAgent({
  name: 'social-media-caption-generator',
  description: 'AI-powered caption generation optimized for different social media platforms',
  version: '1.0.0',

  inputSchema: CaptionInputSchema,
  outputSchema: CaptionOutputSchema,

  tools: {
    get_platform_limits: {
      description: 'Get character limits and best practices for a platform',
      parameters: z.object({
        platform: PlatformSchema,
      }),
      returns: PlatformLimitsSchema,
      execute: getPlatformLimits,
      timeoutMs: 5000,
    },

    generate_hashtags: {
      description: 'Generate relevant hashtags for a topic',
      parameters: z.object({
        topic: z.string(),
        platform: PlatformSchema,
        count: z.number(),
        niche: z.string().optional(),
      }),
      returns: z.array(HashtagSchema),
      execute: generateHashtags,
      timeoutMs: 15000,
    },

    generate_caption: {
      description: 'Generate a caption for a specific platform',
      parameters: z.object({
        topic: z.string(),
        context: z.string().optional(),
        platform: PlatformSchema,
        tone: ToneSchema,
        contentType: ContentTypeSchema,
        includeEmojis: z.boolean(),
        includeCTA: z.boolean(),
        targetAudience: z.string().optional(),
      }),
      returns: CaptionSchema,
      execute: generateCaption,
      timeoutMs: 30000,
    },

    generate_variations: {
      description: 'Generate variations of a caption',
      parameters: z.object({
        baseCaption: CaptionSchema,
        count: z.number(),
        tones: z.array(ToneSchema),
      }),
      returns: z.array(CaptionVariationSchema),
      execute: generateVariations,
      timeoutMs: 30000,
    },

    add_hashtags: {
      description: 'Add hashtags to a caption',
      parameters: z.object({
        caption: CaptionSchema,
        hashtags: z.array(HashtagSchema),
        placement: z.enum(['inline', 'end', 'first_comment']),
      }),
      returns: CaptionSchema,
      execute: addHashtagsToCaption,
      timeoutMs: 10000,
    },

    get_posting_tips: {
      description: 'Get platform-specific posting tips',
      parameters: z.object({
        platforms: z.array(PlatformSchema),
      }),
      returns: z.array(z.object({
        platform: PlatformSchema,
        tip: z.string(),
      })),
      execute: getPostingTips,
      timeoutMs: 5000,
    },
  },

  systemPrompt: `You are a social media marketing expert who creates engaging captions optimized for each platform.

Guidelines:
- Match the tone to the brand and audience
- Optimize length for each platform's algorithm
- Use hashtags strategically (not too many on Twitter/LinkedIn)
- Include relevant emojis to increase engagement
- Add clear CTAs when appropriate
- Consider the accompanying visual content

Platform best practices:
- Instagram: 125-300 chars ideal, up to 30 hashtags (10-15 recommended)
- Twitter/X: Keep under 280, 1-3 hashtags max
- LinkedIn: Professional tone, 150-700 chars, 3-5 hashtags
- TikTok: Short and punchy, trending hashtags important
- Facebook: Conversational, questions drive engagement

Always create multiple variations to give options!`,

  config: {
    maxTurns: 10,
    temperature: 0.7,
    maxTokens: 2048,
  },
});

export default socialMediaCaptionGeneratorAgent;
