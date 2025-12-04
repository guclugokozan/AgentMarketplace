/**
 * Model Configuration
 *
 * Pricing, capabilities, and effort level presets for Claude models.
 * Aligned with Anthropic's extended thinking and effort control features.
 */

import type { ModelId, ModelConfig, EffortLevel, ExecutionBudget } from './types.js';

// =============================================================================
// MODEL PRICING (as of Nov 2024)
// =============================================================================

export const MODEL_CONFIG: Record<ModelId, ModelConfig> = {
  'claude-opus-4-5-20250514': {
    id: 'claude-opus-4-5-20250514',
    inputPer1M: 15.00,
    outputPer1M: 75.00,
    tier: 'premium',
    capabilities: [
      'extended_thinking',
      'complex_reasoning',
      'multi_agent_coordination',
      'long_horizon_tasks',
      'novel_problem_solving'
    ],
    maxOutputTokens: 32000,
  },
  'claude-sonnet-4-5-20250514': {
    id: 'claude-sonnet-4-5-20250514',
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    tier: 'standard',
    capabilities: [
      'extended_thinking',
      'reasoning',
      'coding',
      'analysis',
      'tool_orchestration'
    ],
    maxOutputTokens: 16000,
  },
  'claude-haiku-3-5-20241022': {
    id: 'claude-haiku-3-5-20241022',
    inputPer1M: 0.25,
    outputPer1M: 1.25,
    tier: 'fast',
    capabilities: [
      'classification',
      'extraction',
      'simple_tasks',
      'routing',
      'validation'
    ],
    maxOutputTokens: 8000,
  },
};

// Downgrade order (premium → standard → fast)
export const MODEL_TIERS: ModelId[] = [
  'claude-opus-4-5-20250514',
  'claude-sonnet-4-5-20250514',
  'claude-haiku-3-5-20241022',
];

// =============================================================================
// EFFORT LEVEL PRESETS
// =============================================================================

export interface EffortPreset {
  budgetTokens: number;
  description: string;
  useCases: string[];
  recommendedModel: ModelId;
}

export const EFFORT_PRESETS: Record<EffortLevel, EffortPreset> = {
  minimal: {
    budgetTokens: 1024,
    description: 'Quick classification, simple extraction, routing decisions',
    useCases: ['intent classification', 'entity extraction', 'yes/no questions'],
    recommendedModel: 'claude-haiku-3-5-20241022',
  },
  low: {
    budgetTokens: 4096,
    description: 'Standard tasks with straightforward reasoning',
    useCases: ['code formatting', 'simple refactoring', 'documentation'],
    recommendedModel: 'claude-haiku-3-5-20241022',
  },
  medium: {
    budgetTokens: 10000,
    description: 'Complex analysis, multi-step planning',
    useCases: ['code review', 'bug analysis', 'feature planning'],
    recommendedModel: 'claude-sonnet-4-5-20250514',
  },
  high: {
    budgetTokens: 32000,
    description: 'Deep research, architectural decisions',
    useCases: ['architecture design', 'security audit', 'complex debugging'],
    recommendedModel: 'claude-sonnet-4-5-20250514',
  },
  maximum: {
    budgetTokens: 64000,
    description: 'Novel problems, extensive exploration',
    useCases: ['novel algorithms', 'complex system design', 'research tasks'],
    recommendedModel: 'claude-opus-4-5-20250514',
  },
};

// =============================================================================
// COST CALCULATION
// =============================================================================

export function estimateCost(
  model: ModelId,
  inputTokens: number,
  outputTokens: number,
  thinkingTokens: number = 0
): number {
  const config = MODEL_CONFIG[model];
  // Thinking tokens are charged at output rate
  const totalOutputTokens = outputTokens + thinkingTokens;
  return (inputTokens * config.inputPer1M + totalOutputTokens * config.outputPer1M) / 1_000_000;
}

export function estimateTokensFromText(text: string): number {
  // Rough estimate: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}

export function estimateCostFromText(
  model: ModelId,
  inputText: string,
  estimatedOutputMultiplier: number = 1.5
): number {
  const inputTokens = estimateTokensFromText(inputText);
  const estimatedOutputTokens = Math.ceil(inputTokens * estimatedOutputMultiplier);
  return estimateCost(model, inputTokens, estimatedOutputTokens);
}

// =============================================================================
// MODEL SELECTION
// =============================================================================

export function selectModelForEffort(effortLevel: EffortLevel): ModelId {
  return EFFORT_PRESETS[effortLevel].recommendedModel;
}

export function getThinkingBudget(effortLevel: EffortLevel, maxBudget?: number): number {
  const preset = EFFORT_PRESETS[effortLevel];
  if (maxBudget !== undefined) {
    return Math.min(preset.budgetTokens, maxBudget);
  }
  return preset.budgetTokens;
}

export function canModelHandle(model: ModelId, requirement: string): boolean {
  const config = MODEL_CONFIG[model];
  return config.capabilities.includes(requirement);
}

export function getNextTierDown(currentModel: ModelId): ModelId | null {
  const currentIndex = MODEL_TIERS.indexOf(currentModel);
  if (currentIndex < 0 || currentIndex >= MODEL_TIERS.length - 1) {
    return null;
  }
  return MODEL_TIERS[currentIndex + 1];
}

export function isModelAboveMinimum(model: ModelId, minimum: ModelId): boolean {
  const modelIndex = MODEL_TIERS.indexOf(model);
  const minimumIndex = MODEL_TIERS.indexOf(minimum);
  return modelIndex <= minimumIndex;
}

// =============================================================================
// BUDGET HELPERS
// =============================================================================

export const DEFAULT_BUDGET: ExecutionBudget = {
  maxTokens: 50000,
  maxCostUsd: 1.00,
  maxDurationMs: 120000,  // 2 minutes
  maxSteps: 20,
  maxToolCalls: 50,
  allowModelDowngrade: true,
  effortLevel: 'medium',
};

export function mergeBudget(
  partial: Partial<ExecutionBudget> | undefined
): ExecutionBudget {
  return {
    ...DEFAULT_BUDGET,
    ...partial,
  };
}

export function estimateBudgetForTask(
  taskComplexity: 'simple' | 'moderate' | 'complex' | 'very_complex'
): ExecutionBudget {
  const budgets: Record<string, ExecutionBudget> = {
    simple: {
      maxTokens: 10000,
      maxCostUsd: 0.10,
      maxDurationMs: 30000,
      maxSteps: 5,
      maxToolCalls: 10,
      allowModelDowngrade: true,
      effortLevel: 'low',
    },
    moderate: {
      maxTokens: 30000,
      maxCostUsd: 0.50,
      maxDurationMs: 60000,
      maxSteps: 15,
      maxToolCalls: 30,
      allowModelDowngrade: true,
      effortLevel: 'medium',
    },
    complex: {
      maxTokens: 100000,
      maxCostUsd: 2.00,
      maxDurationMs: 180000,
      maxSteps: 30,
      maxToolCalls: 100,
      allowModelDowngrade: true,
      effortLevel: 'high',
    },
    very_complex: {
      maxTokens: 200000,
      maxCostUsd: 10.00,
      maxDurationMs: 600000,
      maxSteps: 50,
      maxToolCalls: 200,
      allowModelDowngrade: true,
      minimumModel: 'claude-sonnet-4-5-20250514',
      effortLevel: 'maximum',
    },
  };

  return budgets[taskComplexity];
}
