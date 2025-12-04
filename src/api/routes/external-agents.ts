/**
 * External Agents Management Routes
 *
 * API routes for managing external agent connections (FastAPI, etc.)
 */

import { Router, Request, Response } from 'express';
import { createLogger } from '../../logging/logger.js';
import { getExternalAgentRegistry } from '../../external/registry.js';
import { getExternalAgentProxy } from '../../external/proxy.js';
import type { ExternalAgentConfig, StreamingProtocol } from '../../external/types.js';

const router = Router();
const logger = createLogger({ level: 'info' });

/**
 * GET /external-agents
 *
 * List all registered external agents
 */
router.get('/', (req: Request, res: Response) => {
  const registry = getExternalAgentRegistry();
  const agents = registry.list();

  const result = agents.map((agent) => ({
    id: agent.config.id,
    name: agent.config.name,
    description: agent.config.description,
    version: agent.config.version,
    baseUrl: agent.config.endpoints.baseUrl,
    streamingProtocol: agent.config.streamingProtocol,
    enabled: agent.config.enabled,
    capabilities: agent.config.capabilities,
    tags: agent.config.tags,
    state: {
      healthStatus: agent.state.healthStatus,
      lastHealthCheck: agent.state.lastHealthCheck,
      activeRequests: agent.state.activeRequests,
      totalRequests: agent.state.totalRequests,
      totalErrors: agent.state.totalErrors,
      avgResponseTimeMs: Math.round(agent.state.avgResponseTimeMs),
      circuitBroken: agent.state.circuitBroken,
    },
  }));

  res.json({
    agents: result,
    total: result.length,
    healthy: result.filter((a) => a.state.healthStatus === 'healthy').length,
  });
});

/**
 * POST /external-agents
 *
 * Register a new external agent
 */
router.post('/', async (req: Request, res: Response) => {
  const {
    id,
    name,
    description,
    version,
    baseUrl,
    streamingProtocol,
    auth,
    timeoutMs,
    healthCheckIntervalMs,
    tags,
    capabilities,
    maxConcurrency,
    enabled,
  } = req.body;

  // Validate required fields
  if (!id || !name || !baseUrl) {
    res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: 'id, name, and baseUrl are required',
      },
    });
    return;
  }

  // Check if already registered
  const registry = getExternalAgentRegistry();
  if (registry.get(id)) {
    res.status(409).json({
      error: {
        code: 'AGENT_EXISTS',
        message: `External agent '${id}' is already registered`,
      },
    });
    return;
  }

  try {
    const config: ExternalAgentConfig = {
      id,
      name,
      description: description || `External agent: ${name}`,
      version: version || '1.0.0',
      endpoints: {
        baseUrl,
      },
      streamingProtocol: (streamingProtocol as StreamingProtocol) || 'sse',
      auth,
      timeoutMs: timeoutMs || 120000,
      healthCheckIntervalMs: healthCheckIntervalMs ?? 30000,
      tags: tags || [],
      capabilities: capabilities || [],
      maxConcurrency: maxConcurrency || 10,
      enabled: enabled !== false,
    };

    const agent = await registry.register(config);

    logger.info('external_agent_registered_via_api', {
      agentId: id,
      baseUrl,
      streamingProtocol: config.streamingProtocol,
    });

    res.status(201).json({
      message: 'External agent registered successfully',
      agent: {
        id: agent.config.id,
        name: agent.config.name,
        baseUrl: agent.config.endpoints.baseUrl,
        streamingProtocol: agent.config.streamingProtocol,
        healthStatus: agent.state.healthStatus,
      },
    });
  } catch (error) {
    logger.error('external_agent_registration_failed', {
      agentId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: {
        code: 'REGISTRATION_FAILED',
        message: error instanceof Error ? error.message : 'Registration failed',
      },
    });
  }
});

/**
 * GET /external-agents/:id
 *
 * Get details of a specific external agent
 */
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const registry = getExternalAgentRegistry();
  const agent = registry.get(id);

  if (!agent) {
    res.status(404).json({
      error: {
        code: 'AGENT_NOT_FOUND',
        message: `External agent '${id}' not found`,
      },
    });
    return;
  }

  res.json({
    id: agent.config.id,
    name: agent.config.name,
    description: agent.config.description,
    version: agent.config.version,
    endpoints: agent.config.endpoints,
    streamingProtocol: agent.config.streamingProtocol,
    enabled: agent.config.enabled,
    capabilities: agent.config.capabilities,
    tags: agent.config.tags,
    timeoutMs: agent.config.timeoutMs,
    maxConcurrency: agent.config.maxConcurrency,
    state: {
      healthStatus: agent.state.healthStatus,
      lastHealthCheck: agent.state.lastHealthCheck,
      lastHealthError: agent.state.lastHealthError,
      activeRequests: agent.state.activeRequests,
      totalRequests: agent.state.totalRequests,
      totalErrors: agent.state.totalErrors,
      avgResponseTimeMs: Math.round(agent.state.avgResponseTimeMs),
      circuitBroken: agent.state.circuitBroken,
      circuitResetTime: agent.state.circuitResetTime,
    },
    card: agent.card,
  });
});

/**
 * PUT /external-agents/:id
 *
 * Update an external agent configuration
 */
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const registry = getExternalAgentRegistry();
  const existingAgent = registry.get(id);

  if (!existingAgent) {
    res.status(404).json({
      error: {
        code: 'AGENT_NOT_FOUND',
        message: `External agent '${id}' not found`,
      },
    });
    return;
  }

  // Unregister and re-register with new config
  registry.unregister(id);

  try {
    const newConfig: ExternalAgentConfig = {
      ...existingAgent.config,
      ...req.body,
      id, // Keep original ID
      endpoints: {
        ...existingAgent.config.endpoints,
        ...req.body.endpoints,
      },
    };

    const agent = await registry.register(newConfig);

    logger.info('external_agent_updated', { agentId: id });

    res.json({
      message: 'External agent updated successfully',
      agent: {
        id: agent.config.id,
        name: agent.config.name,
        baseUrl: agent.config.endpoints.baseUrl,
        healthStatus: agent.state.healthStatus,
      },
    });
  } catch (error) {
    // Re-register original config on failure
    await registry.register(existingAgent.config);

    res.status(500).json({
      error: {
        code: 'UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Update failed',
      },
    });
  }
});

/**
 * DELETE /external-agents/:id
 *
 * Unregister an external agent
 */
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const registry = getExternalAgentRegistry();

  if (!registry.get(id)) {
    res.status(404).json({
      error: {
        code: 'AGENT_NOT_FOUND',
        message: `External agent '${id}' not found`,
      },
    });
    return;
  }

  registry.unregister(id);

  logger.info('external_agent_unregistered_via_api', { agentId: id });

  res.json({
    message: 'External agent unregistered successfully',
    agentId: id,
  });
});

/**
 * POST /external-agents/:id/health
 *
 * Trigger a health check for an external agent
 */
router.post('/:id/health', async (req: Request, res: Response) => {
  const { id } = req.params;
  const registry = getExternalAgentRegistry();

  if (!registry.get(id)) {
    res.status(404).json({
      error: {
        code: 'AGENT_NOT_FOUND',
        message: `External agent '${id}' not found`,
      },
    });
    return;
  }

  const status = await registry.checkHealth(id);
  const agent = registry.get(id)!;

  res.json({
    agentId: id,
    healthStatus: status,
    lastHealthCheck: agent.state.lastHealthCheck,
    lastHealthError: agent.state.lastHealthError,
    circuitBroken: agent.state.circuitBroken,
  });
});

/**
 * POST /external-agents/:id/enable
 *
 * Enable an external agent
 */
router.post('/:id/enable', (req: Request, res: Response) => {
  const { id } = req.params;
  const registry = getExternalAgentRegistry();
  const agent = registry.get(id);

  if (!agent) {
    res.status(404).json({
      error: {
        code: 'AGENT_NOT_FOUND',
        message: `External agent '${id}' not found`,
      },
    });
    return;
  }

  agent.config.enabled = true;
  logger.info('external_agent_enabled', { agentId: id });

  res.json({
    message: 'External agent enabled',
    agentId: id,
    enabled: true,
  });
});

/**
 * POST /external-agents/:id/disable
 *
 * Disable an external agent
 */
router.post('/:id/disable', (req: Request, res: Response) => {
  const { id } = req.params;
  const registry = getExternalAgentRegistry();
  const agent = registry.get(id);

  if (!agent) {
    res.status(404).json({
      error: {
        code: 'AGENT_NOT_FOUND',
        message: `External agent '${id}' not found`,
      },
    });
    return;
  }

  agent.config.enabled = false;
  logger.info('external_agent_disabled', { agentId: id });

  res.json({
    message: 'External agent disabled',
    agentId: id,
    enabled: false,
  });
});

/**
 * POST /external-agents/:id/circuit/reset
 *
 * Reset circuit breaker for an external agent
 */
router.post('/:id/circuit/reset', (req: Request, res: Response) => {
  const { id } = req.params;
  const registry = getExternalAgentRegistry();

  if (!registry.get(id)) {
    res.status(404).json({
      error: {
        code: 'AGENT_NOT_FOUND',
        message: `External agent '${id}' not found`,
      },
    });
    return;
  }

  registry.resetCircuitBreaker(id);

  res.json({
    message: 'Circuit breaker reset',
    agentId: id,
  });
});

/**
 * POST /external-agents/:id/execute
 *
 * Execute an external agent (non-streaming)
 */
router.post('/:id/execute', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { task, model, budget, context } = req.body;

  if (!task) {
    res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: 'task is required',
      },
    });
    return;
  }

  const registry = getExternalAgentRegistry();
  if (!registry.get(id)) {
    res.status(404).json({
      error: {
        code: 'AGENT_NOT_FOUND',
        message: `External agent '${id}' not found`,
      },
    });
    return;
  }

  const proxy = getExternalAgentProxy();
  const result = await proxy.execute(id, {
    task,
    model,
    budget,
    context,
    stream: false,
  });

  if (result.success) {
    res.json({
      runId: result.runId,
      result: result.result,
      usage: result.usage,
    });
  } else {
    res.status(500).json({
      runId: result.runId,
      error: result.error,
      usage: result.usage,
    });
  }
});

/**
 * GET /external-agents/stats
 *
 * Get aggregate statistics for all external agents
 */
router.get('/stats/all', (req: Request, res: Response) => {
  const registry = getExternalAgentRegistry();
  const stats = registry.getStats();

  res.json(stats);
});

export default router;
