/**
 * Virtual Try-On Agent
 *
 * AI-powered virtual clothing try-on that allows users to see
 * how garments look on them without physically trying them on.
 *
 * Capabilities:
 * - Person pose detection and validation
 * - Garment category classification
 * - Virtual garment fitting using IDM-VTON
 * - Multiple garment support (upper body, lower body, full body)
 * - Quality validation and enhancement
 *
 * Uses: Replicate (IDM-VTON, Background Removal)
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import {
  getReplicateClient,
  REPLICATE_MODELS,
  isValidImageInput,
} from '../../../providers/replicate.js';
import { getJobsStorage } from '../../../storage/jobs.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const GarmentCategorySchema = z.enum([
  'upper_body',    // Shirts, blouses, jackets, etc.
  'lower_body',    // Pants, skirts, shorts
  'full_body',     // Dresses, jumpsuits, onesies
  'outerwear',     // Coats, blazers
]);

const PersonValidationSchema = z.object({
  isValid: z.boolean(),
  personDetected: z.boolean(),
  poseQuality: z.number().min(0).max(100),
  bodyVisible: z.object({
    upperBody: z.boolean(),
    lowerBody: z.boolean(),
    fullBody: z.boolean(),
  }),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
});

const GarmentValidationSchema = z.object({
  isValid: z.boolean(),
  garmentDetected: z.boolean(),
  category: GarmentCategorySchema.optional(),
  quality: z.number().min(0).max(100),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
});

const TryOnOptionsSchema = z.object({
  category: GarmentCategorySchema,
  preserveBackground: z.boolean().default(true),
  enhanceResult: z.boolean().default(true),
  outputSize: z.enum(['512', '768', '1024']).default('768'),
});

// Input/Output Schemas
const TryOnInputSchema = z.object({
  personImageUrl: z.string().describe('URL or base64 of the person image'),
  garmentImageUrl: z.string().describe('URL or base64 of the garment image'),
  options: TryOnOptionsSchema.optional(),
  webhookUrl: z.string().url().optional(),
});

const TryOnOutputSchema = z.object({
  jobId: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  personValidation: PersonValidationSchema,
  garmentValidation: GarmentValidationSchema,
  outputImage: z.object({
    url: z.string(),
    category: z.string(),
  }).optional(),
  processingTime: z.number().optional(),
  cost: z.number().optional(),
  error: z.string().optional(),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function inferGarmentCategory(description: string): z.infer<typeof GarmentCategorySchema> {
  const lower = description.toLowerCase();

  if (lower.includes('dress') || lower.includes('jumpsuit') || lower.includes('romper')) {
    return 'full_body';
  }
  if (lower.includes('pant') || lower.includes('skirt') || lower.includes('short') || lower.includes('jean')) {
    return 'lower_body';
  }
  if (lower.includes('coat') || lower.includes('jacket') || lower.includes('blazer')) {
    return 'outerwear';
  }
  return 'upper_body'; // Default to upper body
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function validatePersonImage(
  ctx: AgentContext,
  params: { imageUrl: string; category: z.infer<typeof GarmentCategorySchema> }
): Promise<PersonValidationSchema['_output']> {
  if (!isValidImageInput(params.imageUrl)) {
    return {
      isValid: false,
      personDetected: false,
      poseQuality: 0,
      bodyVisible: { upperBody: false, lowerBody: false, fullBody: false },
      issues: ['Invalid image input'],
      suggestions: ['Provide a valid URL or base64 image'],
    };
  }

  logger.info('person_validation_started', { category: params.category });

  // In production, this would use pose detection model
  // For now, simulate validation
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Basic checks based on category
  const bodyVisible = {
    upperBody: true, // Simulated
    lowerBody: params.category !== 'upper_body' && params.category !== 'outerwear',
    fullBody: params.category === 'full_body',
  };

  if (params.category === 'full_body' && !bodyVisible.fullBody) {
    issues.push('Full body not visible for full-body garment');
    suggestions.push('Use a photo showing your full body from head to feet');
  }

  if (params.category === 'lower_body' && !bodyVisible.lowerBody) {
    issues.push('Lower body not visible');
    suggestions.push('Ensure your legs are visible in the photo');
  }

  // Simulated quality score
  const poseQuality = 80;

  return {
    isValid: issues.length === 0,
    personDetected: true,
    poseQuality,
    bodyVisible,
    issues,
    suggestions,
  };
}

async function validateGarmentImage(
  ctx: AgentContext,
  params: { imageUrl: string; expectedCategory?: z.infer<typeof GarmentCategorySchema> }
): Promise<GarmentValidationSchema['_output']> {
  if (!isValidImageInput(params.imageUrl)) {
    return {
      isValid: false,
      garmentDetected: false,
      quality: 0,
      issues: ['Invalid image input'],
      suggestions: ['Provide a valid URL or base64 image'],
    };
  }

  logger.info('garment_validation_started');

  // In production, this would use garment classification model
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Simulate garment detection
  const garmentDetected = true;
  const category = params.expectedCategory || 'upper_body';
  const quality = 85;

  // Suggestions for better results
  if (quality < 70) {
    issues.push('Garment image quality is low');
    suggestions.push('Use a higher resolution image of the garment');
  }

  suggestions.push('For best results, use a garment image with a plain background');
  suggestions.push('Ensure the entire garment is visible in the frame');

  return {
    isValid: garmentDetected && issues.length === 0,
    garmentDetected,
    category,
    quality,
    issues,
    suggestions,
  };
}

async function removeGarmentBackground(
  ctx: AgentContext,
  params: { imageUrl: string }
): Promise<{
  success: boolean;
  outputUrl?: string;
  error?: string;
}> {
  const client = getReplicateClient();

  logger.info('garment_background_removal_started');

  try {
    const prediction = await client.run(
      REPLICATE_MODELS['background-removal'].version,
      {
        image: params.imageUrl,
      }
    );

    if (prediction.status === 'succeeded' && prediction.output) {
      return {
        success: true,
        outputUrl: String(prediction.output),
      };
    }

    return {
      success: false,
      error: prediction.error || 'Background removal failed',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function performTryOn(
  ctx: AgentContext,
  params: {
    personImageUrl: string;
    garmentImageUrl: string;
    category: z.infer<typeof GarmentCategorySchema>;
  }
): Promise<{
  predictionId: string;
  status: string;
  outputUrl?: string;
  error?: string;
}> {
  const client = getReplicateClient();

  logger.info('virtual_tryon_started', { category: params.category });

  try {
    // IDM-VTON expects specific inputs
    const prediction = await client.createPrediction({
      version: REPLICATE_MODELS['virtual-tryon'].version,
      input: {
        human_img: params.personImageUrl,
        garm_img: params.garmentImageUrl,
        garment_des: `${params.category.replace('_', ' ')} garment`,
        is_checked: true,
        is_checked_crop: false,
        denoise_steps: 30,
        seed: -1,
      },
    });

    return {
      predictionId: prediction.id,
      status: prediction.status,
    };
  } catch (error) {
    return {
      predictionId: '',
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function processTryOnPipeline(
  ctx: AgentContext,
  params: {
    personImageUrl: string;
    garmentImageUrl: string;
    options: z.infer<typeof TryOnOptionsSchema>;
    jobId: string;
  }
): Promise<{
  success: boolean;
  outputImage?: { url: string; category: string };
  processingTime: number;
  error?: string;
}> {
  const startTime = Date.now();
  const client = getReplicateClient();
  const jobsStorage = getJobsStorage();

  try {
    jobsStorage.markProcessing(params.jobId, undefined, 'replicate');
    jobsStorage.updateProgress(params.jobId, 10);

    // Step 1: Remove background from garment (optional but recommended)
    let processedGarmentUrl = params.garmentImageUrl;

    const bgRemoval = await client.run(
      REPLICATE_MODELS['background-removal'].version,
      { image: params.garmentImageUrl }
    );

    if (bgRemoval.status === 'succeeded' && bgRemoval.output) {
      processedGarmentUrl = String(bgRemoval.output);
      logger.info('garment_background_removed');
    }

    jobsStorage.updateProgress(params.jobId, 30);

    // Step 2: Perform virtual try-on
    const tryOnResult = await client.run(
      REPLICATE_MODELS['virtual-tryon'].version,
      {
        human_img: params.personImageUrl,
        garm_img: processedGarmentUrl,
        garment_des: `${params.options.category.replace('_', ' ')} garment`,
        is_checked: true,
        is_checked_crop: false,
        denoise_steps: 30,
        seed: -1,
      },
      {
        onProgress: (p) => {
          if (p.status === 'processing') {
            jobsStorage.updateProgress(params.jobId, 60);
          }
        },
      }
    );

    if (tryOnResult.status !== 'succeeded' || !tryOnResult.output) {
      throw new Error(tryOnResult.error || 'Virtual try-on failed');
    }

    jobsStorage.updateProgress(params.jobId, 90);

    const outputUrl = String(tryOnResult.output);
    const processingTime = Date.now() - startTime;

    // Calculate estimated cost (based on Replicate pricing)
    const estimatedCost = 0.10; // Approximate cost for IDM-VTON

    jobsStorage.markCompleted(
      params.jobId,
      {
        outputImage: {
          url: outputUrl,
          category: params.options.category,
        },
        processingTime,
      },
      estimatedCost
    );

    logger.info('tryon_pipeline_completed', {
      jobId: params.jobId,
      processingTime,
    });

    return {
      success: true,
      outputImage: {
        url: outputUrl,
        category: params.options.category,
      },
      processingTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    jobsStorage.markFailed(params.jobId, errorMessage);

    logger.error('tryon_pipeline_failed', {
      jobId: params.jobId,
      error: errorMessage,
    });

    return {
      success: false,
      processingTime: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

async function checkPredictionStatus(
  ctx: AgentContext,
  params: { predictionId: string }
): Promise<{
  status: string;
  output?: unknown;
  error?: string;
  progress?: number;
}> {
  const client = getReplicateClient();
  const prediction = await client.getPrediction(params.predictionId);

  let progress = 0;
  switch (prediction.status) {
    case 'starting':
      progress = 10;
      break;
    case 'processing':
      progress = 50;
      break;
    case 'succeeded':
      progress = 100;
      break;
    case 'failed':
    case 'canceled':
      progress = 100;
      break;
  }

  return {
    status: prediction.status,
    output: prediction.output,
    error: prediction.error,
    progress,
  };
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const virtualTryOnAgent = defineAgent({
  name: 'virtual-try-on',
  description: 'AI-powered virtual clothing try-on that shows how garments look on you without trying them on',
  version: '1.0.0',

  inputSchema: TryOnInputSchema,
  outputSchema: TryOnOutputSchema,

  tools: {
    validate_person: {
      description: 'Validate the person image for virtual try-on suitability',
      parameters: z.object({
        imageUrl: z.string(),
        category: GarmentCategorySchema,
      }),
      returns: PersonValidationSchema,
      execute: validatePersonImage,
      timeoutMs: 30000,
    },

    validate_garment: {
      description: 'Validate and classify the garment image',
      parameters: z.object({
        imageUrl: z.string(),
        expectedCategory: GarmentCategorySchema.optional(),
      }),
      returns: GarmentValidationSchema,
      execute: validateGarmentImage,
      timeoutMs: 30000,
    },

    remove_background: {
      description: 'Remove background from garment image for better results',
      parameters: z.object({
        imageUrl: z.string(),
      }),
      returns: z.object({
        success: z.boolean(),
        outputUrl: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: removeGarmentBackground,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    perform_tryon: {
      description: 'Perform the virtual try-on operation',
      parameters: z.object({
        personImageUrl: z.string(),
        garmentImageUrl: z.string(),
        category: GarmentCategorySchema,
      }),
      returns: z.object({
        predictionId: z.string(),
        status: z.string(),
        outputUrl: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: performTryOn,
      sideEffectful: true,
      timeoutMs: 180000,
    },

    process_pipeline: {
      description: 'Run the complete virtual try-on pipeline',
      parameters: z.object({
        personImageUrl: z.string(),
        garmentImageUrl: z.string(),
        options: TryOnOptionsSchema,
        jobId: z.string(),
      }),
      returns: z.object({
        success: z.boolean(),
        outputImage: z.object({
          url: z.string(),
          category: z.string(),
        }).optional(),
        processingTime: z.number(),
        error: z.string().optional(),
      }),
      execute: processTryOnPipeline,
      sideEffectful: true,
      timeoutMs: 300000,
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
        progress: z.number().optional(),
      }),
      execute: checkPredictionStatus,
      timeoutMs: 10000,
    },
  },

  systemPrompt: `You are a virtual try-on assistant helping users visualize how clothing items will look on them.

Workflow:
1. Validate the person image (pose, visibility of body parts)
2. Validate the garment image (quality, category)
3. Remove background from garment for better results
4. Perform virtual try-on using AI
5. Return the composite result

Guidelines:
- Always validate both images before processing
- Explain any issues clearly and provide actionable suggestions
- Match garment category to body visibility (e.g., full-body garments need full-body photos)
- Recommend optimal photo angles for best results

Photo tips for users:
- Stand straight facing the camera
- Wear fitted clothing (not baggy)
- Good, even lighting
- Plain background preferred
- Ensure the relevant body parts are fully visible

For garments:
- Flat lay or on mannequin works best
- Clear, high-resolution image
- Plain background (will be removed anyway)
- Full garment visible in frame`,

  config: {
    maxTurns: 10,
    temperature: 0.3,
    maxTokens: 2048,
  },
});

export default virtualTryOnAgent;
