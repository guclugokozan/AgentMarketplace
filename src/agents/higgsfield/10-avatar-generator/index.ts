/**
 * Avatar Generator Agent
 *
 * AI-powered avatar generation for profiles and gaming.
 * Creates stylized avatars from photos or descriptions.
 *
 * Features:
 * - Photo to avatar conversion
 * - Text to avatar generation
 * - Multiple art styles
 * - Customizable features
 * - Consistent identity across styles
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import { getDalleClient } from '../../../providers/openai.js';
import { getReplicateExtendedClient, REPLICATE_MODELS } from '../../../providers/replicate.js';
import { getStabilityProvider } from '../../../providers/stability.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const AvatarStyleSchema = z.enum([
  'realistic',
  'cartoon',
  'anime',
  'pixel_art',
  '3d_render',
  'sketch',
  'minimalist',
  'chibi',
  'comic',
  'fantasy',
  'cyberpunk',
  'watercolor',
]);

const AvatarInputSchema = z.object({
  sourceImageUrl: z.string().optional().describe('Photo to convert to avatar'),
  description: z.string().optional().describe('Text description for avatar'),
  style: AvatarStyleSchema.default('cartoon').describe('Avatar art style'),
  gender: z.enum(['male', 'female', 'neutral']).optional().describe('Character gender'),
  age: z.enum(['child', 'young', 'adult', 'elderly']).optional().describe('Apparent age'),
  expression: z.string().optional().describe('Facial expression'),
  accessories: z.array(z.string()).optional().describe('Accessories to add'),
  backgroundColor: z.string().optional().describe('Background color or type'),
  outputSize: z.enum(['256', '512', '1024']).default('512').describe('Output size'),
  count: z.number().min(1).max(4).default(1).describe('Number of variations'),
});

const AvatarOutputSchema = z.object({
  success: z.boolean(),
  avatars: z.array(z.object({
    url: z.string(),
    style: z.string(),
    description: z.string().optional(),
  })),
  processingTime: z.number(),
  estimatedCost: z.number(),
  error: z.string().optional(),
});

// =============================================================================
// HELPERS
// =============================================================================

function getStylePrompt(style: z.infer<typeof AvatarStyleSchema>): string {
  const prompts: Record<string, string> = {
    realistic: 'photorealistic portrait, detailed face, professional headshot',
    cartoon: 'cartoon character portrait, colorful, expressive, Disney Pixar style',
    anime: 'anime character portrait, manga style, detailed eyes, Japanese animation',
    pixel_art: 'pixel art portrait, 8-bit style, retro gaming avatar',
    '3d_render': '3D rendered character, Pixar style, smooth surfaces, detailed lighting',
    sketch: 'pencil sketch portrait, artistic, hand-drawn style, detailed linework',
    minimalist: 'minimalist avatar, simple shapes, flat design, modern',
    chibi: 'chibi character, cute style, big head small body, kawaii',
    comic: 'comic book character, bold lines, superhero style, dynamic',
    fantasy: 'fantasy character portrait, magical, ethereal, detailed fantasy art',
    cyberpunk: 'cyberpunk character, neon colors, futuristic, tech elements',
    watercolor: 'watercolor portrait, artistic, soft colors, painterly style',
  };
  return prompts[style] || prompts.cartoon;
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function analyzePhoto(
  ctx: AgentContext,
  params: { imageUrl: string }
): Promise<{
  hasFace: boolean;
  faceCount: number;
  gender: string;
  estimatedAge: string;
  expression: string;
  hairDescription: string;
  facialFeatures: string;
}> {
  logger.info('photo_analysis_started');

  // Simulated analysis - in production would use vision API
  return {
    hasFace: true,
    faceCount: 1,
    gender: 'unknown',
    estimatedAge: 'adult',
    expression: 'neutral',
    hairDescription: 'short dark hair',
    facialFeatures: 'oval face, brown eyes',
  };
}

async function generateFromPhoto(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    style: z.infer<typeof AvatarStyleSchema>;
    expression?: string;
    accessories?: string[];
    backgroundColor?: string;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();
  const stylePrompt = getStylePrompt(params.style);

  let prompt = `${stylePrompt}, portrait avatar`;
  if (params.expression) prompt += `, ${params.expression} expression`;
  if (params.accessories?.length) prompt += `, wearing ${params.accessories.join(', ')}`;
  if (params.backgroundColor) prompt += `, ${params.backgroundColor} background`;

  logger.info('photo_to_avatar_started', {
    style: params.style,
  });

  // Use image-to-image with style prompt
  return replicate.createTrackedPrediction(
    'tencentarc/photomaker-style:latest',
    {
      input_image: params.imageUrl,
      style: params.style,
      prompt,
      negative_prompt: 'blurry, distorted, low quality, ugly',
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'photo_to_avatar', style: params.style }
  );
}

async function generateFromText(
  ctx: AgentContext,
  params: {
    description: string;
    style: z.infer<typeof AvatarStyleSchema>;
    gender?: string;
    age?: string;
    expression?: string;
    accessories?: string[];
    backgroundColor?: string;
    count: number;
  }
): Promise<{
  avatars: Array<{ url: string; revisedPrompt?: string }>;
  estimatedCost: number;
}> {
  const dalle = getDalleClient();
  const stylePrompt = getStylePrompt(params.style);

  let prompt = `${params.description}, ${stylePrompt}, avatar portrait`;
  if (params.gender) prompt += `, ${params.gender}`;
  if (params.age) prompt += `, ${params.age}`;
  if (params.expression) prompt += `, ${params.expression} expression`;
  if (params.accessories?.length) prompt += `, wearing ${params.accessories.join(', ')}`;
  if (params.backgroundColor) prompt += `, ${params.backgroundColor} background`;
  else prompt += ', simple clean background';

  logger.info('text_to_avatar_started', {
    style: params.style,
    count: params.count,
  });

  const results = await dalle.generate({
    prompt,
    model: 'dall-e-3',
    size: '1024x1024',
    quality: 'hd',
    n: params.count,
  });

  return {
    avatars: results.map(r => ({
      url: r.url!,
      revisedPrompt: r.revisedPrompt,
    })),
    estimatedCost: dalle.getEstimatedCost('dall-e-3', '1024x1024', 'hd', params.count),
  };
}

async function generateVariations(
  ctx: AgentContext,
  params: {
    baseAvatarUrl: string;
    variations: Array<{
      expression?: string;
      accessories?: string[];
      backgroundColor?: string;
    }>;
    style: z.infer<typeof AvatarStyleSchema>;
  }
): Promise<{
  avatars: Array<{ url: string; variation: number }>;
}> {
  const dalle = getDalleClient();
  const results: Array<{ url: string; variation: number }> = [];
  const stylePrompt = getStylePrompt(params.style);

  logger.info('variation_generation_started', {
    count: params.variations.length,
  });

  for (let i = 0; i < params.variations.length; i++) {
    const variation = params.variations[i];
    let prompt = `${stylePrompt}, avatar portrait`;
    if (variation.expression) prompt += `, ${variation.expression} expression`;
    if (variation.accessories?.length) prompt += `, wearing ${variation.accessories.join(', ')}`;
    if (variation.backgroundColor) prompt += `, ${variation.backgroundColor} background`;

    const generated = await dalle.generate({
      prompt,
      model: 'dall-e-3',
      size: '1024x1024',
      n: 1,
    });

    if (generated[0].url) {
      results.push({
        url: generated[0].url,
        variation: i,
      });
    }
  }

  return { avatars: results };
}

async function generateStylePack(
  ctx: AgentContext,
  params: {
    description: string;
    styles: z.infer<typeof AvatarStyleSchema>[];
    gender?: string;
    age?: string;
  }
): Promise<{
  avatars: Array<{
    url: string;
    style: string;
  }>;
}> {
  const dalle = getDalleClient();
  const results: Array<{ url: string; style: string }> = [];

  logger.info('style_pack_generation_started', {
    styleCount: params.styles.length,
  });

  for (const style of params.styles) {
    const stylePrompt = getStylePrompt(style);
    let prompt = `${params.description}, ${stylePrompt}, avatar portrait`;
    if (params.gender) prompt += `, ${params.gender}`;
    if (params.age) prompt += `, ${params.age}`;
    prompt += ', simple clean background';

    const generated = await dalle.generate({
      prompt,
      model: 'dall-e-3',
      size: '1024x1024',
      n: 1,
    });

    if (generated[0].url) {
      results.push({
        url: generated[0].url,
        style,
      });
    }
  }

  return { avatars: results };
}

async function waitForJob(
  ctx: AgentContext,
  params: { jobId: string }
): Promise<{
  status: string;
  output?: unknown;
  error?: string;
}> {
  const replicate = getReplicateExtendedClient();
  const prediction = await replicate.waitForTrackedPrediction(params.jobId);

  return {
    status: prediction.status,
    output: prediction.output,
    error: prediction.error,
  };
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const avatarGeneratorAgent = defineAgent({
  name: 'avatar-generator',
  description: 'AI-powered avatar generation from photos or text descriptions',
  version: '1.0.0',

  inputSchema: AvatarInputSchema,
  outputSchema: AvatarOutputSchema,

  tools: {
    analyze_photo: {
      description: 'Analyze a photo before avatar conversion',
      parameters: z.object({
        imageUrl: z.string(),
      }),
      returns: z.object({
        hasFace: z.boolean(),
        faceCount: z.number(),
        gender: z.string(),
        estimatedAge: z.string(),
        expression: z.string(),
        hairDescription: z.string(),
        facialFeatures: z.string(),
      }),
      execute: analyzePhoto,
      timeoutMs: 30000,
    },

    generate_from_photo: {
      description: 'Convert a photo to an avatar in specified style',
      parameters: z.object({
        imageUrl: z.string(),
        style: AvatarStyleSchema,
        expression: z.string().optional(),
        accessories: z.array(z.string()).optional(),
        backgroundColor: z.string().optional(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: generateFromPhoto,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    generate_from_text: {
      description: 'Generate avatar from text description',
      parameters: z.object({
        description: z.string(),
        style: AvatarStyleSchema,
        gender: z.string().optional(),
        age: z.string().optional(),
        expression: z.string().optional(),
        accessories: z.array(z.string()).optional(),
        backgroundColor: z.string().optional(),
        count: z.number(),
      }),
      returns: z.object({
        avatars: z.array(z.object({
          url: z.string(),
          revisedPrompt: z.string().optional(),
        })),
        estimatedCost: z.number(),
      }),
      execute: generateFromText,
      sideEffectful: true,
      timeoutMs: 180000,
    },

    generate_variations: {
      description: 'Generate variations of an avatar with different expressions/accessories',
      parameters: z.object({
        baseAvatarUrl: z.string(),
        variations: z.array(z.object({
          expression: z.string().optional(),
          accessories: z.array(z.string()).optional(),
          backgroundColor: z.string().optional(),
        })),
        style: AvatarStyleSchema,
      }),
      returns: z.object({
        avatars: z.array(z.object({
          url: z.string(),
          variation: z.number(),
        })),
      }),
      execute: generateVariations,
      sideEffectful: true,
      timeoutMs: 300000,
    },

    generate_style_pack: {
      description: 'Generate same avatar in multiple art styles',
      parameters: z.object({
        description: z.string(),
        styles: z.array(AvatarStyleSchema),
        gender: z.string().optional(),
        age: z.string().optional(),
      }),
      returns: z.object({
        avatars: z.array(z.object({
          url: z.string(),
          style: z.string(),
        })),
      }),
      execute: generateStylePack,
      sideEffectful: true,
      timeoutMs: 480000,
    },

    wait_for_job: {
      description: 'Wait for async job to complete',
      parameters: z.object({
        jobId: z.string(),
      }),
      returns: z.object({
        status: z.string(),
        output: z.unknown().optional(),
        error: z.string().optional(),
      }),
      execute: waitForJob,
      timeoutMs: 300000,
    },
  },

  systemPrompt: `You are an avatar generation specialist. Your role is to create unique, stylized avatars.

Available styles:
- realistic: Photorealistic portrait
- cartoon: Colorful Disney/Pixar style
- anime: Japanese animation style
- pixel_art: 8-bit retro gaming style
- 3d_render: 3D Pixar-like rendering
- sketch: Hand-drawn pencil style
- minimalist: Simple flat design
- chibi: Cute big-head small-body style
- comic: Superhero comic book style
- fantasy: Magical fantasy art
- cyberpunk: Futuristic neon style
- watercolor: Artistic painterly style

Workflow options:
1. From photo: Analyze photo, then convert to avatar style
2. From text: Generate avatar from description
3. Style pack: Same character in multiple styles
4. Variations: Same character with different expressions/accessories

Tips for best results:
- Use clear, well-lit photos for conversion
- Be specific about distinctive features
- Include accessories for personality
- Consider the use case (gaming, social, professional)

Common expressions:
- happy, sad, surprised, angry
- confident, shy, playful, serious
- smirking, winking, neutral

Common accessories:
- glasses, sunglasses, headphones
- hats, caps, crowns
- earrings, necklaces, piercings`,

  config: {
    maxTurns: 8,
    temperature: 0.5,
    maxTokens: 2048,
  },
});

export default avatarGeneratorAgent;
