/**
 * Agent Registry
 *
 * Manages registered agents and provides discovery.
 */

import type { Agent, AgentCard, AgentHealth } from '../core/types.js';
import { getDatabase } from '../storage/database.js';
import { getRunsStorage } from '../storage/runs.js';
import { getLogger } from '../logging/logger.js';

export class AgentRegistry {
  private agents: Map<string, Agent> = new Map();
  private db = getDatabase();
  private logger = getLogger();

  /**
   * Register an agent
   */
  register(agent: Agent): void {
    this.agents.set(agent.card.id, agent);
    this.logger.info('agent_registered', { agent_id: agent.card.id, version: agent.card.version });
  }

  /**
   * Unregister an agent
   */
  unregister(agentId: string): boolean {
    const removed = this.agents.delete(agentId);
    if (removed) {
      this.logger.info('agent_unregistered', { agent_id: agentId });
    }
    return removed;
  }

  /**
   * Get an agent by ID
   */
  get(agentId: string): Agent | null {
    return this.agents.get(agentId) ?? null;
  }

  /**
   * Get all agent cards
   */
  listCards(): AgentCard[] {
    return [...this.agents.values()].map(a => a.card);
  }

  /**
   * Search agents by capability or description
   */
  search(query: string): AgentCard[] {
    const queryLower = query.toLowerCase();
    const results: { card: AgentCard; score: number }[] = [];

    for (const agent of this.agents.values()) {
      let score = 0;

      // Name match
      if (agent.card.name.toLowerCase().includes(queryLower)) {
        score += 0.5;
      }

      // Description match
      if (agent.card.description.toLowerCase().includes(queryLower)) {
        score += 0.3;
      }

      // Capability match
      for (const cap of agent.card.capabilities) {
        if (cap.toLowerCase().includes(queryLower)) {
          score += 0.2;
        }
      }

      if (score > 0) {
        results.push({ card: agent.card, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .map(r => r.card);
  }

  /**
   * Get agents by capability
   */
  findByCapability(capability: string): AgentCard[] {
    return [...this.agents.values()]
      .filter(a => a.card.capabilities.includes(capability))
      .map(a => a.card);
  }

  /**
   * Get agent health
   */
  async getHealth(agentId: string): Promise<AgentHealth | null> {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    // Get from cache first
    const cached = this.db.prepare(
      'SELECT * FROM agent_health WHERE agent_id = ?'
    ).get(agentId) as any;

    if (cached) {
      const cacheAge = Date.now() - new Date(cached.last_checked).getTime();
      // Use cache if less than 5 minutes old
      if (cacheAge < 5 * 60 * 1000) {
        return {
          status: cached.status,
          successRate: cached.success_rate,
          p50LatencyMs: cached.p50_latency_ms,
          p95LatencyMs: cached.p95_latency_ms,
          totalRuns: cached.total_runs,
          lastChecked: new Date(cached.last_checked),
        };
      }
    }

    // Calculate fresh health
    const health = await this.calculateHealth(agentId);

    // Update cache
    this.db.prepare(`
      INSERT OR REPLACE INTO agent_health (agent_id, status, success_rate, p50_latency_ms, p95_latency_ms, total_runs, last_checked)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      agentId,
      health.status,
      health.successRate,
      health.p50LatencyMs,
      health.p95LatencyMs,
      health.totalRuns,
      health.lastChecked.toISOString()
    );

    return health;
  }

  /**
   * Calculate health from recent runs
   */
  private async calculateHealth(agentId: string): Promise<AgentHealth> {
    const runs = getRunsStorage().findRecent(agentId, { hours: 24, limit: 100 });

    if (runs.length === 0) {
      return {
        status: 'unknown',
        successRate: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        totalRuns: 0,
        lastChecked: new Date(),
      };
    }

    const successful = runs.filter(r => r.status === 'completed' || r.status === 'partial');
    const successRate = successful.length / runs.length;

    const latencies = runs
      .map(r => r.consumed.durationMs)
      .filter(d => d > 0)
      .sort((a, b) => a - b);

    const p50Index = Math.floor(latencies.length * 0.5);
    const p95Index = Math.floor(latencies.length * 0.95);

    let status: AgentHealth['status'] = 'healthy';
    if (successRate < 0.5) {
      status = 'unhealthy';
    } else if (successRate < 0.9) {
      status = 'degraded';
    }

    return {
      status,
      successRate,
      p50LatencyMs: latencies[p50Index] ?? 0,
      p95LatencyMs: latencies[p95Index] ?? 0,
      totalRuns: runs.length,
      lastChecked: new Date(),
    };
  }

  /**
   * Get statistics
   */
  getStats(): { totalAgents: number; byCapability: Record<string, number> } {
    const byCapability: Record<string, number> = {};

    for (const agent of this.agents.values()) {
      for (const cap of agent.card.capabilities) {
        byCapability[cap] = (byCapability[cap] ?? 0) + 1;
      }
    }

    return {
      totalAgents: this.agents.size,
      byCapability,
    };
  }
}

// Singleton instance
let instance: AgentRegistry | null = null;

export function getAgentRegistry(): AgentRegistry {
  if (!instance) {
    instance = new AgentRegistry();
  }
  return instance;
}
