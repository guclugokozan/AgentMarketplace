/**
 * Motion Graphics Agent
 *
 * AI-powered motion graphics and animated text generation.
 * Creates animated titles, lower thirds, and graphic elements.
 *
 * Features:
 * - Animated text/titles
 * - Lower thirds
 * - Logo animations
 * - Particle effects
 * - Kinetic typography
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import { getRunwayProvider } from '../../../providers/runway.js';
import { getDalleClient } from '../../../providers/openai.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const AnimationStyleSchema = z.enum([
  'fade',
  'slide',
  'bounce',
  'typewriter',
  'glitch',
  'zoom',
  'rotate',
  'wave',
  'particle',
  'kinetic',
]);

const MotionGraphicsInputSchema = z.object({
  type: z.enum(['title', 'lower_third', 'logo', 'text_animation', 'particles']),
  text: z.string().optional().describe('Text content for titles/lower thirds'),
  logoUrl: z.string().optional().describe('Logo image URL'),
  style: AnimationStyleSchema.default('fade'),
  duration: z.number().min(1).max(30).default(5).describe('Duration in seconds'),
  colors: z.object({
    primary: z.string().optional(),
    secondary: z.string().optional(),
    background: z.string().optional(),
  }).optional(),
  outputSize: z.enum(['720p', '1080p', '4k']).default('1080p'),
});

const MotionGraphicsOutputSchema = z.object({
  success: z.boolean(),
  videoUrl: z.string().optional(),
  jobId: z.string().optional(),
  status: z.enum(['pending', 'processing', 'complete', 'failed']),
  duration: z.number().optional(),
  error: z.string().optional(),
});

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function generateAnimatedTitle(
  ctx: AgentContext,
  params: {
    text: string;
    style: z.infer<typeof AnimationStyleSchema>;
    duration: number;
    colors?: { primary?: string; secondary?: string; background?: string };
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  externalId: string;
}> {
  const runway = getRunwayProvider();

  const styleDescriptions: Record<string, string> = {
    fade: 'fading in text animation, smooth opacity transition',
    slide: 'sliding text animation, smooth movement',
    bounce: 'bouncing text animation, elastic effect',
    typewriter: 'typewriter effect, letters appearing one by one',
    glitch: 'glitch effect text, digital distortion',
    zoom: 'zooming text animation, scale transformation',
    rotate: 'rotating text animation, 3D rotation',
    wave: 'wave motion text, fluid movement',
    particle: 'particle effect text, disintegrating/forming',
    kinetic: 'kinetic typography, dynamic text movement',
  };

  const colorDesc = params.colors?.primary
    ? `${params.colors.primary} text on ${params.colors.background || 'dark'} background`
    : 'white text on dark background';

  const prompt = `Animated title "${params.text}", ${styleDescriptions[params.style]}, ${colorDesc}, motion graphics, professional broadcast quality`;

  logger.info('animated_title_started', {
    style: params.style,
    duration: params.duration,
  });

  return runway.generateVideo(
    {
      prompt,
      duration: Math.min(params.duration, 16) as 4 | 8 | 16,
      aspectRatio: '16:9',
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    }
  );
}

async function generateLowerThird(
  ctx: AgentContext,
  params: {
    name: string;
    title: string;
    style: 'minimal' | 'corporate' | 'broadcast' | 'creative';
    colors?: { primary?: string; secondary?: string };
    duration: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  externalId: string;
}> {
  const runway = getRunwayProvider();

  const styleDesc: Record<string, string> = {
    minimal: 'clean minimal lower third, simple line and text',
    corporate: 'professional corporate lower third, business style',
    broadcast: 'news broadcast lower third, TV news style',
    creative: 'creative lower third, dynamic design',
  };

  const prompt = `Animated lower third with name "${params.name}" and title "${params.title}", ${styleDesc[params.style]}, ${params.colors?.primary || 'blue'} accent color, motion graphics, broadcast quality, smooth animation`;

  logger.info('lower_third_started', {
    style: params.style,
    duration: params.duration,
  });

  return runway.generateVideo(
    {
      prompt,
      duration: Math.min(params.duration, 8) as 4 | 8,
      aspectRatio: '16:9',
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    }
  );
}

async function animateLogo(
  ctx: AgentContext,
  params: {
    logoDescription: string;
    animationType: 'reveal' | 'pulse' | 'morph' | 'particle_form' | 'glitch' | '3d_rotate';
    duration: number;
    backgroundColor?: string;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  externalId: string;
}> {
  const runway = getRunwayProvider();

  const animationDesc: Record<string, string> = {
    reveal: 'logo reveal animation, dramatic unveiling',
    pulse: 'pulsing logo animation, breathing effect',
    morph: 'morphing logo animation, shape transformation',
    particle_form: 'particles forming into logo, assembly effect',
    glitch: 'glitch effect logo, digital distortion reveal',
    '3d_rotate': '3D rotating logo, dimensional spin',
  };

  const prompt = `Animated logo "${params.logoDescription}", ${animationDesc[params.animationType]}, ${params.backgroundColor || 'dark'} background, professional motion graphics, cinematic quality`;

  logger.info('logo_animation_started', {
    animationType: params.animationType,
    duration: params.duration,
  });

  return runway.generateVideo(
    {
      prompt,
      duration: Math.min(params.duration, 8) as 4 | 8,
      aspectRatio: '16:9',
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    }
  );
}

async function generateParticleEffect(
  ctx: AgentContext,
  params: {
    particleType: 'sparks' | 'stars' | 'dust' | 'smoke' | 'fire' | 'magic' | 'confetti';
    motionType: 'rising' | 'falling' | 'swirling' | 'exploding' | 'floating';
    duration: number;
    backgroundColor?: string;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  externalId: string;
}> {
  const runway = getRunwayProvider();

  const prompt = `${params.particleType} particles ${params.motionType}, particle effect animation, ${params.backgroundColor || 'transparent dark'} background, seamless loop, motion graphics overlay`;

  logger.info('particle_effect_started', {
    particleType: params.particleType,
    motionType: params.motionType,
  });

  return runway.generateVideo(
    {
      prompt,
      duration: Math.min(params.duration, 8) as 4 | 8,
      aspectRatio: '16:9',
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    }
  );
}

async function generateKineticTypography(
  ctx: AgentContext,
  params: {
    words: string[];
    style: 'bold' | 'elegant' | 'playful' | 'dramatic';
    syncTiming: 'fast' | 'medium' | 'slow';
    duration: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  externalId: string;
}> {
  const runway = getRunwayProvider();

  const styleDesc: Record<string, string> = {
    bold: 'bold impactful typography, strong movements',
    elegant: 'elegant flowing typography, smooth transitions',
    playful: 'playful bouncy typography, fun animations',
    dramatic: 'dramatic cinematic typography, intense effects',
  };

  const timingDesc: Record<string, string> = {
    fast: 'rapid word transitions',
    medium: 'moderate pacing',
    slow: 'slow dramatic reveals',
  };

  const prompt = `Kinetic typography animation: "${params.words.join(' ')}", ${styleDesc[params.style]}, ${timingDesc[params.syncTiming]}, professional motion graphics, broadcast quality`;

  logger.info('kinetic_typography_started', {
    wordCount: params.words.length,
    style: params.style,
  });

  return runway.generateVideo(
    {
      prompt,
      duration: Math.min(params.duration, 16) as 4 | 8 | 16,
      aspectRatio: '16:9',
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
  videoUrl?: string;
  error?: string;
}> {
  const runway = getRunwayProvider();

  const result = await runway.waitForCompletion(params.jobId, {
    timeout: 600000,
  });

  return {
    status: result.status,
    videoUrl: result.outputUrl,
    error: result.error,
  };
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const motionGraphicsAgent = defineAgent({
  name: 'motion-graphics',
  description: 'AI-powered motion graphics and animated text generation',
  version: '1.0.0',

  inputSchema: MotionGraphicsInputSchema,
  outputSchema: MotionGraphicsOutputSchema,

  tools: {
    animated_title: {
      description: 'Generate animated title/text',
      parameters: z.object({
        text: z.string(),
        style: AnimationStyleSchema,
        duration: z.number(),
        colors: z.object({
          primary: z.string().optional(),
          secondary: z.string().optional(),
          background: z.string().optional(),
        }).optional(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        externalId: z.string(),
      }),
      execute: generateAnimatedTitle,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    lower_third: {
      description: 'Generate animated lower third name/title card',
      parameters: z.object({
        name: z.string(),
        title: z.string(),
        style: z.enum(['minimal', 'corporate', 'broadcast', 'creative']),
        colors: z.object({
          primary: z.string().optional(),
          secondary: z.string().optional(),
        }).optional(),
        duration: z.number(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        externalId: z.string(),
      }),
      execute: generateLowerThird,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    animate_logo: {
      description: 'Create animated logo reveal',
      parameters: z.object({
        logoDescription: z.string(),
        animationType: z.enum(['reveal', 'pulse', 'morph', 'particle_form', 'glitch', '3d_rotate']),
        duration: z.number(),
        backgroundColor: z.string().optional(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        externalId: z.string(),
      }),
      execute: animateLogo,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    particle_effect: {
      description: 'Generate particle effect overlay',
      parameters: z.object({
        particleType: z.enum(['sparks', 'stars', 'dust', 'smoke', 'fire', 'magic', 'confetti']),
        motionType: z.enum(['rising', 'falling', 'swirling', 'exploding', 'floating']),
        duration: z.number(),
        backgroundColor: z.string().optional(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        externalId: z.string(),
      }),
      execute: generateParticleEffect,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    kinetic_typography: {
      description: 'Create kinetic typography animation',
      parameters: z.object({
        words: z.array(z.string()),
        style: z.enum(['bold', 'elegant', 'playful', 'dramatic']),
        syncTiming: z.enum(['fast', 'medium', 'slow']),
        duration: z.number(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        externalId: z.string(),
      }),
      execute: generateKineticTypography,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    wait_for_job: {
      description: 'Wait for motion graphics job',
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

  systemPrompt: `You are a motion graphics designer. Create professional animated elements.

Available elements:
- Animated titles: Text animations with various styles
- Lower thirds: Name/title cards for interviews and presentations
- Logo animations: Brand reveal animations
- Particle effects: Overlay effects like sparks, dust, magic
- Kinetic typography: Dynamic text sequences

Animation styles:
- fade, slide, bounce, typewriter
- glitch, zoom, rotate, wave
- particle, kinetic

Best practices:
- Keep titles readable (2-4 seconds minimum)
- Match animation style to content tone
- Use consistent colors for brand identity
- Keep lower thirds in safe area
- Particle effects work best as overlays

Use cases:
- YouTube intros/outros
- Corporate presentations
- Social media videos
- Broadcast graphics
- Event videos`,

  config: {
    maxTurns: 8,
    temperature: 0.5,
    maxTokens: 2048,
  },
});

export default motionGraphicsAgent;
