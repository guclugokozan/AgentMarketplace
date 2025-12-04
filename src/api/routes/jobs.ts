/**
 * Jobs API Routes
 *
 * Async job management for long-running agent operations.
 * Supports: creation, polling, cancellation, webhooks
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getJobsStorage, Job } from '../../storage/jobs.js';
import { getAgentRegistry } from '../../agents/registry.js';
import { checkAgentProviders, getAgentCostEstimate } from '../../config/providers.js';
import { createLogger } from '../../logging/logger.js';
import {
  AgentNotFoundError,
  InvalidInputError,
  JobNotFoundError,
  PermissionDeniedError,
} from '../../core/errors.js';

const router = Router();
const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const CreateJobSchema = z.object({
  agentId: z.string().min(1),
  input: z.record(z.unknown()),
  webhookUrl: z.string().url().optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

const ListJobsSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * Create a new async job
 * POST /jobs
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = CreateJobSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new InvalidInputError('Invalid job request', parseResult.error.errors);
    }

    const { agentId, input, webhookUrl } = parseResult.data;
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
    const userId = req.headers['x-user-id'] as string;

    // Check if agent exists
    const registry = getAgentRegistry();
    const agent = registry.get(agentId);
    if (!agent) {
      throw new AgentNotFoundError(agentId);
    }

    // Check provider availability
    const providerCheck = checkAgentProviders(agentId);
    if (!providerCheck.canRun) {
      throw new InvalidInputError(
        `Agent '${agentId}' cannot run: missing providers ${providerCheck.missing.join(', ')}`
      );
    }

    // Get cost estimate
    const costEstimate = getAgentCostEstimate(agentId);

    // Estimate duration based on agent type
    const estimatedDurationMs = getEstimatedDuration(agentId);

    // Create job
    const jobsStorage = getJobsStorage();
    const job = jobsStorage.create({
      agentId,
      tenantId,
      userId,
      input,
      webhookUrl,
      estimatedDurationMs,
    });

    logger.info('job_created', {
      jobId: job.id,
      agentId,
      tenantId,
    });

    // In a real implementation, you'd queue this for background processing
    // await jobQueue.add('process-job', { jobId: job.id });

    res.status(202).json({
      id: job.id,
      status: job.status,
      statusUrl: `/jobs/${job.id}`,
      estimatedDurationMs,
      costEstimate,
      createdAt: job.createdAt.toISOString(),
      message: 'Job queued for processing',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get job status
 * GET /jobs/:id
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobsStorage = getJobsStorage();
    const job = jobsStorage.get(req.params.id);

    if (!job) {
      throw new JobNotFoundError(req.params.id);
    }

    // Check tenant access
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
    if (job.tenantId !== tenantId && tenantId !== 'admin') {
      throw new PermissionDeniedError('view', `job:${req.params.id}`);
    }

    res.json(formatJobResponse(job));
  } catch (error) {
    next(error);
  }
});

/**
 * List jobs
 * GET /jobs
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = ListJobsSchema.safeParse(req.query);
    if (!parseResult.success) {
      throw new InvalidInputError('Invalid query parameters', parseResult.error.errors);
    }

    const { status, limit } = parseResult.data;
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

    const jobsStorage = getJobsStorage();
    const jobs = jobsStorage.findByTenant(tenantId, { status, limit });

    res.json({
      jobs: jobs.map(formatJobResponse),
      total: jobs.length,
      hasMore: jobs.length === limit,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Cancel a job
 * POST /jobs/:id/cancel
 */
router.post('/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobsStorage = getJobsStorage();
    const job = jobsStorage.get(req.params.id);

    if (!job) {
      throw new JobNotFoundError(req.params.id);
    }

    // Check tenant access
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
    if (job.tenantId !== tenantId && tenantId !== 'admin') {
      throw new PermissionDeniedError('cancel', `job:${req.params.id}`);
    }

    if (job.status === 'completed' || job.status === 'failed') {
      throw new InvalidInputError('Cannot cancel a finished job');
    }

    const cancelled = jobsStorage.cancel(job.id);

    logger.info('job_cancelled', {
      jobId: job.id,
      previousStatus: job.status,
    });

    res.json(formatJobResponse(cancelled!));
  } catch (error) {
    next(error);
  }
});

/**
 * Get job statistics
 * GET /jobs/stats
 */
router.get('/stats/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
    const isAdmin = tenantId === 'admin';

    const jobsStorage = getJobsStorage();
    const stats = jobsStorage.getStats(isAdmin ? undefined : tenantId);

    res.json({
      ...stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// HELPERS
// =============================================================================

function formatJobResponse(job: Job) {
  return {
    id: job.id,
    agentId: job.agentId,
    status: job.status,
    progress: job.progress,
    provider: job.provider,
    output: job.status === 'completed' ? job.output : undefined,
    error: job.status === 'failed' ? { message: job.error, code: job.errorCode } : undefined,
    cost: job.cost,
    estimatedDurationMs: job.estimatedDurationMs,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    completedAt: job.completedAt?.toISOString(),
    statusUrl: `/jobs/${job.id}`,
  };
}

function getEstimatedDuration(agentId: string): number {
  // Estimated durations in milliseconds
  const estimates: Record<string, number> = {
    // Fast (< 10s)
    'product-description-writer': 5000,
    'email-template-generator': 5000,
    'social-media-caption-generator': 5000,
    'customer-support-bot': 3000,

    // Medium (10-30s)
    'smart-data-analyzer': 15000,
    'resume-builder': 20000,
    'seo-content-optimizer': 15000,
    'video-script-generator': 20000,
    'data-visualization': 15000,

    // Slow (30s-2min)
    'ai-background-generator': 45000,
    'chibi-sticker-maker': 60000,
    'image-translator': 30000,

    // Very slow (2-5min)
    'virtual-try-on': 120000,
    'ai-model-swap': 120000,
    'pro-headshot-generator': 90000,
    'meeting-transcriber': 180000, // Depends on audio length
  };

  return estimates[agentId] || 30000;
}

export default router;
