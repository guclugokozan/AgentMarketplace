/**
 * Replicate API Client
 *
 * Handles all interactions with Replicate for image generation,
 * face processing, and virtual try-on operations.
 */

import { createLogger } from '../logging/logger.js';
import { getProviderApiKey, getProvider } from '../config/providers.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// TYPES
// =============================================================================

export interface ReplicatePrediction {
  id: string;
  version: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  input: Record<string, unknown>;
  output: unknown;
  error?: string;
  logs?: string;
  metrics?: {
    predict_time?: number;
  };
  created_at: string;
  started_at?: string;
  completed_at?: string;
  urls: {
    get: string;
    cancel: string;
  };
}

export interface ReplicateModel {
  id: string;
  owner: string;
  name: string;
  description: string;
  visibility: string;
  latest_version?: {
    id: string;
    created_at: string;
  };
}

export interface PredictionInput {
  version: string;
  input: Record<string, unknown>;
  webhook?: string;
  webhook_events_filter?: ('start' | 'output' | 'logs' | 'completed')[];
}

// =============================================================================
// CLIENT
// =============================================================================

export class ReplicateClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor() {
    const apiKey = getProviderApiKey('replicate');
    if (!apiKey) {
      throw new Error('REPLICATE_API_TOKEN environment variable is required');
    }

    const config = getProvider('replicate');
    this.apiKey = apiKey;
    this.baseUrl = config?.baseUrl || 'https://api.replicate.com/v1';
    this.timeout = config?.timeout || 300000;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Token ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error('replicate_api_error', {
          status: response.status,
          body: errorBody,
          endpoint,
        });
        throw new Error(`Replicate API error: ${response.status} - ${errorBody}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Replicate API request timed out');
      }
      throw error;
    }
  }

  /**
   * Create a new prediction (async)
   */
  async createPrediction(input: PredictionInput): Promise<ReplicatePrediction> {
    logger.info('replicate_create_prediction', {
      version: input.version,
      hasWebhook: !!input.webhook,
    });

    return this.request<ReplicatePrediction>('/predictions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * Get prediction status
   */
  async getPrediction(id: string): Promise<ReplicatePrediction> {
    return this.request<ReplicatePrediction>(`/predictions/${id}`);
  }

  /**
   * Cancel a prediction
   */
  async cancelPrediction(id: string): Promise<ReplicatePrediction> {
    return this.request<ReplicatePrediction>(`/predictions/${id}/cancel`, {
      method: 'POST',
    });
  }

  /**
   * Wait for prediction to complete (polling)
   */
  async waitForPrediction(
    id: string,
    options?: {
      maxWaitMs?: number;
      pollIntervalMs?: number;
      onProgress?: (prediction: ReplicatePrediction) => void;
    }
  ): Promise<ReplicatePrediction> {
    const maxWaitMs = options?.maxWaitMs || this.timeout;
    const pollIntervalMs = options?.pollIntervalMs || 2000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const prediction = await this.getPrediction(id);

      if (options?.onProgress) {
        options.onProgress(prediction);
      }

      if (prediction.status === 'succeeded' || prediction.status === 'failed' || prediction.status === 'canceled') {
        return prediction;
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Prediction ${id} timed out after ${maxWaitMs}ms`);
  }

  /**
   * Run prediction and wait for result (synchronous helper)
   */
  async run(
    version: string,
    input: Record<string, unknown>,
    options?: {
      maxWaitMs?: number;
      onProgress?: (prediction: ReplicatePrediction) => void;
    }
  ): Promise<ReplicatePrediction> {
    const prediction = await this.createPrediction({ version, input });

    logger.info('replicate_prediction_started', {
      id: prediction.id,
      version,
    });

    return this.waitForPrediction(prediction.id, options);
  }

  /**
   * Get model information
   */
  async getModel(owner: string, name: string): Promise<ReplicateModel> {
    return this.request<ReplicateModel>(`/models/${owner}/${name}`);
  }

  /**
   * List predictions
   */
  async listPredictions(cursor?: string): Promise<{
    results: ReplicatePrediction[];
    next?: string;
    previous?: string;
  }> {
    const query = cursor ? `?cursor=${cursor}` : '';
    return this.request(`/predictions${query}`);
  }
}

// =============================================================================
// MODEL VERSIONS
// =============================================================================

export const REPLICATE_MODELS = {
  // AI Headshot Generator
  'ai-headshot': {
    owner: 'lucataco',
    name: 'ai-headshot-generator',
    version: 'c7d47f4e4d5c80f47854b7373d7db0fd63e1dbc35f5f91d4d91a9e3c59b2c4b7',
  },

  // Virtual Try-On (IDM-VTON)
  'virtual-tryon': {
    owner: 'cuuupid',
    name: 'idm-vton',
    version: 'c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4',
  },

  // Face Enhancement (GFPGAN)
  'face-enhancement': {
    owner: 'tencentarc',
    name: 'gfpgan',
    version: '9283608cc6b7be6b65a8e44983db012355fde4132009bf99d976b2f0896856a3',
  },

  // Background Removal
  'background-removal': {
    owner: 'cjwbw',
    name: 'rembg',
    version: 'fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003',
  },

  // FLUX Schnell (fast image generation)
  'flux-schnell': {
    owner: 'black-forest-labs',
    name: 'flux-schnell',
    version: 'f2ab8a5bfe79f02f0b2f8d2c8e17fc0fd6e3d579f0f2d8d4f00f67c4f7c8a9b0',
  },

  // SDXL
  'sdxl': {
    owner: 'stability-ai',
    name: 'sdxl',
    version: '39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
  },

  // Real-ESRGAN (upscaling)
  'upscaler': {
    owner: 'nightmareai',
    name: 'real-esrgan',
    version: '42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b',
  },

  // Face Swap
  'face-swap': {
    owner: 'lucataco',
    name: 'faceswap',
    version: '9a4298548422074c3f57258c5d544497314ae4112df80d116f0d2109e843d20d',
  },
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert base64 to data URI
 */
export function base64ToDataUri(base64: string, mimeType = 'image/png'): string {
  if (base64.startsWith('data:')) {
    return base64;
  }
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Convert URL to base64 (for Replicate inputs)
 */
export async function urlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const contentType = response.headers.get('content-type') || 'image/png';
  return `data:${contentType};base64,${base64}`;
}

/**
 * Validate image URL or base64
 */
export function isValidImageInput(input: string): boolean {
  return (
    input.startsWith('http://') ||
    input.startsWith('https://') ||
    input.startsWith('data:image/')
  );
}

// Singleton instance
let clientInstance: ReplicateClient | null = null;

export function getReplicateClient(): ReplicateClient {
  if (!clientInstance) {
    clientInstance = new ReplicateClient();
  }
  return clientInstance;
}

// =============================================================================
// EXTENDED REPLICATE CLIENT WITH JOB MANAGEMENT
// =============================================================================

import { getJobManager, type JobCreateParams } from './job-manager.js';

export class ReplicateExtendedClient extends ReplicateClient {
  /**
   * Create prediction with job tracking
   */
  async createTrackedPrediction(
    version: string,
    input: Record<string, unknown>,
    context: { agentId: string; runId: string; tenantId?: string; userId?: string },
    metadata?: Record<string, unknown>
  ): Promise<{ jobId: string; predictionId: string }> {
    const prediction = await this.createPrediction({ version, input });

    const jobManager = getJobManager();
    const jobId = jobManager.create({
      provider: 'replicate',
      externalJobId: prediction.id,
      agentId: context.agentId,
      runId: context.runId,
      tenantId: context.tenantId,
      userId: context.userId,
      metadata: { version, ...metadata },
    });

    return { jobId, predictionId: prediction.id };
  }

  /**
   * Wait for prediction with job status updates
   */
  async waitForTrackedPrediction(
    jobId: string,
    options?: {
      maxWaitMs?: number;
      pollIntervalMs?: number;
      onProgress?: (prediction: ReplicatePrediction) => void;
    }
  ): Promise<ReplicatePrediction> {
    const jobManager = getJobManager();
    const job = jobManager.getStatus(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const prediction = await this.waitForPrediction(job.externalJobId, {
      ...options,
      onProgress: (p) => {
        if (p.status === 'processing') {
          jobManager.updateProgress(jobId, 50);
        }
        options?.onProgress?.(p);
      },
    });

    if (prediction.status === 'succeeded') {
      const outputUrl = this.extractOutputUrl(prediction.output);
      jobManager.complete(
        jobId,
        outputUrl || '',
        { output: prediction.output, logs: prediction.logs },
        prediction.metrics?.predict_time ? prediction.metrics.predict_time * 0.001 : undefined
      );
    } else if (prediction.status === 'failed') {
      jobManager.fail(jobId, prediction.error || 'Unknown error');
    } else if (prediction.status === 'canceled') {
      jobManager.cancel(jobId);
    }

    return prediction;
  }

  /**
   * Face swap between two images
   */
  async faceSwap(
    sourceImageUrl: string,
    targetImageUrl: string,
    context: { agentId: string; runId: string; tenantId?: string; userId?: string }
  ): Promise<{ jobId: string; predictionId: string }> {
    return this.createTrackedPrediction(
      REPLICATE_MODELS['face-swap'].version,
      {
        source_image: sourceImageUrl,
        target_image: targetImageUrl,
      },
      context,
      { type: 'face_swap' }
    );
  }

  /**
   * Upscale image with Real-ESRGAN
   */
  async upscaleImage(
    imageUrl: string,
    scale: 2 | 4 = 4,
    context: { agentId: string; runId: string; tenantId?: string; userId?: string }
  ): Promise<{ jobId: string; predictionId: string }> {
    return this.createTrackedPrediction(
      REPLICATE_MODELS['upscaler'].version,
      {
        image: imageUrl,
        scale,
        face_enhance: true,
      },
      context,
      { type: 'upscale', scale }
    );
  }

  /**
   * Generate AI headshot
   */
  async generateHeadshot(
    imageUrl: string,
    context: { agentId: string; runId: string; tenantId?: string; userId?: string }
  ): Promise<{ jobId: string; predictionId: string }> {
    return this.createTrackedPrediction(
      REPLICATE_MODELS['ai-headshot'].version,
      { image: imageUrl },
      context,
      { type: 'headshot' }
    );
  }

  /**
   * Virtual try-on
   */
  async virtualTryOn(
    personImageUrl: string,
    garmentImageUrl: string,
    context: { agentId: string; runId: string; tenantId?: string; userId?: string }
  ): Promise<{ jobId: string; predictionId: string }> {
    return this.createTrackedPrediction(
      REPLICATE_MODELS['virtual-tryon'].version,
      {
        human_img: personImageUrl,
        garm_img: garmentImageUrl,
        category: 'upper_body',
      },
      context,
      { type: 'virtual_tryon' }
    );
  }

  /**
   * Remove background from image
   */
  async removeBackground(
    imageUrl: string,
    context: { agentId: string; runId: string; tenantId?: string; userId?: string }
  ): Promise<{ jobId: string; predictionId: string }> {
    return this.createTrackedPrediction(
      REPLICATE_MODELS['background-removal'].version,
      { image: imageUrl },
      context,
      { type: 'background_removal' }
    );
  }

  /**
   * Enhance face quality
   */
  async enhanceFace(
    imageUrl: string,
    context: { agentId: string; runId: string; tenantId?: string; userId?: string }
  ): Promise<{ jobId: string; predictionId: string }> {
    return this.createTrackedPrediction(
      REPLICATE_MODELS['face-enhancement'].version,
      {
        img: imageUrl,
        version: 'v1.4',
        scale: 2,
      },
      context,
      { type: 'face_enhancement' }
    );
  }

  /**
   * Generate image with FLUX
   */
  async generateFluxImage(
    prompt: string,
    options: {
      aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
      numOutputs?: number;
    } = {},
    context: { agentId: string; runId: string; tenantId?: string; userId?: string }
  ): Promise<{ jobId: string; predictionId: string }> {
    return this.createTrackedPrediction(
      REPLICATE_MODELS['flux-schnell'].version,
      {
        prompt,
        aspect_ratio: options.aspectRatio || '1:1',
        num_outputs: options.numOutputs || 1,
      },
      context,
      { type: 'flux_generation' }
    );
  }

  /**
   * Generate image with SDXL
   */
  async generateSdxlImage(
    prompt: string,
    options: {
      negativePrompt?: string;
      width?: number;
      height?: number;
      numOutputs?: number;
    } = {},
    context: { agentId: string; runId: string; tenantId?: string; userId?: string }
  ): Promise<{ jobId: string; predictionId: string }> {
    return this.createTrackedPrediction(
      REPLICATE_MODELS['sdxl'].version,
      {
        prompt,
        negative_prompt: options.negativePrompt,
        width: options.width || 1024,
        height: options.height || 1024,
        num_outputs: options.numOutputs || 1,
      },
      context,
      { type: 'sdxl_generation' }
    );
  }

  /**
   * Extract URL from output (handles various formats)
   */
  private extractOutputUrl(output: unknown): string | undefined {
    if (!output) return undefined;
    if (typeof output === 'string') return output;
    if (Array.isArray(output) && output.length > 0) {
      return typeof output[0] === 'string' ? output[0] : output[0]?.url;
    }
    if (typeof output === 'object' && 'url' in (output as object)) {
      return (output as { url: string }).url;
    }
    return undefined;
  }

  /**
   * Get estimated cost (rough, varies by model)
   */
  getEstimatedCost(model: keyof typeof REPLICATE_MODELS, predictTimeSeconds: number = 10): number {
    const ratesPerSecond: Record<string, number> = {
      cpu: 0.0001,
      't4': 0.00055,
      'a40-small': 0.00115,
      'a40-large': 0.00195,
    };

    // Most models use A40
    const rate = ratesPerSecond['a40-small'];
    return rate * predictTimeSeconds;
  }
}

// Extended client singleton
let extendedClientInstance: ReplicateExtendedClient | null = null;

export function getReplicateExtendedClient(): ReplicateExtendedClient {
  if (!extendedClientInstance) {
    extendedClientInstance = new ReplicateExtendedClient();
  }
  return extendedClientInstance;
}

export default ReplicateClient;
