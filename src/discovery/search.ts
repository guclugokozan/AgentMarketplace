/**
 * Natural Language Discovery
 *
 * Enables finding agents and tools through natural language queries:
 * - Semantic search using embeddings (optional)
 * - Keyword-based fallback
 * - Category inference
 * - Recommendations based on usage patterns
 */

// Discovery types are inferred from registry
import { getAgentRegistry } from '../agents/registry.js';
import { getToolRegistry } from '../tools/registry.js';
import { createLogger, StructuredLogger } from '../logging/logger.js';

export interface SearchResult {
  type: 'agent' | 'tool';
  id: string;
  name: string;
  description: string;
  score: number;
  matchedTerms: string[];
  category?: string;
}

export interface SearchOptions {
  type?: 'agent' | 'tool' | 'all';
  category?: string;
  capabilities?: string[];
  limit?: number;
  minScore?: number;
}

export interface SearchAnalytics {
  query: string;
  results: number;
  topCategory?: string;
  avgScore: number;
  timestamp: Date;
}

// Capability keywords for inference
const CAPABILITY_KEYWORDS: Record<string, string[]> = {
  'code-analysis': ['code', 'review', 'lint', 'analyze', 'refactor', 'debug'],
  'data-processing': ['data', 'csv', 'json', 'parse', 'transform', 'aggregate'],
  'text-generation': ['write', 'generate', 'create', 'compose', 'draft'],
  'summarization': ['summarize', 'summary', 'brief', 'condense', 'tldr'],
  'search': ['search', 'find', 'lookup', 'query', 'retrieve'],
  'automation': ['automate', 'workflow', 'batch', 'process', 'schedule'],
  'communication': ['email', 'message', 'notify', 'send', 'alert'],
  'analysis': ['analyze', 'insight', 'report', 'statistics', 'trends'],
};

// Category mappings
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'development': ['code', 'develop', 'program', 'build', 'deploy', 'test', 'debug'],
  'productivity': ['document', 'email', 'calendar', 'task', 'note', 'organize'],
  'data': ['data', 'database', 'analytics', 'report', 'dashboard', 'metric'],
  'communication': ['chat', 'message', 'notify', 'collaborate', 'share'],
  'security': ['security', 'audit', 'vulnerability', 'scan', 'protect'],
  'integration': ['api', 'webhook', 'connect', 'sync', 'integrate'],
};

export class DiscoveryService {
  private logger: StructuredLogger;
  private searchHistory: SearchAnalytics[] = [];
  private popularSearches: Map<string, number> = new Map();

  constructor() {
    this.logger = createLogger({ level: 'info' });
  }

  /**
   * Search for agents and tools using natural language
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const {
      type = 'all',
      category,
      capabilities,
      limit = 20,
      minScore = 0.1,
    } = options;

    this.logger.debug('discovery_search', { query, options });

    const results: SearchResult[] = [];

    // Normalize query
    const normalizedQuery = this.normalizeQuery(query);
    const queryTerms = this.extractTerms(normalizedQuery);
    const inferredCapabilities = this.inferCapabilities(queryTerms);
    const inferredCategory = this.inferCategory(queryTerms);

    // Search agents
    if (type === 'all' || type === 'agent') {
      const agentResults = this.searchAgents(queryTerms, {
        category: category ?? inferredCategory,
        capabilities: capabilities ?? inferredCapabilities,
      });
      results.push(...agentResults);
    }

    // Search tools
    if (type === 'all' || type === 'tool') {
      const toolResults = this.searchTools(queryTerms, {
        category: category ?? inferredCategory,
      });
      results.push(...toolResults);
    }

    // Sort by score and filter
    const filtered = results
      .filter(r => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Track analytics
    this.trackSearch({
      query,
      results: filtered.length,
      topCategory: inferredCategory,
      avgScore: filtered.length > 0
        ? filtered.reduce((sum, r) => sum + r.score, 0) / filtered.length
        : 0,
      timestamp: new Date(),
    });

    return filtered;
  }

  /**
   * Get recommendations based on context
   */
  async getRecommendations(context: {
    recentAgents?: string[];
    recentTools?: string[];
    currentTask?: string;
  }): Promise<SearchResult[]> {
    const recommendations: SearchResult[] = [];

    // If current task provided, search for relevant agents
    if (context.currentTask) {
      const taskResults = await this.search(context.currentTask, { limit: 5 });
      recommendations.push(...taskResults);
    }

    // Find similar agents to recently used
    if (context.recentAgents?.length) {
      const similar = await this.findSimilarAgents(context.recentAgents[0]);
      recommendations.push(...similar);
    }

    // Deduplicate and sort
    const seen = new Set<string>();
    return recommendations.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    }).slice(0, 10);
  }

  /**
   * Find agents similar to a given agent
   */
  async findSimilarAgents(agentId: string): Promise<SearchResult[]> {
    const registry = getAgentRegistry();
    const agent = registry.get(agentId);

    if (!agent) return [];

    // Search using agent's capabilities
    const query = agent.card.capabilities.join(' ');
    const results = await this.search(query, { type: 'agent', limit: 5 });

    // Filter out the original agent
    return results.filter(r => r.id !== agentId);
  }

  /**
   * Get popular searches
   */
  getPopularSearches(limit: number = 10): { query: string; count: number }[] {
    return [...this.popularSearches.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([query, count]) => ({ query, count }));
  }

  /**
   * Search agents
   */
  private searchAgents(
    queryTerms: string[],
    filters: { category?: string; capabilities?: string[] }
  ): SearchResult[] {
    const registry = getAgentRegistry();
    const agents = registry.listCards();

    const results: SearchResult[] = [];

    for (const agent of agents) {
      // Apply capability filter first
      if (filters.capabilities?.length) {
        const hasCapability = filters.capabilities.some(c =>
          agent.capabilities.includes(c)
        );
        if (!hasCapability) continue;
      }

      const { score, matchedTerms } = this.calculateScore(
        queryTerms,
        agent.name,
        agent.description,
        agent.capabilities
      );

      if (score > 0) {
        results.push({
          type: 'agent',
          id: agent.id,
          name: agent.name,
          description: agent.description,
          score,
          matchedTerms,
          category: this.inferCategory(agent.capabilities),
        });
      }
    }

    return results;
  }

  /**
   * Search tools
   */
  private searchTools(
    queryTerms: string[],
    options: { category?: string }
  ): SearchResult[] {
    const registry = getToolRegistry();
    const tools = registry.getAlwaysLoadedTools();
    const results: SearchResult[] = [];

    for (const tool of tools) {
      // Apply category filter if specified
      if (options.category && tool.category !== options.category) {
        continue;
      }

      const { score, matchedTerms } = this.calculateScore(
        queryTerms,
        tool.name,
        tool.description,
        []
      );

      if (score > 0) {
        results.push({
          type: 'tool',
          id: tool.name,
          name: tool.name,
          description: tool.description,
          score,
          matchedTerms,
          category: tool.category,
        });
      }
    }

    return results;
  }

  /**
   * Calculate relevance score
   */
  private calculateScore(
    queryTerms: string[],
    name: string,
    description: string,
    capabilities: string[]
  ): { score: number; matchedTerms: string[] } {
    let score = 0;
    const matchedTerms: string[] = [];
    const nameLower = name.toLowerCase();
    const descLower = description.toLowerCase();
    const capsLower = capabilities.map(c => c.toLowerCase());

    for (const term of queryTerms) {
      // Exact name match
      if (nameLower === term) {
        score += 1.0;
        matchedTerms.push(term);
      }
      // Name contains term
      else if (nameLower.includes(term)) {
        score += 0.6;
        matchedTerms.push(term);
      }
      // Description contains term
      else if (descLower.includes(term)) {
        score += 0.3;
        matchedTerms.push(term);
      }
      // Capability match
      else if (capsLower.some(c => c.includes(term))) {
        score += 0.4;
        matchedTerms.push(term);
      }
    }

    // Normalize by query length
    score = score / Math.max(queryTerms.length, 1);

    return { score: Math.min(score, 1.0), matchedTerms };
  }

  /**
   * Normalize search query
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract search terms
   */
  private extractTerms(query: string): string[] {
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'can',
      'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
      'as', 'into', 'through', 'during', 'before', 'after',
      'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its',
      'that', 'this', 'these', 'those', 'what', 'which', 'who',
      'and', 'or', 'but', 'if', 'then', 'than', 'so', 'because',
    ]);

    return query
      .split(' ')
      .filter(term => term.length > 2 && !stopWords.has(term));
  }

  /**
   * Infer capabilities from terms
   */
  private inferCapabilities(terms: string[]): string[] {
    const capabilities: Set<string> = new Set();

    for (const term of terms) {
      for (const [capability, keywords] of Object.entries(CAPABILITY_KEYWORDS)) {
        if (keywords.some(k => term.includes(k) || k.includes(term))) {
          capabilities.add(capability);
        }
      }
    }

    return [...capabilities];
  }

  /**
   * Infer category from terms
   */
  private inferCategory(terms: string[]): string | undefined {
    const scores: Record<string, number> = {};

    for (const term of terms) {
      for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        if (keywords.some(k => term.includes(k) || k.includes(term))) {
          scores[category] = (scores[category] ?? 0) + 1;
        }
      }
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : undefined;
  }

  /**
   * Track search analytics
   */
  private trackSearch(analytics: SearchAnalytics): void {
    this.searchHistory.push(analytics);

    // Keep last 1000 searches
    if (this.searchHistory.length > 1000) {
      this.searchHistory = this.searchHistory.slice(-1000);
    }

    // Track popular searches
    const count = this.popularSearches.get(analytics.query) ?? 0;
    this.popularSearches.set(analytics.query, count + 1);
  }
}

// Singleton instance
let instance: DiscoveryService | null = null;

export function getDiscoveryService(): DiscoveryService {
  if (!instance) {
    instance = new DiscoveryService();
  }
  return instance;
}
