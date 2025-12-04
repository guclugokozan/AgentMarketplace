/**
 * Provenance Logger
 *
 * Records audit trail for all operations.
 * Stores hashes by default, full content opt-in for debugging.
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { getDatabase } from '../storage/database.js';
import type { ProvenanceRecord, ModelId, EffortLevel } from '../core/types.js';
import { getLogger } from '../logging/logger.js';

export interface LogModelParams {
  id: ModelId;
  promptHash: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  costUsd: number;
  durationMs: number;
  effortLevel: EffortLevel;
}

export interface LogToolParams {
  name: string;
  version: string;
  argsHash: string;
  resultHash: string;
  sideEffectCommitted: boolean;
  durationMs: number;
}

export interface LogParams {
  traceId: string;
  runId: string;
  stepId?: string;
  tenantId?: string;
  eventType: ProvenanceRecord['eventType'];
  model?: LogModelParams;
  tool?: LogToolParams;
  error?: {
    message: string;
    code: string;
    stack?: string;
  };
}

export class ProvenanceLogger {
  private db = getDatabase();
  private logger = getLogger();

  /**
   * Log a provenance record
   */
  log(params: LogParams): void {
    const id = uuidv4();
    const now = new Date().toISOString();

    try {
      this.db.prepare(`
        INSERT INTO provenance (
          id, timestamp, trace_id, run_id, step_id, tenant_id, event_type,
          model_id, prompt_hash, input_tokens, output_tokens, thinking_tokens, cost_usd, duration_ms, effort_level,
          tool_name, tool_version, args_hash, result_hash, side_effect_committed,
          error_message, error_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        now,
        params.traceId,
        params.runId,
        params.stepId ?? null,
        params.tenantId ?? null,
        params.eventType,
        params.model?.id ?? null,
        params.model?.promptHash ?? null,
        params.model?.inputTokens ?? null,
        params.model?.outputTokens ?? null,
        params.model?.thinkingTokens ?? null,
        params.model?.costUsd ?? null,
        params.model?.durationMs ?? null,
        params.model?.effortLevel ?? null,
        params.tool?.name ?? null,
        params.tool?.version ?? null,
        params.tool?.argsHash ?? null,
        params.tool?.resultHash ?? null,
        params.tool?.sideEffectCommitted ? 1 : null,
        params.error?.message ?? null,
        params.error?.code ?? null
      );
    } catch (error) {
      // Log but don't fail execution if provenance logging fails
      this.logger.error('provenance_log_failed', {
        error: (error as Error).message,
        event_type: params.eventType,
      });
    }
  }

  /**
   * Query provenance by trace ID
   */
  findByTraceId(traceId: string): ProvenanceRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM provenance WHERE trace_id = ? ORDER BY timestamp ASC
    `).all(traceId) as any[];

    return rows.map(row => this.rowToRecord(row));
  }

  /**
   * Query provenance by run ID
   */
  findByRunId(runId: string): ProvenanceRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM provenance WHERE run_id = ? ORDER BY timestamp ASC
    `).all(runId) as any[];

    return rows.map(row => this.rowToRecord(row));
  }

  /**
   * Query recent provenance records
   */
  findRecent(options: { limit?: number; eventType?: string } = {}): ProvenanceRecord[] {
    const limit = options.limit ?? 100;

    let query = 'SELECT * FROM provenance';
    const params: unknown[] = [];

    if (options.eventType) {
      query += ' WHERE event_type = ?';
      params.push(options.eventType);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => this.rowToRecord(row));
  }

  /**
   * Get aggregate statistics
   */
  getStats(options: { traceId?: string; runId?: string; hours?: number } = {}): {
    totalEvents: number;
    llmCalls: number;
    toolCalls: number;
    errors: number;
    totalCostUsd: number;
    totalDurationMs: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  } {
    let whereClause = '1=1';
    const params: unknown[] = [];

    if (options.traceId) {
      whereClause += ' AND trace_id = ?';
      params.push(options.traceId);
    }

    if (options.runId) {
      whereClause += ' AND run_id = ?';
      params.push(options.runId);
    }

    if (options.hours) {
      const since = new Date(Date.now() - options.hours * 60 * 60 * 1000).toISOString();
      whereClause += ' AND timestamp >= ?';
      params.push(since);
    }

    const row = this.db.prepare(`
      SELECT
        COUNT(*) as total_events,
        SUM(CASE WHEN event_type = 'llm_call' THEN 1 ELSE 0 END) as llm_calls,
        SUM(CASE WHEN event_type = 'tool_call' THEN 1 ELSE 0 END) as tool_calls,
        SUM(CASE WHEN event_type = 'error' THEN 1 ELSE 0 END) as errors,
        SUM(COALESCE(cost_usd, 0)) as total_cost_usd,
        SUM(COALESCE(duration_ms, 0)) as total_duration_ms,
        SUM(COALESCE(input_tokens, 0)) as total_input_tokens,
        SUM(COALESCE(output_tokens, 0)) as total_output_tokens
      FROM provenance
      WHERE ${whereClause}
    `).get(...params) as any;

    return {
      totalEvents: row.total_events ?? 0,
      llmCalls: row.llm_calls ?? 0,
      toolCalls: row.tool_calls ?? 0,
      errors: row.errors ?? 0,
      totalCostUsd: row.total_cost_usd ?? 0,
      totalDurationMs: row.total_duration_ms ?? 0,
      totalInputTokens: row.total_input_tokens ?? 0,
      totalOutputTokens: row.total_output_tokens ?? 0,
    };
  }

  /**
   * Hash data for provenance storage
   */
  static hashData(data: unknown): string {
    const content = typeof data === 'string' ? data : JSON.stringify(data);
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  private rowToRecord(row: any): ProvenanceRecord {
    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      traceId: row.trace_id,
      runId: row.run_id,
      stepId: row.step_id ?? undefined,
      tenantId: row.tenant_id ?? undefined,
      eventType: row.event_type,
      model: row.model_id ? {
        id: row.model_id,
        promptHash: row.prompt_hash,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        thinkingTokens: row.thinking_tokens,
        costUsd: row.cost_usd,
        durationMs: row.duration_ms,
        effortLevel: row.effort_level,
      } : undefined,
      tool: row.tool_name ? {
        name: row.tool_name,
        version: row.tool_version,
        argsHash: row.args_hash,
        resultHash: row.result_hash,
        sideEffectCommitted: row.side_effect_committed === 1,
        durationMs: row.duration_ms,
      } : undefined,
      error: row.error_message ? {
        message: row.error_message,
        code: row.error_code,
      } : undefined,
    };
  }
}

// Singleton instance
let instance: ProvenanceLogger | null = null;

export function getProvenanceLogger(): ProvenanceLogger {
  if (!instance) {
    instance = new ProvenanceLogger();
  }
  return instance;
}
