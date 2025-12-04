/**
 * Provider Configuration
 *
 * Centralized configuration for external AI/ML service providers.
 * Each agent specifies which providers it needs.
 */

import { createLogger } from '../logging/logger.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// PROVIDER TYPES
// =============================================================================

export type ProviderType =
  | 'llm'
  | 'image-generation'
  | 'image-editing'
  | 'virtual-tryon'
  | 'face-processing'
  | 'transcription'
  | 'translation'
  | 'ocr'
  | 'tts'
  | 'storage';

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  envKey: string;
  baseUrl?: string;
  models?: string[];
  rateLimit?: {
    requests: number;
    windowMs: number;
  };
  timeout?: number;
  retries?: number;
}

// =============================================================================
// PROVIDER DEFINITIONS
// =============================================================================

export const PROVIDERS: Record<string, ProviderConfig> = {
  // LLM Providers
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    type: 'llm',
    envKey: 'ANTHROPIC_API_KEY',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-opus-4-5-20250514', 'claude-sonnet-4-5-20250514', 'claude-haiku-3-5-20241022'],
    rateLimit: { requests: 1000, windowMs: 60000 },
    timeout: 120000,
    retries: 3,
  },

  openai: {
    id: 'openai',
    name: 'OpenAI',
    type: 'llm',
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'whisper-1'],
    rateLimit: { requests: 500, windowMs: 60000 },
    timeout: 60000,
    retries: 3,
  },

  // Image Generation
  replicate: {
    id: 'replicate',
    name: 'Replicate',
    type: 'image-generation',
    envKey: 'REPLICATE_API_TOKEN',
    baseUrl: 'https://api.replicate.com/v1',
    models: [
      'stability-ai/sdxl',
      'cuuupid/idm-vton', // Virtual try-on
      'tencentarc/gfpgan', // Face enhancement
      'lucataco/ai-headshot-generator',
      'black-forest-labs/flux-schnell',
    ],
    rateLimit: { requests: 100, windowMs: 60000 },
    timeout: 300000, // 5 minutes for image generation
    retries: 2,
  },

  stability: {
    id: 'stability',
    name: 'Stability AI',
    type: 'image-generation',
    envKey: 'STABILITY_API_KEY',
    baseUrl: 'https://api.stability.ai/v1',
    models: ['stable-diffusion-xl-1024-v1-0', 'stable-diffusion-v1-6'],
    rateLimit: { requests: 150, windowMs: 60000 },
    timeout: 120000,
    retries: 2,
  },

  // Transcription
  assemblyai: {
    id: 'assemblyai',
    name: 'AssemblyAI',
    type: 'transcription',
    envKey: 'ASSEMBLYAI_API_KEY',
    baseUrl: 'https://api.assemblyai.com/v2',
    rateLimit: { requests: 100, windowMs: 60000 },
    timeout: 600000, // 10 minutes for long audio
    retries: 2,
  },

  // Translation
  deepl: {
    id: 'deepl',
    name: 'DeepL',
    type: 'translation',
    envKey: 'DEEPL_API_KEY',
    baseUrl: 'https://api-free.deepl.com/v2',
    rateLimit: { requests: 100, windowMs: 60000 },
    timeout: 30000,
    retries: 3,
  },

  // OCR
  'google-vision': {
    id: 'google-vision',
    name: 'Google Cloud Vision',
    type: 'ocr',
    envKey: 'GOOGLE_CLOUD_VISION_KEY',
    baseUrl: 'https://vision.googleapis.com/v1',
    rateLimit: { requests: 1800, windowMs: 60000 },
    timeout: 30000,
    retries: 3,
  },

  // TTS
  elevenlabs: {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    type: 'tts',
    envKey: 'ELEVENLABS_API_KEY',
    baseUrl: 'https://api.elevenlabs.io/v1',
    rateLimit: { requests: 100, windowMs: 60000 },
    timeout: 60000,
    retries: 2,
  },

  // Storage
  s3: {
    id: 's3',
    name: 'AWS S3',
    type: 'storage',
    envKey: 'AWS_ACCESS_KEY_ID',
    timeout: 30000,
    retries: 3,
  },

  r2: {
    id: 'r2',
    name: 'Cloudflare R2',
    type: 'storage',
    envKey: 'R2_ACCESS_KEY_ID',
    timeout: 30000,
    retries: 3,
  },
};

// =============================================================================
// AGENT PROVIDER REQUIREMENTS
// =============================================================================

export interface AgentProviderRequirements {
  required: string[];
  optional: string[];
  fallbacks: Record<string, string[]>;
}

export const AGENT_PROVIDERS: Record<string, AgentProviderRequirements> = {
  // Analytics
  'smart-data-analyzer': {
    required: ['anthropic'],
    optional: [],
    fallbacks: {},
  },
  'data-visualization': {
    required: ['anthropic'],
    optional: [],
    fallbacks: {},
  },

  // E-commerce
  'virtual-try-on': {
    required: ['anthropic', 'replicate'],
    optional: ['stability'],
    fallbacks: { replicate: ['stability'] },
  },
  'ai-model-swap': {
    required: ['anthropic', 'replicate'],
    optional: [],
    fallbacks: {},
  },
  'ai-background-generator': {
    required: ['anthropic', 'replicate'],
    optional: ['stability'],
    fallbacks: { replicate: ['stability'] },
  },
  'product-description-writer': {
    required: ['anthropic'],
    optional: [],
    fallbacks: {},
  },

  // Creative
  'chibi-sticker-maker': {
    required: ['anthropic', 'replicate'],
    optional: ['stability'],
    fallbacks: { replicate: ['stability'] },
  },
  'pro-headshot-generator': {
    required: ['anthropic', 'replicate'],
    optional: [],
    fallbacks: {},
  },

  // Productivity
  'resume-builder': {
    required: ['anthropic'],
    optional: [],
    fallbacks: {},
  },
  'meeting-transcriber': {
    required: ['anthropic', 'openai'], // Whisper
    optional: ['assemblyai'],
    fallbacks: { openai: ['assemblyai'] },
  },
  'email-template-generator': {
    required: ['anthropic'],
    optional: [],
    fallbacks: {},
  },

  // Marketing
  'seo-content-optimizer': {
    required: ['anthropic'],
    optional: [],
    fallbacks: {},
  },
  'social-media-caption-generator': {
    required: ['anthropic'],
    optional: [],
    fallbacks: {},
  },

  // Translation
  'image-translator': {
    required: ['anthropic', 'openai'],
    optional: [],
    fallbacks: {},
  },

  // Content
  'video-script-generator': {
    required: ['anthropic'],
    optional: [],
    fallbacks: {},
  },

  // Business
  'customer-support-bot': {
    required: ['anthropic'],
    optional: [],
    fallbacks: {},
  },
};

// =============================================================================
// PROVIDER VALIDATION
// =============================================================================

export interface ProviderStatus {
  id: string;
  available: boolean;
  reason?: string;
}

export function validateProviderEnv(): {
  valid: boolean;
  providers: ProviderStatus[];
  missingRequired: string[];
  missingOptional: string[];
} {
  const providers: ProviderStatus[] = [];
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  // Always required
  const coreRequired = ['anthropic'];

  for (const [id, config] of Object.entries(PROVIDERS)) {
    const hasEnvKey = !!process.env[config.envKey];

    // Check additional env vars for S3
    let available = hasEnvKey;
    if (id === 's3' && hasEnvKey) {
      available = !!process.env.AWS_SECRET_ACCESS_KEY && !!process.env.S3_BUCKET;
    }
    if (id === 'r2' && hasEnvKey) {
      available = !!process.env.R2_SECRET_ACCESS_KEY && !!process.env.R2_BUCKET;
    }

    providers.push({
      id,
      available,
      reason: available ? undefined : `Missing ${config.envKey}`,
    });

    if (!available) {
      if (coreRequired.includes(id)) {
        missingRequired.push(id);
      } else {
        missingOptional.push(id);
      }
    }
  }

  const valid = missingRequired.length === 0;

  if (!valid) {
    logger.error('provider_validation_failed', { missingRequired });
  } else if (missingOptional.length > 0) {
    logger.warn('optional_providers_unavailable', { missingOptional });
  }

  return { valid, providers, missingRequired, missingOptional };
}

/**
 * Check if all required providers for an agent are available
 */
export function checkAgentProviders(agentId: string): {
  canRun: boolean;
  missing: string[];
  available: string[];
  usingFallbacks: Record<string, string>;
} {
  const requirements = AGENT_PROVIDERS[agentId];
  if (!requirements) {
    return { canRun: true, missing: [], available: [], usingFallbacks: {} };
  }

  const missing: string[] = [];
  const available: string[] = [];
  const usingFallbacks: Record<string, string> = {};

  for (const providerId of requirements.required) {
    const config = PROVIDERS[providerId];
    if (!config) {
      missing.push(providerId);
      continue;
    }

    const hasProvider = !!process.env[config.envKey];
    if (hasProvider) {
      available.push(providerId);
    } else {
      // Check fallbacks
      const fallbacks = requirements.fallbacks[providerId] || [];
      let foundFallback = false;

      for (const fallbackId of fallbacks) {
        const fallbackConfig = PROVIDERS[fallbackId];
        if (fallbackConfig && process.env[fallbackConfig.envKey]) {
          usingFallbacks[providerId] = fallbackId;
          available.push(fallbackId);
          foundFallback = true;
          break;
        }
      }

      if (!foundFallback) {
        missing.push(providerId);
      }
    }
  }

  return {
    canRun: missing.length === 0,
    missing,
    available,
    usingFallbacks,
  };
}

/**
 * Get provider configuration
 */
export function getProvider(id: string): ProviderConfig | undefined {
  return PROVIDERS[id];
}

/**
 * Get API key for a provider
 */
export function getProviderApiKey(id: string): string | undefined {
  const config = PROVIDERS[id];
  if (!config) return undefined;
  return process.env[config.envKey];
}

/**
 * Get estimated cost per operation for an agent
 */
export function getAgentCostEstimate(agentId: string): {
  minCost: number;
  maxCost: number;
  currency: 'USD';
} {
  const estimates: Record<string, { min: number; max: number }> = {
    'smart-data-analyzer': { min: 0.01, max: 0.10 },
    'data-visualization': { min: 0.01, max: 0.10 },
    'virtual-try-on': { min: 0.05, max: 0.30 },
    'ai-model-swap': { min: 0.05, max: 0.30 },
    'ai-background-generator': { min: 0.02, max: 0.15 },
    'product-description-writer': { min: 0.01, max: 0.05 },
    'chibi-sticker-maker': { min: 0.02, max: 0.20 },
    'pro-headshot-generator': { min: 0.05, max: 0.25 },
    'resume-builder': { min: 0.02, max: 0.10 },
    'meeting-transcriber': { min: 0.01, max: 0.50 }, // Depends on audio length
    'email-template-generator': { min: 0.01, max: 0.05 },
    'seo-content-optimizer': { min: 0.02, max: 0.10 },
    'social-media-caption-generator': { min: 0.01, max: 0.05 },
    'image-translator': { min: 0.02, max: 0.15 },
    'video-script-generator': { min: 0.02, max: 0.10 },
    'customer-support-bot': { min: 0.01, max: 0.05 },
  };

  const estimate = estimates[agentId] || { min: 0.01, max: 0.10 };
  return { minCost: estimate.min, maxCost: estimate.max, currency: 'USD' };
}
