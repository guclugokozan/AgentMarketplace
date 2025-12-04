/**
 * Steps Storage
 *
 * Persistence layer for step records with step-level idempotency.
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { getDatabase } from './database.js';
import type { StepRecord, StepType, ModelId } from '../core/types.js';

export interface CreateStepParams {
  runId: string;
  index: number;
  type: StepType;
  model?: ModelId;
  toolName?: string;
  input: unknown;
  storeFullInput?: boolean;
}

export class StepsStorage {
  private db = getDatabase();

  create(params: CreateStepParams): StepRecord {
    const id = uuidv4();
    const inputHash = this.hashData(params.input);
    const idempotencyKey = this.generateIdempotencyKey(params.runId, params.index, inputHash);
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO steps (
        id, run_id, step_index, idempotency_key, type, model, tool_name,
        input_hash, input, status, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      params.runId,
      params.index,
      idempotencyKey,
      params.type,
      params.model ?? null,
      params.toolName ?? null,
      inputHash,
      params.storeFullInput ? JSON.stringify(params.input) : null,
      'running',
      now
    );

    return {
      id,
      runId: params.runId,
      index: params.index,
      idempotencyKey,
      type: params.type,
      model: params.model,
      toolName: params.toolName,
      inputHash,
      input: params.storeFullInput ? params.input : undefined,
      status: 'running',
      costUsd: 0,
      durationMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      startedAt: new Date(now),
    };
  }

  findById(id: string): StepRecord | null {
    const row = this.db.prepare('SELECT * FROM steps WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToStepRecord(row);
  }

  findByIdempotencyKey(key: string): StepRecord | null {
    const row = this.db.prepare('SELECT * FROM steps WHERE idempotency_key = ?').get(key) as any;
    if (!row) return null;
    return this.rowToStepRecord(row);
  }

  findByRunId(runId: string): StepRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM steps WHERE run_id = ? ORDER BY step_index ASC
    `).all(runId) as any[];

    return rows.map(row => this.rowToStepRecord(row));
  }

  complete(
    id: string,
    result: {
      output: unknown;
      costUsd: number;
      durationMs: number;
      inputTokens: number;
      outputTokens: number;
      thinkingTokens?: number;
      sideEffectCommitted?: boolean;
      storeFullOutput?: boolean;
    }
  ): void {
    const now = new Date().toISOString();
    const outputHash = this.hashData(result.output);

    this.db.prepare(`
      UPDATE steps SET
        status = 'completed',
        output_hash = ?,
        output = ?,
        cost_usd = ?,
        duration_ms = ?,
        input_tokens = ?,
        output_tokens = ?,
        thinking_tokens = ?,
        side_effect_committed = ?,
        completed_at = ?
      WHERE id = ?
    `).run(
      outputHash,
      result.storeFullOutput ? JSON.stringify(result.output) : null,
      result.costUsd,
      result.durationMs,
      result.inputTokens,
      result.outputTokens,
      result.thinkingTokens ?? 0,
      result.sideEffectCommitted ? 1 : null,
      now,
      id
    );
  }

  fail(id: string, durationMs: number): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE steps SET status = 'failed', duration_ms = ?, completed_at = ? WHERE id = ?
    `).run(durationMs, now, id);
  }

  skip(id: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE steps SET status = 'skipped', completed_at = ? WHERE id = ?
    `).run(now, id);
  }

  // Check if a step with this input has already been executed in this run
  checkIdempotency(runId: string, index: number, input: unknown): StepRecord | null {
    const inputHash = this.hashData(input);
    const idempotencyKey = this.generateIdempotencyKey(runId, index, inputHash);
    return this.findByIdempotencyKey(idempotencyKey);
  }

  // Generate step idempotency key
  generateIdempotencyKey(runId: string, stepIndex: number, inputHash: string): string {
    return `${runId}:step:${stepIndex}:${inputHash}`;
  }

  // Hash data for provenance (not full storage)
  hashData(data: unknown): string {
    const content = typeof data === 'string' ? data : JSON.stringify(data);
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  private rowToStepRecord(row: any): StepRecord {
    return {
      id: row.id,
      runId: row.run_id,
      index: row.step_index,
      idempotencyKey: row.idempotency_key,
      type: row.type as StepType,
      model: row.model as ModelId | undefined,
      toolName: row.tool_name ?? undefined,
      inputHash: row.input_hash,
      outputHash: row.output_hash ?? undefined,
      input: row.input ? JSON.parse(row.input) : undefined,
      output: row.output ? JSON.parse(row.output) : undefined,
      status: row.status as StepRecord['status'],
      costUsd: row.cost_usd,
      durationMs: row.duration_ms,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      thinkingTokens: row.thinking_tokens,
      sideEffectCommitted: row.side_effect_committed === 1 ? true : undefined,
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    };
  }
}

// Singleton instance
let instance: StepsStorage | null = null;

export function getStepsStorage(): StepsStorage {
  if (!instance) {
    instance = new StepsStorage();
  }
  return instance;
}
