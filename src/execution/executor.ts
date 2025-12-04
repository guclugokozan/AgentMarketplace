/**
 * Agent Executor
 *
 * Core execution engine with:
 * - Budget enforcement with pre-flight and runtime checks
 * - Adaptive model downgrade (Opus → Sonnet → Haiku)
 * - Extended thinking with effort control
 * - Step-level idempotency
 * - Partial results on budget exhaustion
 */

import { v4 as uuidv4 } from 'uuid';
import Anthropic from '@anthropic-ai/sdk';
import type {
  Agent,
  AgentInput,
  AgentOutput,
  ExecutionBudget,
  ExecutionContext,
  RunRecord,
  UsageMetrics,
  ModelId,
  EffortLevel,
  ToolDefinition,
} from '../core/types.js';
import {
  MODEL_CONFIG,
  EFFORT_PRESETS,
  estimateCost,
  getNextTierDown,
  isModelAboveMinimum,
  mergeBudget,
  getThinkingBudget,
} from '../core/models.js';
import { getPreFlightChecker, type PreFlightChecker } from './preflight.js';
import { getRunsStorage, type RunsStorage } from '../storage/runs.js';
import { getStepsStorage, type StepsStorage } from '../storage/steps.js';
import { getToolRegistry, type ToolRegistry } from '../tools/registry.js';
import { getProvenanceLogger, type ProvenanceLogger } from '../audit/provenance.js';
import { createLogger, StructuredLogger } from '../logging/logger.js';
import {
  PreFlightRejectedError,
  wrapError,
} from '../core/errors.js';

export interface ExecuteOptions {
  idempotencyKey: string;
  budget?: Partial<ExecutionBudget>;
  effortLevel?: EffortLevel;
  traceId?: string;
  tenantId?: string;
  userId?: string;
}

export class AgentExecutor {
  private anthropic: Anthropic;
  private runs: RunsStorage;
  private steps: StepsStorage;
  private tools: ToolRegistry;
  private preflight: PreFlightChecker;
  private provenance: ProvenanceLogger;
  private logger: StructuredLogger;

  constructor() {
    this.anthropic = new Anthropic();
    this.runs = getRunsStorage();
    this.steps = getStepsStorage();
    this.tools = getToolRegistry();
    this.preflight = getPreFlightChecker();
    this.provenance = getProvenanceLogger();
    this.logger = createLogger({ level: 'info' });
  }

  /**
   * Execute an agent with full budget and degradation support
   */
  async execute(
    agent: Agent,
    input: AgentInput,
    options: ExecuteOptions
  ): Promise<AgentOutput> {
    const traceId = options.traceId ?? uuidv4();
    const logger = this.logger.child({ trace_id: traceId, agent_id: agent.card.id });

    // Merge budget with defaults
    const budget = mergeBudget(options.budget);
    const effortLevel = options.effortLevel ?? agent.card.defaultEffortLevel;

    // 1. Check idempotency - return cached if exists
    const existingRun = this.runs.findByIdempotencyKey(options.idempotencyKey);
    if (existingRun) {
      if (existingRun.status === 'completed' || existingRun.status === 'partial') {
        logger.info('run_cache_hit', { run_id: existingRun.id, status: existingRun.status });
        return existingRun.output!;
      }
      if (existingRun.status === 'running') {
        logger.warn('run_already_in_progress', { run_id: existingRun.id });
        // Could wait or return partial - for now, return current state
        return {
          status: 'partial',
          result: { message: 'Run already in progress' },
          warnings: ['Run already in progress with this idempotency key'],
          usage: existingRun.consumed,
        };
      }
    }

    // 2. Pre-flight check
    const preflightResult = await this.preflight.check(agent, input, budget);
    if (!preflightResult.canProceed) {
      logger.warn('preflight_rejected', { reason: preflightResult.reason });
      throw new PreFlightRejectedError(preflightResult.reason!, preflightResult.estimate as unknown as Record<string, unknown>);
    }

    // 3. Select initial model based on effort level
    const initialModel = this.selectInitialModel(agent, budget, effortLevel);

    // 4. Create run record
    const run = this.runs.create({
      idempotencyKey: options.idempotencyKey,
      agentId: agent.card.id,
      input,
      budget,
      traceId,
      currentModel: initialModel,
      effortLevel,
      tenantId: options.tenantId,
      userId: options.userId,
    });

    logger.runStarted(run.id, agent.card.id, input);

    // 5. Execute with budget tracking and degradation
    const startTime = Date.now();
    try {
      const output = await this.executeWithDegradation(agent, input, run, budget, effortLevel, logger);
      const durationMs = Date.now() - startTime;

      logger.runCompleted(run.id, output.status, durationMs, output.usage.costUsd);
      return output;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const wrappedError = wrapError(error, 'execute');

      this.runs.fail(run.id, {
        message: wrappedError.message,
        code: wrappedError.code,
        retryable: wrappedError.retryable,
      });

      logger.runFailed(run.id, wrappedError, durationMs);
      throw wrappedError;
    }
  }

  /**
   * Execute with adaptive model degradation
   */
  private async executeWithDegradation(
    agent: Agent,
    input: AgentInput,
    run: RunRecord,
    budget: ExecutionBudget,
    effortLevel: EffortLevel,
    logger: StructuredLogger
  ): Promise<AgentOutput> {
    let currentModel = run.currentModel;
    let stepIndex = 0;
    const warnings: string[] = [];

    // Create execution context
    const context = this.createExecutionContext(run, budget, effortLevel, logger);

    while (true) {
      // Check budget before each step
      if (!this.canContinue(run.consumed, budget)) {
        logger.warn('budget_exhausted', {
          consumed: run.consumed,
          budget: { tokens: budget.maxTokens, cost: budget.maxCostUsd },
        });
        return this.createPartialResult(run, 'budget_exhausted', warnings);
      }

      // Check if should downgrade
      if (this.shouldDowngrade(run.consumed, budget, currentModel)) {
        const nextModel = getNextTierDown(currentModel);

        if (nextModel && this.canDowngrade(nextModel, budget)) {
          const previousModel = currentModel;
          currentModel = nextModel;
          this.runs.updateModel(run.id, currentModel);
          run.consumed.downgrades++;

          logger.modelDowngrade(previousModel, currentModel, 'budget_pressure');
          warnings.push(`Downgraded from ${previousModel} to ${currentModel} due to budget pressure`);

          this.provenance.log({
            traceId: run.traceId,
            runId: run.id,
            eventType: 'downgrade',
            model: {
              id: currentModel,
              promptHash: '',
              inputTokens: 0,
              outputTokens: 0,
              thinkingTokens: 0,
              costUsd: 0,
              durationMs: 0,
              effortLevel,
            },
          });

          continue;
        } else {
          // Can't downgrade further
          return this.createPartialResult(run, 'budget_exhausted_minimum_model', warnings);
        }
      }

      // Check step limit
      if (run.consumed.steps >= budget.maxSteps) {
        return this.createPartialResult(run, 'step_limit_reached', warnings);
      }

      // Create step with idempotency check
      const existingStep = this.steps.checkIdempotency(run.id, stepIndex, input);
      if (existingStep?.status === 'completed') {
        stepIndex++;
        continue;
      }

      const step = this.steps.create({
        runId: run.id,
        index: stepIndex,
        type: 'llm_call',
        model: currentModel,
        input,
        storeFullInput: process.env.STORE_FULL_INPUTS === 'true',
      });

      logger.stepStarted(step.id, 'llm_call', currentModel);

      // Execute step
      const stepStartTime = Date.now();
      try {
        const result = await this.executeLLMStep(agent, input, currentModel, effortLevel, budget, context);
        const stepDurationMs = Date.now() - stepStartTime;

        // Update step
        this.steps.complete(step.id, {
          output: result.output,
          costUsd: result.costUsd,
          durationMs: stepDurationMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          thinkingTokens: result.thinkingTokens,
          storeFullOutput: process.env.STORE_FULL_OUTPUTS === 'true',
        });

        // Update run consumed
        run.consumed.inputTokens += result.inputTokens;
        run.consumed.outputTokens += result.outputTokens;
        run.consumed.thinkingTokens += result.thinkingTokens;
        run.consumed.totalTokens += result.inputTokens + result.outputTokens + result.thinkingTokens;
        run.consumed.costUsd += result.costUsd;
        run.consumed.durationMs += stepDurationMs;
        run.consumed.steps++;
        run.consumed.modelUsed = currentModel;

        this.runs.updateConsumed(run.id, run.consumed);

        // Log provenance
        this.provenance.log({
          traceId: run.traceId,
          runId: run.id,
          stepId: step.id,
          eventType: 'llm_call',
          model: {
            id: currentModel,
            promptHash: step.inputHash,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            thinkingTokens: result.thinkingTokens,
            costUsd: result.costUsd,
            durationMs: stepDurationMs,
            effortLevel,
          },
        });

        logger.stepCompleted(step.id, stepDurationMs, result.inputTokens + result.outputTokens, result.costUsd);

        // Check if complete
        if (result.complete) {
          run.consumed.modelUsed = currentModel;

          const output: AgentOutput = {
            status: 'success',
            result: result.output,
            reasoning: result.reasoning,
            warnings: warnings.length > 0 ? warnings : undefined,
            usage: run.consumed,
          };

          this.runs.complete(run.id, output);
          return output;
        }

        stepIndex++;
      } catch (error) {
        const stepDurationMs = Date.now() - stepStartTime;
        this.steps.fail(step.id, stepDurationMs);
        throw error;
      }
    }
  }

  /**
   * Execute a single LLM step
   */
  private async executeLLMStep(
    agent: Agent,
    input: AgentInput,
    model: ModelId,
    effortLevel: EffortLevel,
    budget: ExecutionBudget,
    _context: ExecutionContext
  ): Promise<{
    output: unknown;
    reasoning?: string;
    complete: boolean;
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    costUsd: number;
  }> {
    // Get tools for request
    const tools = this.tools.getToolsForRequest();

    // Build thinking config
    const thinkingBudget = getThinkingBudget(effortLevel, budget.maxThinkingTokens);
    const useThinking = thinkingBudget >= 1024 && MODEL_CONFIG[model].capabilities.includes('extended_thinking');

    // Build messages
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: this.buildPrompt(agent, input),
      },
    ];

    // Call Claude API
    const response = await this.anthropic.messages.create({
      model,
      max_tokens: MODEL_CONFIG[model].maxOutputTokens,
      messages,
      tools: tools.length > 0 ? this.convertToolsToAnthropicFormat(tools) : undefined,
      ...(useThinking && {
        thinking: {
          type: 'enabled',
          budget_tokens: thinkingBudget,
        },
      }),
    });

    // Extract metrics
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    // Thinking tokens from cache_read if available, otherwise estimate
    const thinkingTokens = (response.usage as any).thinking_tokens ?? 0;
    const costUsd = estimateCost(model, inputTokens, outputTokens, thinkingTokens);

    // Extract content
    let textContent = '';
    let reasoning = '';
    let toolCalls: any[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'thinking') {
        reasoning = (block as any).thinking;
      } else if (block.type === 'tool_use') {
        toolCalls.push(block);
      }
    }

    // Handle tool calls (simplified for v0)
    if (toolCalls.length > 0) {
      // For v0, just indicate we need more steps
      return {
        output: { toolCalls, partialText: textContent },
        reasoning,
        complete: false,
        inputTokens,
        outputTokens,
        thinkingTokens,
        costUsd,
      };
    }

    // Parse output if JSON expected
    let output: unknown = textContent;
    try {
      // Try to extract JSON from response
      const jsonMatch = textContent.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        output = JSON.parse(jsonMatch[1]);
      } else if (textContent.trim().startsWith('{') || textContent.trim().startsWith('[')) {
        output = JSON.parse(textContent);
      }
    } catch {
      // Keep as text
    }

    return {
      output,
      reasoning,
      complete: response.stop_reason === 'end_turn',
      inputTokens,
      outputTokens,
      thinkingTokens,
      costUsd,
    };
  }

  /**
   * Build prompt for agent
   */
  private buildPrompt(agent: Agent, input: AgentInput): string {
    return `You are ${agent.card.name}.

${agent.card.description}

## Task
${input.task}

## Parameters
${JSON.stringify(input.parameters, null, 2)}

${input.context?.conversationHistory ? `## Previous Context\n${input.context.conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}` : ''}

Provide your response. If the expected output format is JSON, wrap it in \`\`\`json code blocks.`;
  }

  /**
   * Convert tools to Anthropic API format
   */
  private convertToolsToAnthropicFormat(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    }));
  }

  /**
   * Select initial model based on effort level and budget
   */
  private selectInitialModel(
    _agent: Agent,
    budget: ExecutionBudget,
    effortLevel: EffortLevel
  ): ModelId {
    const recommendedModel = EFFORT_PRESETS[effortLevel].recommendedModel;

    // Respect minimum model constraint
    if (budget.minimumModel && !isModelAboveMinimum(recommendedModel, budget.minimumModel)) {
      return budget.minimumModel;
    }

    return recommendedModel;
  }

  /**
   * Check if we can continue execution
   */
  private canContinue(consumed: UsageMetrics, budget: ExecutionBudget): boolean {
    return (
      consumed.totalTokens < budget.maxTokens &&
      consumed.costUsd < budget.maxCostUsd &&
      consumed.durationMs < budget.maxDurationMs &&
      consumed.steps < budget.maxSteps
    );
  }

  /**
   * Check if we should downgrade model
   */
  private shouldDowngrade(consumed: UsageMetrics, budget: ExecutionBudget, currentModel: ModelId): boolean {
    const remainingBudget = budget.maxCostUsd - consumed.costUsd;

    // Estimate next step cost (assume 2000 input, 1000 output)
    const estimatedNextCost = estimateCost(currentModel, 2000, 1000, 5000);

    // Downgrade if next step would consume >60% of remaining budget
    return estimatedNextCost > remainingBudget * 0.6;
  }

  /**
   * Check if we can downgrade to a model
   */
  private canDowngrade(model: ModelId, budget: ExecutionBudget): boolean {
    if (!budget.allowModelDowngrade) return false;
    if (budget.minimumModel && !isModelAboveMinimum(model, budget.minimumModel)) return false;
    return true;
  }

  /**
   * Create execution context
   */
  private createExecutionContext(
    run: RunRecord,
    budget: ExecutionBudget,
    effortLevel: EffortLevel,
    logger: StructuredLogger
  ): ExecutionContext {
    return {
      runId: run.id,
      traceId: run.traceId,
      budget,
      consumed: run.consumed,
      currentModel: run.currentModel,
      effortLevel,
      environment: (process.env.NODE_ENV as any) ?? 'development',
      logger,
      canContinue: () => this.canContinue(run.consumed, budget),
      shouldDowngrade: () => this.shouldDowngrade(run.consumed, budget, run.currentModel),
      getRemainingBudget: () => ({
        maxTokens: budget.maxTokens - run.consumed.totalTokens,
        maxCostUsd: budget.maxCostUsd - run.consumed.costUsd,
        maxDurationMs: budget.maxDurationMs - run.consumed.durationMs,
        maxSteps: budget.maxSteps - run.consumed.steps,
      }),
    };
  }

  /**
   * Create partial result
   */
  private createPartialResult(
    run: RunRecord,
    reason: string,
    warnings: string[]
  ): AgentOutput {
    const steps = this.steps.findByRunId(run.id);
    const lastCompletedStep = steps.filter((s: { status: string }) => s.status === 'completed').pop();

    const output: AgentOutput = {
      status: 'partial',
      result: lastCompletedStep?.output,
      warnings: [...warnings, `Execution stopped: ${reason}`],
      usage: run.consumed,
    };

    this.runs.partial(run.id, output);
    return output;
  }
}

// Singleton instance
let instance: AgentExecutor | null = null;

export function getAgentExecutor(): AgentExecutor {
  if (!instance) {
    instance = new AgentExecutor();
  }
  return instance;
}
