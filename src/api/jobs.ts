/**
 * Jobs API Router
 *
 * REST endpoints for async job management:
 * - GET /jobs/:id - Get job status
 * - GET /jobs/run/:runId - List jobs for a run
 * - POST /jobs/:id/cancel - Cancel a job
 * - POST /jobs/webhook/:provider - Handle provider webhooks
 */

import { Router, Request, Response } from 'express';
import { getJobManager } from '../providers/job-manager.js';
import { getRunwayProvider } from '../providers/runway.js';
import { getReplicateClient } from '../providers/replicate.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger({ level: 'info' });
const router = Router();

// =============================================================================
// GET /jobs/:id - Get job status
// =============================================================================

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const jobManager = getJobManager();
    const job = jobManager.getStatus(id);

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        code: 'JOB_NOT_FOUND',
      });
    }

    return res.json({
      success: true,
      job: {
        id: job.id,
        provider: job.provider,
        status: job.status,
        progress: job.progress,
        resultUrl: job.resultUrl,
        thumbnailUrl: job.thumbnailUrl,
        errorMessage: job.errorMessage,
        costUsd: job.costUsd,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      },
    });
  } catch (error) {
    logger.error('get_job_status_error', { error, jobId: req.params.id });
    return res.status(500).json({
      error: 'Failed to get job status',
      code: 'INTERNAL_ERROR',
    });
  }
});

// =============================================================================
// GET /jobs/run/:runId - List jobs for a run
// =============================================================================

router.get('/run/:runId', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const jobManager = getJobManager();
    const jobs = jobManager.listByRun(runId);

    return res.json({
      success: true,
      jobs: jobs.map((job) => ({
        id: job.id,
        provider: job.provider,
        status: job.status,
        progress: job.progress,
        resultUrl: job.resultUrl,
        errorMessage: job.errorMessage,
        costUsd: job.costUsd,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      })),
    });
  } catch (error) {
    logger.error('list_jobs_error', { error, runId: req.params.runId });
    return res.status(500).json({
      error: 'Failed to list jobs',
      code: 'INTERNAL_ERROR',
    });
  }
});

// =============================================================================
// POST /jobs/:id/cancel - Cancel a job
// =============================================================================

router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const jobManager = getJobManager();
    const job = jobManager.getStatus(id);

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        code: 'JOB_NOT_FOUND',
      });
    }

    if (job.status !== 'pending' && job.status !== 'processing') {
      return res.status(400).json({
        error: 'Job cannot be cancelled',
        code: 'INVALID_STATUS',
        currentStatus: job.status,
      });
    }

    // Cancel with provider
    try {
      if (job.provider === 'runway') {
        const runway = getRunwayProvider();
        await runway.cancelJob(job.externalJobId);
      } else if (job.provider === 'replicate') {
        const replicate = getReplicateClient();
        await replicate.cancelPrediction(job.externalJobId);
      }
    } catch (providerError) {
      logger.warn('provider_cancel_failed', { error: providerError, jobId: id });
      // Continue with local cancellation
    }

    jobManager.cancel(id);

    return res.json({
      success: true,
      message: 'Job cancelled',
      job: {
        id: job.id,
        status: 'cancelled',
      },
    });
  } catch (error) {
    logger.error('cancel_job_error', { error, jobId: req.params.id });
    return res.status(500).json({
      error: 'Failed to cancel job',
      code: 'INTERNAL_ERROR',
    });
  }
});

// =============================================================================
// GET /jobs/stats - Get job statistics
// =============================================================================

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string | undefined;
    const jobManager = getJobManager();
    const stats = jobManager.getStats(tenantId);

    return res.json({
      success: true,
      stats,
    });
  } catch (error) {
    logger.error('get_job_stats_error', { error });
    return res.status(500).json({
      error: 'Failed to get job statistics',
      code: 'INTERNAL_ERROR',
    });
  }
});

// =============================================================================
// POST /jobs/webhook/:provider - Handle provider webhooks
// =============================================================================

router.post('/webhook/:provider', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const payload = req.body;

    logger.info('webhook_received', {
      provider,
      payloadKeys: Object.keys(payload),
    });

    const jobManager = getJobManager();
    let externalJobId: string | undefined;
    let status: string | undefined;

    // Parse provider-specific webhook format
    switch (provider) {
      case 'runway':
        externalJobId = payload.id || payload.generation_id;
        status = payload.status;
        break;

      case 'replicate':
        externalJobId = payload.id;
        status = payload.status;
        break;

      case 'elevenlabs':
        externalJobId = payload.dubbing_id || payload.id;
        status = payload.status;
        break;

      default:
        logger.warn('unknown_webhook_provider', { provider });
        return res.status(400).json({
          error: 'Unknown provider',
          code: 'UNKNOWN_PROVIDER',
        });
    }

    if (!externalJobId) {
      return res.status(400).json({
        error: 'Missing job ID in webhook',
        code: 'MISSING_JOB_ID',
      });
    }

    const job = jobManager.handleWebhook(provider, externalJobId, payload);

    if (!job) {
      logger.warn('webhook_job_not_found', { provider, externalJobId });
      // Return 200 anyway to acknowledge receipt
      return res.json({ success: true, message: 'Job not found but acknowledged' });
    }

    // Update job status based on webhook
    if (status) {
      const normalizedStatus = normalizeStatus(provider, status);
      if (normalizedStatus === 'complete' && payload.output) {
        const resultUrl = extractResultUrl(provider, payload);
        if (resultUrl) {
          jobManager.complete(job.id, resultUrl, payload);
        }
      } else if (normalizedStatus === 'failed') {
        const errorMessage = extractErrorMessage(provider, payload);
        jobManager.fail(job.id, errorMessage);
      }
    }

    return res.json({
      success: true,
      jobId: job.id,
      status: job.status,
    });
  } catch (error) {
    logger.error('webhook_error', { error, provider: req.params.provider });
    return res.status(500).json({
      error: 'Webhook processing failed',
      code: 'INTERNAL_ERROR',
    });
  }
});

// =============================================================================
// POST /jobs/:id/poll - Poll job status from provider
// =============================================================================

router.post('/:id/poll', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const jobManager = getJobManager();
    const job = jobManager.getStatus(id);

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        code: 'JOB_NOT_FOUND',
      });
    }

    if (job.status !== 'pending' && job.status !== 'processing') {
      return res.json({
        success: true,
        job: {
          id: job.id,
          status: job.status,
          resultUrl: job.resultUrl,
          errorMessage: job.errorMessage,
        },
      });
    }

    // Poll provider
    let providerStatus: {
      status: string;
      progress?: number;
      output?: string;
      error?: string;
    } | null = null;

    if (job.provider === 'runway') {
      const runway = getRunwayProvider();
      const status = await runway.pollStatus(job.externalJobId);
      providerStatus = {
        status: status.status,
        progress: status.progress,
        output: status.outputUrl,
        error: status.error,
      };
    } else if (job.provider === 'replicate') {
      const replicate = getReplicateClient();
      const prediction = await replicate.getPrediction(job.externalJobId);
      providerStatus = {
        status: prediction.status,
        output: Array.isArray(prediction.output) ? prediction.output[0] : prediction.output as string,
        error: prediction.error,
      };
    }

    if (providerStatus) {
      if (providerStatus.progress) {
        jobManager.updateProgress(id, providerStatus.progress);
      }

      if (providerStatus.status === 'succeeded' || providerStatus.status === 'complete') {
        if (providerStatus.output) {
          jobManager.complete(id, providerStatus.output);
        }
      } else if (providerStatus.status === 'failed') {
        jobManager.fail(id, providerStatus.error || 'Unknown error');
      }
    }

    // Return updated status
    const updatedJob = jobManager.getStatus(id);
    return res.json({
      success: true,
      job: {
        id: updatedJob?.id,
        status: updatedJob?.status,
        progress: updatedJob?.progress,
        resultUrl: updatedJob?.resultUrl,
        errorMessage: updatedJob?.errorMessage,
      },
    });
  } catch (error) {
    logger.error('poll_job_error', { error, jobId: req.params.id });
    return res.status(500).json({
      error: 'Failed to poll job',
      code: 'INTERNAL_ERROR',
    });
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function normalizeStatus(provider: string, status: string): 'pending' | 'processing' | 'complete' | 'failed' {
  const statusMap: Record<string, Record<string, string>> = {
    runway: {
      pending: 'pending',
      queued: 'pending',
      processing: 'processing',
      running: 'processing',
      complete: 'complete',
      succeeded: 'complete',
      failed: 'failed',
      error: 'failed',
    },
    replicate: {
      starting: 'pending',
      processing: 'processing',
      succeeded: 'complete',
      failed: 'failed',
      canceled: 'failed',
    },
    elevenlabs: {
      pending: 'pending',
      dubbing: 'processing',
      dubbed: 'complete',
      failed: 'failed',
    },
  };

  return (statusMap[provider]?.[status.toLowerCase()] || 'pending') as any;
}

function extractResultUrl(provider: string, payload: Record<string, unknown>): string | undefined {
  switch (provider) {
    case 'runway':
      return (payload.output as any)?.[0]?.url || payload.output_url as string;
    case 'replicate':
      const output = payload.output;
      if (typeof output === 'string') return output;
      if (Array.isArray(output)) return output[0];
      return (output as any)?.url;
    case 'elevenlabs':
      return payload.audio_url as string;
    default:
      return undefined;
  }
}

function extractErrorMessage(provider: string, payload: Record<string, unknown>): string {
  switch (provider) {
    case 'runway':
      return (payload.error as any)?.message || payload.error as string || 'Unknown error';
    case 'replicate':
      return payload.error as string || 'Unknown error';
    case 'elevenlabs':
      return payload.error as string || 'Unknown error';
    default:
      return 'Unknown error';
  }
}

export default router;
