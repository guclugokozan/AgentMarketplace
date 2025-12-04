/**
 * Lipsync Studio Agent
 *
 * AI-powered lip synchronization for videos.
 * Syncs video with audio using Wav2Lip and similar models.
 *
 * Features:
 * - Video-to-audio lip sync
 * - Text-to-speech integration
 * - Multiple language support
 * - Quality enhancement
 * - Consent validation for biometric operations
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import { getReplicateExtendedClient, REPLICATE_MODELS } from '../../../providers/replicate.js';
import { getElevenLabsProvider } from '../../../providers/elevenlabs.js';
import { getConsentValidator, ConsentRequest, ConsentContext } from '../../../safety/consent.js';
import { getJobManager } from '../../../providers/job-manager.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const SubjectTypeSchema = z.enum(['self', 'other', 'unknown']);

const ConsentEvidenceSchema = z.object({
  type: z.enum([
    'explicit_checkbox',
    'terms_acceptance',
    'api_attestation',
    'verbal_recorded',
    'written_document',
    'none',
  ]),
  timestamp: z.string().datetime().optional(),
  reference: z.string().optional(),
});

const LipsyncInputSchema = z.object({
  videoUrl: z.string().describe('URL of the source video'),
  audioUrl: z.string().optional().describe('URL of audio to sync with'),
  text: z.string().optional().describe('Text to generate speech from (if no audio)'),
  voiceId: z.string().optional().describe('ElevenLabs voice ID for TTS'),
  language: z.string().default('en').describe('Language code'),
  subjectType: SubjectTypeSchema.describe('Whose face is in the video'),
  consentEvidence: ConsentEvidenceSchema.optional().describe('Consent evidence for non-self'),
  purpose: z.string().min(1).max(500).describe('Purpose of the lipsync'),
  enhanceAudio: z.boolean().default(true).describe('Enhance audio quality'),
  enhanceVideo: z.boolean().default(true).describe('Enhance video quality'),
});

const LipsyncOutputSchema = z.object({
  success: z.boolean(),
  consentValidation: z.object({
    valid: z.boolean(),
    logId: z.string(),
    restrictions: z.array(z.string()),
    requiresWatermark: z.boolean(),
    message: z.string().optional(),
  }).optional(),
  jobId: z.string().optional(),
  status: z.enum(['pending', 'processing', 'complete', 'failed', 'consent_denied']),
  videoUrl: z.string().optional(),
  audioUrl: z.string().optional(),
  duration: z.number().optional(),
  error: z.string().optional(),
});

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function validateConsent(
  ctx: AgentContext,
  params: {
    subjectType: 'self' | 'other' | 'unknown';
    consentEvidence?: z.infer<typeof ConsentEvidenceSchema>;
    purpose: string;
    runId: string;
    agentId: string;
    tenantId?: string;
    userId?: string;
  }
): Promise<{
  valid: boolean;
  logId: string;
  restrictions: string[];
  requiresWatermark: boolean;
  message?: string;
}> {
  const validator = getConsentValidator();

  const request: ConsentRequest = {
    operationType: 'lipsync',
    subjectType: params.subjectType,
    consentEvidence: params.consentEvidence,
    purpose: params.purpose,
  };

  const context: ConsentContext = {
    runId: params.runId,
    agentId: params.agentId,
    tenantId: params.tenantId,
    userId: params.userId,
  };

  logger.info('lipsync_consent_validation', {
    subjectType: params.subjectType,
    hasEvidence: !!params.consentEvidence,
  });

  return validator.validate(request, context);
}

async function generateSpeech(
  ctx: AgentContext,
  params: {
    text: string;
    voiceId?: string;
    language?: string;
  }
): Promise<{
  audioBase64: string;
  duration: number;
  voiceUsed: string;
}> {
  const elevenlabs = getElevenLabsProvider();

  logger.info('tts_generation_started', {
    textLength: params.text.length,
    hasVoiceId: !!params.voiceId,
  });

  // Get default voice if not specified
  let voiceId = params.voiceId;
  if (!voiceId) {
    const voices = await elevenlabs.getVoices();
    voiceId = voices[0]?.voiceId || 'default';
  }

  const audioBuffer = await elevenlabs.textToSpeech({
    text: params.text,
    voiceId,
    modelId: 'eleven_multilingual_v2',
    stability: 0.5,
    similarityBoost: 0.75,
  });

  const audioBase64 = Buffer.from(audioBuffer).toString('base64');

  // Estimate duration (rough calculation)
  const estimatedDuration = params.text.length * 0.05; // ~50ms per character

  return {
    audioBase64,
    duration: estimatedDuration,
    voiceUsed: voiceId,
  };
}

async function performLipsync(
  ctx: AgentContext,
  params: {
    videoUrl: string;
    audioUrl: string;
    agentId: string;
    runId: string;
    tenantId?: string;
    userId?: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('lipsync_started', {
    hasVideo: !!params.videoUrl,
    hasAudio: !!params.audioUrl,
  });

  // Use Wav2Lip model for lip sync
  return replicate.createTrackedPrediction(
    'devxpy/wav2lip:latest',
    {
      face: params.videoUrl,
      audio: params.audioUrl,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
      tenantId: params.tenantId,
      userId: params.userId,
    },
    { type: 'lipsync' }
  );
}

async function enhanceVideoQuality(
  ctx: AgentContext,
  params: {
    videoUrl: string;
    agentId: string;
    runId: string;
  }
): Promise<{
  jobId: string;
  predictionId: string;
}> {
  const replicate = getReplicateExtendedClient();

  logger.info('video_enhancement_started');

  return replicate.createTrackedPrediction(
    'lucataco/real-esrgan-video:latest',
    {
      video_path: params.videoUrl,
      face_enhance: true,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'video_enhancement' }
  );
}

async function getAvailableVoices(
  ctx: AgentContext,
  params: {}
): Promise<{
  voices: Array<{
    voiceId: string;
    name: string;
    category: string;
    previewUrl?: string;
  }>;
}> {
  const elevenlabs = getElevenLabsProvider();
  const voices = await elevenlabs.getVoices();

  return {
    voices: voices.map(v => ({
      voiceId: v.voiceId,
      name: v.name,
      category: v.category,
      previewUrl: v.previewUrl,
    })),
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

  const prediction = await replicate.waitForTrackedPrediction(params.jobId, {
    maxWaitMs: 600000,
  });

  return {
    status: prediction.status,
    output: prediction.output,
    error: prediction.error,
  };
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const lipsyncStudioAgent = defineAgent({
  name: 'lipsync-studio',
  description: 'AI-powered lip synchronization for videos with TTS and consent validation',
  version: '1.0.0',

  inputSchema: LipsyncInputSchema,
  outputSchema: LipsyncOutputSchema,

  tools: {
    validate_consent: {
      description: 'Validate consent for lipsync operation. Required for non-self subjects.',
      parameters: z.object({
        subjectType: SubjectTypeSchema,
        consentEvidence: ConsentEvidenceSchema.optional(),
        purpose: z.string(),
        runId: z.string(),
        agentId: z.string(),
        tenantId: z.string().optional(),
        userId: z.string().optional(),
      }),
      returns: z.object({
        valid: z.boolean(),
        logId: z.string(),
        restrictions: z.array(z.string()),
        requiresWatermark: z.boolean(),
        message: z.string().optional(),
      }),
      execute: validateConsent,
      timeoutMs: 10000,
    },

    generate_speech: {
      description: 'Generate speech from text using ElevenLabs TTS',
      parameters: z.object({
        text: z.string(),
        voiceId: z.string().optional(),
        language: z.string().optional(),
      }),
      returns: z.object({
        audioBase64: z.string(),
        duration: z.number(),
        voiceUsed: z.string(),
      }),
      execute: generateSpeech,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    perform_lipsync: {
      description: 'Sync video with audio using Wav2Lip',
      parameters: z.object({
        videoUrl: z.string(),
        audioUrl: z.string(),
        agentId: z.string(),
        runId: z.string(),
        tenantId: z.string().optional(),
        userId: z.string().optional(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: performLipsync,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    enhance_video: {
      description: 'Enhance video quality after lipsync',
      parameters: z.object({
        videoUrl: z.string(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: enhanceVideoQuality,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    get_voices: {
      description: 'Get available ElevenLabs voices',
      parameters: z.object({}),
      returns: z.object({
        voices: z.array(z.object({
          voiceId: z.string(),
          name: z.string(),
          category: z.string(),
          previewUrl: z.string().optional(),
        })),
      }),
      execute: getAvailableVoices,
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
      timeoutMs: 660000,
    },
  },

  systemPrompt: `You are an AI lipsync specialist. Your role is to synchronize video lip movements with audio.

CRITICAL: Validate consent BEFORE processing videos with faces of others.

Workflow:
1. If subjectType is 'other': MUST validate consent first
2. If no audio provided but text given: Generate speech with TTS
3. Perform lip synchronization
4. Optionally enhance video quality
5. Apply watermark if required

Best practices:
- Use high-quality source videos with clear face visibility
- Ensure audio is clean and at appropriate volume
- Match audio duration to video duration
- Use ElevenLabs voices for natural-sounding TTS

Voice selection tips:
- Corporate/professional: Use calm, authoritative voices
- Entertainment: Use expressive, dynamic voices
- Educational: Use clear, well-paced voices

Quality considerations:
- Source video should have good lighting on face
- Face should be clearly visible and not occluded
- Audio should be noise-free
- Lip sync works best with frontal or near-frontal faces

Remember: Always prioritize ethical use and proper consent.`,

  config: {
    maxTurns: 10,
    temperature: 0.3,
    maxTokens: 2048,
  },
});

export default lipsyncStudioAgent;
