/**
 * Runway ML Provider
 *
 * Handles Gen-2/Gen-3 video generation, image-to-video, and video editing.
 */

import { BaseProvider, ProviderConfig, requireApiKey } from './base.js';
import { getJobManager } from './job-manager.js';

// Types
export interface RunwayGenerateParams {
  prompt: string;
  model?: 'gen2' | 'gen3';
  duration?: 4 | 8 | 16;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  seed?: number;
  interpolate?: boolean;
  upscale?: boolean;
}

export interface RunwayImageToVideoParams {
  imageUrl: string;
  prompt?: string;
  model?: 'gen2' | 'gen3';
  duration?: 4 | 8;
  motionAmount?: number;
  seed?: number;
}

export interface RunwayVideoToVideoParams {
  videoUrl: string;
  prompt: string;
  model?: 'gen2';
  strength?: number;
  seed?: number;
}

export interface RunwayJobStatus {
  id: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  progress: number;
  outputUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

interface RunwayCreateResponse {
  id: string;
  status: string;
}

interface RunwayStatusResponse {
  id: string;
  status: string;
  progress?: number;
  output?: Array<{ url: string }>;
  thumbnail?: string;
  error?: { message: string };
  createdAt: string;
  completedAt?: string;
}

export class RunwayProvider extends BaseProvider {
  constructor(config?: Partial<ProviderConfig>) {
    super('Runway', {
      apiKey: config?.apiKey || requireApiKey('RUNWAY_API_KEY', 'Runway ML'),
      baseUrl: config?.baseUrl || 'https://api.runwayml.com/v1',
      timeout: config?.timeout || 300000, // 5 minutes
      ...config,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      'X-Runway-Version': '2024-09-13',
    };
  }

  /**
   * Generate video from text prompt
   */
  async generateVideo(
    params: RunwayGenerateParams,
    context: { agentId: string; runId: string; tenantId?: string; userId?: string }
  ): Promise<{ jobId: string; externalId: string }> {
    const response = await this.fetchWithRetry<RunwayCreateResponse>(
      `${this.config.baseUrl}/generations`,
      {
        method: 'POST',
        body: JSON.stringify({
          model: params.model || 'gen3',
          prompt: params.prompt,
          duration: params.duration || 4,
          aspect_ratio: params.aspectRatio || '16:9',
          seed: params.seed,
          interpolate: params.interpolate,
          upscale: params.upscale,
        }),
      }
    );

    // Create job record
    const jobManager = getJobManager();
    const jobId = jobManager.create({
      provider: 'runway',
      externalJobId: response.id,
      agentId: context.agentId,
      runId: context.runId,
      tenantId: context.tenantId,
      userId: context.userId,
      metadata: { type: 'text-to-video', params },
    });

    return { jobId, externalId: response.id };
  }

  /**
   * Generate video from image
   */
  async imageToVideo(
    params: RunwayImageToVideoParams,
    context: { agentId: string; runId: string; tenantId?: string; userId?: string }
  ): Promise<{ jobId: string; externalId: string }> {
    const response = await this.fetchWithRetry<RunwayCreateResponse>(
      `${this.config.baseUrl}/image-to-video`,
      {
        method: 'POST',
        body: JSON.stringify({
          model: params.model || 'gen3',
          image_url: params.imageUrl,
          prompt: params.prompt,
          duration: params.duration || 4,
          motion_amount: params.motionAmount,
          seed: params.seed,
        }),
      }
    );

    const jobManager = getJobManager();
    const jobId = jobManager.create({
      provider: 'runway',
      externalJobId: response.id,
      agentId: context.agentId,
      runId: context.runId,
      tenantId: context.tenantId,
      userId: context.userId,
      metadata: { type: 'image-to-video', params },
    });

    return { jobId, externalId: response.id };
  }

  /**
   * Transform existing video (style transfer)
   */
  async videoToVideo(
    params: RunwayVideoToVideoParams,
    context: { agentId: string; runId: string; tenantId?: string; userId?: string }
  ): Promise<{ jobId: string; externalId: string }> {
    const response = await this.fetchWithRetry<RunwayCreateResponse>(
      `${this.config.baseUrl}/video-to-video`,
      {
        method: 'POST',
        body: JSON.stringify({
          model: params.model || 'gen2',
          video_url: params.videoUrl,
          prompt: params.prompt,
          strength: params.strength || 0.5,
          seed: params.seed,
        }),
      }
    );

    const jobManager = getJobManager();
    const jobId = jobManager.create({
      provider: 'runway',
      externalJobId: response.id,
      agentId: context.agentId,
      runId: context.runId,
      tenantId: context.tenantId,
      userId: context.userId,
      metadata: { type: 'video-to-video', params },
    });

    return { jobId, externalId: response.id };
  }

  /**
   * Poll job status from Runway
   */
  async pollStatus(externalJobId: string): Promise<RunwayJobStatus> {
    const response = await this.fetchWithRetry<RunwayStatusResponse>(
      `${this.config.baseUrl}/generations/${externalJobId}`,
      { method: 'GET' }
    );

    return {
      id: response.id,
      status: this.mapStatus(response.status),
      progress: response.progress || 0,
      outputUrl: response.output?.[0]?.url,
      thumbnailUrl: response.thumbnail,
      error: response.error?.message,
      createdAt: response.createdAt,
      completedAt: response.completedAt,
    };
  }

  /**
   * Wait for job completion with polling
   */
  async waitForCompletion(
    jobId: string,
    options: {
      pollInterval?: number;
      timeout?: number;
      onProgress?: (progress: number) => void;
    } = {}
  ): Promise<RunwayJobStatus> {
    const { pollInterval = 5000, timeout = 600000, onProgress } = options;
    const startTime = Date.now();

    const jobManager = getJobManager();
    const job = jobManager.getStatus(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    while (Date.now() - startTime < timeout) {
      const status = await this.pollStatus(job.externalJobId);

      // Update local job record
      if (status.progress > 0) {
        jobManager.updateProgress(jobId, status.progress);
      }

      onProgress?.(status.progress);

      if (status.status === 'complete') {
        jobManager.complete(
          jobId,
          status.outputUrl!,
          { thumbnailUrl: status.thumbnailUrl },
          this.getEstimatedCost('gen3', 4),
          status.thumbnailUrl
        );
        return status;
      }

      if (status.status === 'failed') {
        jobManager.fail(jobId, status.error || 'Unknown error');
        throw new Error(`Runway job failed: ${status.error}`);
      }

      await this.sleep(pollInterval);
    }

    throw new Error(`Runway job timeout after ${timeout}ms`);
  }

  /**
   * Cancel a running job
   */
  async cancelJob(externalJobId: string): Promise<void> {
    await this.fetchWithRetry(
      `${this.config.baseUrl}/generations/${externalJobId}/cancel`,
      { method: 'POST' }
    );

    const jobManager = getJobManager();
    const job = jobManager.findByExternalId('runway', externalJobId);
    if (job) {
      jobManager.cancel(job.id);
    }
  }

  private mapStatus(status: string): RunwayJobStatus['status'] {
    switch (status.toLowerCase()) {
      case 'pending':
      case 'queued':
        return 'pending';
      case 'processing':
      case 'running':
        return 'processing';
      case 'complete':
      case 'succeeded':
        return 'complete';
      case 'failed':
      case 'error':
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Get estimated cost for video generation
   */
  getEstimatedCost(
    model: 'gen2' | 'gen3',
    duration: number = 4
  ): number {
    // Runway charges per second
    const perSecond: Record<string, number> = {
      gen2: 0.05,
      gen3: 0.10,
    };

    return (perSecond[model] || 0.10) * duration;
  }
}

// Singleton instance
let instance: RunwayProvider | null = null;

export function getRunwayProvider(): RunwayProvider {
  if (!instance) {
    instance = new RunwayProvider();
  }
  return instance;
}
