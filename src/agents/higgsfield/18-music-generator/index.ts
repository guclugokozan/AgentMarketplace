/**
 * Music Generator Agent
 *
 * AI-powered music and sound generation.
 * Creates background music, sound effects, and audio tracks.
 *
 * Features:
 * - Text to music generation
 * - Sound effect generation
 * - Music continuation
 * - Style-based generation
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import { getReplicateExtendedClient } from '../../../providers/replicate.js';
import { getElevenLabsProvider } from '../../../providers/elevenlabs.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const MusicGenreSchema = z.enum([
  'ambient',
  'electronic',
  'cinematic',
  'corporate',
  'pop',
  'rock',
  'jazz',
  'classical',
  'hip_hop',
  'lofi',
  'edm',
  'acoustic',
]);

const MoodSchema = z.enum([
  'happy',
  'sad',
  'energetic',
  'calm',
  'dramatic',
  'mysterious',
  'romantic',
  'epic',
  'playful',
  'dark',
  'uplifting',
  'nostalgic',
]);

const MusicInputSchema = z.object({
  type: z.enum(['music', 'sfx', 'ambient']),
  prompt: z.string().describe('Description of the music/sound'),
  genre: MusicGenreSchema.optional(),
  mood: MoodSchema.optional(),
  duration: z.number().min(5).max(300).default(30).describe('Duration in seconds'),
  bpm: z.number().min(60).max(200).optional().describe('Beats per minute'),
  key: z.string().optional().describe('Musical key (e.g., C major)'),
  instruments: z.array(z.string()).optional(),
});

const MusicOutputSchema = z.object({
  success: z.boolean(),
  audioUrl: z.string().optional(),
  jobId: z.string().optional(),
  status: z.enum(['pending', 'processing', 'complete', 'failed']),
  duration: z.number().optional(),
  format: z.string().optional(),
  error: z.string().optional(),
});

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function generateMusic(
  ctx: AgentContext,
  params: {
    prompt: string;
    genre?: z.infer<typeof MusicGenreSchema>;
    mood?: z.infer<typeof MoodSchema>;
    duration: number;
    bpm?: number;
    instruments?: string[];
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  let fullPrompt = params.prompt;
  if (params.genre) fullPrompt += `, ${params.genre} genre`;
  if (params.mood) fullPrompt += `, ${params.mood} mood`;
  if (params.bpm) fullPrompt += `, ${params.bpm} BPM`;
  if (params.instruments?.length) {
    fullPrompt += `, featuring ${params.instruments.join(', ')}`;
  }

  logger.info('music_generation_started', {
    genre: params.genre,
    mood: params.mood,
    duration: params.duration,
  });

  return replicate.createTrackedPrediction(
    'meta/musicgen:latest',
    {
      prompt: fullPrompt,
      duration: params.duration,
      model_version: 'large',
      output_format: 'mp3',
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'music_generation', genre: params.genre }
  );
}

async function generateSoundEffect(
  ctx: AgentContext,
  params: {
    description: string;
    duration?: number;
  }
): Promise<{
  audioBase64: string;
}> {
  const elevenlabs = getElevenLabsProvider();

  logger.info('sfx_generation_started', {
    description: params.description,
    duration: params.duration,
  });

  const audioBuffer = await elevenlabs.generateSoundEffect(
    params.description,
    params.duration,
    0.5
  );

  return {
    audioBase64: Buffer.from(audioBuffer).toString('base64'),
  };
}

async function generateAmbient(
  ctx: AgentContext,
  params: {
    environment: string;
    intensity: number;
    duration: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  const prompt = `Ambient soundscape: ${params.environment}, atmospheric, immersive, seamless loop`;

  logger.info('ambient_generation_started', {
    environment: params.environment,
    duration: params.duration,
  });

  return replicate.createTrackedPrediction(
    'meta/musicgen:latest',
    {
      prompt,
      duration: params.duration,
      model_version: 'large',
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'ambient_generation' }
  );
}

async function continueMusic(
  ctx: AgentContext,
  params: {
    audioUrl: string;
    continuationPrompt: string;
    duration: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('music_continuation_started', {
    duration: params.duration,
  });

  return replicate.createTrackedPrediction(
    'meta/musicgen:latest',
    {
      prompt: params.continuationPrompt,
      input_audio: params.audioUrl,
      continuation: true,
      duration: params.duration,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'music_continuation' }
  );
}

async function generateMelody(
  ctx: AgentContext,
  params: {
    description: string;
    key?: string;
    tempo?: string;
    instrument: string;
    duration: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  let prompt = `${params.description}, ${params.instrument} melody`;
  if (params.key) prompt += `, in ${params.key}`;
  if (params.tempo) prompt += `, ${params.tempo} tempo`;

  logger.info('melody_generation_started', {
    instrument: params.instrument,
    duration: params.duration,
  });

  return replicate.createTrackedPrediction(
    'meta/musicgen:latest',
    {
      prompt,
      duration: params.duration,
      model_version: 'melody',
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'melody_generation', instrument: params.instrument }
  );
}

async function suggestMusic(
  ctx: AgentContext,
  params: {
    videoDescription: string;
    duration: number;
    usageType: 'background' | 'intro' | 'outro' | 'action' | 'emotional';
  }
): Promise<{
  suggestions: Array<{
    genre: string;
    mood: string;
    prompt: string;
    reason: string;
  }>;
}> {
  logger.info('music_suggestion_started', {
    usageType: params.usageType,
  });

  const usageSuggestions: Record<string, Array<{ genre: string; mood: string; prompt: string; reason: string }>> = {
    background: [
      { genre: 'ambient', mood: 'calm', prompt: 'subtle ambient background music', reason: 'Non-intrusive background' },
      { genre: 'corporate', mood: 'uplifting', prompt: 'light corporate background', reason: 'Professional feel' },
    ],
    intro: [
      { genre: 'cinematic', mood: 'epic', prompt: 'dramatic intro music, building tension', reason: 'Captures attention' },
      { genre: 'electronic', mood: 'energetic', prompt: 'energetic electronic intro', reason: 'Modern and dynamic' },
    ],
    outro: [
      { genre: 'ambient', mood: 'calm', prompt: 'peaceful outro music, fading', reason: 'Smooth ending' },
      { genre: 'cinematic', mood: 'uplifting', prompt: 'triumphant outro, resolution', reason: 'Satisfying conclusion' },
    ],
    action: [
      { genre: 'electronic', mood: 'energetic', prompt: 'intense action music, driving beat', reason: 'High energy' },
      { genre: 'rock', mood: 'dramatic', prompt: 'powerful rock action track', reason: 'Raw energy' },
    ],
    emotional: [
      { genre: 'classical', mood: 'sad', prompt: 'emotional piano piece, touching', reason: 'Deep emotion' },
      { genre: 'ambient', mood: 'nostalgic', prompt: 'nostalgic emotional ambient', reason: 'Reflective mood' },
    ],
  };

  return {
    suggestions: usageSuggestions[params.usageType] || usageSuggestions.background,
  };
}

async function waitForJob(
  ctx: AgentContext,
  params: { jobId: string }
): Promise<{
  status: string;
  audioUrl?: string;
  error?: string;
}> {
  const replicate = getReplicateExtendedClient();

  const prediction = await replicate.waitForTrackedPrediction(params.jobId, {
    maxWaitMs: 600000,
  });

  return {
    status: prediction.status,
    audioUrl: Array.isArray(prediction.output) ? prediction.output[0] : prediction.output as string,
    error: prediction.error,
  };
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const musicGeneratorAgent = defineAgent({
  name: 'music-generator',
  description: 'AI-powered music, sound effects, and ambient audio generation',
  version: '1.0.0',

  inputSchema: MusicInputSchema,
  outputSchema: MusicOutputSchema,

  tools: {
    generate_music: {
      description: 'Generate music from a text description',
      parameters: z.object({
        prompt: z.string(),
        genre: MusicGenreSchema.optional(),
        mood: MoodSchema.optional(),
        duration: z.number(),
        bpm: z.number().optional(),
        instruments: z.array(z.string()).optional(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: generateMusic,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    generate_sfx: {
      description: 'Generate a sound effect',
      parameters: z.object({
        description: z.string(),
        duration: z.number().optional(),
      }),
      returns: z.object({
        audioBase64: z.string(),
      }),
      execute: generateSoundEffect,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    generate_ambient: {
      description: 'Generate ambient soundscape',
      parameters: z.object({
        environment: z.string(),
        intensity: z.number().min(0).max(1),
        duration: z.number(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: generateAmbient,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    continue_music: {
      description: 'Continue an existing music track',
      parameters: z.object({
        audioUrl: z.string(),
        continuationPrompt: z.string(),
        duration: z.number(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: continueMusic,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    generate_melody: {
      description: 'Generate a melody with specific instrument',
      parameters: z.object({
        description: z.string(),
        key: z.string().optional(),
        tempo: z.string().optional(),
        instrument: z.string(),
        duration: z.number(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: generateMelody,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    suggest_music: {
      description: 'Get music suggestions for video content',
      parameters: z.object({
        videoDescription: z.string(),
        duration: z.number(),
        usageType: z.enum(['background', 'intro', 'outro', 'action', 'emotional']),
      }),
      returns: z.object({
        suggestions: z.array(z.object({
          genre: z.string(),
          mood: z.string(),
          prompt: z.string(),
          reason: z.string(),
        })),
      }),
      execute: suggestMusic,
      timeoutMs: 10000,
    },

    wait_for_job: {
      description: 'Wait for music generation job',
      parameters: z.object({
        jobId: z.string(),
      }),
      returns: z.object({
        status: z.string(),
        audioUrl: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: waitForJob,
      timeoutMs: 660000,
    },
  },

  systemPrompt: `You are a music generation specialist. Create original audio content.

Available genres:
ambient, electronic, cinematic, corporate, pop, rock,
jazz, classical, hip_hop, lofi, edm, acoustic

Available moods:
happy, sad, energetic, calm, dramatic, mysterious,
romantic, epic, playful, dark, uplifting, nostalgic

Generation types:
- Music: Full tracks with instruments and structure
- SFX: Short sound effects
- Ambient: Environmental soundscapes
- Melody: Single instrument melodies

Tips:
- Be specific about instruments and style
- Include tempo (BPM) for rhythmic consistency
- Specify musical key for harmony
- Duration affects generation quality (shorter = better)
- Use continuation for longer pieces

Best practices:
- Background music: ambient, lofi, or corporate
- Action scenes: electronic, rock, or cinematic
- Emotional moments: classical, ambient, or acoustic
- Intros/Outros: cinematic or electronic`,

  config: {
    maxTurns: 8,
    temperature: 0.5,
    maxTokens: 2048,
  },
});

export default musicGeneratorAgent;
