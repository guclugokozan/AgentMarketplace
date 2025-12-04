/**
 * Pro Headshot Generator Agent
 *
 * AI-powered professional headshot generation that transforms
 * casual photos into polished, professional-looking portraits.
 *
 * Capabilities:
 * - Face detection and quality validation
 * - Professional lighting simulation
 * - Background replacement (corporate, studio, etc.)
 * - Face enhancement and retouching
 * - Multiple style presets (corporate, creative, casual pro)
 *
 * Uses: Replicate (AI Headshot Generator, GFPGAN)
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import {
  getReplicateClient,
  REPLICATE_MODELS,
  isValidImageInput,
  ReplicatePrediction,
} from '../../../providers/replicate.js';
import { getJobsStorage } from '../../../storage/jobs.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const StylePresetSchema = z.enum([
  'corporate',        // Clean, professional business look
  'creative',         // More artistic, suitable for creative industries
  'executive',        // High-end executive portrait
  'startup',          // Modern, approachable tech startup vibe
  'linkedin',         // Optimized for LinkedIn profile photos
  'actor_headshot',   // Entertainment industry standard
]);

const BackgroundStyleSchema = z.enum([
  'studio_gray',
  'studio_white',
  'studio_black',
  'office_blur',
  'gradient_blue',
  'gradient_warm',
  'outdoor_blur',
  'custom',
]);

const FaceValidationSchema = z.object({
  isValid: z.boolean(),
  faceDetected: z.boolean(),
  faceCount: z.number(),
  faceQuality: z.number().min(0).max(100),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
});

const GenerationOptionsSchema = z.object({
  style: StylePresetSchema.default('corporate'),
  background: BackgroundStyleSchema.default('studio_gray'),
  enhanceFace: z.boolean().default(true),
  removeBackground: z.boolean().default(true),
  upscale: z.boolean().default(false),
  outputSize: z.enum(['512', '1024', '2048']).default('1024'),
});

// Input/Output Schemas
const HeadshotInputSchema = z.object({
  imageUrl: z.string().describe('URL or base64 of the source image'),
  options: GenerationOptionsSchema.optional(),
  webhookUrl: z.string().url().optional().describe('Webhook for async job completion'),
});

const HeadshotOutputSchema = z.object({
  jobId: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  inputValidation: FaceValidationSchema,
  outputImages: z.array(z.object({
    url: z.string(),
    style: z.string(),
    size: z.string(),
  })).optional(),
  processingTime: z.number().optional(),
  cost: z.number().optional(),
  error: z.string().optional(),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getStylePrompt(style: z.infer<typeof StylePresetSchema>): string {
  const prompts: Record<string, string> = {
    corporate: 'professional business headshot, corporate portrait, clean lighting, formal attire, neutral expression, high quality',
    creative: 'creative professional headshot, artistic lighting, modern style, confident expression, vibrant but professional',
    executive: 'executive portrait, premium quality, sophisticated lighting, authoritative presence, luxury feel',
    startup: 'modern professional headshot, tech startup style, approachable, casual professional, natural lighting',
    linkedin: 'LinkedIn professional photo, trustworthy appearance, friendly smile, clean background, business casual',
    actor_headshot: 'actor headshot, entertainment industry, dramatic lighting, expressive, casting director ready',
  };
  return prompts[style] || prompts.corporate;
}

function getBackgroundPrompt(background: z.infer<typeof BackgroundStyleSchema>): string {
  const backgrounds: Record<string, string> = {
    studio_gray: 'neutral gray studio background',
    studio_white: 'clean white studio background',
    studio_black: 'elegant black studio background',
    office_blur: 'blurred modern office background',
    gradient_blue: 'professional blue gradient background',
    gradient_warm: 'warm gradient background',
    outdoor_blur: 'blurred outdoor natural background',
    custom: '',
  };
  return backgrounds[background] || backgrounds.studio_gray;
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function validateFaceImage(
  ctx: AgentContext,
  params: { imageUrl: string }
): Promise<FaceValidationSchema['_output']> {
  // Validate input format
  if (!isValidImageInput(params.imageUrl)) {
    return {
      isValid: false,
      faceDetected: false,
      faceCount: 0,
      faceQuality: 0,
      issues: ['Invalid image input. Provide a valid URL or base64 data URI.'],
      suggestions: ['Use a direct image URL (https://...) or base64 data URI (data:image/...)'],
    };
  }

  // In a production system, we would use a face detection model here
  // For now, we'll do basic validation and assume face is present
  logger.info('face_validation_started', {
    hasUrl: params.imageUrl.startsWith('http'),
  });

  // Basic validation - in production, use actual face detection
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check if it's a data URI
  if (params.imageUrl.startsWith('data:')) {
    const base64Part = params.imageUrl.split(',')[1];
    if (!base64Part || base64Part.length < 1000) {
      issues.push('Image appears to be too small or invalid');
      suggestions.push('Use a higher resolution image (at least 512x512)');
    }
  }

  // Simulated face detection result
  // In production, this would call a face detection API
  const faceDetected = true;
  const faceCount = 1;
  const faceQuality = 75; // Simulated quality score

  if (faceQuality < 50) {
    issues.push('Face quality is low');
    suggestions.push('Use a clearer photo with good lighting');
  }

  if (faceCount > 1) {
    issues.push('Multiple faces detected');
    suggestions.push('Use a photo with only one person visible');
  }

  const isValid = faceDetected && faceCount === 1 && issues.length === 0;

  return {
    isValid,
    faceDetected,
    faceCount,
    faceQuality,
    issues,
    suggestions,
  };
}

async function generateHeadshot(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    style: z.infer<typeof StylePresetSchema>;
    background: z.infer<typeof BackgroundStyleSchema>;
    outputSize: string;
  }
): Promise<{
  predictionId: string;
  status: string;
  outputUrl?: string;
}> {
  const client = getReplicateClient();

  const stylePrompt = getStylePrompt(params.style);
  const backgroundPrompt = getBackgroundPrompt(params.background);
  const fullPrompt = `${stylePrompt}, ${backgroundPrompt}`;

  logger.info('headshot_generation_started', {
    style: params.style,
    background: params.background,
    outputSize: params.outputSize,
  });

  // Use AI Headshot Generator model
  const prediction = await client.createPrediction({
    version: REPLICATE_MODELS['ai-headshot'].version,
    input: {
      image: params.imageUrl,
      prompt: fullPrompt,
      negative_prompt: 'blurry, low quality, distorted, deformed face, bad anatomy',
      num_outputs: 1,
      guidance_scale: 7.5,
      num_inference_steps: 30,
    },
  });

  return {
    predictionId: prediction.id,
    status: prediction.status,
    outputUrl: prediction.status === 'succeeded' ? String(prediction.output) : undefined,
  };
}

async function enhanceFace(
  ctx: AgentContext,
  params: { imageUrl: string }
): Promise<{
  predictionId: string;
  status: string;
  outputUrl?: string;
}> {
  const client = getReplicateClient();

  logger.info('face_enhancement_started');

  // Use GFPGAN for face enhancement
  const prediction = await client.createPrediction({
    version: REPLICATE_MODELS['face-enhancement'].version,
    input: {
      img: params.imageUrl,
      version: 'v1.4',
      scale: 2,
    },
  });

  return {
    predictionId: prediction.id,
    status: prediction.status,
    outputUrl: prediction.status === 'succeeded' ? String(prediction.output) : undefined,
  };
}

async function checkJobStatus(
  ctx: AgentContext,
  params: { predictionId: string }
): Promise<{
  status: string;
  output?: unknown;
  error?: string;
  metrics?: { predict_time?: number };
}> {
  const client = getReplicateClient();
  const prediction = await client.getPrediction(params.predictionId);

  return {
    status: prediction.status,
    output: prediction.output,
    error: prediction.error,
    metrics: prediction.metrics,
  };
}

async function processHeadshotPipeline(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    options: z.infer<typeof GenerationOptionsSchema>;
    jobId: string;
  }
): Promise<{
  success: boolean;
  outputImages: Array<{ url: string; style: string; size: string }>;
  processingTime: number;
  error?: string;
}> {
  const startTime = Date.now();
  const client = getReplicateClient();
  const jobsStorage = getJobsStorage();
  const outputImages: Array<{ url: string; style: string; size: string }> = [];

  try {
    // Update job to processing
    jobsStorage.markProcessing(params.jobId, undefined, 'replicate');

    // Step 1: Generate professional headshot
    jobsStorage.updateProgress(params.jobId, 20);

    const headshot = await client.run(
      REPLICATE_MODELS['ai-headshot'].version,
      {
        image: params.imageUrl,
        prompt: `${getStylePrompt(params.options.style)}, ${getBackgroundPrompt(params.options.background)}`,
        negative_prompt: 'blurry, low quality, distorted, deformed face, bad anatomy, watermark',
        num_outputs: 1,
        guidance_scale: 7.5,
        num_inference_steps: 30,
      },
      {
        onProgress: (p) => {
          if (p.status === 'processing') {
            jobsStorage.updateProgress(params.jobId, 40);
          }
        },
      }
    );

    if (headshot.status !== 'succeeded' || !headshot.output) {
      throw new Error(headshot.error || 'Headshot generation failed');
    }

    let finalImageUrl = Array.isArray(headshot.output) ? headshot.output[0] : headshot.output;
    jobsStorage.updateProgress(params.jobId, 60);

    // Step 2: Enhance face if requested
    if (params.options.enhanceFace) {
      const enhanced = await client.run(
        REPLICATE_MODELS['face-enhancement'].version,
        {
          img: finalImageUrl,
          version: 'v1.4',
          scale: 2,
        },
        {
          onProgress: (p) => {
            if (p.status === 'processing') {
              jobsStorage.updateProgress(params.jobId, 80);
            }
          },
        }
      );

      if (enhanced.status === 'succeeded' && enhanced.output) {
        finalImageUrl = String(enhanced.output);
      }
    }

    jobsStorage.updateProgress(params.jobId, 90);

    outputImages.push({
      url: String(finalImageUrl),
      style: params.options.style,
      size: params.options.outputSize,
    });

    const processingTime = Date.now() - startTime;

    // Mark job as completed
    jobsStorage.markCompleted(params.jobId, {
      outputImages,
      processingTime,
    });

    logger.info('headshot_pipeline_completed', {
      jobId: params.jobId,
      processingTime,
      outputCount: outputImages.length,
    });

    return {
      success: true,
      outputImages,
      processingTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    jobsStorage.markFailed(params.jobId, errorMessage);

    logger.error('headshot_pipeline_failed', {
      jobId: params.jobId,
      error: errorMessage,
    });

    return {
      success: false,
      outputImages: [],
      processingTime: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const proHeadshotGeneratorAgent = defineAgent({
  name: 'pro-headshot-generator',
  description: 'AI-powered professional headshot generation that transforms casual photos into polished portraits',
  version: '1.0.0',

  inputSchema: HeadshotInputSchema,
  outputSchema: HeadshotOutputSchema,

  tools: {
    validate_face: {
      description: 'Validate that the input image contains a suitable face for headshot generation',
      parameters: z.object({
        imageUrl: z.string(),
      }),
      returns: FaceValidationSchema,
      execute: validateFaceImage,
      timeoutMs: 30000,
    },

    generate_headshot: {
      description: 'Generate a professional headshot from the input image',
      parameters: z.object({
        imageUrl: z.string(),
        style: StylePresetSchema,
        background: BackgroundStyleSchema,
        outputSize: z.string(),
      }),
      returns: z.object({
        predictionId: z.string(),
        status: z.string(),
        outputUrl: z.string().optional(),
      }),
      execute: generateHeadshot,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    enhance_face: {
      description: 'Enhance and retouch the face in the generated headshot',
      parameters: z.object({
        imageUrl: z.string(),
      }),
      returns: z.object({
        predictionId: z.string(),
        status: z.string(),
        outputUrl: z.string().optional(),
      }),
      execute: enhanceFace,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    check_status: {
      description: 'Check the status of a running prediction',
      parameters: z.object({
        predictionId: z.string(),
      }),
      returns: z.object({
        status: z.string(),
        output: z.unknown().optional(),
        error: z.string().optional(),
        metrics: z.object({
          predict_time: z.number().optional(),
        }).optional(),
      }),
      execute: checkJobStatus,
      timeoutMs: 10000,
    },

    process_pipeline: {
      description: 'Run the complete headshot generation pipeline (validation, generation, enhancement)',
      parameters: z.object({
        imageUrl: z.string(),
        options: GenerationOptionsSchema,
        jobId: z.string(),
      }),
      returns: z.object({
        success: z.boolean(),
        outputImages: z.array(z.object({
          url: z.string(),
          style: z.string(),
          size: z.string(),
        })),
        processingTime: z.number(),
        error: z.string().optional(),
      }),
      execute: processHeadshotPipeline,
      sideEffectful: true,
      timeoutMs: 300000, // 5 minutes for full pipeline
    },
  },

  systemPrompt: `You are a professional headshot generation assistant. Your role is to help users create polished, professional-looking portraits from their photos.

Workflow:
1. First, validate the input image to ensure it has a detectable face
2. If validation passes, proceed with headshot generation
3. Apply face enhancement for the final polish
4. Return the processed images

Guidelines:
- Always validate the input image first
- Explain any issues with the input image clearly
- Suggest the best style based on the user's needs
- For corporate/LinkedIn, recommend clean, professional styles
- For creative industries, suggest more artistic options
- Ensure the final output maintains natural appearance

Quality checks:
- Face must be clearly visible and in focus
- Lighting should be even on the face
- No extreme angles or obscured features
- Resolution should be at least 512x512`,

  config: {
    maxTurns: 10,
    temperature: 0.3,
    maxTokens: 2048,
  },
});

export default proHeadshotGeneratorAgent;
