/**
 * Face Swap Video Agent
 *
 * AI-powered face swapping for videos with consent validation.
 * Uses Replicate models for face detection and swapping.
 *
 * Features:
 * - Video face swap
 * - Consent validation (required for 'other' subjects)
 * - Multi-face support
 * - Quality enhancement
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import { getReplicateExtendedClient, REPLICATE_MODELS } from '../../../providers/replicate.js';
import { getConsentValidator, ConsentRequest, ConsentContext } from '../../../safety/consent.js';

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

const FaceSwapVideoInputSchema = z.object({
  sourceImageUrl: z.string().describe('URL of the source face image'),
  targetVideoUrl: z.string().describe('URL of the target video'),
  subjectType: SubjectTypeSchema.describe('Whose face is being swapped'),
  consentEvidence: ConsentEvidenceSchema.optional().describe('Consent evidence for non-self subjects'),
  purpose: z.string().min(1).max(500).describe('Purpose of the face swap'),
  intendedUse: z.string().optional().describe('How the result will be used'),
  faceIndex: z.number().default(0).describe('Which face to swap (if multiple detected)'),
  enhanceOutput: z.boolean().default(true).describe('Apply quality enhancement'),
});

const FaceSwapVideoOutputSchema = z.object({
  success: z.boolean(),
  consentValidation: z.object({
    valid: z.boolean(),
    logId: z.string(),
    restrictions: z.array(z.string()),
    requiresWatermark: z.boolean(),
    message: z.string().optional(),
  }),
  jobId: z.string().optional(),
  status: z.enum(['pending', 'processing', 'complete', 'failed', 'consent_denied']),
  videoUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  processingTime: z.number().optional(),
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
    intendedUse?: string;
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
    operationType: 'face_swap',
    subjectType: params.subjectType,
    consentEvidence: params.consentEvidence,
    purpose: params.purpose,
    intendedUse: params.intendedUse,
  };

  const context: ConsentContext = {
    runId: params.runId,
    agentId: params.agentId,
    tenantId: params.tenantId,
    userId: params.userId,
  };

  logger.info('consent_validation_started', {
    subjectType: params.subjectType,
    hasEvidence: !!params.consentEvidence,
  });

  const result = validator.validate(request, context);

  logger.info('consent_validation_completed', {
    valid: result.valid,
    restrictions: result.restrictions,
    requiresWatermark: result.requiresWatermark,
  });

  return result;
}

async function detectFaces(
  ctx: AgentContext,
  params: { imageUrl: string }
): Promise<{
  faceCount: number;
  faces: Array<{
    index: number;
    confidence: number;
    boundingBox: { x: number; y: number; width: number; height: number };
  }>;
}> {
  // In production, this would call a face detection API
  // For now, we simulate detection
  logger.info('face_detection_started', { hasUrl: !!params.imageUrl });

  // Simulated result
  return {
    faceCount: 1,
    faces: [
      {
        index: 0,
        confidence: 0.98,
        boundingBox: { x: 100, y: 80, width: 200, height: 250 },
      },
    ],
  };
}

async function swapFaceInVideo(
  ctx: AgentContext,
  params: {
    sourceImageUrl: string;
    targetVideoUrl: string;
    faceIndex: number;
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

  logger.info('face_swap_video_started', {
    faceIndex: params.faceIndex,
  });

  // Use face swap model for video
  // Note: This uses a video face swap model on Replicate
  return replicate.createTrackedPrediction(
    'yan-ops/face_swap_video:latest', // Video face swap model
    {
      source_image: params.sourceImageUrl,
      target_video: params.targetVideoUrl,
      face_index: params.faceIndex,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
      tenantId: params.tenantId,
      userId: params.userId,
    },
    { type: 'face_swap_video' }
  );
}

async function enhanceVideoFace(
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

  logger.info('face_enhancement_video_started');

  // Use video enhancement model
  return replicate.createTrackedPrediction(
    'lucataco/video-face-restoration:latest',
    {
      input_video: params.videoUrl,
    },
    {
      agentId: params.agentId,
      runId: params.runId,
    },
    { type: 'face_enhancement_video' }
  );
}

async function applyWatermark(
  ctx: AgentContext,
  params: {
    videoUrl: string;
    watermarkText: string;
  }
): Promise<{
  videoUrl: string;
}> {
  // In production, this would apply an actual watermark
  // For now, we simulate and return the same URL with a note
  logger.info('watermark_applied', { text: params.watermarkText });

  return {
    videoUrl: params.videoUrl, // Would be watermarked in production
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

  logger.info('waiting_for_job', { jobId: params.jobId });

  const prediction = await replicate.waitForTrackedPrediction(params.jobId, {
    maxWaitMs: 600000, // 10 minutes for video
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

export const faceSwapVideoAgent = defineAgent({
  name: 'face-swap-video',
  description: 'AI-powered face swapping for videos with mandatory consent validation',
  version: '1.0.0',

  inputSchema: FaceSwapVideoInputSchema,
  outputSchema: FaceSwapVideoOutputSchema,

  tools: {
    validate_consent: {
      description: 'Validate consent for face swap operation. MUST be called first for non-self subjects.',
      parameters: z.object({
        subjectType: SubjectTypeSchema,
        consentEvidence: ConsentEvidenceSchema.optional(),
        purpose: z.string(),
        intendedUse: z.string().optional(),
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

    detect_faces: {
      description: 'Detect faces in the source image',
      parameters: z.object({
        imageUrl: z.string(),
      }),
      returns: z.object({
        faceCount: z.number(),
        faces: z.array(z.object({
          index: z.number(),
          confidence: z.number(),
          boundingBox: z.object({
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
          }),
        })),
      }),
      execute: detectFaces,
      timeoutMs: 30000,
    },

    swap_face_video: {
      description: 'Perform face swap on video. Requires consent validation first.',
      parameters: z.object({
        sourceImageUrl: z.string(),
        targetVideoUrl: z.string(),
        faceIndex: z.number(),
        agentId: z.string(),
        runId: z.string(),
        tenantId: z.string().optional(),
        userId: z.string().optional(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: swapFaceInVideo,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    enhance_video_face: {
      description: 'Enhance face quality in the output video',
      parameters: z.object({
        videoUrl: z.string(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        jobId: z.string(),
        predictionId: z.string(),
      }),
      execute: enhanceVideoFace,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    apply_watermark: {
      description: 'Apply watermark to video (required for non-self subjects)',
      parameters: z.object({
        videoUrl: z.string(),
        watermarkText: z.string(),
      }),
      returns: z.object({
        videoUrl: z.string(),
      }),
      execute: applyWatermark,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    wait_for_job: {
      description: 'Wait for an async job to complete',
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

  systemPrompt: `You are an AI face swap video specialist with strict ethical guidelines.

CRITICAL: You MUST validate consent BEFORE performing any face swap operation on subjects other than 'self'.

Workflow:
1. FIRST: Call validate_consent with subject type and evidence
2. If consent is invalid for 'other' subjects, STOP and return the consent error
3. Detect faces in the source image
4. Perform the face swap
5. If requiresWatermark is true, apply watermark
6. Optionally enhance the output

Subject types:
- 'self': User is swapping their own face (no consent needed)
- 'other': Swapping someone else's face (REQUIRES explicit consent evidence)
- 'unknown': Unknown subject (restricted to personal use only)

Consent evidence types:
- 'explicit_checkbox': User checked a consent checkbox
- 'terms_acceptance': Subject accepted terms of service
- 'api_attestation': API caller attests to having consent
- 'verbal_recorded': Verbal consent was recorded
- 'written_document': Written consent document exists

Restrictions applied:
- 'no_commercial_without_license': Cannot use commercially without proper license
- 'personal_use_only': Restricted to personal use
- 'no_redistribution': Cannot share or redistribute
- 'watermark_applied': Visible watermark added
- 'attestation_recorded': Consent attestation logged

NEVER bypass consent requirements. Always log and validate before processing.`,

  config: {
    maxTurns: 10,
    temperature: 0.2,
    maxTokens: 2048,
  },
});

export default faceSwapVideoAgent;
