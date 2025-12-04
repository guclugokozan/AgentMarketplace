/**
 * Video Generator Agent
 *
 * AI-powered video generation using Runway Gen-3 and other models.
 * Creates videos from text prompts or images.
 *
 * Features:
 * - Text-to-video generation
 * - Image-to-video animation
 * - Multiple duration options
 * - Async job handling
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import { getRunwayProvider } from '../../../providers/runway.js';
import { getJobManager } from '../../../providers/job-manager.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const VideoInputSchema = z.object({
  prompt: z.string().min(1).max(2000).describe('Description of the video to generate'),
  imageUrl: z.string().optional().describe('Source image for image-to-video'),
  model: z.enum(['gen2', 'gen3']).default('gen3').describe('Runway model to use'),
  duration: z.enum(['4', '8', '16']).default('4').describe('Video duration in seconds'),
  aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('16:9').describe('Video aspect ratio'),
  motionAmount: z.number().min(1).max(10).default(5).describe('Amount of motion (1-10)'),
  seed: z.number().optional().describe('Random seed for reproducibility'),
  upscale: z.boolean().default(false).describe('Upscale output to higher resolution'),
});

const VideoOutputSchema = z.object({
  success: z.boolean(),
  jobId: z.string(),
  externalId: z.string(),
  status: z.enum(['pending', 'processing', 'complete', 'failed']),
  videoUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  duration: z.number().optional(),
  estimatedCost: z.number(),
  error: z.string().optional(),
});

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function generateTextToVideo(
  ctx: AgentContext,
  params: {
    prompt: string;
    model: 'gen2' | 'gen3';
    duration: number;
    aspectRatio: '16:9' | '9:16' | '1:1';
    seed?: number;
    upscale?: boolean;
    interpolate?: boolean;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  externalId: string;
  estimatedCost: number;
}> {
  const runway = getRunwayProvider();

  logger.info('text_to_video_started', {
    model: params.model,
    duration: params.duration,
    aspectRatio: params.aspectRatio,
  });

  const result = await runway.generateVideo(
    {
      prompt: params.prompt,
      model: params.model,
      duration: params.duration as 4 | 8 | 16,
      aspectRatio: params.aspectRatio,
      seed: params.seed,
      upscale: params.upscale,
      interpolate: params.interpolate,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    }
  );

  return {
    jobId: result.jobId,
    externalId: result.externalId,
    estimatedCost: runway.getEstimatedCost(params.model, params.duration),
  };
}

async function generateImageToVideo(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    prompt?: string;
    model: 'gen2' | 'gen3';
    duration: number;
    motionAmount?: number;
    seed?: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  externalId: string;
  estimatedCost: number;
}> {
  const runway = getRunwayProvider();

  logger.info('image_to_video_started', {
    model: params.model,
    duration: params.duration,
    hasPrompt: !!params.prompt,
  });

  const result = await runway.imageToVideo(
    {
      imageUrl: params.imageUrl,
      prompt: params.prompt,
      model: params.model,
      duration: params.duration as 4 | 8,
      motionAmount: params.motionAmount,
      seed: params.seed,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    }
  );

  return {
    jobId: result.jobId,
    externalId: result.externalId,
    estimatedCost: runway.getEstimatedCost(params.model, params.duration),
  };
}

async function checkJobStatus(
  ctx: AgentContext,
  params: { jobId: string }
): Promise<{
  status: string;
  progress: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}> {
  const jobManager = getJobManager();
  const job = jobManager.getStatus(params.jobId);

  if (!job) {
    throw new Error(`Job ${params.jobId} not found`);
  }

  return {
    status: job.status,
    progress: job.progress,
    videoUrl: job.resultUrl,
    thumbnailUrl: job.thumbnailUrl,
    error: job.errorMessage,
  };
}

async function pollUntilComplete(
  ctx: AgentContext,
  params: {
    jobId: string;
    maxWaitMs?: number;
    pollIntervalMs?: number;
  }
): Promise<{
  status: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}> {
  const runway = getRunwayProvider();
  const maxWait = params.maxWaitMs || 600000; // 10 minutes default
  const pollInterval = params.pollIntervalMs || 10000; // 10 seconds

  logger.info('polling_video_job', {
    jobId: params.jobId,
    maxWaitMs: maxWait,
  });

  try {
    const status = await runway.waitForCompletion(params.jobId, {
      timeout: maxWait,
      pollInterval,
    });

    return {
      status: status.status,
      videoUrl: status.outputUrl,
      thumbnailUrl: status.thumbnailUrl,
      error: status.error,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('video_job_failed', { jobId: params.jobId, error: errorMessage });

    return {
      status: 'failed',
      error: errorMessage,
    };
  }
}

async function cancelJob(
  ctx: AgentContext,
  params: { jobId: string }
): Promise<{ cancelled: boolean }> {
  const jobManager = getJobManager();
  const job = jobManager.getStatus(params.jobId);

  if (!job) {
    throw new Error(`Job ${params.jobId} not found`);
  }

  if (job.status !== 'pending' && job.status !== 'processing') {
    return { cancelled: false };
  }

  try {
    const runway = getRunwayProvider();
    await runway.cancelJob(job.externalJobId);
    return { cancelled: true };
  } catch (error) {
    logger.warn('job_cancel_failed', { jobId: params.jobId, error });
    return { cancelled: false };
  }
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const videoGeneratorAgent = defineAgent({
  name: 'video-generator',
  description: 'AI-powered video generation using Runway Gen-3. Creates videos from text or images.',
  version: '1.0.0',

  inputSchema: VideoInputSchema,
  outputSchema: VideoOutputSchema,

  tools: {
    text_to_video: {
      description: 'Generate a video from a text prompt',
      parameters: z.object({
        prompt: z.string(),
        model: z.enum(['gen2', 'gen3']),
        duration: z.number(),
        aspectRatio: z.enum(['16:9', '9:16', '1:1']),
        seed: z.number().optional(),
        upscale: z.boolean().optional(),
        interpolate: z.boolean().optional(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        externalId: z.string(),
        estimatedCost: z.number(),
      }),
      execute: generateTextToVideo,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    image_to_video: {
      description: 'Animate an image into a video',
      parameters: z.object({
        imageUrl: z.string(),
        prompt: z.string().optional(),
        model: z.enum(['gen2', 'gen3']),
        duration: z.number(),
        motionAmount: z.number().optional(),
        seed: z.number().optional(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        externalId: z.string(),
        estimatedCost: z.number(),
      }),
      execute: generateImageToVideo,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    check_status: {
      description: 'Check the status of a video generation job',
      parameters: z.object({
        jobId: z.string(),
      }),
      returns: z.object({
        status: z.string(),
        progress: z.number(),
        videoUrl: z.string().optional(),
        thumbnailUrl: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: checkJobStatus,
      timeoutMs: 10000,
    },

    poll_until_complete: {
      description: 'Poll until video generation is complete',
      parameters: z.object({
        jobId: z.string(),
        maxWaitMs: z.number().optional(),
        pollIntervalMs: z.number().optional(),
      }),
      returns: z.object({
        status: z.string(),
        videoUrl: z.string().optional(),
        thumbnailUrl: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: pollUntilComplete,
      timeoutMs: 660000, // 11 minutes
    },

    cancel_job: {
      description: 'Cancel a pending or processing job',
      parameters: z.object({
        jobId: z.string(),
      }),
      returns: z.object({
        cancelled: z.boolean(),
      }),
      execute: cancelJob,
      sideEffectful: true,
      timeoutMs: 30000,
    },
  },

  systemPrompt: `You are an AI video generation expert using Runway Gen-3. Your role is to help users create stunning AI-generated videos.

Key capabilities:
- Text-to-video: Generate videos from text descriptions
- Image-to-video: Animate still images with motion

Model selection:
- Gen-3: Latest model, best quality, recommended for most use cases
- Gen-2: Older model, faster but lower quality

Duration options:
- 4 seconds: Quick clips, best for testing ideas
- 8 seconds: Standard length for most content
- 16 seconds: Extended clips (Gen-3 only)

Best practices for prompts:
1. Describe the scene clearly and specifically
2. Include camera movement: "tracking shot", "zoom in", "pan left"
3. Describe the motion: "walking slowly", "waves crashing", "leaves falling"
4. Add atmosphere: "golden hour lighting", "foggy morning", "neon lights"
5. Keep prompts concise but descriptive

For image-to-video:
1. Use high-quality source images
2. Describe the desired motion in the prompt
3. Adjust motion amount based on scene (lower for subtle, higher for dynamic)

Workflow:
1. Start the generation job
2. Return the jobId to the user immediately
3. Optionally poll for completion if user wants to wait
4. Provide the video URL when complete`,

  config: {
    maxTurns: 8,
    temperature: 0.4,
    maxTokens: 2048,
  },
});

export default videoGeneratorAgent;
