/**
 * Style Transfer Agent
 *
 * AI-powered artistic style transfer between images.
 * Applies the style of one image to another.
 *
 * Features:
 * - Image-to-image style transfer
 * - Preset artistic styles
 * - Adjustable style strength
 * - Color preservation options
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import { getStabilityProvider } from '../../../providers/stability.js';
import { getReplicateExtendedClient, REPLICATE_MODELS } from '../../../providers/replicate.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const PresetStyleSchema = z.enum([
  'van_gogh',
  'monet',
  'picasso',
  'kandinsky',
  'hokusai',
  'pop_art',
  'watercolor',
  'oil_painting',
  'pencil_sketch',
  'comic_book',
  'anime',
  'pixel_art',
  'neon',
  'vintage',
  'noir',
]);

const StyleTransferInputSchema = z.object({
  contentImageUrl: z.string().describe('URL of the content image'),
  styleImageUrl: z.string().optional().describe('URL of the style reference image'),
  presetStyle: PresetStyleSchema.optional().describe('Preset artistic style'),
  styleStrength: z.number().min(0).max(1).default(0.7).describe('How strongly to apply the style'),
  preserveColors: z.boolean().default(false).describe('Keep original image colors'),
  outputSize: z.enum(['512', '768', '1024']).default('768').describe('Output image size'),
});

const StyleTransferOutputSchema = z.object({
  success: z.boolean(),
  imageUrl: z.string().optional(),
  imageBase64: z.string().optional(),
  styleApplied: z.string(),
  processingTime: z.number(),
  estimatedCost: z.number(),
  error: z.string().optional(),
});

// =============================================================================
// HELPERS
// =============================================================================

function getPresetStylePrompt(style: z.infer<typeof PresetStyleSchema>): string {
  const prompts: Record<string, string> = {
    van_gogh: 'in the style of Vincent van Gogh, swirling brushstrokes, vibrant colors, post-impressionist',
    monet: 'in the style of Claude Monet, impressionist, soft brushstrokes, light and atmosphere',
    picasso: 'in the style of Pablo Picasso, cubist, geometric shapes, abstract',
    kandinsky: 'in the style of Wassily Kandinsky, abstract, geometric, colorful',
    hokusai: 'in the style of Katsushika Hokusai, ukiyo-e, Japanese woodblock print',
    pop_art: 'pop art style, bold colors, Ben-Day dots, Andy Warhol inspired',
    watercolor: 'watercolor painting, soft edges, flowing colors, artistic',
    oil_painting: 'oil painting, rich textures, classical art style',
    pencil_sketch: 'pencil sketch, detailed linework, graphite drawing',
    comic_book: 'comic book style, bold outlines, halftone dots, dynamic',
    anime: 'anime style, cel shaded, Japanese animation',
    pixel_art: 'pixel art, 8-bit style, retro gaming aesthetic',
    neon: 'neon art style, glowing colors, dark background, cyberpunk',
    vintage: 'vintage photograph style, sepia tones, aged texture',
    noir: 'film noir style, high contrast black and white, dramatic lighting',
  };
  return prompts[style] || '';
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function analyzeImage(
  ctx: AgentContext,
  params: { imageUrl: string }
): Promise<{
  width: number;
  height: number;
  dominantColors: string[];
  hasfaces: boolean;
  contentDescription: string;
}> {
  logger.info('image_analysis_started');

  // Simulated analysis - in production would use vision API
  return {
    width: 1024,
    height: 768,
    dominantColors: ['#3B5998', '#8B4513', '#228B22'],
    hasfaces: false,
    contentDescription: 'Landscape scene with natural elements',
  };
}

async function transferWithPreset(
  ctx: AgentContext,
  params: {
    contentImageUrl: string;
    style: z.infer<typeof PresetStyleSchema>;
    strength: number;
    preserveColors: boolean;
    outputSize: number;
  }
): Promise<{
  imageBase64: string;
  seed: number;
  estimatedCost: number;
}> {
  const stability = getStabilityProvider();
  const stylePrompt = getPresetStylePrompt(params.style);

  logger.info('preset_style_transfer_started', {
    style: params.style,
    strength: params.strength,
    preserveColors: params.preserveColors,
  });

  // Fetch the content image as base64
  const response = await fetch(params.contentImageUrl);
  const buffer = await response.arrayBuffer();
  const imageBase64 = Buffer.from(buffer).toString('base64');

  const results = await stability.imageToImage({
    image: imageBase64,
    prompt: stylePrompt,
    strength: params.strength,
    steps: 40,
    cfgScale: 8,
    stylePreset: params.style === 'anime' ? 'anime' : undefined,
  });

  return {
    imageBase64: results[0].base64,
    seed: results[0].seed,
    estimatedCost: stability.getEstimatedCost('img2img', 40),
  };
}

async function transferWithReference(
  ctx: AgentContext,
  params: {
    contentImageUrl: string;
    styleImageUrl: string;
    strength: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('reference_style_transfer_started', {
    strength: params.strength,
  });

  // Use neural style transfer model on Replicate
  return replicate.createTrackedPrediction(
    'tensorflow/arbitrary-image-stylization-v1-256:latest',
    {
      content_image: params.contentImageUrl,
      style_image: params.styleImageUrl,
      style_weight: params.strength,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'style_transfer' }
  );
}

async function blendStyles(
  ctx: AgentContext,
  params: {
    contentImageUrl: string;
    styleImages: string[];
    weights: number[];
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('style_blending_started', {
    styleCount: params.styleImages.length,
  });

  // Use a model that supports multiple style references
  return replicate.createTrackedPrediction(
    'style-blend-model:latest', // Hypothetical model
    {
      content_image: params.contentImageUrl,
      style_images: params.styleImages,
      style_weights: params.weights,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'style_blend' }
  );
}

async function preserveColorsTransfer(
  ctx: AgentContext,
  params: {
    styledImageBase64: string;
    originalImageUrl: string;
    colorStrength: number;
  }
): Promise<{
  imageBase64: string;
}> {
  logger.info('color_preservation_started', {
    colorStrength: params.colorStrength,
  });

  // In production, this would extract colors from original and apply to styled
  // For now, return the styled image
  return {
    imageBase64: params.styledImageBase64,
  };
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

export const styleTransferAgent = defineAgent({
  name: 'style-transfer',
  description: 'AI-powered artistic style transfer between images',
  version: '1.0.0',

  inputSchema: StyleTransferInputSchema,
  outputSchema: StyleTransferOutputSchema,

  tools: {
    analyze_image: {
      description: 'Analyze the content image before style transfer',
      parameters: z.object({
        imageUrl: z.string(),
      }),
      returns: z.object({
        width: z.number(),
        height: z.number(),
        dominantColors: z.array(z.string()),
        hasfaces: z.boolean(),
        contentDescription: z.string(),
      }),
      execute: analyzeImage,
      timeoutMs: 30000,
    },

    transfer_preset: {
      description: 'Apply a preset artistic style to an image',
      parameters: z.object({
        contentImageUrl: z.string(),
        style: PresetStyleSchema,
        strength: z.number(),
        preserveColors: z.boolean(),
        outputSize: z.number(),
      }),
      returns: z.object({
        imageBase64: z.string(),
        seed: z.number(),
        estimatedCost: z.number(),
      }),
      execute: transferWithPreset,
      sideEffectful: true,
      timeoutMs: 180000,
    },

    transfer_reference: {
      description: 'Apply style from a reference image',
      parameters: z.object({
        contentImageUrl: z.string(),
        styleImageUrl: z.string(),
        strength: z.number(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: transferWithReference,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    blend_styles: {
      description: 'Blend multiple styles together',
      parameters: z.object({
        contentImageUrl: z.string(),
        styleImages: z.array(z.string()),
        weights: z.array(z.number()),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: blendStyles,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    preserve_colors: {
      description: 'Apply color preservation to styled image',
      parameters: z.object({
        styledImageBase64: z.string(),
        originalImageUrl: z.string(),
        colorStrength: z.number(),
      }),
      returns: z.object({
        imageBase64: z.string(),
      }),
      execute: preserveColorsTransfer,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    wait_for_job: {
      description: 'Wait for async style transfer job',
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

  systemPrompt: `You are an artistic style transfer specialist. Your role is to transform images with artistic styles.

Available preset styles:
- van_gogh: Post-impressionist swirling brushstrokes
- monet: Soft impressionist light and atmosphere
- picasso: Cubist geometric abstraction
- kandinsky: Abstract geometric colors
- hokusai: Japanese ukiyo-e woodblock prints
- pop_art: Bold colors, Andy Warhol style
- watercolor: Soft flowing watercolor effect
- oil_painting: Rich textured classical style
- pencil_sketch: Detailed graphite drawing
- comic_book: Bold outlines, halftone dots
- anime: Japanese animation cel shading
- pixel_art: 8-bit retro gaming aesthetic
- neon: Glowing cyberpunk aesthetic
- vintage: Aged sepia photograph
- noir: High contrast black and white

Style strength guidelines:
- 0.3-0.5: Subtle style hint, content dominant
- 0.5-0.7: Balanced blend of style and content
- 0.7-0.9: Strong style, content still recognizable
- 0.9-1.0: Very stylized, may lose content details

Best practices:
- For portraits: Use lower strength (0.4-0.6) to preserve faces
- For landscapes: Higher strength works well (0.7-0.9)
- Preserve colors when content colors are important
- Use reference images for unique styles not in presets`,

  config: {
    maxTurns: 6,
    temperature: 0.4,
    maxTokens: 2048,
  },
});

export default styleTransferAgent;
