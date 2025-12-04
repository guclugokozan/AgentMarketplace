/**
 * Runs API Route
 *
 * GET /runs/:id - Get run details
 * GET /runs - List runs
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getRunsStorage } from '../../storage/runs.js';
import { getStepsStorage } from '../../storage/steps.js';
import type { RunStatus } from '../../core/types.js';

const router = Router();

/**
 * GET /runs/:id
 *
 * Get run details including steps.
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const runs = getRunsStorage();
    const steps = getStepsStorage();

    const run = runs.findById(id);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    // Get steps for this run
    const runSteps = steps.findByRunId(id);

    res.json({
      id: run.id,
      agentId: run.agentId,
      status: run.status,
      input: run.input,
      output: run.output,
      budget: run.budget,
      consumed: run.consumed,
      currentModel: run.currentModel,
      effortLevel: run.effortLevel,
      traceId: run.traceId,
      error: run.error,
      steps: runSteps.map(step => ({
        id: step.id,
        index: step.index,
        type: step.type,
        model: step.model,
        toolName: step.toolName,
        status: step.status,
        costUsd: step.costUsd,
        durationMs: step.durationMs,
        inputTokens: step.inputTokens,
        outputTokens: step.outputTokens,
        thinkingTokens: step.thinkingTokens,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
      })),
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      completedAt: run.completedAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /runs
 *
 * List runs with optional filters.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      agentId,
      status,
      limit = '50',
    } = req.query;

    const runs = getRunsStorage();

    let results;
    if (agentId) {
      results = runs.findRecent(agentId as string, { limit: parseInt(limit as string, 10) });
    } else if (status) {
      results = runs.findByStatus(status as RunStatus, { limit: parseInt(limit as string, 10) });
    } else {
      // Get recent runs across all agents
      results = runs.findByStatus('completed', { limit: parseInt(limit as string, 10) });
    }

    res.json({
      runs: results.map(run => ({
        id: run.id,
        agentId: run.agentId,
        status: run.status,
        consumed: run.consumed,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
      })),
      total: results.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
