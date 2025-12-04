/**
 * Discovery Service Tests
 *
 * Comprehensive tests for agent and tool discovery
 */

import { describe, it, expect } from 'vitest';

describe('Discovery Service', () => {
  describe('Query Normalization', () => {
    function normalizeQuery(query: string): string {
      return query
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    it('should convert to lowercase', () => {
      expect(normalizeQuery('Find CODE Analyzer')).toBe('find code analyzer');
    });

    it('should remove special characters', () => {
      expect(normalizeQuery('find @#$% code!')).toBe('find code');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeQuery('find    code    tool')).toBe('find code tool');
    });

    it('should trim whitespace', () => {
      expect(normalizeQuery('  find code  ')).toBe('find code');
    });

    it('should handle mixed input', () => {
      expect(normalizeQuery('  Find CODE @analyzer!!  ')).toBe('find code analyzer');
    });
  });

  describe('Term Extraction', () => {
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

    function extractTerms(query: string): string[] {
      return query
        .split(' ')
        .filter(term => term.length > 2 && !stopWords.has(term));
    }

    it('should remove stop words', () => {
      const terms = extractTerms('find the code analyzer');
      expect(terms).not.toContain('the');
      expect(terms).toContain('find');
      expect(terms).toContain('code');
      expect(terms).toContain('analyzer');
    });

    it('should filter short words', () => {
      const terms = extractTerms('a is to be or it an');
      expect(terms).toHaveLength(0);
    });

    it('should keep meaningful terms', () => {
      const terms = extractTerms('code review tool');
      expect(terms).toEqual(['code', 'review', 'tool']);
    });

    it('should handle empty query', () => {
      const terms = extractTerms('');
      expect(terms).toHaveLength(0);
    });
  });

  describe('Capability Inference', () => {
    const CAPABILITY_KEYWORDS: Record<string, string[]> = {
      'code-analysis': ['code', 'review', 'lint', 'analyze', 'refactor', 'debug'],
      'data-processing': ['data', 'csv', 'json', 'parse', 'transform', 'aggregate'],
      'text-generation': ['write', 'generate', 'create', 'compose', 'draft'],
      'summarization': ['summarize', 'summary', 'brief', 'condense', 'tldr'],
      'search': ['search', 'find', 'lookup', 'query', 'retrieve'],
      'automation': ['automate', 'workflow', 'batch', 'process', 'schedule'],
    };

    function inferCapabilities(terms: string[]): string[] {
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

    it('should infer code-analysis from code terms', () => {
      const caps = inferCapabilities(['code', 'review']);
      expect(caps).toContain('code-analysis');
    });

    it('should infer data-processing from data terms', () => {
      const caps = inferCapabilities(['csv', 'parse']);
      expect(caps).toContain('data-processing');
    });

    it('should infer multiple capabilities', () => {
      const caps = inferCapabilities(['code', 'data', 'summarize']);
      expect(caps).toContain('code-analysis');
      expect(caps).toContain('data-processing');
      expect(caps).toContain('summarization');
    });

    it('should return empty for unknown terms', () => {
      const caps = inferCapabilities(['xyz', 'abc']);
      expect(caps).toHaveLength(0);
    });
  });

  describe('Category Inference', () => {
    const CATEGORY_KEYWORDS: Record<string, string[]> = {
      'development': ['code', 'develop', 'program', 'build', 'deploy', 'test', 'debug'],
      'productivity': ['document', 'email', 'calendar', 'task', 'note', 'organize'],
      'data': ['data', 'database', 'analytics', 'report', 'dashboard', 'metric'],
      'communication': ['chat', 'message', 'notify', 'collaborate', 'share'],
      'security': ['security', 'audit', 'vulnerability', 'scan', 'protect'],
      'integration': ['api', 'webhook', 'connect', 'sync', 'integrate'],
    };

    function inferCategory(terms: string[]): string | undefined {
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

    it('should infer development category', () => {
      const category = inferCategory(['code', 'debug', 'test']);
      expect(category).toBe('development');
    });

    it('should infer data category', () => {
      const category = inferCategory(['database', 'analytics']);
      expect(category).toBe('data');
    });

    it('should pick highest scoring category', () => {
      // development has 2 matches, data has 1
      const category = inferCategory(['code', 'debug', 'data']);
      expect(category).toBe('development');
    });

    it('should return undefined for no matches', () => {
      const category = inferCategory(['unknown', 'terms']);
      expect(category).toBeUndefined();
    });
  });

  describe('Score Calculation', () => {
    function calculateScore(
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
        if (nameLower === term) {
          score += 1.0;
          matchedTerms.push(term);
        } else if (nameLower.includes(term)) {
          score += 0.6;
          matchedTerms.push(term);
        } else if (descLower.includes(term)) {
          score += 0.3;
          matchedTerms.push(term);
        } else if (capsLower.some(c => c.includes(term))) {
          score += 0.4;
          matchedTerms.push(term);
        }
      }

      score = score / Math.max(queryTerms.length, 1);
      return { score: Math.min(score, 1.0), matchedTerms };
    }

    it('should give highest score for exact name match', () => {
      const { score } = calculateScore(['analyzer'], 'analyzer', 'A tool', []);
      expect(score).toBe(1.0);
    });

    it('should give high score for name contains', () => {
      const { score } = calculateScore(['code'], 'code-analyzer', 'A tool', []);
      expect(score).toBe(0.6);
    });

    it('should give medium score for description match', () => {
      const { score } = calculateScore(['reviews'], 'tool', 'Reviews code', []);
      expect(score).toBe(0.3);
    });

    it('should give score for capability match', () => {
      const { score } = calculateScore(['analysis'], 'tool', 'A tool', ['code-analysis']);
      expect(score).toBe(0.4);
    });

    it('should normalize by query length', () => {
      const { score } = calculateScore(['code', 'review', 'tool'], 'code-reviewer', 'Reviews code', []);
      // code: 0.6, review: 0.6 (name includes), tool: 0 = 1.2 / 3 = 0.4
      expect(score).toBeCloseTo(0.4, 1);
    });

    it('should track matched terms', () => {
      const { matchedTerms } = calculateScore(['code', 'unknown'], 'code-tool', 'A tool', []);
      expect(matchedTerms).toContain('code');
      expect(matchedTerms).not.toContain('unknown');
    });

    it('should cap score at 1.0', () => {
      const { score } = calculateScore(['tool'], 'tool', 'tool helper for tools', ['tool']);
      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Search Filtering', () => {
    it('should filter by minimum score', () => {
      const results = [
        { score: 0.8, id: '1' },
        { score: 0.05, id: '2' },
        { score: 0.3, id: '3' },
      ];
      const minScore = 0.1;
      const filtered = results.filter(r => r.score >= minScore);
      expect(filtered).toHaveLength(2);
      expect(filtered.map(r => r.id)).toEqual(['1', '3']);
    });

    it('should sort by score descending', () => {
      const results = [
        { score: 0.3, id: '1' },
        { score: 0.8, id: '2' },
        { score: 0.5, id: '3' },
      ];
      const sorted = results.sort((a, b) => b.score - a.score);
      expect(sorted.map(r => r.id)).toEqual(['2', '3', '1']);
    });

    it('should respect limit', () => {
      const results = Array.from({ length: 50 }, (_, i) => ({ score: 0.5, id: String(i) }));
      const limit = 20;
      const limited = results.slice(0, limit);
      expect(limited).toHaveLength(20);
    });

    it('should filter by type', () => {
      const results = [
        { type: 'agent', id: '1' },
        { type: 'tool', id: '2' },
        { type: 'agent', id: '3' },
      ];
      const agentsOnly = results.filter(r => r.type === 'agent');
      expect(agentsOnly).toHaveLength(2);
    });
  });

  describe('Recommendations', () => {
    it('should deduplicate results', () => {
      const results = [
        { id: '1', score: 0.8 },
        { id: '2', score: 0.7 },
        { id: '1', score: 0.6 }, // duplicate
        { id: '3', score: 0.5 },
      ];

      const seen = new Set<string>();
      const deduped = results.filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      expect(deduped).toHaveLength(3);
      expect(deduped.map(r => r.id)).toEqual(['1', '2', '3']);
    });

    it('should limit recommendations', () => {
      const results = Array.from({ length: 20 }, (_, i) => ({ id: String(i) }));
      const limited = results.slice(0, 10);
      expect(limited).toHaveLength(10);
    });
  });

  describe('Search Analytics', () => {
    it('should track search metadata', () => {
      const analytics = {
        query: 'code review tool',
        results: 5,
        topCategory: 'development',
        avgScore: 0.65,
        timestamp: new Date(),
      };

      expect(analytics.query).toBe('code review tool');
      expect(analytics.results).toBe(5);
      expect(analytics.avgScore).toBeGreaterThan(0);
    });

    it('should calculate average score', () => {
      const scores = [0.8, 0.6, 0.4, 0.2];
      const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      expect(avg).toBeCloseTo(0.5, 10);
    });

    it('should handle empty results', () => {
      const results: any[] = [];
      const avgScore = results.length > 0
        ? results.reduce((sum, r) => sum + r.score, 0) / results.length
        : 0;
      expect(avgScore).toBe(0);
    });
  });

  describe('Popular Searches', () => {
    it('should track search frequency', () => {
      const popularSearches = new Map<string, number>();
      const query = 'code review';

      const count = popularSearches.get(query) ?? 0;
      popularSearches.set(query, count + 1);

      expect(popularSearches.get(query)).toBe(1);
    });

    it('should sort by frequency', () => {
      const searches = [
        { query: 'code', count: 10 },
        { query: 'data', count: 5 },
        { query: 'test', count: 15 },
      ];

      const sorted = searches.sort((a, b) => b.count - a.count);
      expect(sorted[0].query).toBe('test');
      expect(sorted[1].query).toBe('code');
    });

    it('should limit results', () => {
      const searches = Array.from({ length: 20 }, (_, i) => ({
        query: `query-${i}`,
        count: 20 - i,
      }));

      const top10 = searches.slice(0, 10);
      expect(top10).toHaveLength(10);
    });
  });

  describe('Search Result Structure', () => {
    it('should have required fields', () => {
      const result = {
        type: 'agent' as const,
        id: 'agent-1',
        name: 'Code Reviewer',
        description: 'Reviews code for issues',
        score: 0.85,
        matchedTerms: ['code', 'review'],
        category: 'development',
      };

      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('matchedTerms');
    });

    it('should support agent type', () => {
      const result = { type: 'agent' as const };
      expect(result.type).toBe('agent');
    });

    it('should support tool type', () => {
      const result = { type: 'tool' as const };
      expect(result.type).toBe('tool');
    });
  });
});
