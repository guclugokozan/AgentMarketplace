/**
 * Core Module Tests
 *
 * Tests for types, models, and error handling
 */

import { describe, it, expect } from 'vitest';
import {
  ExecuteRequestSchema,
  ToolDefinitionSchema,
} from '../src/core/types.js';
import {
  MODEL_CONFIG,
  EFFORT_PRESETS,
  estimateCost,
  getNextTierDown,
  selectModelForEffort,
  getThinkingBudget,
  mergeBudget,
  DEFAULT_BUDGET,
} from '../src/core/models.js';
import {
  RateLimitError,
  TimeoutError,
  NetworkError,
  BudgetExceededError,
  InvalidInputError,
  AgentNotFoundError,
  ModelDowngradeError,
  isRetryable,
  isNonRetryable,
  isDegradable,
  getRetryDelay,
  wrapError,
} from '../src/core/errors.js';

describe('Core Types', () => {
  describe('ExecuteRequestSchema', () => {
    it('should validate a valid execute request', () => {
      const validRequest = {
        agentId: 'test-agent',
        input: {
          task: 'Review this code',
          parameters: { code: 'function hello() {}' },
        },
        idempotencyKey: 'test-key-123',
      };

      const result = ExecuteRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid execute request', () => {
      const invalidRequest = {
        agentId: '', // Empty ID should fail
        input: { task: '', parameters: {} },
        idempotencyKey: 'key',
      };

      const result = ExecuteRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should validate request with budget', () => {
      const requestWithBudget = {
        agentId: 'test-agent',
        input: { task: 'Do something', parameters: {} },
        idempotencyKey: 'key-123',
        budget: {
          maxTokens: 50000,
          maxCostUsd: 1.00,
          allowModelDowngrade: true,
        },
        effortLevel: 'medium',
      };

      const result = ExecuteRequestSchema.safeParse(requestWithBudget);
      expect(result.success).toBe(true);
    });
  });

  describe('ToolDefinitionSchema', () => {
    it('should validate a valid tool definition', () => {
      const validTool = {
        name: 'file_reader',
        version: '1.0.0',
        description: 'Reads files from the filesystem',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
        defer_loading: true,
        allowed_callers: ['human', 'code_execution_20250825'],
        idempotent: true,
        sideEffectful: false,
        scopes: ['file:read'],
        allowlistedDomains: [],
        timeoutMs: 30000,
      };

      const result = ToolDefinitionSchema.safeParse(validTool);
      expect(result.success).toBe(true);
    });

    it('should validate tool with examples', () => {
      const toolWithExamples = {
        name: 'calculator',
        version: '1.0.0',
        description: 'Performs calculations',
        inputSchema: { type: 'object' },
        defer_loading: false,
        allowed_callers: ['human'],
        inputExamples: [
          {
            description: 'Add two numbers',
            input: { operation: 'add', a: 1, b: 2 },
            expectedOutput: { result: 3 },
          },
        ],
        idempotent: true,
        sideEffectful: false,
        scopes: [],
        allowlistedDomains: [],
        timeoutMs: 5000,
      };

      const result = ToolDefinitionSchema.safeParse(toolWithExamples);
      expect(result.success).toBe(true);
    });

    it('should reject tool with invalid name format', () => {
      const invalidTool = {
        name: 'Invalid-Name', // Must be lowercase with underscores
        version: '1.0.0',
        description: 'A tool',
        inputSchema: {},
        defer_loading: false,
        allowed_callers: ['human'],
        idempotent: true,
        sideEffectful: false,
        scopes: [],
        allowlistedDomains: [],
        timeoutMs: 5000,
      };

      const result = ToolDefinitionSchema.safeParse(invalidTool);
      expect(result.success).toBe(false);
    });
  });
});

describe('Model Configuration', () => {
  describe('MODEL_CONFIG', () => {
    it('should have all required models', () => {
      expect(MODEL_CONFIG).toHaveProperty('claude-opus-4-5-20250514');
      expect(MODEL_CONFIG).toHaveProperty('claude-sonnet-4-5-20250514');
      expect(MODEL_CONFIG).toHaveProperty('claude-haiku-3-5-20241022');
    });

    it('should have correct tier assignments', () => {
      expect(MODEL_CONFIG['claude-opus-4-5-20250514'].tier).toBe('premium');
      expect(MODEL_CONFIG['claude-sonnet-4-5-20250514'].tier).toBe('standard');
      expect(MODEL_CONFIG['claude-haiku-3-5-20241022'].tier).toBe('fast');
    });

    it('should have pricing information', () => {
      const opus = MODEL_CONFIG['claude-opus-4-5-20250514'];
      expect(opus.inputPer1M).toBeGreaterThan(0);
      expect(opus.outputPer1M).toBeGreaterThan(0);
      expect(opus.outputPer1M).toBeGreaterThan(opus.inputPer1M);
    });

    it('should have capabilities defined', () => {
      const sonnet = MODEL_CONFIG['claude-sonnet-4-5-20250514'];
      expect(sonnet.capabilities).toContain('extended_thinking');
      expect(sonnet.capabilities).toContain('coding');
    });
  });

  describe('EFFORT_PRESETS', () => {
    it('should have all effort levels', () => {
      expect(EFFORT_PRESETS).toHaveProperty('minimal');
      expect(EFFORT_PRESETS).toHaveProperty('low');
      expect(EFFORT_PRESETS).toHaveProperty('medium');
      expect(EFFORT_PRESETS).toHaveProperty('high');
      expect(EFFORT_PRESETS).toHaveProperty('maximum');
    });

    it('should have increasing budget tokens', () => {
      expect(EFFORT_PRESETS.minimal.budgetTokens).toBeLessThan(EFFORT_PRESETS.low.budgetTokens);
      expect(EFFORT_PRESETS.low.budgetTokens).toBeLessThan(EFFORT_PRESETS.medium.budgetTokens);
      expect(EFFORT_PRESETS.medium.budgetTokens).toBeLessThan(EFFORT_PRESETS.high.budgetTokens);
      expect(EFFORT_PRESETS.high.budgetTokens).toBeLessThan(EFFORT_PRESETS.maximum.budgetTokens);
    });

    it('should have recommended models', () => {
      expect(EFFORT_PRESETS.minimal.recommendedModel).toBe('claude-haiku-3-5-20241022');
      expect(EFFORT_PRESETS.medium.recommendedModel).toBe('claude-sonnet-4-5-20250514');
      expect(EFFORT_PRESETS.maximum.recommendedModel).toBe('claude-opus-4-5-20250514');
    });
  });

  describe('estimateCost', () => {
    it('should calculate cost correctly', () => {
      const cost = estimateCost('claude-sonnet-4-5-20250514', 1000, 500);
      // Input: 1000 tokens * $3/1M = $0.003
      // Output: 500 tokens * $15/1M = $0.0075
      // Total: $0.0105
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    it('should handle zero tokens', () => {
      const cost = estimateCost('claude-haiku-3-5-20241022', 0, 0);
      expect(cost).toBe(0);
    });

    it('should include thinking tokens at output rate', () => {
      const costWithThinking = estimateCost('claude-sonnet-4-5-20250514', 1000, 500, 1000);
      const costWithoutThinking = estimateCost('claude-sonnet-4-5-20250514', 1000, 500, 0);
      expect(costWithThinking).toBeGreaterThan(costWithoutThinking);
    });
  });

  describe('getNextTierDown', () => {
    it('should return correct downgrade path', () => {
      expect(getNextTierDown('claude-opus-4-5-20250514')).toBe('claude-sonnet-4-5-20250514');
      expect(getNextTierDown('claude-sonnet-4-5-20250514')).toBe('claude-haiku-3-5-20241022');
      expect(getNextTierDown('claude-haiku-3-5-20241022')).toBeNull();
    });
  });

  describe('selectModelForEffort', () => {
    it('should recommend appropriate models for effort levels', () => {
      expect(selectModelForEffort('minimal')).toBe('claude-haiku-3-5-20241022');
      expect(selectModelForEffort('medium')).toBe('claude-sonnet-4-5-20250514');
      expect(selectModelForEffort('maximum')).toBe('claude-opus-4-5-20250514');
    });
  });

  describe('getThinkingBudget', () => {
    it('should return preset budget tokens', () => {
      expect(getThinkingBudget('minimal')).toBe(1024);
      expect(getThinkingBudget('medium')).toBe(10000);
    });

    it('should respect max budget constraint', () => {
      expect(getThinkingBudget('maximum', 10000)).toBe(10000);
      expect(getThinkingBudget('minimal', 100000)).toBe(1024);
    });
  });

  describe('mergeBudget', () => {
    it('should merge partial budget with defaults', () => {
      const merged = mergeBudget({ maxTokens: 100000 });
      expect(merged.maxTokens).toBe(100000);
      expect(merged.maxCostUsd).toBe(DEFAULT_BUDGET.maxCostUsd);
      expect(merged.allowModelDowngrade).toBe(DEFAULT_BUDGET.allowModelDowngrade);
    });

    it('should handle undefined', () => {
      const merged = mergeBudget(undefined);
      expect(merged).toEqual(DEFAULT_BUDGET);
    });
  });
});

describe('Error Handling', () => {
  describe('RetryableError subclasses', () => {
    it('RateLimitError should have correct properties', () => {
      const error = new RateLimitError(5000);
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.retryAfterMs).toBe(5000);
      expect(error.retryable).toBe(true);
      expect(error.name).toBe('RateLimitError');
    });

    it('TimeoutError should have correct properties', () => {
      const error = new TimeoutError('LLM call', 30000);
      expect(error.code).toBe('TIMEOUT');
      expect(error.retryable).toBe(true);
      expect(error.message).toContain('LLM call');
    });

    it('NetworkError should be retryable', () => {
      const error = new NetworkError('Connection refused');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.retryable).toBe(true);
    });
  });

  describe('NonRetryableError subclasses', () => {
    it('BudgetExceededError should have correct properties', () => {
      const error = new BudgetExceededError('tokens', 50000, 40000);
      expect(error.code).toBe('BUDGET_EXCEEDED');
      expect(error.retryable).toBe(false);
      expect(error.resourceType).toBe('tokens');
      expect(error.consumed).toBe(50000);
      expect(error.budget).toBe(40000);
    });

    it('InvalidInputError should not be retryable', () => {
      const error = new InvalidInputError('Missing required field');
      expect(error.code).toBe('INVALID_INPUT');
      expect(error.retryable).toBe(false);
    });

    it('AgentNotFoundError should include agent ID', () => {
      const error = new AgentNotFoundError('my-agent');
      expect(error.code).toBe('AGENT_NOT_FOUND');
      expect(error.message).toContain('my-agent');
    });
  });

  describe('DegradableError', () => {
    it('should create with degradation info', () => {
      const error = new ModelDowngradeError(
        'claude-opus-4-5-20250514',
        'claude-sonnet-4-5-20250514',
        'Budget constraint'
      );
      expect(error.degradationPath).toBe('model_downgrade');
      expect(error.originalCapability).toBe('claude-opus-4-5-20250514');
      expect(error.reducedCapability).toBe('claude-sonnet-4-5-20250514');
    });
  });

  describe('isRetryable', () => {
    it('should identify retryable errors', () => {
      expect(isRetryable(new RateLimitError(1000))).toBe(true);
      expect(isRetryable(new TimeoutError('op', 1000))).toBe(true);
      expect(isRetryable(new NetworkError('error'))).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      expect(isRetryable(new BudgetExceededError('tokens', 100, 50))).toBe(false);
      expect(isRetryable(new InvalidInputError('bad'))).toBe(false);
    });
  });

  describe('isNonRetryable', () => {
    it('should identify non-retryable errors', () => {
      expect(isNonRetryable(new BudgetExceededError('cost', 10, 5))).toBe(true);
      expect(isNonRetryable(new AgentNotFoundError('agent'))).toBe(true);
    });

    it('should not match retryable errors', () => {
      expect(isNonRetryable(new RateLimitError(1000))).toBe(false);
    });
  });

  describe('isDegradable', () => {
    it('should identify degradable errors', () => {
      const error = new ModelDowngradeError('opus', 'sonnet', 'cost');
      expect(isDegradable(error)).toBe(true);
    });
  });

  describe('getRetryDelay', () => {
    it('should return retry delay for retryable errors', () => {
      const error = new RateLimitError(5000);
      const delay = getRetryDelay(error, 1);
      expect(delay).toBeGreaterThanOrEqual(5000);
      expect(delay).toBeLessThanOrEqual(6500); // With jitter
    });

    it('should apply exponential backoff', () => {
      const error = new NetworkError('error');
      const delay1 = getRetryDelay(error, 1);
      const delay2 = getRetryDelay(error, 2);
      const delay3 = getRetryDelay(error, 3);

      // Each delay should be roughly 2x the previous (with jitter)
      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    it('should cap at 60 seconds', () => {
      const error = new RateLimitError(100000);
      const delay = getRetryDelay(error, 10);
      expect(delay).toBeLessThanOrEqual(60000);
    });
  });

  describe('wrapError', () => {
    it('should pass through AgentMarketplaceError instances', () => {
      const original = new RateLimitError(1000);
      const wrapped = wrapError(original);
      expect(wrapped).toBe(original);
    });

    it('should wrap network errors appropriately', () => {
      const original = new Error('ECONNREFUSED');
      const wrapped = wrapError(original);
      expect(wrapped.code).toBe('NETWORK_ERROR');
      expect(isRetryable(wrapped)).toBe(true);
    });

    it('should wrap timeout errors appropriately', () => {
      const original = new Error('timeout exceeded');
      const wrapped = wrapError(original, 'API call');
      expect(wrapped.code).toBe('TIMEOUT');
    });

    it('should wrap unknown errors as non-retryable', () => {
      const wrapped = wrapError('string error');
      expect(wrapped.code).toBe('UNKNOWN_ERROR');
      expect(isNonRetryable(wrapped)).toBe(true);
    });
  });
});
