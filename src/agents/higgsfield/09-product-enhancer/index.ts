/**
 * Product Enhancer Agent
 *
 * AI-powered product image enhancement for e-commerce.
 * Creates professional product photos from basic shots.
 *
 * Features:
 * - Background removal and replacement
 * - Lighting enhancement
 * - Shadow generation
 * - Multi-angle generation
 * - Lifestyle scene placement
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

const BackgroundTypeSchema = z.enum([
  'white',
  'gradient',
  'studio',
  'lifestyle',
  'outdoor',
  'custom',
]);

const ProductInputSchema = z.object({
  imageUrl: z.string().describe('URL of the product image'),
  productName: z.string().optional().describe('Product name for context'),
  productCategory: z.string().optional().describe('Product category'),
  backgroundType: BackgroundTypeSchema.default('white').describe('Type of background'),
  customBackground: z.string().optional().describe('Custom background prompt'),
  addShadow: z.boolean().default(true).describe('Add realistic shadow'),
  enhanceLighting: z.boolean().default(true).describe('Enhance product lighting'),
  generateAngles: z.boolean().default(false).describe('Generate multiple angles'),
  lifestyleScene: z.string().optional().describe('Lifestyle scene description'),
});

const ProductOutputSchema = z.object({
  success: z.boolean(),
  images: z.array(z.object({
    url: z.string(),
    type: z.enum(['main', 'angle', 'lifestyle', 'enhanced']),
    description: z.string().optional(),
  })),
  processingTime: z.number(),
  estimatedCost: z.number(),
  error: z.string().optional(),
});

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function removeBackground(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('background_removal_started');

  return replicate.removeBackground(params.imageUrl, {
    agentId: params.agentId,
    runId: params.runId,
  });
}

async function generateBackground(
  ctx: AgentContext,
  params: {
    productImageBase64: string;
    backgroundType: z.infer<typeof BackgroundTypeSchema>;
    customPrompt?: string;
    addShadow: boolean;
  }
): Promise<{
  imageBase64: string;
}> {
  const stability = getStabilityProvider();

  let backgroundPrompt: string;

  switch (params.backgroundType) {
    case 'white':
      backgroundPrompt = 'clean white studio background, product photography';
      break;
    case 'gradient':
      backgroundPrompt = 'smooth gradient background, professional product shot';
      break;
    case 'studio':
      backgroundPrompt = 'professional photography studio, softbox lighting, clean backdrop';
      break;
    case 'outdoor':
      backgroundPrompt = 'outdoor natural setting, blurred background, natural lighting';
      break;
    case 'lifestyle':
      backgroundPrompt = params.customPrompt || 'modern lifestyle setting, stylish interior';
      break;
    case 'custom':
      backgroundPrompt = params.customPrompt || 'professional product background';
      break;
    default:
      backgroundPrompt = 'clean white studio background';
  }

  if (params.addShadow) {
    backgroundPrompt += ', soft natural shadow, depth';
  }

  logger.info('background_generation_started', {
    type: params.backgroundType,
    addShadow: params.addShadow,
  });

  const results = await stability.inpaint({
    image: params.productImageBase64,
    mask: params.productImageBase64, // Mask for background areas
    prompt: backgroundPrompt,
    negativePrompt: 'distorted product, blurry, low quality',
    steps: 30,
  });

  return {
    imageBase64: results[0].base64,
  };
}

async function enhanceLighting(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('lighting_enhancement_started');

  return replicate.createTrackedPrediction(
    'lucataco/product-photography-enhancer:latest',
    {
      image: params.imageUrl,
      enhance_lighting: true,
      enhance_colors: true,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'lighting_enhancement' }
  );
}

async function generateLifestyleScene(
  ctx: AgentContext,
  params: {
    productImageUrl: string;
    sceneDescription: string;
    productName?: string;
  }
): Promise<{
  imageUrl: string;
  revisedPrompt?: string;
}> {
  const dalle = getDalleClient();

  const prompt = params.productName
    ? `${params.productName} product in ${params.sceneDescription}, professional product photography, realistic lighting`
    : `Product in ${params.sceneDescription}, professional product photography, realistic lighting`;

  logger.info('lifestyle_scene_started', {
    scene: params.sceneDescription,
  });

  const results = await dalle.generate({
    prompt,
    model: 'dall-e-3',
    size: '1024x1024',
    quality: 'hd',
    n: 1,
  });

  return {
    imageUrl: results[0].url!,
    revisedPrompt: results[0].revisedPrompt,
  };
}

async function generateAngles(
  ctx: AgentContext,
  params: {
    productImageUrl: string;
    productDescription: string;
    angles: string[];
  }
): Promise<{
  images: Array<{
    url: string;
    angle: string;
  }>;
}> {
  const dalle = getDalleClient();
  const results: Array<{ url: string; angle: string }> = [];

  logger.info('angle_generation_started', {
    angleCount: params.angles.length,
  });

  for (const angle of params.angles) {
    const prompt = `${params.productDescription}, ${angle} view, professional product photography, white background, clean studio lighting`;

    const generated = await dalle.generate({
      prompt,
      model: 'dall-e-3',
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    });

    if (generated[0].url) {
      results.push({
        url: generated[0].url,
        angle,
      });
    }
  }

  return { images: results };
}

async function addShadow(
  ctx: AgentContext,
  params: {
    imageBase64: string;
    shadowType: 'soft' | 'hard' | 'drop';
    direction: 'bottom' | 'bottom-right' | 'bottom-left';
  }
): Promise<{
  imageBase64: string;
}> {
  logger.info('shadow_addition_started', {
    type: params.shadowType,
    direction: params.direction,
  });

  // In production, this would use image processing
  // For now, return the original
  return {
    imageBase64: params.imageBase64,
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

export const productEnhancerAgent = defineAgent({
  name: 'product-enhancer',
  description: 'AI-powered product image enhancement for professional e-commerce photos',
  version: '1.0.0',

  inputSchema: ProductInputSchema,
  outputSchema: ProductOutputSchema,

  tools: {
    remove_background: {
      description: 'Remove background from product image',
      parameters: z.object({
        imageUrl: z.string(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: removeBackground,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    generate_background: {
      description: 'Generate professional background for product',
      parameters: z.object({
        productImageBase64: z.string(),
        backgroundType: BackgroundTypeSchema,
        customPrompt: z.string().optional(),
        addShadow: z.boolean(),
      }),
      returns: z.object({
        imageBase64: z.string(),
      }),
      execute: generateBackground,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    enhance_lighting: {
      description: 'Enhance product lighting and colors',
      parameters: z.object({
        imageUrl: z.string(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: enhanceLighting,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    generate_lifestyle: {
      description: 'Generate lifestyle scene with product',
      parameters: z.object({
        productImageUrl: z.string(),
        sceneDescription: z.string(),
        productName: z.string().optional(),
      }),
      returns: z.object({
        imageUrl: z.string(),
        revisedPrompt: z.string().optional(),
      }),
      execute: generateLifestyleScene,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    generate_angles: {
      description: 'Generate multiple angle views of product',
      parameters: z.object({
        productImageUrl: z.string(),
        productDescription: z.string(),
        angles: z.array(z.string()),
      }),
      returns: z.object({
        images: z.array(z.object({
          url: z.string(),
          angle: z.string(),
        })),
      }),
      execute: generateAngles,
      sideEffectful: true,
      timeoutMs: 300000,
    },

    add_shadow: {
      description: 'Add realistic shadow to product image',
      parameters: z.object({
        imageBase64: z.string(),
        shadowType: z.enum(['soft', 'hard', 'drop']),
        direction: z.enum(['bottom', 'bottom-right', 'bottom-left']),
      }),
      returns: z.object({
        imageBase64: z.string(),
      }),
      execute: addShadow,
      sideEffectful: true,
      timeoutMs: 30000,
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

  systemPrompt: `You are a product photography enhancement specialist. Your role is to transform basic product photos into professional e-commerce images.

Standard workflow:
1. Remove the background from the product image
2. Apply professional background (white, gradient, or custom)
3. Enhance lighting and colors
4. Add realistic shadows
5. Optionally generate lifestyle scenes or multiple angles

Background types:
- white: Clean white background (Amazon, e-commerce standard)
- gradient: Smooth gradient (premium look)
- studio: Professional studio setup
- lifestyle: Product in real-world setting
- outdoor: Natural outdoor environment

For best results:
- Start with well-lit, sharp product images
- Remove background first for clean isolation
- Use soft shadows for natural look
- Keep consistent style across product line

Lifestyle scenes tips:
- Match scene to product category
- Consider target audience
- Maintain product as focal point
- Use appropriate lighting context

Angle generation:
- Common angles: front, 45-degree, side, top-down
- Match product type (electronics need detail shots, fashion needs lifestyle)`,

  config: {
    maxTurns: 10,
    temperature: 0.3,
    maxTokens: 2048,
  },
});

export default productEnhancerAgent;
