/**
 * Image Generator Agent
 *
 * AI-powered image generation using DALL-E 3, Stable Diffusion, and FLUX.
 * Supports multiple styles, aspect ratios, and quality settings.
 *
 * Features:
 * - Text-to-image generation
 * - Multiple AI models (DALL-E 3, SDXL, FLUX)
 * - Style presets and customization
 * - Batch generation
 * - Image variations
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import { getDalleClient } from '../../../providers/openai.js';
import { getStabilityProvider } from '../../../providers/stability.js';
import { getReplicateExtendedClient, REPLICATE_MODELS } from '../../../providers/replicate.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const ModelSchema = z.enum(['dall-e-3', 'dall-e-2', 'sdxl', 'sd3', 'flux-schnell']);

const StylePresetSchema = z.enum([
  'photorealistic',
  'digital-art',
  'anime',
  'oil-painting',
  'watercolor',
  'sketch',
  '3d-render',
  'cinematic',
  'minimalist',
  'abstract',
  'fantasy',
  'sci-fi',
]);

const AspectRatioSchema = z.enum([
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '21:9',
  '3:2',
  '2:3',
]);

const ImageInputSchema = z.object({
  prompt: z.string().min(1).max(4000).describe('Description of the image to generate'),
  negativePrompt: z.string().optional().describe('What to avoid in the image'),
  model: ModelSchema.default('dall-e-3').describe('AI model to use'),
  style: StylePresetSchema.optional().describe('Visual style preset'),
  aspectRatio: AspectRatioSchema.default('1:1').describe('Image aspect ratio'),
  quality: z.enum(['standard', 'hd']).default('standard').describe('Output quality'),
  count: z.number().min(1).max(4).default(1).describe('Number of images to generate'),
  seed: z.number().optional().describe('Random seed for reproducibility'),
});

const ImageOutputSchema = z.object({
  success: z.boolean(),
  images: z.array(z.object({
    url: z.string(),
    model: z.string(),
    revisedPrompt: z.string().optional(),
    seed: z.number().optional(),
  })),
  model: z.string(),
  processingTime: z.number(),
  estimatedCost: z.number(),
  error: z.string().optional(),
});

// =============================================================================
// HELPERS
// =============================================================================

function getStyleModifier(style?: z.infer<typeof StylePresetSchema>): string {
  const modifiers: Record<string, string> = {
    photorealistic: 'photorealistic, ultra detailed, professional photography, 8k resolution',
    'digital-art': 'digital art, vibrant colors, detailed illustration',
    anime: 'anime style, japanese animation, cel shaded, vibrant',
    'oil-painting': 'oil painting style, classical, textured brushstrokes, fine art',
    watercolor: 'watercolor painting, soft colors, artistic, flowing',
    sketch: 'pencil sketch, detailed linework, black and white, artistic',
    '3d-render': '3D render, octane render, unreal engine, photorealistic 3D',
    cinematic: 'cinematic, movie still, dramatic lighting, film grain',
    minimalist: 'minimalist, clean, simple, modern design',
    abstract: 'abstract art, geometric shapes, modern art, creative',
    fantasy: 'fantasy art, magical, ethereal, detailed fantasy illustration',
    'sci-fi': 'science fiction, futuristic, cyberpunk, technological',
  };
  return style ? modifiers[style] || '' : '';
}

function aspectRatioToSize(ratio: string, model: string): { width: number; height: number } {
  const sizes: Record<string, Record<string, { width: number; height: number }>> = {
    'dall-e-3': {
      '1:1': { width: 1024, height: 1024 },
      '16:9': { width: 1792, height: 1024 },
      '9:16': { width: 1024, height: 1792 },
      default: { width: 1024, height: 1024 },
    },
    sdxl: {
      '1:1': { width: 1024, height: 1024 },
      '16:9': { width: 1344, height: 768 },
      '9:16': { width: 768, height: 1344 },
      '4:3': { width: 1152, height: 896 },
      '3:4': { width: 896, height: 1152 },
      default: { width: 1024, height: 1024 },
    },
    flux: {
      '1:1': { width: 1024, height: 1024 },
      '16:9': { width: 1024, height: 576 },
      '9:16': { width: 576, height: 1024 },
      default: { width: 1024, height: 1024 },
    },
  };

  const modelSizes = sizes[model] || sizes.sdxl;
  return modelSizes[ratio] || modelSizes.default;
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function generateWithDalle(
  ctx: AgentContext,
  params: {
    prompt: string;
    negativePrompt?: string;
    style?: string;
    aspectRatio: string;
    quality: 'standard' | 'hd';
    count: number;
    model: 'dall-e-3' | 'dall-e-2';
  }
): Promise<{
  images: Array<{ url: string; revisedPrompt?: string }>;
  estimatedCost: number;
}> {
  const dalle = getDalleClient();
  const styleModifier = params.style ? getStyleModifier(params.style as any) : '';
  const fullPrompt = styleModifier ? `${params.prompt}, ${styleModifier}` : params.prompt;

  // Map aspect ratio to DALL-E size
  let size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024';
  if (params.aspectRatio === '16:9') size = '1792x1024';
  else if (params.aspectRatio === '9:16') size = '1024x1792';

  logger.info('dalle_generation_started', {
    model: params.model,
    size,
    quality: params.quality,
    count: params.count,
  });

  const results = await dalle.generate({
    prompt: fullPrompt,
    model: params.model,
    size,
    quality: params.quality,
    style: 'vivid',
    n: params.count,
  });

  const estimatedCost = dalle.getEstimatedCost(params.model, size, params.quality, params.count);

  return {
    images: results.map(img => ({
      url: img.url!,
      revisedPrompt: img.revisedPrompt,
    })),
    estimatedCost,
  };
}

async function generateWithStability(
  ctx: AgentContext,
  params: {
    prompt: string;
    negativePrompt?: string;
    style?: string;
    aspectRatio: string;
    count: number;
    model: 'sdxl' | 'sd3';
    seed?: number;
  }
): Promise<{
  images: Array<{ url: string; seed: number }>;
  estimatedCost: number;
}> {
  const stability = getStabilityProvider();
  const styleModifier = params.style ? getStyleModifier(params.style as any) : '';
  const fullPrompt = styleModifier ? `${params.prompt}, ${styleModifier}` : params.prompt;
  const size = aspectRatioToSize(params.aspectRatio, 'sdxl');

  logger.info('stability_generation_started', {
    model: params.model,
    size,
    count: params.count,
  });

  if (params.model === 'sd3') {
    const result = await stability.generateSD3({
      prompt: fullPrompt,
      negativePrompt: params.negativePrompt,
      model: 'sd3',
      aspectRatio: params.aspectRatio as any,
      seed: params.seed,
    });

    return {
      images: [{ url: `data:image/png;base64,${result.image}`, seed: result.seed }],
      estimatedCost: 0.065, // SD3 pricing
    };
  }

  const results = await stability.generate({
    prompt: fullPrompt,
    negativePrompt: params.negativePrompt,
    width: size.width,
    height: size.height,
    samples: params.count,
    seed: params.seed,
    stylePreset: params.style,
  });

  return {
    images: results.map(img => ({
      url: `data:image/png;base64,${img.base64}`,
      seed: img.seed,
    })),
    estimatedCost: stability.getEstimatedCost('generate', 30) * params.count,
  };
}

async function generateWithFlux(
  ctx: AgentContext,
  params: {
    prompt: string;
    style?: string;
    aspectRatio: string;
    count: number;
    runId: string;
    agentId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();
  const styleModifier = params.style ? getStyleModifier(params.style as any) : '';
  const fullPrompt = styleModifier ? `${params.prompt}, ${styleModifier}` : params.prompt;

  logger.info('flux_generation_started', {
    aspectRatio: params.aspectRatio,
    count: params.count,
  });

  return replicate.generateFluxImage(
    fullPrompt,
    {
      aspectRatio: params.aspectRatio as any,
      numOutputs: params.count,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    }
  );
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

export const imageGeneratorAgent = defineAgent({
  name: 'image-generator',
  description: 'AI-powered image generation using multiple models (DALL-E 3, Stable Diffusion, FLUX)',
  version: '1.0.0',

  inputSchema: ImageInputSchema,
  outputSchema: ImageOutputSchema,

  tools: {
    generate_dalle: {
      description: 'Generate images using DALL-E 3 or DALL-E 2',
      parameters: z.object({
        prompt: z.string(),
        negativePrompt: z.string().optional(),
        style: z.string().optional(),
        aspectRatio: z.string(),
        quality: z.enum(['standard', 'hd']),
        count: z.number(),
        model: z.enum(['dall-e-3', 'dall-e-2']),
      }),
      returns: z.object({
        images: z.array(z.object({
          url: z.string(),
          revisedPrompt: z.string().optional(),
        })),
        estimatedCost: z.number(),
      }),
      execute: generateWithDalle,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    generate_stability: {
      description: 'Generate images using Stable Diffusion (SDXL or SD3)',
      parameters: z.object({
        prompt: z.string(),
        negativePrompt: z.string().optional(),
        style: z.string().optional(),
        aspectRatio: z.string(),
        count: z.number(),
        model: z.enum(['sdxl', 'sd3']),
        seed: z.number().optional(),
      }),
      returns: z.object({
        images: z.array(z.object({
          url: z.string(),
          seed: z.number(),
        })),
        estimatedCost: z.number(),
      }),
      execute: generateWithStability,
      sideEffectful: true,
      timeoutMs: 180000,
    },

    generate_flux: {
      description: 'Generate images using FLUX (async, requires polling)',
      parameters: z.object({
        prompt: z.string(),
        style: z.string().optional(),
        aspectRatio: z.string(),
        count: z.number(),
        runId: z.string(),
        agentId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: generateWithFlux,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    wait_for_job: {
      description: 'Wait for an async generation job to complete',
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

  systemPrompt: `You are an AI image generation expert. Your role is to help users create stunning images using various AI models.

Available models and their strengths:
- DALL-E 3: Best for photorealistic images, following complex prompts, and text rendering
- DALL-E 2: Good for quick generations, variations, and edits
- SDXL: Excellent for artistic styles, fine control, and customization
- SD3: Latest Stable Diffusion with improved quality and prompt adherence
- FLUX: Fast generation, good for iterative exploration

Workflow:
1. Analyze the user's request and determine the best model
2. Enhance the prompt with style modifiers if appropriate
3. Generate the image(s)
4. Return results with metadata

Best practices:
- For photorealistic: Use DALL-E 3 with 'hd' quality
- For artistic styles: Use SDXL or SD3 with appropriate style presets
- For fast iteration: Use FLUX
- For portrait orientation: Use 9:16 aspect ratio
- For landscape: Use 16:9 aspect ratio

Prompt enhancement tips:
- Add lighting details: "soft natural lighting", "dramatic shadows"
- Add composition: "rule of thirds", "centered composition"
- Add quality modifiers: "high resolution", "detailed", "professional"`,

  config: {
    maxTurns: 5,
    temperature: 0.5,
    maxTokens: 2048,
  },
});

export default imageGeneratorAgent;
