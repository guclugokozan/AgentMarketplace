/**
 * Provider Job Manager
 *
 * Manages async job lifecycle for video, audio, and heavy processing.
 * Handles creation, polling, completion, and failure states.
 */

import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';

// Types
export interface JobCreateParams {
  provider: string;
  externalJobId: string;
  agentId: string;
  runId: string;
  webhookUrl?: string;
  tenantId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface JobStatus {
  id: string;
  provider: string;
  externalJobId: string;
  status: 'pending' | 'processing' | 'complete' | 'failed' | 'cancelled';
  progress: number;
  resultUrl?: string;
  resultMetadata?: Record<string, unknown>;
  thumbnailUrl?: string;
  errorMessage?: string;
  errorCode?: string;
  costUsd: number;
  createdAt: string;
  completedAt?: string;
}

export interface JobUpdateParams {
  status?: JobStatus['status'];
  progress?: number;
  resultUrl?: string;
  resultMetadata?: Record<string, unknown>;
  thumbnailUrl?: string;
  errorMessage?: string;
  errorCode?: string;
  costUsd?: number;
}

export class ProviderJobManager {
  private db: Database.Database;

  constructor(dbPath: string = './data/agent-marketplace.db') {
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
  }

  /**
   * Create a new job record
   */
  create(params: JobCreateParams): string {
    const id = uuidv4();

    this.db.prepare(`
      INSERT INTO provider_jobs (
        id, provider, external_job_id, agent_id, run_id,
        webhook_url, tenant_id, user_id, result_metadata, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      id,
      params.provider,
      params.externalJobId,
      params.agentId,
      params.runId,
      params.webhookUrl || null,
      params.tenantId || null,
      params.userId || null,
      params.metadata ? JSON.stringify(params.metadata) : null
    );

    return id;
  }

  /**
   * Get job status by ID
   */
  getStatus(id: string): JobStatus | null {
    const row = this.db.prepare(`
      SELECT
        id, provider, external_job_id, status, progress,
        result_url, result_metadata, thumbnail_url,
        error_message, error_code, cost_usd,
        created_at, completed_at
      FROM provider_jobs
      WHERE id = ?
    `).get(id) as any;

    if (!row) return null;

    return this.rowToStatus(row);
  }

  /**
   * Get job by external provider ID
   */
  findByExternalId(provider: string, externalJobId: string): JobStatus | null {
    const row = this.db.prepare(`
      SELECT
        id, provider, external_job_id, status, progress,
        result_url, result_metadata, thumbnail_url,
        error_message, error_code, cost_usd,
        created_at, completed_at
      FROM provider_jobs
      WHERE provider = ? AND external_job_id = ?
    `).get(provider, externalJobId) as any;

    if (!row) return null;

    return this.rowToStatus(row);
  }

  /**
   * List jobs by run ID
   */
  listByRun(runId: string): JobStatus[] {
    const rows = this.db.prepare(`
      SELECT
        id, provider, external_job_id, status, progress,
        result_url, result_metadata, thumbnail_url,
        error_message, error_code, cost_usd,
        created_at, completed_at
      FROM provider_jobs
      WHERE run_id = ?
      ORDER BY created_at DESC
    `).all(runId) as any[];

    return rows.map(row => this.rowToStatus(row));
  }

  /**
   * Update job progress
   */
  updateProgress(id: string, progress: number): void {
    this.db.prepare(`
      UPDATE provider_jobs
      SET progress = ?, status = 'processing',
          started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(Math.min(100, Math.max(0, progress)), id);
  }

  /**
   * Mark job as complete
   */
  complete(
    id: string,
    resultUrl: string,
    metadata?: Record<string, unknown>,
    costUsd?: number,
    thumbnailUrl?: string
  ): void {
    this.db.prepare(`
      UPDATE provider_jobs
      SET
        status = 'complete',
        progress = 100,
        result_url = ?,
        result_metadata = ?,
        thumbnail_url = ?,
        cost_usd = COALESCE(?, cost_usd),
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      resultUrl,
      metadata ? JSON.stringify(metadata) : null,
      thumbnailUrl || null,
      costUsd || null,
      id
    );
  }

  /**
   * Mark job as failed
   */
  fail(id: string, errorMessage: string, errorCode?: string): void {
    this.db.prepare(`
      UPDATE provider_jobs
      SET
        status = 'failed',
        error_message = ?,
        error_code = ?,
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(errorMessage, errorCode || null, id);
  }

  /**
   * Cancel a job
   */
  cancel(id: string): void {
    this.db.prepare(`
      UPDATE provider_jobs
      SET status = 'cancelled',
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('pending', 'processing')
    `).run(id);
  }

  /**
   * Get pending jobs for a provider (for batch polling)
   */
  getPendingJobs(provider: string, limit: number = 50): JobStatus[] {
    const rows = this.db.prepare(`
      SELECT
        id, provider, external_job_id, status, progress,
        result_url, result_metadata, thumbnail_url,
        error_message, error_code, cost_usd,
        created_at, completed_at
      FROM provider_jobs
      WHERE provider = ? AND status IN ('pending', 'processing')
      ORDER BY created_at ASC
      LIMIT ?
    `).all(provider, limit) as any[];

    return rows.map(row => this.rowToStatus(row));
  }

  /**
   * Handle webhook callback
   */
  handleWebhook(
    provider: string,
    externalJobId: string,
    payload: Record<string, unknown>
  ): JobStatus | null {
    const job = this.findByExternalId(provider, externalJobId);
    if (!job) return null;

    this.db.prepare(`
      UPDATE provider_jobs
      SET webhook_received = TRUE,
          webhook_payload = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(payload), job.id);

    return this.getStatus(job.id);
  }

  /**
   * Get job statistics
   */
  getStats(tenantId?: string): {
    total: number;
    pending: number;
    processing: number;
    complete: number;
    failed: number;
    totalCostUsd: number;
  } {
    const whereClause = tenantId ? 'WHERE tenant_id = ?' : '';
    const params = tenantId ? [tenantId] : [];

    const row = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as complete,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        COALESCE(SUM(cost_usd), 0) as total_cost_usd
      FROM provider_jobs
      ${whereClause}
    `).get(...params) as any;

    return {
      total: row.total || 0,
      pending: row.pending || 0,
      processing: row.processing || 0,
      complete: row.complete || 0,
      failed: row.failed || 0,
      totalCostUsd: row.total_cost_usd || 0,
    };
  }

  /**
   * Clean up old completed/failed jobs
   */
  cleanup(olderThanDays: number = 30): number {
    const result = this.db.prepare(`
      DELETE FROM provider_jobs
      WHERE status IN ('complete', 'failed', 'cancelled')
        AND completed_at < datetime('now', '-' || ? || ' days')
    `).run(olderThanDays);

    return result.changes;
  }

  private rowToStatus(row: any): JobStatus {
    return {
      id: row.id,
      provider: row.provider,
      externalJobId: row.external_job_id,
      status: row.status,
      progress: row.progress,
      resultUrl: row.result_url || undefined,
      resultMetadata: row.result_metadata ? JSON.parse(row.result_metadata) : undefined,
      thumbnailUrl: row.thumbnail_url || undefined,
      errorMessage: row.error_message || undefined,
      errorCode: row.error_code || undefined,
      costUsd: row.cost_usd || 0,
      createdAt: row.created_at,
      completedAt: row.completed_at || undefined,
    };
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance
let instance: ProviderJobManager | null = null;

export function getJobManager(): ProviderJobManager {
  if (!instance) {
    instance = new ProviderJobManager();
  }
  return instance;
}

export function closeJobManager(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
