/**
 * Tool Registry with Tool Search Support
 *
 * Implements Anthropic's Tool Search pattern:
 * - defer_loading: Tools not loaded upfront, discovered on-demand
 * - Always-loaded tools: Core tools always available
 * - Search tool: Meta-tool for discovering deferred tools
 */

import type { ToolDefinition, ToolSearchResult } from '../core/types.js';
import { ToolDefinitionSchema } from '../core/types.js';
import { getLogger } from '../logging/logger.js';

export class ToolRegistry {
  private deferredTools: Map<string, ToolDefinition> = new Map();
  private alwaysLoadedTools: Map<string, ToolDefinition> = new Map();
  private logger = getLogger();

  /**
   * Register a tool. Tools with defer_loading=true are only available via search.
   */
  register(tool: ToolDefinition): void {
    // Validate tool definition
    const result = ToolDefinitionSchema.safeParse(tool);
    if (!result.success) {
      throw new Error(`Invalid tool definition for ${tool.name}: ${result.error.message}`);
    }

    if (tool.defer_loading) {
      this.deferredTools.set(tool.name, tool);
      this.logger.debug('tool_registered_deferred', { tool: tool.name, category: tool.category });
    } else {
      this.alwaysLoadedTools.set(tool.name, tool);
      this.logger.debug('tool_registered_always', { tool: tool.name });
    }
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    return this.deferredTools.delete(name) || this.alwaysLoadedTools.delete(name);
  }

  /**
   * Get tool by name (from either registry)
   */
  get(name: string): ToolDefinition | null {
    return this.alwaysLoadedTools.get(name) ?? this.deferredTools.get(name) ?? null;
  }

  /**
   * Get all always-loaded tools (for API requests)
   */
  getAlwaysLoadedTools(): ToolDefinition[] {
    return [...this.alwaysLoadedTools.values()];
  }

  /**
   * Get tools for Claude API request (always-loaded + search meta-tool)
   */
  getToolsForRequest(): ToolDefinition[] {
    const tools = this.getAlwaysLoadedTools();

    // Add the tool search meta-tool if we have deferred tools
    if (this.deferredTools.size > 0) {
      tools.push(this.createSearchTool());
    }

    return tools;
  }

  /**
   * Search for tools matching a query
   */
  search(query: string, category?: string): ToolSearchResult[] {
    let candidates = [...this.deferredTools.values()];

    // Filter by category if provided
    if (category) {
      candidates = candidates.filter(t => t.category === category);
    }

    // Score and rank results
    const results = candidates.map(tool => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
      relevanceScore: this.calculateRelevance(query, tool),
    }));

    return results
      .filter(r => r.relevanceScore > 0.2)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10);
  }

  /**
   * Get all available categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    for (const tool of this.deferredTools.values()) {
      if (tool.category) {
        categories.add(tool.category);
      }
    }
    return [...categories].sort();
  }

  /**
   * Load a deferred tool's full definition
   */
  loadTool(name: string): ToolDefinition | null {
    const tool = this.deferredTools.get(name);
    if (tool) {
      this.logger.debug('tool_loaded', { tool: name });
    }
    return tool ?? null;
  }

  /**
   * Get statistics about registered tools
   */
  getStats(): { alwaysLoaded: number; deferred: number; categories: number } {
    return {
      alwaysLoaded: this.alwaysLoadedTools.size,
      deferred: this.deferredTools.size,
      categories: this.getCategories().length,
    };
  }

  /**
   * Create the tool search meta-tool
   */
  private createSearchTool(): ToolDefinition {
    const categories = this.getCategories();
    const categoryList = categories.length > 0
      ? `Available categories: ${categories.join(', ')}`
      : 'No categories defined';

    return {
      name: 'tool_search',
      version: '1.0.0',
      description: `Search for available tools to accomplish a task. ${categoryList}. Use this to discover tools before calling them.`,
      category: 'meta',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'What you want to accomplish (e.g., "send email", "create ticket")',
          },
          category: {
            type: 'string',
            description: 'Optional category to filter results',
            enum: categories.length > 0 ? categories : undefined,
          },
        },
        required: ['query'],
      },
      defer_loading: false,
      allowed_callers: ['human', 'code_execution_20250825'],
      idempotent: true,
      returnFormat: '{ results: [{ name: string, description: string, relevanceScore: number }] }',
      sideEffectful: false,
      scopes: [],
      allowlistedDomains: [],
      timeoutMs: 1000,
      execute: async (input: unknown) => {
        const { query, category } = input as { query: string; category?: string };
        const results = this.search(query, category);
        return { results };
      },
    };
  }

  /**
   * Calculate relevance score for a tool against a query
   */
  private calculateRelevance(query: string, tool: ToolDefinition): number {
    const queryLower = query.toLowerCase();
    const nameLower = tool.name.toLowerCase();
    const descLower = tool.description.toLowerCase();

    let score = 0;

    // Exact name match
    if (nameLower === queryLower) {
      score += 1.0;
    }
    // Name contains query
    else if (nameLower.includes(queryLower)) {
      score += 0.6;
    }
    // Query contains name
    else if (queryLower.includes(nameLower)) {
      score += 0.4;
    }

    // Description contains query
    if (descLower.includes(queryLower)) {
      score += 0.3;
    }

    // Word overlap
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const toolWords = new Set([
      ...nameLower.split(/[_\s]+/),
      ...descLower.split(/\s+/),
    ]);

    for (const word of queryWords) {
      for (const toolWord of toolWords) {
        if (toolWord.includes(word) || word.includes(toolWord)) {
          score += 0.1;
        }
      }
    }

    // Capability keywords
    const capabilityKeywords: Record<string, string[]> = {
      email: ['send', 'mail', 'message', 'notify'],
      database: ['query', 'sql', 'db', 'record', 'store'],
      file: ['read', 'write', 'create', 'delete', 'upload'],
      api: ['request', 'http', 'rest', 'fetch'],
      search: ['find', 'lookup', 'query', 'get'],
    };

    for (const [_capability, keywords] of Object.entries(capabilityKeywords)) {
      const queryHasCapability = keywords.some(k => queryLower.includes(k));
      const toolHasCapability = keywords.some(k => nameLower.includes(k) || descLower.includes(k));

      if (queryHasCapability && toolHasCapability) {
        score += 0.2;
      }
    }

    return Math.min(score, 1.0);
  }
}

// Singleton instance
let instance: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!instance) {
    instance = new ToolRegistry();
  }
  return instance;
}
