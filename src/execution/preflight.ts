/**
 * Pre-flight Checker
 *
 * Estimates cost and validates budget before execution.
 * Implements:
 * - Cost estimation with confidence levels
 * - Budget validation with refusal for guaranteed failures
 * - Execution path selection (standard vs programmatic)
 * - Effort level recommendations
 */

import type {
  Agent,
  AgentInput,
  ExecutionBudget,
  PreFlightResult,
  CostEstimate,
  EffortLevel,
  ModelId,
} from '../core/types.js';
import {
  EFFORT_PRESETS,
  estimateCost,
  estimateTokensFromText,
  selectModelForEffort,
} from '../core/models.js';
import { getLogger } from '../logging/logger.js';

export class PreFlightChecker {
  private logger = getLogger();

  /**
   * Perform pre-flight checks before execution
   */
  async check(
    agent: Agent,
    input: AgentInput,
    budget: ExecutionBudget
  ): Promise<PreFlightResult> {
    const estimate = this.estimateCost(agent, input, budget);
    const executionPath = this.selectExecutionPath(input);
    const suggestedEffortLevel = this.suggestEffortLevel(input);

    // Check for guaranteed budget exceeded
    if (estimate.estimatedCostUsd.min > budget.maxCostUsd) {
      this.logger.warn('preflight_rejected', {
        reason: 'guaranteed_budget_exceeded',
        min_cost: estimate.estimatedCostUsd.min,
        budget: budget.maxCostUsd,
      });

      return {
        canProceed: false,
        reason: `Minimum estimated cost ($${estimate.estimatedCostUsd.min.toFixed(4)}) exceeds budget ($${budget.maxCostUsd.toFixed(4)})`,
        estimate,
        suggestedBudget: estimate.estimatedCostUsd.likely * 1.5,
        suggestedEffortLevel,
        executionPath,
      };
    }

    // Check for likely budget exceeded
    const warnings: string[] = [];
    if (estimate.estimatedCostUsd.likely > budget.maxCostUsd * 0.8) {
      warnings.push(
        `Estimated cost ($${estimate.estimatedCostUsd.likely.toFixed(4)}) may exceed budget. Consider increasing budget to $${(estimate.estimatedCostUsd.likely * 1.5).toFixed(4)}`
      );
    }

    // Check token limits
    if (estimate.maxTokens > budget.maxTokens * 0.9) {
      warnings.push(
        `Estimated tokens (${estimate.maxTokens}) may exceed limit (${budget.maxTokens})`
      );
    }

    // Check duration
    if (estimate.estimatedDurationMs.likely > budget.maxDurationMs * 0.8) {
      warnings.push(
        `Estimated duration (${estimate.estimatedDurationMs.likely}ms) may exceed timeout (${budget.maxDurationMs}ms)`
      );
    }

    // Check effort level compatibility
    const requestedEffort = budget.effortLevel ?? 'medium';
    if (this.effortLevelMismatch(requestedEffort, suggestedEffortLevel)) {
      warnings.push(
        `Requested effort level "${requestedEffort}" may not match task complexity. Suggested: "${suggestedEffortLevel}"`
      );
    }

    return {
      canProceed: true,
      estimate,
      suggestedEffortLevel,
      executionPath,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Estimate cost for an execution
   */
  estimateCost(
    _agent: Agent,
    input: AgentInput,
    budget: ExecutionBudget
  ): CostEstimate {
    const effortLevel = budget.effortLevel ?? 'medium';
    const model = budget.minimumModel ?? selectModelForEffort(effortLevel);

    // Estimate input tokens
    const inputText = JSON.stringify(input);
    const inputTokens = estimateTokensFromText(inputText);

    // Estimate based on historical data or defaults
    const historicalMultiplier = this.getHistoricalOutputMultiplier('default');
    const thinkingBudget = EFFORT_PRESETS[effortLevel].budgetTokens;

    // Calculate token estimates
    const estimatedOutputTokens = Math.ceil(inputTokens * historicalMultiplier);
    const estimatedThinkingTokens = Math.min(thinkingBudget, budget.maxThinkingTokens ?? thinkingBudget);

    const minTokens = inputTokens + Math.ceil(estimatedOutputTokens * 0.5);
    const maxTokens = inputTokens + estimatedOutputTokens * 2 + estimatedThinkingTokens;

    // Calculate cost estimates
    const minCost = estimateCost(model, inputTokens, Math.ceil(estimatedOutputTokens * 0.5), 0);
    const maxCost = estimateCost(model, inputTokens, estimatedOutputTokens * 2, estimatedThinkingTokens);
    const likelyCost = estimateCost(model, inputTokens, estimatedOutputTokens, estimatedThinkingTokens);

    // Estimate duration (rough: 50 tokens/second for output + thinking time)
    const tokensPerSecond = 50;
    const minDuration = Math.ceil((estimatedOutputTokens * 0.5) / tokensPerSecond * 1000);
    const maxDuration = Math.ceil((estimatedOutputTokens * 2 + estimatedThinkingTokens) / tokensPerSecond * 1000);
    const likelyDuration = Math.ceil((estimatedOutputTokens + estimatedThinkingTokens) / tokensPerSecond * 1000);

    // Determine confidence
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    if (historicalMultiplier > 0) {
      confidence = 'high';
    } else if (inputTokens < 1000) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      minTokens,
      maxTokens,
      estimatedCostUsd: {
        min: minCost,
        max: maxCost,
        likely: likelyCost,
      },
      estimatedDurationMs: {
        min: minDuration,
        max: maxDuration,
        likely: likelyDuration,
      },
      confidence,
    };
  }

  /**
   * Synchronous cost estimation (for quick checks)
   */
  estimateCostSync(
    _agent: Agent,
    input: AgentInput,
    model: ModelId
  ): { min: number; max: number; likely: number } {
    const inputText = JSON.stringify(input);
    const inputTokens = estimateTokensFromText(inputText);
    const outputMultiplier = 1.5;
    const outputTokens = inputTokens * outputMultiplier;

    return {
      min: estimateCost(model, inputTokens, outputTokens * 0.5, 0),
      max: estimateCost(model, inputTokens, outputTokens * 2, 10000),
      likely: estimateCost(model, inputTokens, outputTokens, 5000),
    };
  }

  /**
   * Select execution path based on task characteristics
   */
  private selectExecutionPath(input: AgentInput): 'standard' | 'programmatic' {
    const task = input.task.toLowerCase();

    // Patterns indicating programmatic execution would be beneficial
    const programmaticPatterns = [
      /process\s+(all|each|every|multiple)/i,
      /analyze\s+\d+/i,
      /for\s+(all|each)/i,
      /batch/i,
      /aggregate/i,
      /summarize\s+(all|the|these|those)/i,
      /iterate/i,
      /loop\s+through/i,
      /\d+\s+(items|records|rows|entries)/i,
    ];

    if (programmaticPatterns.some(pattern => pattern.test(task))) {
      return 'programmatic';
    }

    return 'standard';
  }

  /**
   * Suggest appropriate effort level based on task
   */
  private suggestEffortLevel(input: AgentInput): EffortLevel {
    const task = input.task.toLowerCase();

    // Maximum effort patterns
    const maximumPatterns = [
      /architect/i,
      /design\s+system/i,
      /novel/i,
      /research/i,
      /comprehensive\s+analysis/i,
    ];
    if (maximumPatterns.some(p => p.test(task))) return 'maximum';

    // High effort patterns
    const highPatterns = [
      /refactor/i,
      /optimize/i,
      /debug.*complex/i,
      /security\s+audit/i,
      /performance/i,
      /investigate/i,
    ];
    if (highPatterns.some(p => p.test(task))) return 'high';

    // Low effort patterns
    const lowPatterns = [
      /format/i,
      /convert/i,
      /simple/i,
      /quick/i,
      /list\s+(all|the)/i,
    ];
    if (lowPatterns.some(p => p.test(task))) return 'low';

    // Minimal effort patterns
    const minimalPatterns = [
      /yes\s+or\s+no/i,
      /classify/i,
      /extract\s+(the|a)/i,
      /count/i,
      /which\s+(one|is)/i,
    ];
    if (minimalPatterns.some(p => p.test(task))) return 'minimal';

    // Default to medium
    return 'medium';
  }

  /**
   * Check if effort level is mismatched with task complexity
   */
  private effortLevelMismatch(requested: EffortLevel, suggested: EffortLevel): boolean {
    const levels: EffortLevel[] = ['minimal', 'low', 'medium', 'high', 'maximum'];
    const requestedIndex = levels.indexOf(requested);
    const suggestedIndex = levels.indexOf(suggested);

    // Warn if difference is more than 1 level
    return Math.abs(requestedIndex - suggestedIndex) > 1;
  }

  /**
   * Get historical output multiplier for an agent (stub for now)
   */
  private getHistoricalOutputMultiplier(_agentId: string): number {
    // TODO: Query from agent health/metrics
    // For now, return default multiplier
    return 1.5;
  }
}

// Singleton instance
let instance: PreFlightChecker | null = null;

export function getPreFlightChecker(): PreFlightChecker {
  if (!instance) {
    instance = new PreFlightChecker();
  }
  return instance;
}
