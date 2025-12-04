/**
 * Video Effects Agent
 *
 * AI-powered video effects and filters.
 * Applies transitions, filters, and visual enhancements to videos.
 *
 * Features:
 * - Color grading presets
 * - Transition effects
 * - Slow motion / speed changes
 * - Stabilization
 * - Filter overlays
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import { getRunwayProvider } from '../../../providers/runway.js';
import { getReplicateExtendedClient } from '../../../providers/replicate.js';
import { getJobManager } from '../../../providers/job-manager.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const FilterPresetSchema = z.enum([
  'cinematic',
  'vintage',
  'noir',
  'vibrant',
  'muted',
  'warm',
  'cool',
  'dreamy',
  'dramatic',
  'natural',
]);

const TransitionSchema = z.enum([
  'fade',
  'dissolve',
  'wipe',
  'slide',
  'zoom',
  'blur',
  'glitch',
]);

const VideoEffectsInputSchema = z.object({
  videoUrl: z.string().describe('URL of the source video'),
  effects: z.array(z.object({
    type: z.enum(['filter', 'speed', 'stabilize', 'transition', 'overlay']),
    value: z.string(),
    params: z.record(z.unknown()).optional(),
  })).describe('Effects to apply'),
  outputFormat: z.enum(['mp4', 'webm', 'mov']).default('mp4'),
  outputQuality: z.enum(['low', 'medium', 'high', 'ultra']).default('high'),
});

const VideoEffectsOutputSchema = z.object({
  success: z.boolean(),
  jobId: z.string().optional(),
  videoUrl: z.string().optional(),
  status: z.enum(['pending', 'processing', 'complete', 'failed']),
  appliedEffects: z.array(z.string()),
  duration: z.number().optional(),
  processingTime: z.number(),
  error: z.string().optional(),
});

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function applyColorGrade(
  ctx: AgentContext,
  params: {
    videoUrl: string;
    preset: z.infer<typeof FilterPresetSchema>;
    intensity: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  externalId: string;
}> {
  const runway = getRunwayProvider();

  const presetPrompts: Record<string, string> = {
    cinematic: 'cinematic color grade, film look, teal and orange',
    vintage: 'vintage film, faded colors, nostalgic grain',
    noir: 'film noir, high contrast black and white',
    vibrant: 'vibrant saturated colors, punchy look',
    muted: 'muted colors, subdued palette, soft',
    warm: 'warm color temperature, golden tones',
    cool: 'cool color temperature, blue tones',
    dreamy: 'dreamy soft glow, ethereal',
    dramatic: 'dramatic lighting, deep shadows',
    natural: 'natural colors, balanced exposure',
  };

  logger.info('video_color_grade_started', {
    preset: params.preset,
    intensity: params.intensity,
  });

  return runway.videoToVideo(
    {
      videoUrl: params.videoUrl,
      prompt: presetPrompts[params.preset],
      strength: params.intensity * 0.5,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    }
  );
}

async function changeSpeed(
  ctx: AgentContext,
  params: {
    videoUrl: string;
    speed: number;
    smoothMotion: boolean;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('video_speed_change_started', {
    speed: params.speed,
    smoothMotion: params.smoothMotion,
  });

  return replicate.createTrackedPrediction(
    'lucataco/video-speed:latest',
    {
      video: params.videoUrl,
      speed: params.speed,
      interpolate: params.smoothMotion,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'video_speed', speed: params.speed }
  );
}

async function stabilizeVideo(
  ctx: AgentContext,
  params: {
    videoUrl: string;
    strength: number;
    cropBorders: boolean;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('video_stabilization_started', {
    strength: params.strength,
    cropBorders: params.cropBorders,
  });

  return replicate.createTrackedPrediction(
    'lucataco/video-stabilization:latest',
    {
      video: params.videoUrl,
      stabilization_strength: params.strength,
      crop_black_borders: params.cropBorders,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'video_stabilize' }
  );
}

async function createTransition(
  ctx: AgentContext,
  params: {
    video1Url: string;
    video2Url: string;
    transitionType: z.infer<typeof TransitionSchema>;
    durationMs: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('transition_creation_started', {
    type: params.transitionType,
    durationMs: params.durationMs,
  });

  return replicate.createTrackedPrediction(
    'lucataco/video-transition:latest',
    {
      video_1: params.video1Url,
      video_2: params.video2Url,
      transition: params.transitionType,
      duration: params.durationMs / 1000,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'video_transition', transition: params.transitionType }
  );
}

async function addOverlay(
  ctx: AgentContext,
  params: {
    videoUrl: string;
    overlayType: 'film_grain' | 'vignette' | 'light_leak' | 'dust' | 'scanlines';
    opacity: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('overlay_addition_started', {
    type: params.overlayType,
    opacity: params.opacity,
  });

  return replicate.createTrackedPrediction(
    'lucataco/video-overlay:latest',
    {
      video: params.videoUrl,
      overlay: params.overlayType,
      opacity: params.opacity,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'video_overlay', overlay: params.overlayType }
  );
}

async function interpolateFrames(
  ctx: AgentContext,
  params: {
    videoUrl: string;
    targetFps: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('frame_interpolation_started', {
    targetFps: params.targetFps,
  });

  return replicate.createTrackedPrediction(
    'lucataco/rife-video-interpolation:latest',
    {
      video: params.videoUrl,
      fps: params.targetFps,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'frame_interpolation', fps: params.targetFps }
  );
}

async function checkJobStatus(
  ctx: AgentContext,
  params: { jobId: string }
): Promise<{
  status: string;
  progress: number;
  videoUrl?: string;
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
    error: job.errorMessage,
  };
}

async function waitForJob(
  ctx: AgentContext,
  params: { jobId: string }
): Promise<{
  status: string;
  videoUrl?: string;
  error?: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('waiting_for_video_effect_job', { jobId: params.jobId });

  const prediction = await replicate.waitForTrackedPrediction(params.jobId, {
    maxWaitMs: 600000,
  });

  return {
    status: prediction.status,
    videoUrl: Array.isArray(prediction.output) ? prediction.output[0] : prediction.output as string,
    error: prediction.error,
  };
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const videoEffectsAgent = defineAgent({
  name: 'video-effects',
  description: 'AI-powered video effects, filters, and enhancements',
  version: '1.0.0',

  inputSchema: VideoEffectsInputSchema,
  outputSchema: VideoEffectsOutputSchema,

  tools: {
    apply_color_grade: {
      description: 'Apply color grading preset to video',
      parameters: z.object({
        videoUrl: z.string(),
        preset: FilterPresetSchema,
        intensity: z.number().min(0).max(1).default(0.5),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        externalId: z.string(),
      }),
      execute: applyColorGrade,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    change_speed: {
      description: 'Change video playback speed (slow motion or speed up)',
      parameters: z.object({
        videoUrl: z.string(),
        speed: z.number().min(0.1).max(4),
        smoothMotion: z.boolean().default(true),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: changeSpeed,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    stabilize: {
      description: 'Stabilize shaky video footage',
      parameters: z.object({
        videoUrl: z.string(),
        strength: z.number().min(0).max(1).default(0.5),
        cropBorders: z.boolean().default(true),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: stabilizeVideo,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    create_transition: {
      description: 'Create transition between two video clips',
      parameters: z.object({
        video1Url: z.string(),
        video2Url: z.string(),
        transitionType: TransitionSchema,
        durationMs: z.number().min(100).max(3000).default(1000),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: createTransition,
      sideEffectful: true,
      timeoutMs: 180000,
    },

    add_overlay: {
      description: 'Add visual overlay effect to video',
      parameters: z.object({
        videoUrl: z.string(),
        overlayType: z.enum(['film_grain', 'vignette', 'light_leak', 'dust', 'scanlines']),
        opacity: z.number().min(0).max(1).default(0.3),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: addOverlay,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    interpolate_frames: {
      description: 'Interpolate frames to increase FPS or smooth slow motion',
      parameters: z.object({
        videoUrl: z.string(),
        targetFps: z.number().min(24).max(120).default(60),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: interpolateFrames,
      sideEffectful: true,
      timeoutMs: 300000,
    },

    check_status: {
      description: 'Check status of a video effect job',
      parameters: z.object({
        jobId: z.string(),
      }),
      returns: z.object({
        status: z.string(),
        progress: z.number(),
        videoUrl: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: checkJobStatus,
      timeoutMs: 10000,
    },

    wait_for_job: {
      description: 'Wait for video effect job to complete',
      parameters: z.object({
        jobId: z.string(),
      }),
      returns: z.object({
        status: z.string(),
        videoUrl: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: waitForJob,
      timeoutMs: 660000,
    },
  },

  systemPrompt: `You are a video effects specialist. Your role is to apply professional effects to videos.

Available effects:

Color Grading:
- cinematic, vintage, noir
- vibrant, muted, warm, cool
- dreamy, dramatic, natural

Speed Effects:
- Slow motion: speed < 1 (e.g., 0.5 for half speed)
- Speed up: speed > 1 (e.g., 2 for double speed)
- Enable smoothMotion for AI frame interpolation

Transitions:
- fade, dissolve, wipe
- slide, zoom, blur, glitch

Overlays:
- film_grain: Vintage film look
- vignette: Dark edges
- light_leak: Film light leaks
- dust: Dust particles
- scanlines: CRT effect

Workflow:
1. Start with stabilization if needed
2. Apply color grading
3. Adjust speed if requested
4. Add overlays for style
5. Use transitions for clip joining

Tips:
- Stabilize before other effects
- Keep overlays subtle (opacity 0.2-0.4)
- For slow motion, interpolate frames first
- Match color grade to content mood`,

  config: {
    maxTurns: 10,
    temperature: 0.4,
    maxTokens: 2048,
  },
});

export default videoEffectsAgent;
