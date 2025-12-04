/**
 * Execute API Route
 *
 * POST /execute - Execute an agent
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ExecuteRequestSchema } from '../../core/types.js';
import { getAgentExecutor } from '../../execution/executor.js';
import { getAgentRegistry } from '../../agents/registry.js';
import { AgentNotFoundError, InvalidInputError } from '../../core/errors.js';

const router = Router();

/**
 * POST /execute
 *
 * Execute an agent with the given input and options.
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request body
    const parseResult = ExecuteRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new InvalidInputError(
        'Invalid request body',
        parseResult.error.errors
      );
    }

    const request = parseResult.data;

    // Get agent
    const registry = getAgentRegistry();
    const agent = registry.get(request.agentId);
    if (!agent) {
      throw new AgentNotFoundError(request.agentId);
    }

    // Execute
    const executor = getAgentExecutor();
    const output = await executor.execute(agent, request.input, {
      idempotencyKey: request.idempotencyKey,
      budget: request.budget,
      effortLevel: request.effortLevel,
      traceId: request.traceId,
      tenantId: request.tenantId,
      userId: request.userId,
    });

    // Return response
    res.json({
      status: output.status,
      result: output.result,
      reasoning: output.reasoning,
      warnings: output.warnings,
      usage: output.usage,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
