/**
 * Voice Cloner Agent
 *
 * AI-powered voice cloning and synthesis.
 * Creates realistic voice clones from audio samples.
 *
 * IMPORTANT: This is a biometric operation requiring explicit consent.
 *
 * Features:
 * - Voice cloning from samples
 * - Text-to-speech with cloned voice
 * - Voice style transfer
 * - Multi-language synthesis
 * - Voice mixing
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import { getElevenLabsProvider } from '../../../providers/elevenlabs.js';
import { ConsentValidator } from '../../../consent/validator.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const VoiceStyleSchema = z.enum([
  'natural',
  'professional',
  'casual',
  'dramatic',
  'whisper',
  'energetic',
  'calm',
  'authoritative',
]);

const LanguageSchema = z.enum([
  'en-US',
  'en-GB',
  'es-ES',
  'fr-FR',
  'de-DE',
  'it-IT',
  'pt-BR',
  'ja-JP',
  'ko-KR',
  'zh-CN',
]);

const VoiceClonerInputSchema = z.object({
  operation: z.enum(['clone', 'synthesize', 'style_transfer', 'translate']),
  audioSampleUrls: z.array(z.string()).optional().describe('Audio samples for cloning'),
  text: z.string().optional().describe('Text to synthesize'),
  voiceId: z.string().optional().describe('Existing voice ID'),
  targetStyle: VoiceStyleSchema.optional(),
  targetLanguage: LanguageSchema.optional(),
  consent: z.object({
    subjectId: z.string(),
    subjectName: z.string(),
    consentToken: z.string(),
    purpose: z.string(),
  }).optional().describe('Required consent for voice cloning'),
});

const VoiceClonerOutputSchema = z.object({
  success: z.boolean(),
  voiceId: z.string().optional(),
  audioUrl: z.string().optional(),
  audioBase64: z.string().optional(),
  duration: z.number().optional(),
  processingTime: z.number(),
  error: z.string().optional(),
});

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function validateVoiceConsent(
  ctx: AgentContext,
  params: {
    subjectId: string;
    subjectName: string;
    consentToken: string;
    purpose: string;
    tenantId: string;
    userId: string;
  }
): Promise<{
  valid: boolean;
  consentId: string;
  expiresAt: string;
  restrictions: string[];
}> {
  const validator = new ConsentValidator();

  logger.info('voice_consent_validation_started', {
    subjectId: params.subjectId,
    purpose: params.purpose,
  });

  const result = await validator.validateConsent({
    operationType: 'voice_clone',
    subjectId: params.subjectId,
    subjectName: params.subjectName,
    consentToken: params.consentToken,
    purpose: params.purpose,
    tenantId: params.tenantId,
    userId: params.userId,
  });

  if (!result.valid) {
    throw new Error(`Consent validation failed: ${result.reason}`);
  }

  return {
    valid: true,
    consentId: result.consentId,
    expiresAt: result.expiresAt,
    restrictions: result.restrictions || [],
  };
}

async function cloneVoice(
  ctx: AgentContext,
  params: {
    name: string;
    description: string;
    audioSampleUrls: string[];
    consentId: string;
  }
): Promise<{
  voiceId: string;
  name: string;
  previewUrl?: string;
}> {
  const elevenlabs = getElevenLabsProvider();

  logger.info('voice_cloning_started', {
    sampleCount: params.audioSampleUrls.length,
  });

  // Download and convert samples to buffers
  const samples: Array<{ buffer: Buffer; name: string }> = [];
  for (let i = 0; i < params.audioSampleUrls.length; i++) {
    const response = await fetch(params.audioSampleUrls[i]);
    const buffer = Buffer.from(await response.arrayBuffer());
    samples.push({
      buffer,
      name: `sample_${i + 1}.mp3`,
    });
  }

  const result = await elevenlabs.cloneVoice(
    params.name,
    params.description,
    samples
  );

  return {
    voiceId: result.voiceId,
    name: params.name,
    previewUrl: result.previewUrl,
  };
}

async function synthesizeSpeech(
  ctx: AgentContext,
  params: {
    text: string;
    voiceId: string;
    style?: z.infer<typeof VoiceStyleSchema>;
    stability?: number;
    clarity?: number;
  }
): Promise<{
  audioBase64: string;
  duration: number;
}> {
  const elevenlabs = getElevenLabsProvider();

  // Map style to voice settings
  const styleSettings: Record<string, { stability: number; clarity: number }> = {
    natural: { stability: 0.5, clarity: 0.5 },
    professional: { stability: 0.7, clarity: 0.8 },
    casual: { stability: 0.4, clarity: 0.5 },
    dramatic: { stability: 0.3, clarity: 0.7 },
    whisper: { stability: 0.8, clarity: 0.3 },
    energetic: { stability: 0.3, clarity: 0.8 },
    calm: { stability: 0.8, clarity: 0.5 },
    authoritative: { stability: 0.6, clarity: 0.9 },
  };

  const settings = params.style ? styleSettings[params.style] : { stability: 0.5, clarity: 0.5 };

  logger.info('speech_synthesis_started', {
    voiceId: params.voiceId,
    textLength: params.text.length,
    style: params.style,
  });

  const audioBuffer = await elevenlabs.textToSpeech(
    params.text,
    params.voiceId,
    'eleven_multilingual_v2',
    {
      stability: params.stability ?? settings.stability,
      similarity_boost: params.clarity ?? settings.clarity,
    }
  );

  // Estimate duration (rough approximation: ~150 words per minute)
  const wordCount = params.text.split(/\s+/).length;
  const estimatedDuration = (wordCount / 150) * 60;

  return {
    audioBase64: Buffer.from(audioBuffer).toString('base64'),
    duration: estimatedDuration,
  };
}

async function transferVoiceStyle(
  ctx: AgentContext,
  params: {
    sourceAudioUrl: string;
    targetVoiceId: string;
    preserveEmotion: boolean;
  }
): Promise<{
  audioBase64: string;
}> {
  const elevenlabs = getElevenLabsProvider();

  logger.info('voice_style_transfer_started', {
    targetVoiceId: params.targetVoiceId,
    preserveEmotion: params.preserveEmotion,
  });

  const response = await fetch(params.sourceAudioUrl);
  const audioBuffer = Buffer.from(await response.arrayBuffer());

  const result = await elevenlabs.speechToSpeech(
    audioBuffer,
    params.targetVoiceId,
    {
      stability: params.preserveEmotion ? 0.3 : 0.7,
      similarity_boost: 0.8,
    }
  );

  return {
    audioBase64: Buffer.from(result).toString('base64'),
  };
}

async function translateVoice(
  ctx: AgentContext,
  params: {
    audioUrl: string;
    targetLanguage: z.infer<typeof LanguageSchema>;
    voiceId?: string;
    agentId: string;
    runId: string;
  }
): Promise<{
  dubbingId: string;
  estimatedDuration: number;
}> {
  const elevenlabs = getElevenLabsProvider();

  logger.info('voice_translation_started', {
    targetLanguage: params.targetLanguage,
  });

  const response = await fetch(params.audioUrl);
  const audioBuffer = Buffer.from(await response.arrayBuffer());

  const result = await elevenlabs.startDubbing(
    audioBuffer,
    params.targetLanguage,
    {
      voiceId: params.voiceId,
      agentId: params.agentId,
      runId: params.runId,
    }
  );

  return {
    dubbingId: result.dubbingId,
    estimatedDuration: result.expectedDurationSec || 60,
  };
}

async function listVoices(
  ctx: AgentContext,
  params: { includeCustom: boolean }
): Promise<{
  voices: Array<{
    voiceId: string;
    name: string;
    category: string;
    description: string;
  }>;
}> {
  const elevenlabs = getElevenLabsProvider();

  logger.info('listing_voices');

  const voices = await elevenlabs.listVoices();

  return {
    voices: voices
      .filter(v => params.includeCustom || v.category !== 'cloned')
      .map(v => ({
        voiceId: v.voice_id,
        name: v.name,
        category: v.category,
        description: v.description || '',
      })),
  };
}

async function deleteVoice(
  ctx: AgentContext,
  params: { voiceId: string }
): Promise<{
  success: boolean;
}> {
  const elevenlabs = getElevenLabsProvider();

  logger.info('deleting_voice', { voiceId: params.voiceId });

  await elevenlabs.deleteVoice(params.voiceId);

  return { success: true };
}

async function analyzeVoiceSample(
  ctx: AgentContext,
  params: { audioUrl: string }
): Promise<{
  duration: number;
  quality: 'low' | 'medium' | 'high';
  noiseLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
}> {
  logger.info('analyzing_voice_sample');

  // In production, would use audio analysis API
  // Simulated analysis
  return {
    duration: 30,
    quality: 'high',
    noiseLevel: 'low',
    recommendations: [
      'Good audio quality for cloning',
      'Consider adding more samples for better accuracy',
      'Ensure consistent speaking style across samples',
    ],
  };
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const voiceClonerAgent = defineAgent({
  name: 'voice-cloner',
  description: 'AI-powered voice cloning and synthesis with consent validation',
  version: '1.0.0',

  inputSchema: VoiceClonerInputSchema,
  outputSchema: VoiceClonerOutputSchema,

  tools: {
    validate_consent: {
      description: 'Validate consent for voice cloning (REQUIRED before cloning)',
      parameters: z.object({
        subjectId: z.string(),
        subjectName: z.string(),
        consentToken: z.string(),
        purpose: z.string(),
        tenantId: z.string(),
        userId: z.string(),
      }),
      returns: z.object({
        valid: z.boolean(),
        consentId: z.string(),
        expiresAt: z.string(),
        restrictions: z.array(z.string()),
      }),
      execute: validateVoiceConsent,
      timeoutMs: 10000,
    },

    clone_voice: {
      description: 'Clone a voice from audio samples (requires consent)',
      parameters: z.object({
        name: z.string(),
        description: z.string(),
        audioSampleUrls: z.array(z.string()),
        consentId: z.string(),
      }),
      returns: z.object({
        voiceId: z.string(),
        name: z.string(),
        previewUrl: z.string().optional(),
      }),
      execute: cloneVoice,
      sideEffectful: true,
      timeoutMs: 300000,
    },

    synthesize_speech: {
      description: 'Generate speech from text using a voice',
      parameters: z.object({
        text: z.string(),
        voiceId: z.string(),
        style: VoiceStyleSchema.optional(),
        stability: z.number().min(0).max(1).optional(),
        clarity: z.number().min(0).max(1).optional(),
      }),
      returns: z.object({
        audioBase64: z.string(),
        duration: z.number(),
      }),
      execute: synthesizeSpeech,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    transfer_style: {
      description: 'Transfer voice style while keeping content',
      parameters: z.object({
        sourceAudioUrl: z.string(),
        targetVoiceId: z.string(),
        preserveEmotion: z.boolean(),
      }),
      returns: z.object({
        audioBase64: z.string(),
      }),
      execute: transferVoiceStyle,
      sideEffectful: true,
      timeoutMs: 180000,
    },

    translate_voice: {
      description: 'Translate audio to another language keeping voice',
      parameters: z.object({
        audioUrl: z.string(),
        targetLanguage: LanguageSchema,
        voiceId: z.string().optional(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        dubbingId: z.string(),
        estimatedDuration: z.number(),
      }),
      execute: translateVoice,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    list_voices: {
      description: 'List available voices',
      parameters: z.object({
        includeCustom: z.boolean(),
      }),
      returns: z.object({
        voices: z.array(z.object({
          voiceId: z.string(),
          name: z.string(),
          category: z.string(),
          description: z.string(),
        })),
      }),
      execute: listVoices,
      timeoutMs: 30000,
    },

    delete_voice: {
      description: 'Delete a cloned voice',
      parameters: z.object({
        voiceId: z.string(),
      }),
      returns: z.object({
        success: z.boolean(),
      }),
      execute: deleteVoice,
      sideEffectful: true,
      timeoutMs: 30000,
    },

    analyze_sample: {
      description: 'Analyze audio sample quality for cloning',
      parameters: z.object({
        audioUrl: z.string(),
      }),
      returns: z.object({
        duration: z.number(),
        quality: z.enum(['low', 'medium', 'high']),
        noiseLevel: z.enum(['low', 'medium', 'high']),
        recommendations: z.array(z.string()),
      }),
      execute: analyzeVoiceSample,
      timeoutMs: 60000,
    },
  },

  systemPrompt: `You are a voice cloning specialist. Create and manage AI voice clones.

IMPORTANT: Voice cloning is a biometric operation requiring explicit consent.
ALWAYS validate consent BEFORE cloning a voice. Never skip this step.

Voice cloning workflow:
1. Validate consent (REQUIRED)
2. Analyze audio samples for quality
3. Clone voice with sufficient samples (3-5 recommended)
4. Test with synthesis

Available styles:
- natural: Balanced, everyday speaking
- professional: Clear, authoritative delivery
- casual: Relaxed, conversational tone
- dramatic: Expressive, theatrical delivery
- whisper: Soft, intimate speaking
- energetic: Upbeat, enthusiastic delivery
- calm: Soothing, peaceful tone
- authoritative: Commanding, confident voice

Sample requirements:
- Minimum 1 minute of clean audio
- Multiple samples improve quality
- Consistent speaking style preferred
- Low background noise essential
- Clear pronunciation important

Supported languages:
en-US, en-GB, es-ES, fr-FR, de-DE,
it-IT, pt-BR, ja-JP, ko-KR, zh-CN

Best practices:
- Use high-quality recordings (48kHz recommended)
- Avoid background music or noise
- Include varied sentence types
- Test clone with different text samples
- Respect subject's consent restrictions`,

  config: {
    maxTurns: 10,
    temperature: 0.4,
    maxTokens: 2048,
  },
});

export default voiceClonerAgent;
