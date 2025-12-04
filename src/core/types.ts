/**
 * Core Types for Agent Marketplace
 *
 * Aligned with Anthropic's Advanced Tool Use features:
 * - Tool Search (defer_loading)
 * - Programmatic Tool Calling (allowed_callers)
 * - Tool Use Examples (inputExamples)
 * - Extended Thinking (effort levels)
 */

import { z } from 'zod';

// =============================================================================
// MODEL TYPES
// =============================================================================

export type ModelId =
  | 'claude-opus-4-5-20250514'
  | 'claude-sonnet-4-5-20250514'
  | 'claude-haiku-3-5-20241022';

export type EffortLevel = 'minimal' | 'low' | 'medium' | 'high' | 'maximum';

export interface ModelConfig {
  id: ModelId;
  inputPer1M: number;
  outputPer1M: number;
  tier: 'premium' | 'standard' | 'fast';
  capabilities: string[];
  maxOutputTokens: number;
}

// =============================================================================
// AGENT TYPES
// =============================================================================

export interface AgentCard {
  id: string;
  name: string;
  description: string;
  version: string;

  // Capabilities
  capabilities: string[];
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;

  // Behavior
  defaultModel: ModelId;
  defaultEffortLevel: EffortLevel;
  sideEffects: boolean;
  estimatedCostTier: 'low' | 'medium' | 'high';

  // Health (populated by system)
  health?: AgentHealth;

  // Lifecycle
  deprecated?: {
    since: string;
    reason: string;
    replacement?: string;
    sunsetDate: string;
  };
}

export interface AgentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  successRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  lastChecked: Date;
  totalRuns: number;
}

export interface Agent {
  card: AgentCard;
  execute(input: AgentInput, context: ExecutionContext): Promise<AgentOutput>;
}

// =============================================================================
// TOOL TYPES - With Advanced Tool Use Features
// =============================================================================

export interface ToolDefinition {
  // Identity
  name: string;
  version: string;
  description: string;
  category?: string;
  inputSchema: JSONSchema;

  // Advanced Tool Use: Tool Search
  defer_loading: boolean;

  // Advanced Tool Use: Programmatic Tool Calling
  allowed_callers: ('human' | 'code_execution_20250825')[];
  idempotent: boolean;
  returnFormat?: string;  // Document return shape for code generation

  // Advanced Tool Use: Tool Use Examples
  inputExamples?: ToolExample[];

  // Safety Contract (REQUIRED)
  sideEffectful: boolean;
  scopes: string[];
  allowlistedDomains: string[];
  timeoutMs: number;
  rateLimit?: {
    requests: number;
    windowMs: number;
  };

  // Execution
  execute: (input: unknown, context: ToolContext) => Promise<unknown>;
  rollback?: (input: unknown, output: unknown) => Promise<void>;
}

export interface ToolExample {
  description: string;
  input: Record<string, unknown>;
  expectedOutput?: unknown;
}

export interface ToolContext {
  runId: string;
  stepId: string;
  traceId: string;
  allowedScopes: string[];
  timeout: AbortSignal;
  logger: Logger;
}

export interface ToolSearchResult {
  name: string;
  description: string;
  category?: string;
  relevanceScore: number;
}

// =============================================================================
// EXECUTION TYPES
// =============================================================================

export interface AgentInput {
  task: string;
  parameters: Record<string, unknown>;
  context?: {
    conversationHistory?: Message[];
    parentTaskId?: string;
  };
}

export interface AgentOutput {
  status: 'success' | 'partial' | 'failed';
  result?: unknown;
  reasoning?: string;
  warnings?: string[];
  usage: UsageMetrics;
}

export interface UsageMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  thinkingTokens: number;
  costUsd: number;
  durationMs: number;
  modelUsed: ModelId;
  downgrades: number;
  steps: number;
  toolCalls: number;
}

export interface ExecutionBudget {
  maxTokens: number;
  maxCostUsd: number;
  maxDurationMs: number;
  maxSteps: number;
  maxToolCalls: number;

  // Degradation preferences
  allowModelDowngrade: boolean;
  minimumModel?: ModelId;

  // Thinking preferences
  effortLevel?: EffortLevel;
  maxThinkingTokens?: number;
}

export interface ExecutionContext {
  runId: string;
  traceId: string;
  budget: ExecutionBudget;
  consumed: UsageMetrics;
  currentModel: ModelId;
  effortLevel: EffortLevel;
  environment: 'development' | 'staging' | 'production';
  logger: Logger;

  // Methods
  canContinue(): boolean;
  shouldDowngrade(): boolean;
  getRemainingBudget(): Partial<ExecutionBudget>;
}

// =============================================================================
// RUN/STEP TYPES
// =============================================================================

export type RunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'partial'
  | 'cancelled';

export interface RunRecord {
  id: string;
  idempotencyKey: string;
  agentId: string;

  status: RunStatus;
  input: AgentInput;
  output?: AgentOutput;

  budget: ExecutionBudget;
  consumed: UsageMetrics;

  steps: StepRecord[];
  currentModel: ModelId;
  effortLevel: EffortLevel;

  // Tracking
  traceId: string;
  tenantId?: string;
  userId?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;

  // Failure info
  error?: {
    message: string;
    code: string;
    retryable: boolean;
    step?: number;
  };
}

export type StepType = 'llm_call' | 'tool_call' | 'tool_search' | 'approval_wait';

export interface StepRecord {
  id: string;
  runId: string;
  index: number;
  idempotencyKey: string;

  type: StepType;
  model?: ModelId;
  toolName?: string;

  // Content hashes (for privacy)
  inputHash: string;
  outputHash?: string;

  // For debugging (opt-in)
  input?: unknown;
  output?: unknown;

  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

  // Metrics
  costUsd: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;

  // For side-effectful steps
  sideEffectCommitted?: boolean;

  // Timestamps
  startedAt?: Date;
  completedAt?: Date;
}

// =============================================================================
// APPROVAL TYPES
// =============================================================================

export interface ApprovalRequest {
  id: string;
  runId: string;
  stepIndex: number;

  action: {
    toolName: string;
    description: string;
    input: unknown;
  };

  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: string[];

  requestedBy: string;
  requestedAt: Date;
  expiresAt: Date;

  status: 'pending' | 'approved' | 'declined' | 'expired';
  resolvedBy?: string;
  resolvedAt?: Date;
  resolution?: {
    decision: 'approve' | 'decline';
    reason?: string;
    modifiedInput?: unknown;
  };
}

// =============================================================================
// PROVENANCE TYPES
// =============================================================================

export interface ProvenanceRecord {
  id: string;
  timestamp: Date;

  // Context
  traceId: string;
  runId: string;
  stepId: string;
  tenantId?: string;

  // Event type
  eventType: 'llm_call' | 'tool_call' | 'tool_search' | 'approval' | 'error' | 'downgrade';

  // Model info
  model?: {
    id: ModelId;
    promptHash: string;
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    costUsd: number;
    durationMs: number;
    effortLevel: EffortLevel;
  };

  // Tool info
  tool?: {
    name: string;
    version: string;
    argsHash: string;
    resultHash: string;
    sideEffectCommitted: boolean;
    durationMs: number;
  };

  // Error info
  error?: {
    message: string;
    code: string;
    stack?: string;
  };
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: unknown[];
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

// =============================================================================
// REQUEST/RESPONSE TYPES
// =============================================================================

export interface ExecuteRequest {
  agentId: string;
  input: AgentInput;
  idempotencyKey: string;
  budget?: Partial<ExecutionBudget>;
  effortLevel?: EffortLevel;
  traceId?: string;
  tenantId?: string;
  userId?: string;
}

export interface ExecuteResponse {
  runId: string;
  status: RunStatus;
  output?: AgentOutput;
  warnings?: string[];
}

export interface PreFlightResult {
  canProceed: boolean;
  reason?: string;
  estimate: CostEstimate;
  suggestedBudget?: number;
  suggestedEffortLevel?: EffortLevel;
  executionPath: 'standard' | 'programmatic';
  warnings?: string[];
}

export interface CostEstimate {
  minTokens: number;
  maxTokens: number;
  estimatedCostUsd: {
    min: number;
    max: number;
    likely: number;
  };
  estimatedDurationMs: {
    min: number;
    max: number;
    likely: number;
  };
  confidence: 'high' | 'medium' | 'low';
}

// =============================================================================
// ZOD SCHEMAS (for runtime validation)
// =============================================================================

export const ExecuteRequestSchema = z.object({
  agentId: z.string().min(1),
  input: z.object({
    task: z.string().min(1),
    parameters: z.record(z.unknown()),
    context: z.object({
      conversationHistory: z.array(z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string()
      })).optional(),
      parentTaskId: z.string().optional()
    }).optional()
  }),
  idempotencyKey: z.string().min(1),
  budget: z.object({
    maxTokens: z.number().positive().optional(),
    maxCostUsd: z.number().positive().optional(),
    maxDurationMs: z.number().positive().optional(),
    maxSteps: z.number().positive().optional(),
    maxToolCalls: z.number().positive().optional(),
    allowModelDowngrade: z.boolean().optional(),
    minimumModel: z.enum(['claude-opus-4-5-20250514', 'claude-sonnet-4-5-20250514', 'claude-haiku-3-5-20241022']).optional(),
    effortLevel: z.enum(['minimal', 'low', 'medium', 'high', 'maximum']).optional(),
    maxThinkingTokens: z.number().positive().optional()
  }).optional(),
  effortLevel: z.enum(['minimal', 'low', 'medium', 'high', 'maximum']).optional(),
  traceId: z.string().optional(),
  tenantId: z.string().optional(),
  userId: z.string().optional()
});

export const ToolDefinitionSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().min(1).max(1024),
  category: z.string().optional(),
  inputSchema: z.record(z.unknown()),
  defer_loading: z.boolean(),
  allowed_callers: z.array(z.enum(['human', 'code_execution_20250825'])),
  idempotent: z.boolean(),
  returnFormat: z.string().optional(),
  inputExamples: z.array(z.object({
    description: z.string(),
    input: z.record(z.unknown()),
    expectedOutput: z.unknown().optional()
  })).optional(),
  sideEffectful: z.boolean(),
  scopes: z.array(z.string()),
  allowlistedDomains: z.array(z.string()),
  timeoutMs: z.number().positive(),
  rateLimit: z.object({
    requests: z.number().positive(),
    windowMs: z.number().positive()
  }).optional()
});
