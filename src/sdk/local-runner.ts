/**
 * Local Development Runner
 *
 * Enables local testing of agents with:
 * - Mock tool implementations
 * - Budget simulation
 * - Test case execution
 * - Coverage tracking
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Agent,
  AgentInput,
  AgentOutput,
  ExecutionBudget,
  ExecutionContext,
  UsageMetrics,
} from '../core/types.js';
import { DEFAULT_BUDGET } from '../core/models.js';
import { createLogger, StructuredLogger } from '../logging/logger.js';

export interface LocalRunnerOptions {
  agent: Agent;
  mockTools?: boolean;
  verbose?: boolean;
  budget?: Partial<ExecutionBudget>;
  environment?: 'development' | 'staging' | 'production';
}

export interface TestCase {
  name: string;
  description?: string;
  input: AgentInput;
  expectedOutput?: unknown;
  expectedStatus?: 'success' | 'partial' | 'failed';
  timeout?: number;
  tags?: string[];
}

export interface TestResult {
  testCase: TestCase;
  passed: boolean;
  output: AgentOutput;
  durationMs: number;
  error?: string;
  comparison?: {
    expected: unknown;
    actual: unknown;
    differences: string[];
  };
}

export interface TestSuiteResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: TestResult[];
  coverage?: CoverageReport;
}

export interface CoverageReport {
  inputFields: { field: string; covered: boolean }[];
  outputFields: { field: string; covered: boolean }[];
  edgeCases: { case: string; covered: boolean }[];
}

export class LocalRunner {
  private agent: Agent;
  private options: LocalRunnerOptions;
  private logger: StructuredLogger;
  private mockResponses: Map<string, unknown> = new Map();
  private toolCallLog: { tool: string; args: unknown; result: unknown }[] = [];

  constructor(options: LocalRunnerOptions) {
    this.agent = options.agent;
    this.options = options;
    this.logger = createLogger({
      level: options.verbose ? 'debug' : 'info',
    });
  }

  /**
   * Execute agent with local context
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const runId = uuidv4();
    const traceId = uuidv4();

    this.logger.debug('local_run_start', {
      run_id: runId,
      agent_id: this.agent.card.id,
      task: input.task.slice(0, 100),
    });

    const context = this.createContext(runId, traceId);

    try {
      const output = await this.agent.execute(input, context);

      const durationMs = Date.now() - startTime;

      this.logger.debug('local_run_complete', {
        run_id: runId,
        status: output.status,
        duration_ms: durationMs,
      });

      return {
        ...output,
        usage: {
          ...output.usage,
          durationMs,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      this.logger.error('local_run_failed', {
        run_id: runId,
        error: (error as Error).message,
        duration_ms: durationMs,
      });

      return {
        status: 'failed',
        result: { error: (error as Error).message },
        usage: {
          ...context.consumed,
          durationMs,
        },
      };
    }
  }

  /**
   * Run a single test case
   */
  async runTest(testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();

    this.logger.info('test_start', { name: testCase.name });

    try {
      const output = await this.execute(testCase.input);
      const durationMs = Date.now() - startTime;

      // Check status
      let passed = true;
      const differences: string[] = [];

      if (testCase.expectedStatus && output.status !== testCase.expectedStatus) {
        passed = false;
        differences.push(`Status: expected ${testCase.expectedStatus}, got ${output.status}`);
      }

      // Check output
      if (testCase.expectedOutput !== undefined) {
        const outputDiffs = this.compareOutputs(testCase.expectedOutput, output.result);
        if (outputDiffs.length > 0) {
          passed = false;
          differences.push(...outputDiffs);
        }
      }

      const result: TestResult = {
        testCase,
        passed,
        output,
        durationMs,
        comparison: differences.length > 0 ? {
          expected: testCase.expectedOutput,
          actual: output.result,
          differences,
        } : undefined,
      };

      this.logger.info('test_complete', {
        name: testCase.name,
        passed,
        duration_ms: durationMs,
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      this.logger.error('test_error', {
        name: testCase.name,
        error: (error as Error).message,
      });

      return {
        testCase,
        passed: false,
        output: {
          status: 'failed',
          result: { error: (error as Error).message },
          usage: this.createEmptyUsage(),
        },
        durationMs,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Run multiple test cases
   */
  async runTests(testCases: TestCase[]): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const results: TestResult[] = [];

    this.logger.info('test_suite_start', { total: testCases.length });

    for (const testCase of testCases) {
      const result = await this.runTest(testCase);
      results.push(result);
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    const suiteResult: TestSuiteResult = {
      total: testCases.length,
      passed,
      failed,
      skipped: 0,
      duration: Date.now() - startTime,
      results,
      coverage: this.calculateCoverage(testCases),
    };

    this.logger.info('test_suite_complete', {
      total: suiteResult.total,
      passed: suiteResult.passed,
      failed: suiteResult.failed,
      duration_ms: suiteResult.duration,
    });

    return suiteResult;
  }

  /**
   * Set mock response for a tool
   */
  mockTool(toolName: string, response: unknown): void {
    this.mockResponses.set(toolName, response);
  }

  /**
   * Clear all mock responses
   */
  clearMocks(): void {
    this.mockResponses.clear();
  }

  /**
   * Get tool call log
   */
  getToolCallLog(): { tool: string; args: unknown; result: unknown }[] {
    return [...this.toolCallLog];
  }

  /**
   * Clear tool call log
   */
  clearToolCallLog(): void {
    this.toolCallLog = [];
  }

  /**
   * Create execution context for local run
   */
  private createContext(runId: string, traceId: string): ExecutionContext {
    const budget: ExecutionBudget = {
      ...DEFAULT_BUDGET,
      ...this.options.budget,
    };

    return {
      runId,
      traceId,
      budget,
      consumed: this.createEmptyUsage(),
      currentModel: this.agent.card.defaultModel,
      effortLevel: this.agent.card.defaultEffortLevel,
      environment: this.options.environment ?? 'development',
      logger: this.logger,
      canContinue: () => true,
      shouldDowngrade: () => false,
      getRemainingBudget: () => budget,
    };
  }

  /**
   * Create empty usage metrics
   */
  private createEmptyUsage(): UsageMetrics {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      thinkingTokens: 0,
      costUsd: 0,
      durationMs: 0,
      modelUsed: this.agent.card.defaultModel,
      downgrades: 0,
      steps: 0,
      toolCalls: 0,
    };
  }

  /**
   * Compare expected and actual outputs
   */
  private compareOutputs(expected: unknown, actual: unknown): string[] {
    const differences: string[] = [];

    if (typeof expected !== typeof actual) {
      differences.push(`Type mismatch: expected ${typeof expected}, got ${typeof actual}`);
      return differences;
    }

    if (typeof expected === 'object' && expected !== null && actual !== null) {
      const expectedObj = expected as Record<string, unknown>;
      const actualObj = actual as Record<string, unknown>;

      // Check for missing keys
      for (const key of Object.keys(expectedObj)) {
        if (!(key in actualObj)) {
          differences.push(`Missing key: ${key}`);
        } else if (JSON.stringify(expectedObj[key]) !== JSON.stringify(actualObj[key])) {
          differences.push(`Value mismatch for ${key}: expected ${JSON.stringify(expectedObj[key])}, got ${JSON.stringify(actualObj[key])}`);
        }
      }

      // Check for extra keys
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

  /**
   * Calculate test coverage
   */
  private calculateCoverage(testCases: TestCase[]): CoverageReport {
    // Get schema fields from agent card
    const inputFields = this.extractFields(this.agent.card.inputSchema);
    const outputFields = this.extractFields(this.agent.card.outputSchema);

    // Track which fields were used
    const usedInputFields = new Set<string>();
    const usedOutputFields = new Set<string>();

    for (const testCase of testCases) {
      // Check input fields
      this.collectUsedFields(testCase.input.parameters, '', usedInputFields);

      // Check expected output fields
      if (testCase.expectedOutput) {
        this.collectUsedFields(testCase.expectedOutput, '', usedOutputFields);
      }
    }

    return {
      inputFields: inputFields.map(field => ({
        field,
        covered: usedInputFields.has(field),
      })),
      outputFields: outputFields.map(field => ({
        field,
        covered: usedOutputFields.has(field),
      })),
      edgeCases: [
        { case: 'empty_input', covered: testCases.some(t => Object.keys(t.input.parameters).length === 0) },
        { case: 'large_input', covered: testCases.some(t => JSON.stringify(t.input).length > 10000) },
        { case: 'special_characters', covered: testCases.some(t => /[<>&"']/.test(JSON.stringify(t.input))) },
        { case: 'unicode', covered: testCases.some(t => /[^\x00-\x7F]/.test(JSON.stringify(t.input))) },
      ],
    };
  }

  /**
   * Extract field paths from JSON schema
   */
  private extractFields(schema: any, prefix: string = ''): string[] {
    const fields: string[] = [];

    if (schema.properties) {
      for (const [key, value] of Object.entries(schema.properties)) {
        const path = prefix ? `${prefix}.${key}` : key;
        fields.push(path);

        if ((value as any).type === 'object') {
          fields.push(...this.extractFields(value, path));
        }
      }
    }

    return fields;
  }

  /**
   * Collect used field paths from data
   */
  private collectUsedFields(data: unknown, prefix: string, fields: Set<string>): void {
    if (typeof data === 'object' && data !== null) {
      for (const [key, value] of Object.entries(data)) {
        const path = prefix ? `${prefix}.${key}` : key;
        fields.add(path);

        if (typeof value === 'object' && value !== null) {
          this.collectUsedFields(value, path, fields);
        }
      }
    }
  }
}

/**
 * Create a local runner for an agent
 */
export function createLocalRunner(options: LocalRunnerOptions): LocalRunner {
  return new LocalRunner(options);
}
