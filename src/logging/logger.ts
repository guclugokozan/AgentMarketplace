/**
 * Structured JSON Logger
 *
 * Provides consistent logging with trace_id and run_id for debugging.
 * All logs are JSON for easy parsing and aggregation.
 */

import type { Logger } from '../core/types.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  trace_id?: string;
  run_id?: string;
  step_id?: string;
  agent_id?: string;
  tenant_id?: string;
  duration_ms?: number;
  cost_usd?: number;
  model?: string;
  tool?: string;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  [key: string]: unknown;
}

export interface LoggerOptions {
  level?: LogLevel;
  traceId?: string;
  runId?: string;
  agentId?: string;
  tenantId?: string;
  pretty?: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class StructuredLogger implements Logger {
  private level: number;
  private context: Partial<LogEntry>;
  private pretty: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = LOG_LEVELS[options.level ?? 'info'];
    this.pretty = options.pretty ?? process.env.NODE_ENV === 'development';
    this.context = {
      trace_id: options.traceId,
      run_id: options.runId,
      agent_id: options.agentId,
      tenant_id: options.tenantId,
    };
  }

  child(additionalContext: Partial<LogEntry>): StructuredLogger {
    const logger = new StructuredLogger({
      level: this.getLevelName(),
      pretty: this.pretty,
    });
    logger.context = { ...this.context, ...additionalContext };
    return logger;
  }

  private getLevelName(): LogLevel {
    for (const [name, value] of Object.entries(LOG_LEVELS)) {
      if (value === this.level) return name as LogLevel;
    }
    return 'info';
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LOG_LEVELS[level] < this.level) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...meta,
    };

    // Clean undefined values
    for (const key of Object.keys(entry)) {
      if (entry[key] === undefined) {
        delete entry[key];
      }
    }

    const output = this.pretty
      ? JSON.stringify(entry, null, 2)
      : JSON.stringify(entry);

    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }

  // Convenience methods for common events
  runStarted(runId: string, agentId: string, input: unknown): void {
    this.info('run_started', {
      run_id: runId,
      agent_id: agentId,
      input_size: JSON.stringify(input).length,
    });
  }

  runCompleted(runId: string, status: string, durationMs: number, costUsd: number): void {
    this.info('run_completed', {
      run_id: runId,
      status,
      duration_ms: durationMs,
      cost_usd: costUsd,
    });
  }

  runFailed(runId: string, error: Error, durationMs: number): void {
    this.error('run_failed', {
      run_id: runId,
      duration_ms: durationMs,
      error: {
        code: (error as any).code ?? 'UNKNOWN',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
    });
  }

  stepStarted(stepId: string, type: string, model?: string, tool?: string): void {
    this.debug('step_started', {
      step_id: stepId,
      step_type: type,
      model,
      tool,
    });
  }

  stepCompleted(stepId: string, durationMs: number, tokens: number, costUsd: number): void {
    this.debug('step_completed', {
      step_id: stepId,
      duration_ms: durationMs,
      tokens,
      cost_usd: costUsd,
    });
  }

  modelDowngrade(fromModel: string, toModel: string, reason: string): void {
    this.warn('model_downgrade', {
      from_model: fromModel,
      to_model: toModel,
      reason,
    });
  }

  toolCalled(toolName: string, durationMs: number, success: boolean): void {
    this.debug('tool_called', {
      tool: toolName,
      duration_ms: durationMs,
      success,
    });
  }

  budgetWarning(resourceType: string, consumed: number, budget: number): void {
    this.warn('budget_warning', {
      resource_type: resourceType,
      consumed,
      budget,
      percentage: Math.round((consumed / budget) * 100),
    });
  }

  approvalRequested(approvalId: string, action: string, riskLevel: string): void {
    this.info('approval_requested', {
      approval_id: approvalId,
      action,
      risk_level: riskLevel,
    });
  }
}

// Global logger instance
let globalLogger: StructuredLogger | null = null;

export function getLogger(): StructuredLogger {
  if (!globalLogger) {
    globalLogger = new StructuredLogger({
      level: (process.env.LOG_LEVEL as LogLevel) ?? 'info',
      pretty: process.env.NODE_ENV === 'development',
    });
  }
  return globalLogger;
}

export function createLogger(options: LoggerOptions): StructuredLogger {
  return new StructuredLogger(options);
}
