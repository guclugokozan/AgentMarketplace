/**
 * Photo Editor Agent
 *
 * AI-powered photo editing and enhancement.
 * Professional-grade adjustments and retouching.
 *
 * Features:
 * - Color correction and grading
 * - Exposure and contrast adjustment
 * - Skin retouching
 * - Object removal
 * - Background blur
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import { getReplicateExtendedClient, REPLICATE_MODELS } from '../../../providers/replicate.js';
import { getStabilityProvider } from '../../../providers/stability.js';
import { getDalleClient } from '../../../providers/openai.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const EditTypeSchema = z.enum([
  'enhance',
  'retouch',
  'color_correct',
  'blur_background',
  'remove_object',
  'adjust_lighting',
  'upscale',
  'denoise',
  'sharpen',
  'crop_smart',
]);

const PhotoEditInputSchema = z.object({
  imageUrl: z.string().describe('URL of the photo to edit'),
  edits: z.array(z.object({
    type: EditTypeSchema,
    params: z.record(z.unknown()).optional(),
  })).describe('List of edits to apply'),
  preserveOriginal: z.boolean().default(true),
  outputFormat: z.enum(['png', 'jpg', 'webp']).default('jpg'),
  outputQuality: z.number().min(1).max(100).default(90),
});

const PhotoEditOutputSchema = z.object({
  success: z.boolean(),
  originalUrl: z.string().optional(),
  editedUrl: z.string().optional(),
  editedBase64: z.string().optional(),
  appliedEdits: z.array(z.string()),
  processingTime: z.number(),
  error: z.string().optional(),
});

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function enhancePhoto(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    autoEnhance: boolean;
    enhanceFaces: boolean;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('photo_enhancement_started', {
    autoEnhance: params.autoEnhance,
    enhanceFaces: params.enhanceFaces,
  });

  if (params.enhanceFaces) {
    return replicate.enhanceFace(params.imageUrl, {
      agentId: params.agentId,
      runId: params.runId,
    });
  }

  return replicate.createTrackedPrediction(
    'tencentarc/gfpgan:latest',
    {
      img: params.imageUrl,
      version: 'v1.4',
      scale: 2,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'photo_enhance' }
  );
}

async function retouchSkin(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    intensity: number;
    preserveTexture: boolean;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('skin_retouch_started', {
    intensity: params.intensity,
    preserveTexture: params.preserveTexture,
  });

  return replicate.createTrackedPrediction(
    'lucataco/skin-retouching:latest',
    {
      image: params.imageUrl,
      intensity: params.intensity,
      preserve_texture: params.preserveTexture,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'skin_retouch' }
  );
}

async function adjustColors(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    brightness: number;
    contrast: number;
    saturation: number;
    warmth: number;
    vibrance: number;
  }
): Promise<{
  imageBase64: string;
  adjustmentsApplied: Record<string, number>;
}> {
  const stability = getStabilityProvider();

  logger.info('color_adjustment_started', {
    brightness: params.brightness,
    contrast: params.contrast,
  });

  // Build adjustment prompt
  let prompt = 'photo with adjusted colors';
  if (params.brightness > 0) prompt += ', brighter';
  else if (params.brightness < 0) prompt += ', darker';
  if (params.contrast > 0) prompt += ', high contrast';
  else if (params.contrast < 0) prompt += ', low contrast';
  if (params.warmth > 0) prompt += ', warmer tones';
  else if (params.warmth < 0) prompt += ', cooler tones';
  if (params.saturation > 0) prompt += ', vivid colors';
  else if (params.saturation < 0) prompt += ', desaturated';

  const response = await fetch(params.imageUrl);
  const buffer = await response.arrayBuffer();
  const imageBase64 = Buffer.from(buffer).toString('base64');

  const results = await stability.imageToImage({
    image: imageBase64,
    prompt,
    strength: 0.3,
    steps: 20,
  });

  return {
    imageBase64: results[0].base64,
    adjustmentsApplied: {
      brightness: params.brightness,
      contrast: params.contrast,
      saturation: params.saturation,
      warmth: params.warmth,
      vibrance: params.vibrance,
    },
  };
}

async function blurBackground(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    blurAmount: number;
    preserveSubject: boolean;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('background_blur_started', {
    blurAmount: params.blurAmount,
  });

  return replicate.createTrackedPrediction(
    'lucataco/bokeh-background:latest',
    {
      image: params.imageUrl,
      blur_amount: params.blurAmount,
      preserve_subject: params.preserveSubject,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'background_blur' }
  );
}

async function removeObject(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    objectDescription: string;
    maskUrl?: string;
  }
): Promise<{
  imageUrl: string;
}> {
  const dalle = getDalleClient();

  logger.info('object_removal_started', {
    objectDescription: params.objectDescription,
    hasMask: !!params.maskUrl,
  });

  // Use DALL-E inpainting for object removal
  const response = await fetch(params.imageUrl);
  const buffer = await response.arrayBuffer();
  const imageBase64 = Buffer.from(buffer).toString('base64');

  const results = await dalle.edit({
    image: imageBase64,
    mask: params.maskUrl,
    prompt: `photo without ${params.objectDescription}, seamless background`,
    size: '1024x1024',
  });

  return {
    imageUrl: results[0].url!,
  };
}

async function upscalePhoto(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    scale: 2 | 4;
    enhanceFaces: boolean;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('photo_upscale_started', {
    scale: params.scale,
    enhanceFaces: params.enhanceFaces,
  });

  return replicate.upscaleImage(params.imageUrl, params.scale, {
    agentId: params.agentId,
    runId: params.runId,
  });
}

async function denoisePhoto(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    strength: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('denoise_started', { strength: params.strength });

  return replicate.createTrackedPrediction(
    'cjwbw/real-esrgan:latest',
    {
      image: params.imageUrl,
      scale: 2,
      face_enhance: false,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'denoise' }
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

export const photoEditorAgent = defineAgent({
  name: 'photo-editor',
  description: 'AI-powered professional photo editing and enhancement',
  version: '1.0.0',

  inputSchema: PhotoEditInputSchema,
  outputSchema: PhotoEditOutputSchema,

  tools: {
    enhance_photo: {
      description: 'Automatically enhance photo quality',
      parameters: z.object({
        imageUrl: z.string(),
        autoEnhance: z.boolean().default(true),
        enhanceFaces: z.boolean().default(true),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: enhancePhoto,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    retouch_skin: {
      description: 'Retouch and smooth skin in portraits',
      parameters: z.object({
        imageUrl: z.string(),
        intensity: z.number().min(0).max(1).default(0.5),
        preserveTexture: z.boolean().default(true),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: retouchSkin,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    adjust_colors: {
      description: 'Adjust color properties of the photo',
      parameters: z.object({
        imageUrl: z.string(),
        brightness: z.number().min(-1).max(1).default(0),
        contrast: z.number().min(-1).max(1).default(0),
        saturation: z.number().min(-1).max(1).default(0),
        warmth: z.number().min(-1).max(1).default(0),
        vibrance: z.number().min(-1).max(1).default(0),
      }),
      returns: z.object({
        imageBase64: z.string(),
        adjustmentsApplied: z.record(z.number()),
      }),
      execute: adjustColors,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    blur_background: {
      description: 'Apply bokeh/blur effect to background',
      parameters: z.object({
        imageUrl: z.string(),
        blurAmount: z.number().min(1).max(20).default(10),
        preserveSubject: z.boolean().default(true),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: blurBackground,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    remove_object: {
      description: 'Remove unwanted objects from photo',
      parameters: z.object({
        imageUrl: z.string(),
        objectDescription: z.string(),
        maskUrl: z.string().optional(),
      }),
      returns: z.object({
        imageUrl: z.string(),
      }),
      execute: removeObject,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    upscale_photo: {
      description: 'Upscale photo resolution',
      parameters: z.object({
        imageUrl: z.string(),
        scale: z.enum(['2', '4']).transform(v => parseInt(v) as 2 | 4),
        enhanceFaces: z.boolean().default(true),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: upscalePhoto,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    denoise_photo: {
      description: 'Remove noise from photo',
      parameters: z.object({
        imageUrl: z.string(),
        strength: z.number().min(0).max(1).default(0.5),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: denoisePhoto,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    wait_for_job: {
      description: 'Wait for editing job to complete',
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

  systemPrompt: `You are a professional photo editor assistant. Your role is to help users enhance and edit their photos.

Available edits:
- Enhance: Auto-improve overall quality
- Retouch: Smooth skin while preserving texture
- Color correct: Adjust brightness, contrast, saturation, warmth
- Blur background: Create bokeh/depth effect
- Remove object: Erase unwanted elements
- Upscale: Increase resolution (2x or 4x)
- Denoise: Remove noise/grain

Workflow:
1. Analyze the photo to determine needed edits
2. Apply edits in optimal order:
   a. Denoise first (if needed)
   b. Color corrections
   c. Retouching
   d. Background blur
   e. Object removal
   f. Upscale last

Tips:
- For portraits: Enhance faces + retouch + blur background
- For landscapes: Color correct + denoise + upscale
- For old photos: Denoise + enhance + upscale
- Keep retouch subtle for natural look
- Preserve skin texture unless requested otherwise`,

  config: {
    maxTurns: 10,
    temperature: 0.3,
    maxTokens: 2048,
  },
});

export default photoEditorAgent;
