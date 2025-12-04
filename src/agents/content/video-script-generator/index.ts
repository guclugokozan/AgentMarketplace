/**
 * Video Script Generator Agent
 *
 * AI-powered video script generation for various platforms and formats.
 * Creates engaging scripts with hooks, structure, and timing markers.
 *
 * Capabilities:
 * - Platform-specific scripts (YouTube, TikTok, Instagram, LinkedIn)
 * - Multiple formats (tutorial, explainer, promotional, vlog)
 * - Timing and pacing guidance
 * - Hook generation for retention
 * - B-roll and visual cue suggestions
 * - Call-to-action optimization
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const PlatformSchema = z.enum([
  'youtube_long',
  'youtube_short',
  'tiktok',
  'instagram_reel',
  'linkedin',
  'facebook',
  'podcast',
  'presentation',
]);

const VideoFormatSchema = z.enum([
  'tutorial',
  'explainer',
  'listicle',
  'promotional',
  'testimonial',
  'vlog',
  'interview',
  'product_demo',
  'educational',
  'entertainment',
]);

const ToneSchema = z.enum([
  'professional',
  'casual',
  'energetic',
  'conversational',
  'authoritative',
  'inspirational',
  'humorous',
]);

const ScriptSectionSchema = z.object({
  type: z.enum(['hook', 'intro', 'main_content', 'transition', 'cta', 'outro']),
  timestamp: z.string().describe('Estimated timestamp (MM:SS)'),
  duration: z.number().describe('Duration in seconds'),
  voiceover: z.string(),
  onScreenText: z.string().optional(),
  visualCues: z.array(z.string()),
  bRollSuggestions: z.array(z.string()),
  notes: z.string().optional(),
});

const HookSchema = z.object({
  type: z.enum(['question', 'statement', 'statistic', 'story', 'controversy', 'promise']),
  text: z.string(),
  visualSuggestion: z.string(),
  estimatedRetention: z.enum(['low', 'medium', 'high']),
});

const CTASchema = z.object({
  type: z.enum(['subscribe', 'like', 'comment', 'share', 'link', 'follow', 'buy', 'custom']),
  text: z.string(),
  placement: z.enum(['beginning', 'middle', 'end', 'multiple']),
  visualCue: z.string(),
});

const ScriptMetadataSchema = z.object({
  title: z.string(),
  platform: PlatformSchema,
  format: VideoFormatSchema,
  totalDuration: z.number(),
  wordCount: z.number(),
  readingPace: z.enum(['slow', 'normal', 'fast']),
  targetAudience: z.string(),
});

const VideoScriptSchema = z.object({
  id: z.string(),
  metadata: ScriptMetadataSchema,
  hooks: z.array(HookSchema),
  sections: z.array(ScriptSectionSchema),
  ctas: z.array(CTASchema),
  fullScript: z.string(),
  thumbnailIdeas: z.array(z.string()),
  seoTags: z.array(z.string()),
});

// Input/Output Schemas
const ScriptInputSchema = z.object({
  topic: z.string().describe('Main topic or title of the video'),
  platform: PlatformSchema,
  format: VideoFormatSchema,
  targetDuration: z.number().describe('Target duration in seconds'),
  content: z.object({
    mainPoints: z.array(z.string()).describe('Key points to cover'),
    examples: z.array(z.string()).optional(),
    targetAudience: z.string(),
    goal: z.string().describe('What should viewers do/learn?'),
  }),
  options: z.object({
    tone: ToneSchema.default('conversational'),
    includeHooks: z.boolean().default(true),
    hookCount: z.number().min(1).max(5).default(3),
    includeCTA: z.boolean().default(true),
    includeTimestamps: z.boolean().default(true),
    includeBRoll: z.boolean().default(true),
  }).optional(),
});

const ScriptOutputSchema = z.object({
  script: VideoScriptSchema,
  alternativeHooks: z.array(HookSchema),
  productionNotes: z.array(z.string()),
  estimatedEngagement: z.object({
    retentionScore: z.number().min(0).max(100),
    factors: z.array(z.string()),
  }),
});

// =============================================================================
// CONSTANTS
// =============================================================================

const PLATFORM_GUIDELINES: Record<string, {
  maxDuration: number;
  optimalDuration: { min: number; max: number };
  paceWordsPerMinute: number;
  hookMaxSeconds: number;
}> = {
  youtube_long: {
    maxDuration: 3600,
    optimalDuration: { min: 480, max: 900 },
    paceWordsPerMinute: 150,
    hookMaxSeconds: 10,
  },
  youtube_short: {
    maxDuration: 60,
    optimalDuration: { min: 30, max: 58 },
    paceWordsPerMinute: 180,
    hookMaxSeconds: 3,
  },
  tiktok: {
    maxDuration: 180,
    optimalDuration: { min: 15, max: 60 },
    paceWordsPerMinute: 180,
    hookMaxSeconds: 2,
  },
  instagram_reel: {
    maxDuration: 90,
    optimalDuration: { min: 15, max: 60 },
    paceWordsPerMinute: 170,
    hookMaxSeconds: 3,
  },
  linkedin: {
    maxDuration: 600,
    optimalDuration: { min: 60, max: 180 },
    paceWordsPerMinute: 140,
    hookMaxSeconds: 5,
  },
  facebook: {
    maxDuration: 240,
    optimalDuration: { min: 60, max: 180 },
    paceWordsPerMinute: 150,
    hookMaxSeconds: 5,
  },
  podcast: {
    maxDuration: 7200,
    optimalDuration: { min: 1200, max: 3600 },
    paceWordsPerMinute: 140,
    hookMaxSeconds: 30,
  },
  presentation: {
    maxDuration: 3600,
    optimalDuration: { min: 300, max: 1200 },
    paceWordsPerMinute: 130,
    hookMaxSeconds: 15,
  },
};

const HOOK_TEMPLATES: Record<string, string[]> = {
  question: [
    'Have you ever wondered why {{topic}}?',
    'What if I told you {{claim}}?',
    'Why do most people get {{topic}} completely wrong?',
  ],
  statement: [
    'This is the {{adjective}} way to {{action}}.',
    '{{topic}} is about to change forever.',
    'I\'ve spent {{time}} learning {{topic}}, and here\'s what nobody tells you.',
  ],
  statistic: [
    '{{percentage}}% of people don\'t know this about {{topic}}.',
    'In just {{time}}, {{result}}.',
    'Studies show that {{statistic}}.',
  ],
  story: [
    'Last {{time_period}}, I discovered something that changed everything.',
    'When I first started with {{topic}}, I made every mistake possible.',
    'Here\'s the story of how {{result}}.',
  ],
  controversy: [
    'Everything you\'ve been told about {{topic}} is wrong.',
    'Unpopular opinion: {{opinion}}.',
    'I\'m going to say something controversial about {{topic}}.',
  ],
  promise: [
    'By the end of this video, you\'ll know exactly how to {{outcome}}.',
    'In the next {{duration}}, I\'ll show you {{promise}}.',
    'This video will save you {{benefit}}.',
  ],
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateId(): string {
  return `script_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function calculateWordCount(durationSeconds: number, wordsPerMinute: number): number {
  return Math.floor((durationSeconds / 60) * wordsPerMinute);
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function generateHooks(
  ctx: AgentContext,
  params: {
    topic: string;
    format: z.infer<typeof VideoFormatSchema>;
    platform: z.infer<typeof PlatformSchema>;
    count: number;
  }
): Promise<HookSchema['_output'][]> {
  const hooks: HookSchema['_output'][] = [];
  const hookTypes: Array<HookSchema['_output']['type']> = ['question', 'statement', 'statistic', 'story', 'controversy', 'promise'];

  for (let i = 0; i < params.count; i++) {
    const type = hookTypes[i % hookTypes.length];
    const templates = HOOK_TEMPLATES[type];
    const template = templates[Math.floor(Math.random() * templates.length)];

    const text = template
      .replace('{{topic}}', params.topic)
      .replace('{{claim}}', `${params.topic} can change your life`)
      .replace('{{adjective}}', 'best')
      .replace('{{action}}', `master ${params.topic}`)
      .replace('{{percentage}}', '90')
      .replace('{{time}}', '5 years')
      .replace('{{result}}', 'I saw incredible results')
      .replace('{{statistic}}', `${params.topic} can increase productivity by 50%`)
      .replace('{{time_period}}', 'month')
      .replace('{{opinion}}', `${params.topic} is overrated for beginners`)
      .replace('{{outcome}}', `improve your ${params.topic.toLowerCase()} skills`)
      .replace('{{duration}}', '10 minutes')
      .replace('{{promise}}', `the secrets of ${params.topic}`)
      .replace('{{benefit}}', 'hours of frustration');

    hooks.push({
      type,
      text,
      visualSuggestion: `Dynamic text overlay with "${text.split(' ').slice(0, 5).join(' ')}..."`,
      estimatedRetention: type === 'question' || type === 'controversy' ? 'high' : 'medium',
    });
  }

  return hooks;
}

async function generateScriptSections(
  ctx: AgentContext,
  params: {
    topic: string;
    mainPoints: string[];
    format: z.infer<typeof VideoFormatSchema>;
    platform: z.infer<typeof PlatformSchema>;
    targetDuration: number;
    tone: z.infer<typeof ToneSchema>;
    includeBRoll: boolean;
  }
): Promise<ScriptSectionSchema['_output'][]> {
  const sections: ScriptSectionSchema['_output'][] = [];
  const guidelines = PLATFORM_GUIDELINES[params.platform];
  const totalDuration = Math.min(params.targetDuration, guidelines.maxDuration);

  // Calculate section durations
  const hookDuration = Math.min(5, guidelines.hookMaxSeconds);
  const introDuration = Math.min(15, totalDuration * 0.1);
  const outroDuration = Math.min(20, totalDuration * 0.1);
  const ctaDuration = Math.min(10, totalDuration * 0.05);
  const mainContentDuration = totalDuration - hookDuration - introDuration - outroDuration - ctaDuration;

  let currentTime = 0;

  // Hook
  sections.push({
    type: 'hook',
    timestamp: formatTimestamp(currentTime),
    duration: hookDuration,
    voiceover: `[HOOK - Grab attention immediately]`,
    onScreenText: params.topic.toUpperCase(),
    visualCues: ['Quick cuts', 'Energetic pacing', 'Eye contact with camera'],
    bRollSuggestions: params.includeBRoll ? ['Attention-grabbing visual related to topic'] : [],
    notes: 'First 3 seconds are critical for retention',
  });
  currentTime += hookDuration;

  // Intro
  sections.push({
    type: 'intro',
    timestamp: formatTimestamp(currentTime),
    duration: introDuration,
    voiceover: `Welcome! Today we're diving into ${params.topic}. By the end of this video, you'll understand exactly how to apply this in your own life.`,
    visualCues: ['Friendly wave', 'Show enthusiasm', 'Brief topic overview graphic'],
    bRollSuggestions: params.includeBRoll ? ['Personal introduction shot', 'Topic-related imagery'] : [],
    notes: 'Establish credibility and set expectations',
  });
  currentTime += introDuration;

  // Main content - divide among key points
  const pointDuration = mainContentDuration / params.mainPoints.length;

  for (let i = 0; i < params.mainPoints.length; i++) {
    const point = params.mainPoints[i];

    // Add transition if not first point
    if (i > 0) {
      sections.push({
        type: 'transition',
        timestamp: formatTimestamp(currentTime),
        duration: 3,
        voiceover: `Now, let's move on to ${point.toLowerCase()}.`,
        visualCues: ['Quick transition', 'New section graphic'],
        bRollSuggestions: [],
        notes: 'Keep transitions snappy',
      });
      currentTime += 3;
    }

    sections.push({
      type: 'main_content',
      timestamp: formatTimestamp(currentTime),
      duration: Math.floor(pointDuration) - 3,
      voiceover: `[POINT ${i + 1}: ${point}]\n\nLet me explain ${point}. This is important because...\n\n[Elaborate on the point with examples and actionable advice]`,
      onScreenText: `${i + 1}. ${point}`,
      visualCues: ['Emphasize key moments', 'Use hand gestures', 'Show examples'],
      bRollSuggestions: params.includeBRoll ? [`Visual demonstration of ${point}`, 'Supporting imagery'] : [],
      notes: `Key point ${i + 1} of ${params.mainPoints.length}`,
    });
    currentTime += Math.floor(pointDuration) - 3;
  }

  // CTA
  sections.push({
    type: 'cta',
    timestamp: formatTimestamp(currentTime),
    duration: ctaDuration,
    voiceover: 'If you found this helpful, make sure to like this video and subscribe for more content like this. Drop a comment below letting me know what you want to learn next!',
    onScreenText: 'LIKE & SUBSCRIBE',
    visualCues: ['Point to subscribe button', 'Engaging facial expression'],
    bRollSuggestions: [],
    notes: 'Clear call-to-action',
  });
  currentTime += ctaDuration;

  // Outro
  sections.push({
    type: 'outro',
    timestamp: formatTimestamp(currentTime),
    duration: outroDuration,
    voiceover: `That wraps up today's video on ${params.topic}. Thanks so much for watching, and I'll see you in the next one!`,
    visualCues: ['Warm goodbye', 'End screen', 'Related video suggestions'],
    bRollSuggestions: [],
    notes: 'Leave viewers with a positive impression',
  });

  return sections;
}

async function generateCTAs(
  ctx: AgentContext,
  params: {
    platform: z.infer<typeof PlatformSchema>;
    goal: string;
    format: z.infer<typeof VideoFormatSchema>;
  }
): Promise<CTASchema['_output'][]> {
  const ctas: CTASchema['_output'][] = [];

  // Platform-specific primary CTA
  const platformCTAs: Record<string, CTASchema['_output']> = {
    youtube_long: {
      type: 'subscribe',
      text: 'If you want more content like this, hit that subscribe button and notification bell!',
      placement: 'end',
      visualCue: 'Point to subscribe button, show animation',
    },
    youtube_short: {
      type: 'follow',
      text: 'Follow for more tips!',
      placement: 'end',
      visualCue: 'Quick text overlay',
    },
    tiktok: {
      type: 'follow',
      text: 'Follow for part 2!',
      placement: 'end',
      visualCue: 'Point up to follow button',
    },
    instagram_reel: {
      type: 'like',
      text: 'Double tap if this helped you!',
      placement: 'end',
      visualCue: 'Heart animation',
    },
    linkedin: {
      type: 'comment',
      text: 'What\'s your experience with this? Share in the comments!',
      placement: 'end',
      visualCue: 'Text prompt on screen',
    },
    facebook: {
      type: 'share',
      text: 'Share this with someone who needs to see it!',
      placement: 'end',
      visualCue: 'Share button highlight',
    },
    podcast: {
      type: 'subscribe',
      text: 'Subscribe on your favorite podcast platform!',
      placement: 'end',
      visualCue: 'Audio mention',
    },
    presentation: {
      type: 'custom',
      text: 'Questions? Let\'s discuss!',
      placement: 'end',
      visualCue: 'Q&A slide',
    },
  };

  ctas.push(platformCTAs[params.platform] || platformCTAs.youtube_long);

  // Add engagement CTA
  ctas.push({
    type: 'comment',
    text: 'Drop a comment with your biggest takeaway!',
    placement: 'middle',
    visualCue: 'Comment icon animation',
  });

  return ctas;
}

async function generateFullScript(
  ctx: AgentContext,
  params: {
    topic: string;
    platform: z.infer<typeof PlatformSchema>;
    format: z.infer<typeof VideoFormatSchema>;
    targetDuration: number;
    mainPoints: string[];
    targetAudience: string;
    goal: string;
    tone: z.infer<typeof ToneSchema>;
    hookCount: number;
    includeBRoll: boolean;
  }
): Promise<VideoScriptSchema['_output']> {
  const guidelines = PLATFORM_GUIDELINES[params.platform];

  // Generate hooks
  const hooks = await generateHooks({} as AgentContext, {
    topic: params.topic,
    format: params.format,
    platform: params.platform,
    count: params.hookCount,
  });

  // Generate sections
  const sections = await generateScriptSections({} as AgentContext, {
    topic: params.topic,
    mainPoints: params.mainPoints,
    format: params.format,
    platform: params.platform,
    targetDuration: params.targetDuration,
    tone: params.tone,
    includeBRoll: params.includeBRoll,
  });

  // Generate CTAs
  const ctas = await generateCTAs({} as AgentContext, {
    platform: params.platform,
    goal: params.goal,
    format: params.format,
  });

  // Compile full script
  const fullScript = sections.map(s => {
    let section = `[${s.timestamp}] ${s.type.toUpperCase()}\n`;
    section += `${s.voiceover}\n`;
    if (s.onScreenText) section += `ON-SCREEN: ${s.onScreenText}\n`;
    if (s.visualCues.length) section += `VISUAL: ${s.visualCues.join(', ')}\n`;
    if (s.bRollSuggestions.length) section += `B-ROLL: ${s.bRollSuggestions.join(', ')}\n`;
    return section;
  }).join('\n---\n');

  const wordCount = fullScript.split(/\s+/).length;
  const actualDuration = Math.ceil((wordCount / guidelines.paceWordsPerMinute) * 60);

  // Generate thumbnail ideas
  const thumbnailIdeas = [
    `${params.topic} - with surprised expression and bold text`,
    `Before/after split showing ${params.topic} transformation`,
    `Close-up face with "${params.mainPoints[0]}" text overlay`,
  ];

  // Generate SEO tags
  const seoTags = [
    params.topic.toLowerCase(),
    params.format,
    ...params.mainPoints.map(p => p.toLowerCase().split(' ').slice(0, 2).join(' ')),
    'how to',
    'tutorial',
    'guide',
  ];

  return {
    id: generateId(),
    metadata: {
      title: params.topic,
      platform: params.platform,
      format: params.format,
      totalDuration: actualDuration,
      wordCount,
      readingPace: 'normal',
      targetAudience: params.targetAudience,
    },
    hooks,
    sections,
    ctas,
    fullScript,
    thumbnailIdeas,
    seoTags,
  };
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const videoScriptGeneratorAgent = defineAgent({
  name: 'video-script-generator',
  description: 'AI-powered video script generation for various platforms with hooks, timing, and visual cues',
  version: '1.0.0',

  inputSchema: ScriptInputSchema,
  outputSchema: ScriptOutputSchema,

  tools: {
    generate_hooks: {
      description: 'Generate attention-grabbing hooks for the video',
      parameters: z.object({
        topic: z.string(),
        format: VideoFormatSchema,
        platform: PlatformSchema,
        count: z.number(),
      }),
      returns: z.array(HookSchema),
      execute: generateHooks,
      timeoutMs: 15000,
    },

    generate_sections: {
      description: 'Generate script sections with timestamps and visual cues',
      parameters: z.object({
        topic: z.string(),
        mainPoints: z.array(z.string()),
        format: VideoFormatSchema,
        platform: PlatformSchema,
        targetDuration: z.number(),
        tone: ToneSchema,
        includeBRoll: z.boolean(),
      }),
      returns: z.array(ScriptSectionSchema),
      execute: generateScriptSections,
      timeoutMs: 30000,
    },

    generate_ctas: {
      description: 'Generate platform-appropriate calls-to-action',
      parameters: z.object({
        platform: PlatformSchema,
        goal: z.string(),
        format: VideoFormatSchema,
      }),
      returns: z.array(CTASchema),
      execute: generateCTAs,
      timeoutMs: 10000,
    },

    generate_full_script: {
      description: 'Generate a complete video script with all elements',
      parameters: z.object({
        topic: z.string(),
        platform: PlatformSchema,
        format: VideoFormatSchema,
        targetDuration: z.number(),
        mainPoints: z.array(z.string()),
        targetAudience: z.string(),
        goal: z.string(),
        tone: ToneSchema,
        hookCount: z.number(),
        includeBRoll: z.boolean(),
      }),
      returns: VideoScriptSchema,
      execute: generateFullScript,
      timeoutMs: 60000,
    },
  },

  systemPrompt: `You are an expert video scriptwriter who creates engaging, platform-optimized scripts.

Key principles:
1. Hook viewers in the first 3 seconds
2. Deliver value throughout to maintain retention
3. Match pacing to platform expectations
4. Include visual cues and B-roll suggestions
5. End with clear, compelling CTAs

Platform guidelines:
- YouTube Long: 8-15 min optimal, thorough explanations
- YouTube Shorts: Under 60 sec, punchy and fast
- TikTok: 15-60 sec, trendy and engaging
- Instagram Reels: 15-60 sec, visually driven
- LinkedIn: 1-3 min, professional and valuable
- Facebook: 1-3 min, shareable content

Script structure:
1. Hook - Grab attention immediately
2. Intro - Set expectations, establish credibility
3. Main content - Deliver on the promise
4. CTA - Tell viewers what to do next
5. Outro - Thank and tease future content

Always provide timestamps, visual cues, and multiple hook options!`,

  config: {
    maxTurns: 12,
    temperature: 0.7,
    maxTokens: 4096,
  },
});

export default videoScriptGeneratorAgent;
