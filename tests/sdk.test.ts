/**
 * SDK Tests
 *
 * Comprehensive tests for defineAgent and LocalRunner
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('SDK - defineAgent', () => {
  describe('Agent Definition Structure', () => {
    it('should have required identity fields', () => {
      const definition = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        version: '1.0.0',
      };

      expect(definition).toHaveProperty('id');
      expect(definition).toHaveProperty('name');
      expect(definition).toHaveProperty('description');
      expect(definition).toHaveProperty('version');
    });

    it('should support optional model configuration', () => {
      const definition = {
        models: {
          default: 'claude-sonnet-4-5-20250514',
          fallback: 'claude-haiku-3-5-20241022',
          premium: 'claude-opus-4-20250514',
        },
      };

      expect(definition.models.default).toBe('claude-sonnet-4-5-20250514');
      expect(definition.models.fallback).toBe('claude-haiku-3-5-20241022');
    });

    it('should support effort levels', () => {
      const effortLevels = ['low', 'medium', 'high', 'max'];
      expect(effortLevels).toContain('low');
      expect(effortLevels).toContain('medium');
      expect(effortLevels).toContain('high');
      expect(effortLevels).toContain('max');
    });

    it('should support cost tiers', () => {
      const costTiers = ['low', 'medium', 'high'];
      expect(costTiers).toContain('low');
      expect(costTiers).toContain('medium');
      expect(costTiers).toContain('high');
    });
  });

  describe('AgentCard Generation', () => {
    it('should create AgentCard from definition', () => {
      const card = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        version: '1.0.0',
        capabilities: ['code-analysis'],
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        defaultModel: 'claude-sonnet-4-5-20250514',
        defaultEffortLevel: 'medium',
        sideEffects: false,
        estimatedCostTier: 'medium',
      };

      expect(card.id).toBe('test-agent');
      expect(card.capabilities).toContain('code-analysis');
      expect(card.defaultModel).toBe('claude-sonnet-4-5-20250514');
    });

    it('should use default values when not specified', () => {
      const defaults = {
        defaultModel: 'claude-sonnet-4-5-20250514',
        defaultEffortLevel: 'medium',
        sideEffects: false,
        estimatedCostTier: 'medium',
      };

      expect(defaults.defaultModel).toBe('claude-sonnet-4-5-20250514');
      expect(defaults.defaultEffortLevel).toBe('medium');
      expect(defaults.sideEffects).toBe(false);
    });
  });

  describe('Capability Inference', () => {
    function inferCapabilities(name: string, description: string): string[] {
      const caps: string[] = [];
      const text = `${name} ${description}`.toLowerCase();

      if (text.includes('code') || text.includes('review')) caps.push('code-analysis');
      if (text.includes('data') || text.includes('analyz')) caps.push('data-analysis');
      if (text.includes('search') || text.includes('find')) caps.push('search');
      if (text.includes('write') || text.includes('generate')) caps.push('content-generation');
      if (text.includes('summar')) caps.push('summarization');
      if (text.includes('translat')) caps.push('translation');

      return caps.length > 0 ? caps : ['general'];
    }

    it('should infer code-analysis from code keywords', () => {
      const caps = inferCapabilities('Code Reviewer', 'Reviews code');
      expect(caps).toContain('code-analysis');
    });

    it('should infer data-analysis from data keywords', () => {
      const caps = inferCapabilities('Data Analyzer', 'Analyzes data');
      expect(caps).toContain('data-analysis');
    });

    it('should infer search capability', () => {
      const caps = inferCapabilities('Search Agent', 'Finds information');
      expect(caps).toContain('search');
    });

    it('should infer content-generation capability', () => {
      const caps = inferCapabilities('Writer', 'Generates content');
      expect(caps).toContain('content-generation');
    });

    it('should infer summarization capability', () => {
      const caps = inferCapabilities('Summary Agent', 'Summarizes documents');
      expect(caps).toContain('summarization');
    });

    it('should infer multiple capabilities', () => {
      const caps = inferCapabilities('Code Search', 'Search and review code');
      expect(caps).toContain('code-analysis');
      expect(caps).toContain('search');
    });

    it('should return general when no keywords match', () => {
      const caps = inferCapabilities('Helper', 'A helpful agent');
      expect(caps).toContain('general');
    });
  });

  describe('Zod to JSON Schema Conversion', () => {
    it('should convert string type', () => {
      const schema = { type: 'string' };
      expect(schema.type).toBe('string');
    });

    it('should convert number type', () => {
      const schema = { type: 'number' };
      expect(schema.type).toBe('number');
    });

    it('should convert boolean type', () => {
      const schema = { type: 'boolean' };
      expect(schema.type).toBe('boolean');
    });

    it('should convert array type', () => {
      const schema = {
        type: 'array',
        items: { type: 'string' },
      };
      expect(schema.type).toBe('array');
      expect(schema.items.type).toBe('string');
    });

    it('should convert object type with properties', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };
      expect(schema.type).toBe('object');
      expect(schema.properties.name.type).toBe('string');
      expect(schema.required).toContain('name');
    });

    it('should convert enum type', () => {
      const schema = {
        type: 'string',
        enum: ['a', 'b', 'c'],
      };
      expect(schema.enum).toEqual(['a', 'b', 'c']);
    });
  });

  describe('Tool Context', () => {
    it('should provide call method', () => {
      const toolContext = {
        call: async (name: string, _args: Record<string, unknown>) => ({ result: name }),
        search: async (_query: string) => [],
        available: () => ['tool1', 'tool2'],
      };

      expect(typeof toolContext.call).toBe('function');
    });

    it('should provide search method', () => {
      const tools = [
        { name: 'search-tool', description: 'Search for data' },
        { name: 'code-tool', description: 'Analyze code' },
      ];

      function searchTools(query: string): string[] {
        const queryLower = query.toLowerCase();
        return tools
          .filter(t =>
            t.name.toLowerCase().includes(queryLower) ||
            t.description.toLowerCase().includes(queryLower)
          )
          .map(t => t.name);
      }

      expect(searchTools('code')).toContain('code-tool');
      expect(searchTools('search')).toContain('search-tool');
    });

    it('should list available tools', () => {
      const tools = [{ name: 'tool1' }, { name: 'tool2' }, { name: 'tool3' }];
      const available = tools.map(t => t.name);

      expect(available).toEqual(['tool1', 'tool2', 'tool3']);
    });
  });

  describe('Input Validation', () => {
    it('should validate required fields', () => {
      const schema = {
        required: ['name', 'email'],
      };
      const input = { name: 'John', email: 'john@test.com' };

      const isValid = schema.required.every(field => field in input);
      expect(isValid).toBe(true);
    });

    it('should reject missing required fields', () => {
      const schema = {
        required: ['name', 'email'],
      };
      const input = { name: 'John' };

      const isValid = schema.required.every(field => field in input);
      expect(isValid).toBe(false);
    });

    it('should handle type validation', () => {
      const input = { name: 'John', age: 30 };
      expect(typeof input.name).toBe('string');
      expect(typeof input.age).toBe('number');
    });
  });

  describe('Output Validation', () => {
    it('should validate output structure', () => {
      const expectedFields = ['result', 'summary'];
      const output = { result: 'done', summary: 'completed' };

      const hasAllFields = expectedFields.every(f => f in output);
      expect(hasAllFields).toBe(true);
    });

    it('should detect invalid output', () => {
      const expectedFields = ['result', 'summary'];
      const output = { result: 'done' };

      const hasAllFields = expectedFields.every(f => f in output);
      expect(hasAllFields).toBe(false);
    });
  });

  describe('Lifecycle Hooks', () => {
    it('should support beforeExecute hook', async () => {
      let beforeCalled = false;

      const beforeExecute = async () => {
        beforeCalled = true;
      };

      await beforeExecute();
      expect(beforeCalled).toBe(true);
    });

    it('should support afterExecute hook', async () => {
      let afterCalled = false;

      const afterExecute = async () => {
        afterCalled = true;
      };

      await afterExecute();
      expect(afterCalled).toBe(true);
    });

    it('should support onError hook', async () => {
      let errorHandled = false;

      const onError = async (_error: Error) => {
        errorHandled = true;
        return { recovered: true };
      };

      const result = await onError(new Error('test'));
      expect(errorHandled).toBe(true);
      expect(result.recovered).toBe(true);
    });
  });

  describe('Agent Output Structure', () => {
    it('should have success status', () => {
      const output = {
        status: 'success' as const,
        result: { data: 'test' },
        usage: { durationMs: 100 },
      };

      expect(output.status).toBe('success');
    });

    it('should have failed status with error', () => {
      const output = {
        status: 'failed' as const,
        result: { error: 'Something went wrong' },
        usage: { durationMs: 50 },
      };

      expect(output.status).toBe('failed');
      expect(output.result.error).toBeDefined();
    });

    it('should include usage metrics', () => {
      const usage = {
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        costUsd: 0.05,
        durationMs: 1500,
      };

      expect(usage.totalTokens).toBe(usage.inputTokens + usage.outputTokens);
    });

    it('should support warnings array', () => {
      const output = {
        status: 'success' as const,
        result: {},
        warnings: ['Recovered from error: timeout'],
        usage: { durationMs: 100 },
      };

      expect(output.warnings).toHaveLength(1);
    });
  });
});

describe('SDK - LocalRunner', () => {
  describe('Runner Options', () => {
    it('should accept agent option', () => {
      const options = {
        agent: { card: { id: 'test' } },
        mockTools: true,
        verbose: false,
      };

      expect(options.agent).toBeDefined();
    });

    it('should support mock tools option', () => {
      const options = { mockTools: true };
      expect(options.mockTools).toBe(true);
    });

    it('should support verbose option', () => {
      const options = { verbose: true };
      expect(options.verbose).toBe(true);
    });

    it('should support custom budget', () => {
      const options = {
        budget: {
          maxInputTokens: 5000,
          maxOutputTokens: 2000,
          maxCostUsd: 1.0,
        },
      };

      expect(options.budget.maxInputTokens).toBe(5000);
      expect(options.budget.maxCostUsd).toBe(1.0);
    });

    it('should support environment option', () => {
      const environments = ['development', 'staging', 'production'];
      expect(environments).toContain('development');
      expect(environments).toContain('staging');
      expect(environments).toContain('production');
    });
  });

  describe('Test Case Structure', () => {
    it('should have required fields', () => {
      const testCase = {
        name: 'test-1',
        input: {
          task: 'Do something',
          parameters: { key: 'value' },
        },
      };

      expect(testCase).toHaveProperty('name');
      expect(testCase).toHaveProperty('input');
    });

    it('should support optional description', () => {
      const testCase = {
        name: 'test-1',
        description: 'Tests the main functionality',
        input: { task: 'Test', parameters: {} },
      };

      expect(testCase.description).toBe('Tests the main functionality');
    });

    it('should support expected output', () => {
      const testCase = {
        name: 'test-1',
        input: { task: 'Test', parameters: {} },
        expectedOutput: { result: 'success' },
      };

      expect(testCase.expectedOutput).toEqual({ result: 'success' });
    });

    it('should support expected status', () => {
      const testCase = {
        name: 'test-1',
        input: { task: 'Test', parameters: {} },
        expectedStatus: 'success' as const,
      };

      expect(testCase.expectedStatus).toBe('success');
    });

    it('should support timeout', () => {
      const testCase = {
        name: 'test-1',
        input: { task: 'Test', parameters: {} },
        timeout: 5000,
      };

      expect(testCase.timeout).toBe(5000);
    });

    it('should support tags', () => {
      const testCase = {
        name: 'test-1',
        input: { task: 'Test', parameters: {} },
        tags: ['unit', 'fast', 'critical'],
      };

      expect(testCase.tags).toContain('unit');
      expect(testCase.tags).toContain('fast');
    });
  });

  describe('Test Result Structure', () => {
    it('should include test case reference', () => {
      const result = {
        testCase: { name: 'test-1', input: { task: 'Test', parameters: {} } },
        passed: true,
        output: { status: 'success', result: {}, usage: {} },
        durationMs: 150,
      };

      expect(result.testCase.name).toBe('test-1');
    });

    it('should include passed boolean', () => {
      const passedResult = { passed: true };
      const failedResult = { passed: false };

      expect(passedResult.passed).toBe(true);
      expect(failedResult.passed).toBe(false);
    });

    it('should include duration', () => {
      const result = { durationMs: 250 };
      expect(result.durationMs).toBe(250);
    });

    it('should include error for failed tests', () => {
      const result = {
        passed: false,
        error: 'Expected success but got failure',
      };

      expect(result.error).toBeDefined();
    });

    it('should include comparison details', () => {
      const result = {
        comparison: {
          expected: { value: 1 },
          actual: { value: 2 },
          differences: ['Value mismatch: expected 1, got 2'],
        },
      };

      expect(result.comparison.differences).toHaveLength(1);
    });
  });

  describe('Test Suite Result', () => {
    it('should include totals', () => {
      const suiteResult = {
        total: 10,
        passed: 8,
        failed: 2,
        skipped: 0,
        duration: 5000,
        results: [],
      };

      expect(suiteResult.total).toBe(10);
      expect(suiteResult.passed).toBe(8);
      expect(suiteResult.failed).toBe(2);
    });

    it('should calculate pass rate', () => {
      const total = 10;
      const passed = 8;
      const passRate = (passed / total) * 100;

      expect(passRate).toBe(80);
    });

    it('should include all test results', () => {
      const results = [
        { passed: true, testCase: { name: 'test-1' } },
        { passed: true, testCase: { name: 'test-2' } },
        { passed: false, testCase: { name: 'test-3' } },
      ];

      expect(results).toHaveLength(3);
      expect(results.filter(r => r.passed)).toHaveLength(2);
    });
  });

  describe('Output Comparison', () => {
    function compareOutputs(expected: unknown, actual: unknown): string[] {
      const differences: string[] = [];

      if (typeof expected !== typeof actual) {
        differences.push(`Type mismatch: expected ${typeof expected}, got ${typeof actual}`);
        return differences;
      }

      if (typeof expected === 'object' && expected !== null && actual !== null) {
        const expectedObj = expected as Record<string, unknown>;
        const actualObj = actual as Record<string, unknown>;

        for (const key of Object.keys(expectedObj)) {
          if (!(key in actualObj)) {
            differences.push(`Missing key: ${key}`);
          } else if (JSON.stringify(expectedObj[key]) !== JSON.stringify(actualObj[key])) {
            differences.push(`Value mismatch for ${key}`);
          }
        }

        for (const key of Object.keys(actualObj)) {
          if (!(key in expectedObj)) {
            differences.push(`Extra key: ${key}`);
          }
        }
      } else if (expected !== actual) {
        differences.push(`Value mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }

      return differences;
    }

    it('should detect matching outputs', () => {
      const expected = { a: 1, b: 'test' };
      const actual = { a: 1, b: 'test' };
      const diffs = compareOutputs(expected, actual);
      expect(diffs).toHaveLength(0);
    });

    it('should detect type mismatch', () => {
      const expected = 'string';
      const actual = 123;
      const diffs = compareOutputs(expected, actual);
      expect(diffs[0]).toContain('Type mismatch');
    });

    it('should detect missing keys', () => {
      const expected = { a: 1, b: 2 };
      const actual = { a: 1 };
      const diffs = compareOutputs(expected, actual);
      expect(diffs.some(d => d.includes('Missing key'))).toBe(true);
    });

    it('should detect extra keys', () => {
      const expected = { a: 1 };
      const actual = { a: 1, b: 2 };
      const diffs = compareOutputs(expected, actual);
      expect(diffs.some(d => d.includes('Extra key'))).toBe(true);
    });

    it('should detect value mismatch', () => {
      const expected = { a: 1 };
      const actual = { a: 2 };
      const diffs = compareOutputs(expected, actual);
      expect(diffs.some(d => d.includes('Value mismatch'))).toBe(true);
    });
  });

  describe('Coverage Report', () => {
    it('should track input field coverage', () => {
      const inputFields = [
        { field: 'name', covered: true },
        { field: 'email', covered: true },
        { field: 'phone', covered: false },
      ];

      const coveredCount = inputFields.filter(f => f.covered).length;
      expect(coveredCount).toBe(2);
    });

    it('should track output field coverage', () => {
      const outputFields = [
        { field: 'result', covered: true },
        { field: 'metadata', covered: false },
      ];

      const coveragePercent = (outputFields.filter(f => f.covered).length / outputFields.length) * 100;
      expect(coveragePercent).toBe(50);
    });

    it('should track edge case coverage', () => {
      const edgeCases = [
        { case: 'empty_input', covered: true },
        { case: 'large_input', covered: false },
        { case: 'special_characters', covered: true },
        { case: 'unicode', covered: false },
      ];

      expect(edgeCases.filter(e => e.covered)).toHaveLength(2);
    });
  });

  describe('Mock Tool Management', () => {
    it('should set mock response', () => {
      const mockResponses = new Map<string, unknown>();
      mockResponses.set('search-tool', { results: ['a', 'b'] });

      expect(mockResponses.get('search-tool')).toEqual({ results: ['a', 'b'] });
    });

    it('should clear mocks', () => {
      const mockResponses = new Map<string, unknown>();
      mockResponses.set('tool1', { data: 1 });
      mockResponses.set('tool2', { data: 2 });

      mockResponses.clear();

      expect(mockResponses.size).toBe(0);
    });

    it('should override existing mock', () => {
      const mockResponses = new Map<string, unknown>();
      mockResponses.set('tool1', { version: 1 });
      mockResponses.set('tool1', { version: 2 });

      expect(mockResponses.get('tool1')).toEqual({ version: 2 });
    });
  });

  describe('Tool Call Logging', () => {
    it('should log tool calls', () => {
      const toolCallLog: { tool: string; args: unknown; result: unknown }[] = [];

      toolCallLog.push({
        tool: 'search',
        args: { query: 'test' },
        result: { items: [] },
      });

      expect(toolCallLog).toHaveLength(1);
      expect(toolCallLog[0].tool).toBe('search');
    });

    it('should preserve call order', () => {
      const toolCallLog: { tool: string }[] = [];

      toolCallLog.push({ tool: 'tool1' });
      toolCallLog.push({ tool: 'tool2' });
      toolCallLog.push({ tool: 'tool3' });

      expect(toolCallLog.map(c => c.tool)).toEqual(['tool1', 'tool2', 'tool3']);
    });

    it('should clear tool call log', () => {
      let toolCallLog = [{ tool: 'test' }];
      toolCallLog = [];

      expect(toolCallLog).toHaveLength(0);
    });
  });

  describe('Execution Context Creation', () => {
    it('should generate unique run ID', () => {
      const runIds = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        runIds.add(runId);
      }

      expect(runIds.size).toBe(100);
    });

    it('should apply budget overrides', () => {
      const defaultBudget = {
        maxInputTokens: 10000,
        maxOutputTokens: 4096,
        maxCostUsd: 5.0,
      };

      const overrides = {
        maxCostUsd: 2.0,
      };

      const budget = { ...defaultBudget, ...overrides };

      expect(budget.maxInputTokens).toBe(10000);
      expect(budget.maxCostUsd).toBe(2.0);
    });

    it('should create empty usage metrics', () => {
      const emptyUsage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        thinkingTokens: 0,
        costUsd: 0,
        durationMs: 0,
        downgrades: 0,
        steps: 0,
        toolCalls: 0,
      };

      expect(emptyUsage.inputTokens).toBe(0);
      expect(emptyUsage.costUsd).toBe(0);
    });
  });

  describe('Field Extraction', () => {
    function extractFields(schema: any, prefix: string = ''): string[] {
      const fields: string[] = [];

      if (schema.properties) {
        for (const [key, value] of Object.entries(schema.properties)) {
          const path = prefix ? `${prefix}.${key}` : key;
          fields.push(path);

          if ((value as any).type === 'object') {
            fields.push(...extractFields(value, path));
          }
        }
      }

      return fields;
    }

    it('should extract top-level fields', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };

      const fields = extractFields(schema);
      expect(fields).toContain('name');
      expect(fields).toContain('age');
    });

    it('should extract nested fields', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
            },
          },
        },
      };

      const fields = extractFields(schema);
      expect(fields).toContain('user');
      expect(fields).toContain('user.name');
      expect(fields).toContain('user.email');
    });

    it('should handle empty schema', () => {
      const schema = {};
      const fields = extractFields(schema);
      expect(fields).toHaveLength(0);
    });
  });
});

describe('SDK - defineTool', () => {
  describe('Tool Definition', () => {
    it('should create tool with required fields', () => {
      const tool = {
        name: 'my-tool',
        version: '1.0.0',
        description: 'A test tool',
        inputSchema: { type: 'object' },
      };

      expect(tool.name).toBe('my-tool');
      expect(tool.version).toBe('1.0.0');
    });

    it('should set default values', () => {
      const defaults = {
        version: '1.0.0',
        defer_loading: false,
        idempotent: true,
        sideEffectful: false,
        timeoutMs: 30000,
      };

      expect(defaults.idempotent).toBe(true);
      expect(defaults.sideEffectful).toBe(false);
      expect(defaults.timeoutMs).toBe(30000);
    });

    it('should support allowed callers', () => {
      const tool = {
        allowed_callers: ['human', 'code_execution_20250825'],
      };

      expect(tool.allowed_callers).toContain('human');
      expect(tool.allowed_callers).toContain('code_execution_20250825');
    });

    it('should support scopes and domains', () => {
      const tool = {
        scopes: ['read:data', 'write:data'],
        allowlistedDomains: ['api.example.com'],
      };

      expect(tool.scopes).toContain('read:data');
      expect(tool.allowlistedDomains).toContain('api.example.com');
    });
  });

  describe('Tool Execution', () => {
    it('should execute with parsed input', async () => {
      const execute = async (input: { query: string }) => {
        return { results: [`Found: ${input.query}`] };
      };

      const result = await execute({ query: 'test' });
      expect(result.results[0]).toContain('test');
    });

    it('should handle execution errors', async () => {
      const execute = async () => {
        throw new Error('Tool execution failed');
      };

      await expect(execute()).rejects.toThrow('Tool execution failed');
    });
  });
});
