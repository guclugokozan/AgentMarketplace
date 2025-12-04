/**
 * Runs Storage
 *
 * Persistence layer for run records with idempotency support.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './database.js';
import type {
  RunRecord,
  RunStatus,
  AgentInput,
  AgentOutput,
  ExecutionBudget,
  UsageMetrics,
  ModelId,
  EffortLevel,
} from '../core/types.js';

// Default consumed metrics
const defaultConsumed = (): UsageMetrics => ({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  thinkingTokens: 0,
  costUsd: 0,
  durationMs: 0,
  modelUsed: 'claude-sonnet-4-5-20250514',
  downgrades: 0,
  steps: 0,
  toolCalls: 0,
});

export interface CreateRunParams {
  idempotencyKey: string;
  agentId: string;
  input: AgentInput;
  budget: ExecutionBudget;
  traceId: string;
  currentModel: ModelId;
  effortLevel: EffortLevel;
  tenantId?: string;
  userId?: string;
}

export class RunsStorage {
  private db = getDatabase();

  create(params: CreateRunParams): RunRecord {
    const id = uuidv4();
    const now = new Date().toISOString();
    const consumed = defaultConsumed();
    consumed.modelUsed = params.currentModel;

    const stmt = this.db.prepare(`
      INSERT INTO runs (
        id, idempotency_key, agent_id, status, input, budget, consumed,
        current_model, effort_level, trace_id, tenant_id, user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      params.idempotencyKey,
      params.agentId,
      'running',
      JSON.stringify(params.input),
      JSON.stringify(params.budget),
      JSON.stringify(consumed),
      params.currentModel,
      params.effortLevel,
      params.traceId,
      params.tenantId ?? null,
      params.userId ?? null,
      now,
      now
    );

    return {
      id,
      idempotencyKey: params.idempotencyKey,
      agentId: params.agentId,
      status: 'running',
      input: params.input,
      budget: params.budget,
      consumed,
      steps: [],
      currentModel: params.currentModel,
      effortLevel: params.effortLevel,
      traceId: params.traceId,
      tenantId: params.tenantId,
      userId: params.userId,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  findById(id: string): RunRecord | null {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToRunRecord(row);
  }

  findByIdempotencyKey(key: string): RunRecord | null {
    const row = this.db.prepare('SELECT * FROM runs WHERE idempotency_key = ?').get(key) as any;
    if (!row) return null;
    return this.rowToRunRecord(row);
  }

  updateStatus(id: string, status: RunStatus): void {
    const now = new Date().toISOString();
    const completedAt = ['completed', 'failed', 'partial', 'cancelled'].includes(status)
      ? now
      : null;

    this.db.prepare(`
      UPDATE runs SET status = ?, updated_at = ?, completed_at = COALESCE(?, completed_at)
      WHERE id = ?
    `).run(status, now, completedAt, id);
  }

  updateConsumed(id: string, consumed: UsageMetrics): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE runs SET consumed = ?, updated_at = ? WHERE id = ?
    `).run(JSON.stringify(consumed), now, id);
  }

  updateModel(id: string, model: ModelId): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE runs SET current_model = ?, updated_at = ? WHERE id = ?
    `).run(model, now, id);
  }

  complete(id: string, output: AgentOutput): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE runs SET
        status = 'completed',
        output = ?,
        consumed = ?,
        updated_at = ?,
        completed_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify(output),
      JSON.stringify(output.usage),
      now,
      now,
      id
    );
  }

  partial(id: string, output: AgentOutput): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE runs SET
        status = 'partial',
        output = ?,
        consumed = ?,
        updated_at = ?,
        completed_at = ?
      WHERE id = ?
    `).run(
      JSON.stringify(output),
      JSON.stringify(output.usage),
      now,
      now,
      id
    );
  }

  fail(id: string, error: { message: string; code: string; retryable: boolean; step?: number }): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE runs SET
        status = 'failed',
        error = ?,
        updated_at = ?,
        completed_at = ?
      WHERE id = ?
    `).run(JSON.stringify(error), now, now, id);
  }

  awaitApproval(id: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE runs SET status = 'awaiting_approval', updated_at = ? WHERE id = ?
    `).run(now, id);
  }

  findRecent(agentId: string, options: { limit?: number; hours?: number } = {}): RunRecord[] {
    const limit = options.limit ?? 100;
    const hours = options.hours ?? 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const rows = this.db.prepare(`
      SELECT * FROM runs
      WHERE agent_id = ? AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(agentId, since, limit) as any[];

    return rows.map(row => this.rowToRunRecord(row));
  }

  findByStatus(status: RunStatus, options: { limit?: number } = {}): RunRecord[] {
    const limit = options.limit ?? 100;
    const rows = this.db.prepare(`
      SELECT * FROM runs WHERE status = ? ORDER BY created_at DESC LIMIT ?
    `).all(status, limit) as any[];

    return rows.map(row => this.rowToRunRecord(row));
  }

  private rowToRunRecord(row: any): RunRecord {
    return {
      id: row.id,
      idempotencyKey: row.idempotency_key,
      agentId: row.agent_id,
      status: row.status as RunStatus,
      input: JSON.parse(row.input),
      output: row.output ? JSON.parse(row.output) : undefined,
      budget: JSON.parse(row.budget),
      consumed: JSON.parse(row.consumed),
      steps: [], // Loaded separately via StepsStorage
      currentModel: row.current_model as ModelId,
      effortLevel: row.effort_level as EffortLevel,
      traceId: row.trace_id,
      tenantId: row.tenant_id ?? undefined,
      userId: row.user_id ?? undefined,
      error: row.error ? JSON.parse(row.error) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    };
  }
}

// Singleton instance
let instance: RunsStorage | null = null;

export function getRunsStorage(): RunsStorage {
  if (!instance) {
    instance = new RunsStorage();
  }
  return instance;
}
