/**
 * External Agent Registry
 *
 * Manages registration and discovery of external agents (FastAPI, etc.)
 * with health monitoring and circuit breaking.
 */

import { EventEmitter } from 'events';
import { createLogger } from '../logging/logger.js';
import type { AgentCard } from '../core/types.js';
import {
  ExternalAgentConfig,
  ExternalAgent,
  ExternalAgentState,
  HealthStatus,
  DEFAULT_EXTERNAL_AGENT_CONFIG,
  FastAPIAgentCard,
  convertFastAPICard,
} from './types.js';

const logger = createLogger({ level: 'info' });

/**
 * External Agent Registry
 *
 * Manages external agent connections with:
 * - Registration and discovery
 * - Health monitoring
 * - Circuit breaking
 * - Load balancing ready
 */
export class ExternalAgentRegistry extends EventEmitter {
  private agents: Map<string, ExternalAgent> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
  }

  /**
   * Register an external agent
   */
  async register(config: ExternalAgentConfig): Promise<ExternalAgent> {
    // Merge with defaults
    const fullConfig: ExternalAgentConfig = {
      ...DEFAULT_EXTERNAL_AGENT_CONFIG,
      ...config,
      endpoints: {
        executePath: '/execute',
        streamPath: '/execute/stream',
        healthPath: '/health',
        infoPath: '/info',
        toolsPath: '/tools',
        ...config.endpoints,
      },
      retry: {
        ...DEFAULT_EXTERNAL_AGENT_CONFIG.retry,
        ...config.retry,
      },
    };

    // Initialize state
    const state: ExternalAgentState = {
      healthStatus: 'unknown',
      activeRequests: 0,
      totalRequests: 0,
      totalErrors: 0,
      avgResponseTimeMs: 0,
      circuitBroken: false,
    };

    // Create agent card for marketplace compatibility
    const card: AgentCard = {
      id: fullConfig.id,
      name: fullConfig.name,
      description: fullConfig.description,
      version: fullConfig.version,
      capabilities: fullConfig.capabilities || [],
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      defaultModel: 'external',
      defaultEffortLevel: 'medium',
      sideEffects: true,
      estimatedCostTier: 'variable',
    };

    const agent: ExternalAgent = { config: fullConfig, state, card };

    // Try to fetch agent info to populate card
    try {
      const agentInfo = await this.fetchAgentInfo(fullConfig);
      if (agentInfo) {
        agent.card = convertFastAPICard(agentInfo, fullConfig.endpoints.baseUrl);
        agent.card.id = fullConfig.id; // Keep our ID
      }
    } catch (error) {
      logger.warn('external_agent_info_fetch_failed', {
        agentId: fullConfig.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Store agent
    this.agents.set(fullConfig.id, agent);

    // Start health checks if configured
    if (fullConfig.healthCheckIntervalMs && fullConfig.healthCheckIntervalMs > 0) {
      this.startHealthCheck(fullConfig.id, fullConfig.healthCheckIntervalMs);
    }

    // Initial health check
    await this.checkHealth(fullConfig.id);

    logger.info('external_agent_registered', {
      agentId: fullConfig.id,
      baseUrl: fullConfig.endpoints.baseUrl,
      streamingProtocol: fullConfig.streamingProtocol,
    });

    this.emit('registered', agent);
    return agent;
  }

  /**
   * Unregister an external agent
   */
  unregister(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    // Stop health checks
    const interval = this.healthCheckIntervals.get(agentId);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(agentId);
    }

    this.agents.delete(agentId);

    logger.info('external_agent_unregistered', { agentId });
    this.emit('unregistered', agentId);
    return true;
  }

  /**
   * Get an external agent by ID
   */
  get(agentId: string): ExternalAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * List all registered external agents
   */
  list(): ExternalAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * List all healthy agents
   */
  listHealthy(): ExternalAgent[] {
    return this.list().filter(
      (agent) =>
        agent.config.enabled &&
        !agent.state.circuitBroken &&
        (agent.state.healthStatus === 'healthy' || agent.state.healthStatus === 'degraded')
    );
  }

  /**
   * Check if an agent is available for requests
   */
  isAvailable(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    if (!agent.config.enabled) return false;
    if (agent.state.circuitBroken) return false;
    if (agent.state.healthStatus === 'unhealthy') return false;
    if (agent.config.maxConcurrency && agent.state.activeRequests >= agent.config.maxConcurrency) {
      return false;
    }
    return true;
  }

  /**
   * Fetch agent info from remote endpoint
   */
  private async fetchAgentInfo(config: ExternalAgentConfig): Promise<FastAPIAgentCard | null> {
    const url = `${config.endpoints.baseUrl}${config.endpoints.infoPath || '/info'}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.connectionTimeoutMs || 10000
      );

      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(config),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Check health of an agent
   */
  async checkHealth(agentId: string): Promise<HealthStatus> {
    const agent = this.agents.get(agentId);
    if (!agent) return 'unknown';

    const config = agent.config;
    const url = `${config.endpoints.baseUrl}${config.endpoints.healthPath || '/health'}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.connectionTimeoutMs || 10000
      );

      const startTime = Date.now();
      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(config),
        signal: controller.signal,
      });
      const responseTime = Date.now() - startTime;

      clearTimeout(timeout);

      let status: HealthStatus;
      if (response.ok) {
        // Check response time for degraded status
        status = responseTime > 5000 ? 'degraded' : 'healthy';
      } else if (response.status >= 500) {
        status = 'unhealthy';
      } else {
        status = 'degraded';
      }

      agent.state.healthStatus = status;
      agent.state.lastHealthCheck = new Date();
      agent.state.lastHealthError = undefined;

      // Reset circuit breaker on healthy response
      if (status === 'healthy' && agent.state.circuitBroken) {
        this.resetCircuitBreaker(agentId);
      }

      this.emit('healthCheck', { agentId, status, responseTime });
      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      agent.state.healthStatus = 'unhealthy';
      agent.state.lastHealthCheck = new Date();
      agent.state.lastHealthError = message;

      // Trip circuit breaker after consecutive failures
      this.maybeTriCircuitBreaker(agentId);

      this.emit('healthCheck', { agentId, status: 'unhealthy', error: message });
      return 'unhealthy';
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(agentId: string, intervalMs: number): void {
    // Clear existing interval if any
    const existing = this.healthCheckIntervals.get(agentId);
    if (existing) {
      clearInterval(existing);
    }

    const interval = setInterval(() => {
      this.checkHealth(agentId).catch((err) => {
        logger.error('health_check_error', {
          agentId,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      });
    }, intervalMs);

    this.healthCheckIntervals.set(agentId, interval);
  }

  /**
   * Trip circuit breaker for an agent
   */
  tripCircuitBreaker(agentId: string, resetAfterMs: number = 30000): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.state.circuitBroken = true;
    agent.state.circuitResetTime = new Date(Date.now() + resetAfterMs);

    logger.warn('circuit_breaker_tripped', { agentId, resetAfterMs });
    this.emit('circuitBroken', { agentId, resetAfterMs });

    // Auto-reset after timeout
    setTimeout(() => {
      this.resetCircuitBreaker(agentId);
    }, resetAfterMs);
  }

  /**
   * Reset circuit breaker for an agent
   */
  resetCircuitBreaker(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.state.circuitBroken = false;
    agent.state.circuitResetTime = undefined;

    logger.info('circuit_breaker_reset', { agentId });
    this.emit('circuitReset', { agentId });
  }

  /**
   * Maybe trip circuit breaker based on error rate
   */
  private maybeTriCircuitBreaker(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent || agent.state.circuitBroken) return;

    // Trip if more than 50% errors in last 10 requests
    const errorRate = agent.state.totalErrors / Math.max(agent.state.totalRequests, 1);
    if (agent.state.totalRequests >= 5 && errorRate > 0.5) {
      this.tripCircuitBreaker(agentId);
    }
  }

  /**
   * Record a request starting
   */
  recordRequestStart(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.state.activeRequests++;
      agent.state.totalRequests++;
    }
  }

  /**
   * Record a request completing
   */
  recordRequestEnd(agentId: string, durationMs: number, error: boolean = false): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.state.activeRequests = Math.max(0, agent.state.activeRequests - 1);

    if (error) {
      agent.state.totalErrors++;
      this.maybeTriCircuitBreaker(agentId);
    }

    // Update rolling average
    const alpha = 0.1; // Smoothing factor
    agent.state.avgResponseTimeMs =
      alpha * durationMs + (1 - alpha) * agent.state.avgResponseTimeMs;
  }

  /**
   * Build headers for requests
   */
  buildHeaders(config: ExternalAgentConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...config.headers,
    };

    // Add authentication
    if (config.auth) {
      switch (config.auth.method) {
        case 'api-key':
          headers[config.auth.headerName || 'X-API-Key'] = config.auth.credentials || '';
          break;
        case 'bearer':
          headers['Authorization'] = `Bearer ${config.auth.credentials || ''}`;
          break;
        case 'basic':
          headers['Authorization'] = `Basic ${config.auth.credentials || ''}`;
          break;
      }
    }

    return headers;
  }

  /**
   * Get statistics for all agents
   */
  getStats(): {
    total: number;
    healthy: number;
    unhealthy: number;
    circuitBroken: number;
    totalRequests: number;
    totalErrors: number;
    avgResponseTimeMs: number;
  } {
    const agents = this.list();
    let totalRequests = 0;
    let totalErrors = 0;
    let totalResponseTime = 0;

    for (const agent of agents) {
      totalRequests += agent.state.totalRequests;
      totalErrors += agent.state.totalErrors;
      totalResponseTime += agent.state.avgResponseTimeMs;
    }

    return {
      total: agents.length,
      healthy: agents.filter((a) => a.state.healthStatus === 'healthy').length,
      unhealthy: agents.filter((a) => a.state.healthStatus === 'unhealthy').length,
      circuitBroken: agents.filter((a) => a.state.circuitBroken).length,
      totalRequests,
      totalErrors,
      avgResponseTimeMs: agents.length > 0 ? totalResponseTime / agents.length : 0,
    };
  }

  /**
   * Shutdown - cleanup all health check intervals
   */
  shutdown(): void {
    for (const [agentId, interval] of this.healthCheckIntervals) {
      clearInterval(interval);
      logger.info('health_check_stopped', { agentId });
    }
    this.healthCheckIntervals.clear();
    this.removeAllListeners();
  }
}

// Singleton instance
let registryInstance: ExternalAgentRegistry | null = null;

export function getExternalAgentRegistry(): ExternalAgentRegistry {
  if (!registryInstance) {
    registryInstance = new ExternalAgentRegistry();
  }
  return registryInstance;
}
