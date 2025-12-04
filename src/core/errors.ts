/**
 * Error Taxonomy
 *
 * Categorized errors for proper handling:
 * - Retryable: System should retry automatically
 * - NonRetryable: Requires human intervention or different approach
 * - Degradable: Can continue with reduced capability
 */

// =============================================================================
// BASE ERRORS
// =============================================================================

export abstract class AgentMarketplaceError extends Error {
  abstract readonly retryable: boolean;
  abstract readonly code: string;

  constructor(
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
    };
  }
}

// =============================================================================
// RETRYABLE ERRORS - System should retry automatically
// =============================================================================

export abstract class RetryableError extends AgentMarketplaceError {
  readonly retryable = true;

  constructor(
    message: string,
    public readonly retryAfterMs?: number,
    public readonly maxRetries: number = 3,
    details?: Record<string, unknown>
  ) {
    super(message, details);
  }
}

export class RateLimitError extends RetryableError {
  readonly code = 'RATE_LIMITED';

  constructor(retryAfterMs: number, details?: Record<string, unknown>) {
    super(`Rate limited, retry after ${retryAfterMs}ms`, retryAfterMs, 3, details);
  }
}

export class TemporaryUnavailableError extends RetryableError {
  readonly code = 'TEMPORARILY_UNAVAILABLE';

  constructor(service: string, retryAfterMs: number = 5000) {
    super(`${service} temporarily unavailable`, retryAfterMs, 3, { service });
  }
}

export class TimeoutError extends RetryableError {
  readonly code = 'TIMEOUT';

  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`, undefined, 2, { operation, timeoutMs });
  }
}

export class NetworkError extends RetryableError {
  readonly code = 'NETWORK_ERROR';

  constructor(message: string, cause?: Error) {
    super(message, 5000, 3, { cause: cause?.message });
  }
}

export class TransientAPIError extends RetryableError {
  readonly code = 'TRANSIENT_API_ERROR';

  constructor(statusCode: number, message: string) {
    super(`API error (${statusCode}): ${message}`, 1000, 3, { statusCode });
  }
}

// =============================================================================
// NON-RETRYABLE ERRORS - Requires human intervention
// =============================================================================

export abstract class NonRetryableError extends AgentMarketplaceError {
  readonly retryable = false;
}

export class BudgetExceededError extends NonRetryableError {
  readonly code = 'BUDGET_EXCEEDED';

  constructor(
    public readonly resourceType: 'tokens' | 'cost' | 'duration' | 'steps' | 'tool_calls',
    public readonly consumed: number,
    public readonly budget: number
  ) {
    super(`${resourceType} budget exceeded: ${consumed} > ${budget}`, {
      resourceType,
      consumed,
      budget,
    });
  }
}

export class PreFlightRejectedError extends NonRetryableError {
  readonly code = 'PREFLIGHT_REJECTED';

  constructor(reason: string, public readonly estimate?: Record<string, unknown>) {
    super(`Pre-flight check rejected: ${reason}`, { reason, estimate });
  }
}

export class InvalidInputError extends NonRetryableError {
  readonly code = 'INVALID_INPUT';

  constructor(message: string, public readonly validationErrors?: unknown[]) {
    super(message, { validationErrors });
  }
}

export class AgentNotFoundError extends NonRetryableError {
  readonly code = 'AGENT_NOT_FOUND';

  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`, { agentId });
  }
}

export class ToolNotFoundError extends NonRetryableError {
  readonly code = 'TOOL_NOT_FOUND';

  constructor(toolName: string) {
    super(`Tool not found: ${toolName}`, { toolName });
  }
}

export class JobNotFoundError extends NonRetryableError {
  readonly code = 'JOB_NOT_FOUND';

  constructor(jobId: string) {
    super(`Job not found: ${jobId}`, { jobId });
  }
}

export class PermissionDeniedError extends NonRetryableError {
  readonly code = 'PERMISSION_DENIED';

  constructor(action: string, resource: string, requiredScope?: string) {
    super(`Permission denied: ${action} on ${resource}`, { action, resource, requiredScope });
  }
}

export class ApprovalRequiredError extends NonRetryableError {
  readonly code = 'APPROVAL_REQUIRED';

  constructor(
    public readonly approvalId: string,
    public readonly action: string,
    public readonly riskLevel: string
  ) {
    super(`Approval required for: ${action}`, { approvalId, action, riskLevel });
  }
}

export class ApprovalDeclinedError extends NonRetryableError {
  readonly code = 'APPROVAL_DECLINED';

  constructor(approvalId: string, reason?: string) {
    super(`Approval declined${reason ? `: ${reason}` : ''}`, { approvalId, reason });
  }
}

export class AgentSunsetError extends NonRetryableError {
  readonly code = 'AGENT_SUNSET';

  constructor(agentId: string, replacement?: string) {
    super(`Agent ${agentId} has been sunset`, { agentId, replacement });
  }
}

export class ScopeViolationError extends NonRetryableError {
  readonly code = 'SCOPE_VIOLATION';

  constructor(toolName: string, requiredScope: string, availableScopes: string[]) {
    super(`Tool ${toolName} requires scope ${requiredScope}`, {
      toolName,
      requiredScope,
      availableScopes,
    });
  }
}

export class EgressViolationError extends NonRetryableError {
  readonly code = 'EGRESS_VIOLATION';

  constructor(domain: string, allowedDomains: string[]) {
    super(`Domain ${domain} not in allowlist`, { domain, allowedDomains });
  }
}

export class SandboxViolationError extends NonRetryableError {
  readonly code = 'SANDBOX_VIOLATION';

  constructor(violation: string) {
    super(`Sandbox violation: ${violation}`, { violation });
  }
}

// =============================================================================
// DEGRADABLE ERRORS - Can continue with reduced capability
// =============================================================================

export class DegradableError extends AgentMarketplaceError {
  readonly retryable = false;
  readonly code = 'DEGRADABLE';

  constructor(
    message: string,
    public readonly degradationPath: string,
    public readonly originalCapability: string,
    public readonly reducedCapability: string
  ) {
    super(message, { degradationPath, originalCapability, reducedCapability });
  }
}

export class ModelDowngradeError extends DegradableError {
  constructor(
    fromModel: string,
    toModel: string,
    reason: string
  ) {
    super(
      `Downgrading from ${fromModel} to ${toModel}: ${reason}`,
      'model_downgrade',
      fromModel,
      toModel
    );
  }
}

export class CapabilityUnavailableError extends DegradableError {
  constructor(capability: string, fallback: string) {
    super(
      `Capability ${capability} unavailable, using ${fallback}`,
      'capability_fallback',
      capability,
      fallback
    );
  }
}

// =============================================================================
// ERROR UTILITIES
// =============================================================================

export function isRetryable(error: unknown): error is RetryableError {
  return error instanceof RetryableError;
}

export function isNonRetryable(error: unknown): error is NonRetryableError {
  return error instanceof NonRetryableError;
}

export function isDegradable(error: unknown): error is DegradableError {
  return error instanceof DegradableError;
}

export function getRetryDelay(error: RetryableError, attempt: number): number {
  const baseDelay = error.retryAfterMs ?? 1000;
  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, 60000); // Max 60 seconds
}

export function wrapError(error: unknown, context?: string): AgentMarketplaceError {
  if (error instanceof AgentMarketplaceError) {
    return error;
  }

  if (error instanceof Error) {
    // Try to categorize common errors
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
      return new NetworkError(error.message, error);
    }
    if (error.message.includes('timeout')) {
      return new TimeoutError(context ?? 'operation', 0);
    }

    // Default to non-retryable
    return new class extends NonRetryableError {
      readonly code = 'UNKNOWN_ERROR';
    }(`${context ? context + ': ' : ''}${error.message}`, { originalError: error.name });
  }

  return new class extends NonRetryableError {
    readonly code = 'UNKNOWN_ERROR';
  }(`Unknown error: ${String(error)}`);
}
