/**
 * Jobs Storage
 *
 * Handles async job persistence for long-running agent operations.
 * Used for: Virtual Try-On, Transcription, Image Generation, etc.
 */

import { getDatabase } from './database.js';
import { v4 as uuid } from 'uuid';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  agentId: string;
  tenantId: string;
  userId?: string;
  status: JobStatus;
  providerJobId?: string; // External provider's job ID (Replicate, etc.)
  provider?: string; // Which provider is handling this
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  errorCode?: string;
  progress: number; // 0-100
  webhookUrl?: string;
  estimatedDurationMs?: number;
  cost?: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface CreateJobInput {
  agentId: string;
  tenantId: string;
  userId?: string;
  input: Record<string, unknown>;
  webhookUrl?: string;
  estimatedDurationMs?: number;
}

export interface UpdateJobInput {
  status?: JobStatus;
  providerJobId?: string;
  provider?: string;
  progress?: number;
  output?: Record<string, unknown>;
  error?: string;
  errorCode?: string;
  cost?: number;
}

interface JobRow {
  id: string;
  agent_id: string;
  tenant_id: string;
  user_id: string | null;
  status: string;
  provider_job_id: string | null;
  provider: string | null;
  input: string;
  output: string | null;
  error: string | null;
  error_code: string | null;
  progress: number;
  webhook_url: string | null;
  estimated_duration_ms: number | null;
  cost: number | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

function deserializeJob(row: JobRow): Job {
  return {
    id: row.id,
    agentId: row.agent_id,
    tenantId: row.tenant_id,
    userId: row.user_id ?? undefined,
    status: row.status as JobStatus,
    providerJobId: row.provider_job_id ?? undefined,
    provider: row.provider ?? undefined,
    input: JSON.parse(row.input),
    output: row.output ? JSON.parse(row.output) : undefined,
    error: row.error ?? undefined,
    errorCode: row.error_code ?? undefined,
    progress: row.progress,
    webhookUrl: row.webhook_url ?? undefined,
    estimatedDurationMs: row.estimated_duration_ms ?? undefined,
    cost: row.cost ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  };
}

export class JobsStorage {
  private db = getDatabase();

  /**
   * Create a new job
   */
  create(input: CreateJobInput): Job {
    const id = uuid();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO jobs (
        id, agent_id, tenant_id, user_id, status, input,
        webhook_url, estimated_duration_ms, progress, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, 0, ?, ?)
    `).run(
      id,
      input.agentId,
      input.tenantId,
      input.userId ?? null,
      JSON.stringify(input.input),
      input.webhookUrl ?? null,
      input.estimatedDurationMs ?? null,
      now,
      now
    );

    return this.get(id)!;
  }

  /**
   * Get a job by ID
   */
  get(id: string): Job | null {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined;
    return row ? deserializeJob(row) : null;
  }

  /**
   * Update a job
   */
  update(id: string, updates: UpdateJobInput): Job | null {
    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.status !== undefined) {
      sets.push('status = ?');
      values.push(updates.status);

      if (updates.status === 'processing') {
        sets.push('started_at = ?');
        values.push(now);
      } else if (updates.status === 'completed' || updates.status === 'failed') {
        sets.push('completed_at = ?');
        values.push(now);
      }
    }

    if (updates.providerJobId !== undefined) {
      sets.push('provider_job_id = ?');
      values.push(updates.providerJobId);
    }

    if (updates.provider !== undefined) {
      sets.push('provider = ?');
      values.push(updates.provider);
    }

    if (updates.progress !== undefined) {
      sets.push('progress = ?');
      values.push(updates.progress);
    }

    if (updates.output !== undefined) {
      sets.push('output = ?');
      values.push(JSON.stringify(updates.output));
    }

    if (updates.error !== undefined) {
      sets.push('error = ?');
      values.push(updates.error);
    }

    if (updates.errorCode !== undefined) {
      sets.push('error_code = ?');
      values.push(updates.errorCode);
    }

    if (updates.cost !== undefined) {
      sets.push('cost = ?');
      values.push(updates.cost);
    }

    values.push(id);

    this.db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    return this.get(id);
  }

  /**
   * Mark job as processing
   */
  markProcessing(id: string, providerJobId?: string, provider?: string): Job | null {
    return this.update(id, {
      status: 'processing',
      providerJobId,
      provider,
    });
  }

  /**
   * Mark job as completed
   */
  markCompleted(id: string, output: Record<string, unknown>, cost?: number): Job | null {
    return this.update(id, {
      status: 'completed',
      output,
      progress: 100,
      cost,
    });
  }

  /**
   * Mark job as failed
   */
  markFailed(id: string, error: string, errorCode?: string): Job | null {
    return this.update(id, {
      status: 'failed',
      error,
      errorCode,
    });
  }

  /**
   * Update job progress
   */
  updateProgress(id: string, progress: number): Job | null {
    return this.update(id, { progress: Math.min(100, Math.max(0, progress)) });
  }

  /**
   * Find jobs by status
   */
  findByStatus(status: JobStatus, limit = 100): Job[] {
    const rows = this.db.prepare(`
      SELECT * FROM jobs WHERE status = ? ORDER BY created_at ASC LIMIT ?
    `).all(status, limit) as JobRow[];
    return rows.map(deserializeJob);
  }

  /**
   * Find pending jobs for processing
   */
  findPending(agentId?: string, limit = 50): Job[] {
    if (agentId) {
      const rows = this.db.prepare(`
        SELECT * FROM jobs WHERE status = 'pending' AND agent_id = ?
        ORDER BY created_at ASC LIMIT ?
      `).all(agentId, limit) as JobRow[];
      return rows.map(deserializeJob);
    }

    const rows = this.db.prepare(`
      SELECT * FROM jobs WHERE status = 'pending'
      ORDER BY created_at ASC LIMIT ?
    `).all(limit) as JobRow[];
    return rows.map(deserializeJob);
  }

  /**
   * Find jobs by tenant
   */
  findByTenant(tenantId: string, options?: { status?: JobStatus; limit?: number }): Job[] {
    let query = 'SELECT * FROM jobs WHERE tenant_id = ?';
    const params: unknown[] = [tenantId];

    if (options?.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.prepare(query).all(...params) as JobRow[];
    return rows.map(deserializeJob);
  }

  /**
   * Find stale processing jobs (for recovery)
   */
  findStaleProcessing(olderThanMs: number): Job[] {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const rows = this.db.prepare(`
      SELECT * FROM jobs
      WHERE status = 'processing' AND started_at < ?
      ORDER BY started_at ASC
    `).all(cutoff) as JobRow[];
    return rows.map(deserializeJob);
  }

  /**
   * Cancel a job
   */
  cancel(id: string): Job | null {
    const job = this.get(id);
    if (!job) return null;

    if (job.status === 'completed' || job.status === 'failed') {
      return job; // Cannot cancel finished jobs
    }

    return this.update(id, { status: 'cancelled' });
  }

  /**
   * Delete old completed jobs
   */
  cleanupOld(olderThanDays: number): number {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const result = this.db.prepare(`
      DELETE FROM jobs
      WHERE status IN ('completed', 'failed', 'cancelled') AND completed_at < ?
    `).run(cutoff);
    return result.changes;
  }

  /**
   * Get job statistics
   */
  getStats(tenantId?: string): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    const baseQuery = tenantId ? 'WHERE tenant_id = ?' : '';
    const params = tenantId ? [tenantId] : [];

    const total = this.db.prepare(`SELECT COUNT(*) as count FROM jobs ${baseQuery}`).get(...params) as { count: number };
    const pending = this.db.prepare(`SELECT COUNT(*) as count FROM jobs ${baseQuery ? baseQuery + ' AND' : 'WHERE'} status = 'pending'`).get(...params) as { count: number };
    const processing = this.db.prepare(`SELECT COUNT(*) as count FROM jobs ${baseQuery ? baseQuery + ' AND' : 'WHERE'} status = 'processing'`).get(...params) as { count: number };
    const completed = this.db.prepare(`SELECT COUNT(*) as count FROM jobs ${baseQuery ? baseQuery + ' AND' : 'WHERE'} status = 'completed'`).get(...params) as { count: number };
    const failed = this.db.prepare(`SELECT COUNT(*) as count FROM jobs ${baseQuery ? baseQuery + ' AND' : 'WHERE'} status = 'failed'`).get(...params) as { count: number };

    return {
      total: total.count,
      pending: pending.count,
      processing: processing.count,
      completed: completed.count,
      failed: failed.count,
    };
  }
}

// Singleton instance
let instance: JobsStorage | null = null;

export function getJobsStorage(): JobsStorage {
  if (!instance) {
    instance = new JobsStorage();
  }
  return instance;
}
