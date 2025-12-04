/**
 * VFX Transformer Agent
 *
 * AI-powered visual effects for videos and images.
 * Adds cinematic effects, color grading, and transformations.
 *
 * Features:
 * - Cinematic color grading
 * - Weather effects (rain, snow, fog)
 * - Time of day changes
 * - Particle effects
 * - Background replacement
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import { getReplicateExtendedClient } from '../../../providers/replicate.js';
import { getStabilityProvider } from '../../../providers/stability.js';
import { getRunwayProvider } from '../../../providers/runway.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const ColorGradeSchema = z.enum([
  'cinematic',
  'vintage',
  'noir',
  'cyberpunk',
  'warm',
  'cool',
  'desaturated',
  'high_contrast',
  'soft',
  'dramatic',
  'golden_hour',
  'moonlit',
]);

const WeatherEffectSchema = z.enum([
  'rain',
  'snow',
  'fog',
  'mist',
  'dust',
  'storm',
  'sunny',
  'cloudy',
  'lightning',
]);

const VFXInputSchema = z.object({
  mediaUrl: z.string().describe('URL of the image or video'),
  mediaType: z.enum(['image', 'video']).default('image'),
  effects: z.array(z.object({
    type: z.enum(['color_grade', 'weather', 'time_of_day', 'particles', 'background']),
    value: z.string(),
    intensity: z.number().min(0).max(1).default(0.5),
  })).describe('Effects to apply'),
  preserveSubjects: z.boolean().default(true),
  outputFormat: z.enum(['png', 'jpg', 'mp4', 'webm']).optional(),
});

const VFXOutputSchema = z.object({
  success: z.boolean(),
  mediaUrl: z.string().optional(),
  jobId: z.string().optional(),
  status: z.enum(['complete', 'processing', 'failed']),
  appliedEffects: z.array(z.string()),
  processingTime: z.number(),
  error: z.string().optional(),
});

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function applyColorGrade(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    grade: z.infer<typeof ColorGradeSchema>;
    intensity: number;
  }
): Promise<{
  imageBase64: string;
  gradeApplied: string;
}> {
  const stability = getStabilityProvider();

  const gradePrompts: Record<string, string> = {
    cinematic: 'cinematic color grading, film look, teal and orange',
    vintage: 'vintage film, faded colors, nostalgic',
    noir: 'film noir, high contrast black and white, dramatic',
    cyberpunk: 'cyberpunk colors, neon pink and blue, futuristic',
    warm: 'warm color temperature, golden tones',
    cool: 'cool color temperature, blue tones',
    desaturated: 'desaturated, muted colors, subtle',
    high_contrast: 'high contrast, deep blacks, bright highlights',
    soft: 'soft diffused lighting, dreamy',
    dramatic: 'dramatic lighting, strong shadows',
    golden_hour: 'golden hour lighting, warm sunset tones',
    moonlit: 'moonlit night, blue silver tones, dark',
  };

  logger.info('color_grade_started', {
    grade: params.grade,
    intensity: params.intensity,
  });

  const response = await fetch(params.imageUrl);
  const buffer = await response.arrayBuffer();
  const imageBase64 = Buffer.from(buffer).toString('base64');

  const results = await stability.imageToImage({
    image: imageBase64,
    prompt: gradePrompts[params.grade],
    strength: params.intensity * 0.5, // Scale intensity
    steps: 25,
  });

  return {
    imageBase64: results[0].base64,
    gradeApplied: params.grade,
  };
}

async function addWeatherEffect(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    weather: z.infer<typeof WeatherEffectSchema>;
    intensity: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  const weatherPrompts: Record<string, string> = {
    rain: 'heavy rain, wet surfaces, raindrops visible',
    snow: 'falling snow, winter scene, snowflakes',
    fog: 'thick fog, misty atmosphere, low visibility',
    mist: 'light mist, atmospheric haze',
    dust: 'dusty atmosphere, particles in air',
    storm: 'stormy weather, dark clouds, dramatic',
    sunny: 'bright sunny day, clear blue sky, sun rays',
    cloudy: 'overcast sky, gray clouds, soft light',
    lightning: 'lightning strike, stormy night, dramatic flash',
  };

  logger.info('weather_effect_started', {
    weather: params.weather,
    intensity: params.intensity,
  });

  return replicate.createTrackedPrediction(
    'stability-ai/sdxl-inpainting:latest',
    {
      image: params.imageUrl,
      prompt: `${weatherPrompts[params.weather]}, atmospheric effect`,
      strength: params.intensity,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'weather_effect', weather: params.weather }
  );
}

async function changeTimeOfDay(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    timeOfDay: 'dawn' | 'morning' | 'noon' | 'afternoon' | 'sunset' | 'dusk' | 'night' | 'midnight';
    intensity: number;
  }
): Promise<{
  imageBase64: string;
  timeApplied: string;
}> {
  const stability = getStabilityProvider();

  const timePrompts: Record<string, string> = {
    dawn: 'early dawn, soft pink and purple sky, first light',
    morning: 'bright morning light, fresh, crisp lighting',
    noon: 'midday sun, harsh direct lighting, minimal shadows',
    afternoon: 'afternoon golden light, warm tones',
    sunset: 'sunset lighting, orange and red sky, long shadows',
    dusk: 'dusk twilight, deep blue sky, city lights beginning',
    night: 'nighttime, dark sky, artificial lighting, stars',
    midnight: 'deep night, moonlit, very dark, minimal light',
  };

  logger.info('time_change_started', {
    timeOfDay: params.timeOfDay,
  });

  const response = await fetch(params.imageUrl);
  const buffer = await response.arrayBuffer();
  const imageBase64 = Buffer.from(buffer).toString('base64');

  const results = await stability.imageToImage({
    image: imageBase64,
    prompt: timePrompts[params.timeOfDay],
    strength: params.intensity * 0.6,
    steps: 30,
  });

  return {
    imageBase64: results[0].base64,
    timeApplied: params.timeOfDay,
  };
}

async function addParticleEffect(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    particleType: 'sparks' | 'fire' | 'magic' | 'smoke' | 'bubbles' | 'confetti' | 'leaves' | 'petals';
    density: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  const particlePrompts: Record<string, string> = {
    sparks: 'flying sparks, glowing embers, fire particles',
    fire: 'fire and flames, burning effect',
    magic: 'magical sparkles, glowing particles, fairy dust',
    smoke: 'smoke wisps, atmospheric smoke',
    bubbles: 'floating bubbles, soap bubbles, iridescent',
    confetti: 'colorful confetti, celebration, festive',
    leaves: 'falling autumn leaves, wind-blown foliage',
    petals: 'floating flower petals, romantic, delicate',
  };

  logger.info('particle_effect_started', {
    particleType: params.particleType,
    density: params.density,
  });

  return replicate.createTrackedPrediction(
    'stability-ai/sdxl-inpainting:latest',
    {
      image: params.imageUrl,
      prompt: particlePrompts[params.particleType],
      strength: params.density * 0.4,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'particle_effect', particle: params.particleType }
  );
}

async function replaceBackground(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    newBackground: string;
    preserveSubject: boolean;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('background_replacement_started', {
    newBackground: params.newBackground,
    preserveSubject: params.preserveSubject,
  });

  // First remove background, then composite
  return replicate.createTrackedPrediction(
    'cjwbw/rembg:latest',
    {
      image: params.imageUrl,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'background_removal_for_vfx' }
  );
}

async function applyVideoEffect(
  ctx: AgentContext,
  params: {
    videoUrl: string;
    effect: string;
    intensity: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  externalId: string;
}> {
  const runway = getRunwayProvider();

  logger.info('video_effect_started', {
    effect: params.effect,
    intensity: params.intensity,
  });

  return runway.videoToVideo(
    {
      videoUrl: params.videoUrl,
      prompt: params.effect,
      strength: params.intensity,
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

export const vfxTransformerAgent = defineAgent({
  name: 'vfx-transformer',
  description: 'AI-powered visual effects for images and videos',
  version: '1.0.0',

  inputSchema: VFXInputSchema,
  outputSchema: VFXOutputSchema,

  tools: {
    apply_color_grade: {
      description: 'Apply cinematic color grading to an image',
      parameters: z.object({
        imageUrl: z.string(),
        grade: ColorGradeSchema,
        intensity: z.number(),
      }),
      returns: z.object({
        imageBase64: z.string(),
        gradeApplied: z.string(),
      }),
      execute: applyColorGrade,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    add_weather: {
      description: 'Add weather effects to an image',
      parameters: z.object({
        imageUrl: z.string(),
        weather: WeatherEffectSchema,
        intensity: z.number(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: addWeatherEffect,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    change_time: {
      description: 'Change the time of day in an image',
      parameters: z.object({
        imageUrl: z.string(),
        timeOfDay: z.enum(['dawn', 'morning', 'noon', 'afternoon', 'sunset', 'dusk', 'night', 'midnight']),
        intensity: z.number(),
      }),
      returns: z.object({
        imageBase64: z.string(),
        timeApplied: z.string(),
      }),
      execute: changeTimeOfDay,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    add_particles: {
      description: 'Add particle effects to an image',
      parameters: z.object({
        imageUrl: z.string(),
        particleType: z.enum(['sparks', 'fire', 'magic', 'smoke', 'bubbles', 'confetti', 'leaves', 'petals']),
        density: z.number(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: addParticleEffect,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    replace_background: {
      description: 'Replace the background of an image',
      parameters: z.object({
        imageUrl: z.string(),
        newBackground: z.string(),
        preserveSubject: z.boolean(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: replaceBackground,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    apply_video_effect: {
      description: 'Apply VFX to a video',
      parameters: z.object({
        videoUrl: z.string(),
        effect: z.string(),
        intensity: z.number(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        externalId: z.string(),
      }),
      execute: applyVideoEffect,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    wait_for_job: {
      description: 'Wait for async VFX job',
      parameters: z.object({
        jobId: z.string(),
      }),
      returns: z.object({
        status: z.string(),
        output: z.unknown().optional(),
        error: z.string().optional(),
      }),
      execute: waitForJob,
      timeoutMs: 600000,
    },
  },

  systemPrompt: `You are a VFX artist assistant specializing in visual effects transformation.

Available effects:

Color Grading:
- cinematic: Film-like teal and orange
- vintage: Faded nostalgic look
- noir: High contrast black and white
- cyberpunk: Neon futuristic colors
- golden_hour: Warm sunset tones
- moonlit: Cool night tones

Weather Effects:
- rain, snow, fog, mist
- dust, storm, lightning
- sunny, cloudy

Time of Day:
- dawn, morning, noon
- afternoon, sunset, dusk
- night, midnight

Particle Effects:
- sparks, fire, magic
- smoke, bubbles, confetti
- leaves, petals

Workflow:
1. Analyze the source media
2. Apply effects in logical order
3. Color grading typically goes last
4. Combine effects for complex looks

Tips:
- Stack effects for cinematic results
- Use lower intensity for subtle effects
- Match effects to the scene content
- Consider subject preservation for backgrounds`,

  config: {
    maxTurns: 10,
    temperature: 0.4,
    maxTokens: 2048,
  },
});

export default vfxTransformerAgent;
