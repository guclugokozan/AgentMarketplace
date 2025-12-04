/**
 * Sketch to Image Agent
 *
 * AI-powered sketch/doodle to realistic image conversion.
 * Transforms rough drawings into polished artwork.
 *
 * Features:
 * - Sketch to realistic image
 * - Doodle to illustration
 * - Line art coloring
 * - Style-guided generation
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import { getStabilityProvider } from '../../../providers/stability.js';
import { getReplicateExtendedClient } from '../../../providers/replicate.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const OutputStyleSchema = z.enum([
  'realistic',
  'illustration',
  'anime',
  'oil_painting',
  'watercolor',
  'digital_art',
  '3d_render',
  'concept_art',
]);

const SketchInputSchema = z.object({
  sketchUrl: z.string().describe('URL of the sketch/drawing'),
  prompt: z.string().describe('Description of the desired output'),
  negativePrompt: z.string().optional().describe('What to avoid'),
  style: OutputStyleSchema.default('realistic'),
  fidelity: z.number().min(0).max(1).default(0.5).describe('How closely to follow the sketch'),
  colorScheme: z.string().optional().describe('Desired color palette'),
  detailLevel: z.enum(['low', 'medium', 'high']).default('medium'),
});

const SketchOutputSchema = z.object({
  success: z.boolean(),
  imageUrl: z.string().optional(),
  imageBase64: z.string().optional(),
  style: z.string(),
  processingTime: z.number(),
  error: z.string().optional(),
});

// =============================================================================
// HELPERS
// =============================================================================

function getStylePrompt(style: z.infer<typeof OutputStyleSchema>): string {
  const prompts: Record<string, string> = {
    realistic: 'photorealistic, highly detailed, professional photography',
    illustration: 'digital illustration, vibrant colors, clean lines',
    anime: 'anime style, Japanese animation, cel shaded',
    oil_painting: 'oil painting style, classical art, rich textures',
    watercolor: 'watercolor painting, soft colors, artistic',
    digital_art: 'digital art, modern style, polished',
    '3d_render': '3D render, octane render, realistic materials',
    concept_art: 'concept art, professional, detailed environment',
  };
  return prompts[style] || prompts.digital_art;
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function analyzeSketch(
  ctx: AgentContext,
  params: { sketchUrl: string }
): Promise<{
  hasLines: boolean;
  complexity: 'simple' | 'moderate' | 'complex';
  suggestedStyles: string[];
  detectedSubject: string;
}> {
  logger.info('sketch_analysis_started');

  // In production, would use vision API to analyze
  return {
    hasLines: true,
    complexity: 'moderate',
    suggestedStyles: ['illustration', 'anime', 'digital_art'],
    detectedSubject: 'General sketch',
  };
}

async function convertSketchToImage(
  ctx: AgentContext,
  params: {
    sketchUrl: string;
    prompt: string;
    negativePrompt?: string;
    style: z.infer<typeof OutputStyleSchema>;
    fidelity: number;
    colorScheme?: string;
  }
): Promise<{
  imageBase64: string;
  seed: number;
}> {
  const stability = getStabilityProvider();
  const stylePrompt = getStylePrompt(params.style);

  let fullPrompt = `${params.prompt}, ${stylePrompt}`;
  if (params.colorScheme) {
    fullPrompt += `, ${params.colorScheme} color palette`;
  }

  logger.info('sketch_conversion_started', {
    style: params.style,
    fidelity: params.fidelity,
  });

  const response = await fetch(params.sketchUrl);
  const buffer = await response.arrayBuffer();
  const imageBase64 = Buffer.from(buffer).toString('base64');

  const results = await stability.imageToImage({
    image: imageBase64,
    prompt: fullPrompt,
    negativePrompt: params.negativePrompt || 'blurry, low quality, distorted',
    strength: 1 - params.fidelity, // Higher fidelity = lower strength
    steps: 40,
    cfgScale: 7,
  });

  return {
    imageBase64: results[0].base64,
    seed: results[0].seed,
  };
}

async function convertWithControlNet(
  ctx: AgentContext,
  params: {
    sketchUrl: string;
    prompt: string;
    negativePrompt?: string;
    controlType: 'canny' | 'scribble' | 'lineart' | 'depth';
    controlStrength: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('controlnet_conversion_started', {
    controlType: params.controlType,
    controlStrength: params.controlStrength,
  });

  return replicate.createTrackedPrediction(
    'jagilley/controlnet-scribble:latest',
    {
      image: params.sketchUrl,
      prompt: params.prompt,
      negative_prompt: params.negativePrompt,
      control_strength: params.controlStrength,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'sketch_to_image', controlType: params.controlType }
  );
}

async function colorLineArt(
  ctx: AgentContext,
  params: {
    lineArtUrl: string;
    colorHints?: string;
    style: 'anime' | 'realistic' | 'illustration';
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  const stylePrompt = params.style === 'anime'
    ? 'anime coloring, cel shaded, vibrant'
    : params.style === 'realistic'
    ? 'realistic coloring, natural lighting'
    : 'illustration coloring, digital art';

  logger.info('lineart_coloring_started', {
    style: params.style,
    hasColorHints: !!params.colorHints,
  });

  return replicate.createTrackedPrediction(
    'jagilley/controlnet-lineart:latest',
    {
      image: params.lineArtUrl,
      prompt: `${params.colorHints || 'colorful'}, ${stylePrompt}, detailed coloring`,
      control_strength: 0.7,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'lineart_coloring', style: params.style }
  );
}

async function generateVariations(
  ctx: AgentContext,
  params: {
    sketchUrl: string;
    prompt: string;
    styles: z.infer<typeof OutputStyleSchema>[];
    fidelity: number;
  }
): Promise<{
  variations: Array<{
    style: string;
    imageBase64: string;
  }>;
}> {
  const variations: Array<{ style: string; imageBase64: string }> = [];

  logger.info('variation_generation_started', {
    styleCount: params.styles.length,
  });

  for (const style of params.styles) {
    const result = await convertSketchToImage({} as any, {
      sketchUrl: params.sketchUrl,
      prompt: params.prompt,
      style,
      fidelity: params.fidelity,
    });

    variations.push({
      style,
      imageBase64: result.imageBase64,
    });
  }

  return { variations };
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

export const sketchToImageAgent = defineAgent({
  name: 'sketch-to-image',
  description: 'AI-powered sketch and doodle to realistic image conversion',
  version: '1.0.0',

  inputSchema: SketchInputSchema,
  outputSchema: SketchOutputSchema,

  tools: {
    analyze_sketch: {
      description: 'Analyze a sketch to suggest conversion options',
      parameters: z.object({
        sketchUrl: z.string(),
      }),
      returns: z.object({
        hasLines: z.boolean(),
        complexity: z.enum(['simple', 'moderate', 'complex']),
        suggestedStyles: z.array(z.string()),
        detectedSubject: z.string(),
      }),
      execute: analyzeSketch,
      timeoutMs: 30000,
    },

    convert_sketch: {
      description: 'Convert a sketch to a finished image',
      parameters: z.object({
        sketchUrl: z.string(),
        prompt: z.string(),
        negativePrompt: z.string().optional(),
        style: OutputStyleSchema,
        fidelity: z.number(),
        colorScheme: z.string().optional(),
      }),
      returns: z.object({
        imageBase64: z.string(),
        seed: z.number(),
      }),
      execute: convertSketchToImage,
      sideEffectful: true,
      timeoutMs: 180000,
    },

    convert_controlnet: {
      description: 'Convert sketch using ControlNet for precise control',
      parameters: z.object({
        sketchUrl: z.string(),
        prompt: z.string(),
        negativePrompt: z.string().optional(),
        controlType: z.enum(['canny', 'scribble', 'lineart', 'depth']),
        controlStrength: z.number().min(0).max(1),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: convertWithControlNet,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    color_lineart: {
      description: 'Add colors to line art',
      parameters: z.object({
        lineArtUrl: z.string(),
        colorHints: z.string().optional(),
        style: z.enum(['anime', 'realistic', 'illustration']),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: colorLineArt,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    generate_variations: {
      description: 'Generate the same sketch in multiple styles',
      parameters: z.object({
        sketchUrl: z.string(),
        prompt: z.string(),
        styles: z.array(OutputStyleSchema),
        fidelity: z.number(),
      }),
      returns: z.object({
        variations: z.array(z.object({
          style: z.string(),
          imageBase64: z.string(),
        })),
      }),
      execute: generateVariations,
      sideEffectful: true,
      timeoutMs: 600000,
    },

    wait_for_job: {
      description: 'Wait for async conversion job',
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

  systemPrompt: `You are a sketch-to-image conversion specialist. Transform rough drawings into polished artwork.

Available styles:
- realistic: Photorealistic output
- illustration: Digital illustration style
- anime: Japanese animation style
- oil_painting: Classical art style
- watercolor: Soft watercolor effect
- digital_art: Modern digital art
- 3d_render: 3D rendered output
- concept_art: Professional concept art

Fidelity settings:
- High (0.7-1.0): Closely follows sketch structure
- Medium (0.4-0.6): Balanced between sketch and AI interpretation
- Low (0.1-0.3): AI has more creative freedom

ControlNet types:
- canny: For edge detection (clean sketches)
- scribble: For rough doodles
- lineart: For clean line drawings
- depth: For 3D structure hints

Tips:
- Use high fidelity for detailed sketches
- Use low fidelity for rough concepts
- ControlNet scribble works best for quick doodles
- ControlNet lineart for polished line drawings
- Add color hints for better coloring results`,

  config: {
    maxTurns: 8,
    temperature: 0.4,
    maxTokens: 2048,
  },
});

export default sketchToImageAgent;
