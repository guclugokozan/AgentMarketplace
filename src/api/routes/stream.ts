/**
 * Streaming Execute Routes
 *
 * API routes for streaming agent execution with SSE support.
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '../../logging/logger.js';
import { getAgentRegistry } from '../../agents/registry.js';
import { getExternalAgentRegistry } from '../../external/registry.js';
import { getExternalAgentProxy } from '../../external/proxy.js';
import { SSEWriter, streamifyResponse } from '../../streaming/sse.js';
import type { AgentDefinition, ExecutionContext } from '../../core/types.js';

const router = Router();
const logger = createLogger({ level: 'info' });

/**
 * POST /stream
 *
 * Execute an agent with SSE streaming response
 */
router.post('/', async (req: Request, res: Response) => {
  const { agentId, task, model, budget, context } = req.body;

  if (!agentId) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'agentId is required' } });
    return;
  }

  if (!task) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'task is required' } });
    return;
  }

  const runId = crypto.randomUUID();
  const startTime = Date.now();

  logger.info('stream_execution_started', { runId, agentId });

  // Check if this is an external agent
  const externalRegistry = getExternalAgentRegistry();
  const externalAgent = externalRegistry.get(agentId);

  if (externalAgent) {
    // Use external agent proxy for streaming
    const proxy = getExternalAgentProxy();
    await proxy.executeStream(
      agentId,
      {
        task,
        model,
        budget,
        context,
        requestId: runId,
        stream: true,
      },
      res
    );
    return;
  }

  // Check internal agent registry
  const agentRegistry = getAgentRegistry();
  const agent = agentRegistry.get(agentId);

  if (!agent) {
    res.status(404).json({
      error: { code: 'AGENT_NOT_FOUND', message: `Agent '${agentId}' not found` },
    });
    return;
  }

  // Create SSE writer
  const writer = new SSEWriter(res, runId);

  try {
    writer.sendStart({ agentId, runId });
    writer.sendProgress(0, 'Starting execution...', 0, 3);

    // Create execution context
    const execContext: ExecutionContext = {
      runId,
      agentId,
      task,
      model: model || agent.card.defaultModel,
      effortLevel: agent.card.defaultEffortLevel,
      budget: budget || { maxCostUsd: 1.0 },
      tools: agent.tools || [],
      hooks: {},
      signal: new AbortController().signal,
    };

    writer.sendProgress(33, 'Executing agent...', 1, 3);

    // Execute the agent
    const result = await agent.execute(execContext);

    writer.sendProgress(66, 'Processing results...', 2, 3);

    // Stream the result
    if (typeof result === 'string') {
      // Stream string content token by token
      const chunkSize = 20;
      for (let i = 0; i < result.length; i += chunkSize) {
        const chunk = result.slice(i, i + chunkSize);
        writer.sendToken(chunk, Math.floor(i / chunkSize));
        // Small delay for visual effect
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } else if (result && typeof result === 'object') {
      // For object results, stream as JSON
      const resultStr = JSON.stringify(result, null, 2);
      writer.sendToken(resultStr);
    }

    writer.sendProgress(100, 'Complete', 3, 3);

    const durationMs = Date.now() - startTime;

    writer.sendDone(result, { durationMs }, runId);

    logger.info('stream_execution_completed', { runId, agentId, durationMs });
  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error('stream_execution_error', {
      runId,
      agentId,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs,
    });

    writer.sendError(
      'EXECUTION_ERROR',
      error instanceof Error ? error.message : 'Unknown error',
      true
    );
  }
});

/**
 * GET /stream/test
 *
 * Test endpoint that streams sample data
 */
router.get('/test', (req: Request, res: Response) => {
  const runId = crypto.randomUUID();
  const writer = new SSEWriter(res, runId);

  writer.sendStart({ test: true });

  let step = 0;
  const totalSteps = 10;

  const interval = setInterval(() => {
    step++;
    writer.sendProgress((step / totalSteps) * 100, `Step ${step} of ${totalSteps}`, step, totalSteps);
    writer.sendToken(`Streaming content chunk ${step}... `, step);

    if (step >= totalSteps) {
      clearInterval(interval);
      writer.sendDone(
        { message: 'Test stream completed successfully' },
        { durationMs: step * 500 },
        runId
      );
    }
  }, 500);

  // Handle client disconnect
  res.on('close', () => {
    clearInterval(interval);
  });
});

/**
 * POST /stream/external/:agentId
 *
 * Stream execution from a specific external agent
 */
router.post('/external/:agentId', async (req: Request, res: Response) => {
  const { agentId } = req.params;
  const { task, model, budget, context } = req.body;

  if (!task) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'task is required' } });
    return;
  }

  const externalRegistry = getExternalAgentRegistry();
  const externalAgent = externalRegistry.get(agentId);

  if (!externalAgent) {
    res.status(404).json({
      error: { code: 'AGENT_NOT_FOUND', message: `External agent '${agentId}' not found` },
    });
    return;
  }

  const runId = crypto.randomUUID();
  const proxy = getExternalAgentProxy();

  await proxy.executeStream(
    agentId,
    {
      task,
      model,
      budget,
      context,
      requestId: runId,
      stream: true,
    },
    res
  );
});

export default router;
