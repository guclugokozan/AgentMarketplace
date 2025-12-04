/**
 * Queue and Fairness Module
 *
 * Provides fair scheduling and resource allocation:
 * - Priority queue per tenant
 * - Quota enforcement
 * - Noisy neighbor prevention
 * - Backpressure handling
 * - Weighted fair queuing
 */

import { z } from 'zod';
import type { Database } from 'better-sqlite3';
import { EventEmitter } from 'events';
import type { TenantConfig, TenantContext } from './multi-tenant.js';

// Queue item schema
export const QueueItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  agentId: z.string(),
  priority: z.number().int().min(0).max(100).default(50),
  payload: z.unknown(),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled', 'timeout']),
  attempts: z.number().int().min(0).default(0),
  maxAttempts: z.number().int().min(1).default(3),
  createdAt: z.date(),
  scheduledAt: z.date().optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  timeoutMs: z.number().int().positive().default(300000), // 5 min default
  metadata: z.record(z.unknown()).optional(),
});

export type QueueItem = z.infer<typeof QueueItemSchema>;

// Queue statistics
export interface QueueStats {
  totalPending: number;
  totalProcessing: number;
  totalCompleted: number;
  totalFailed: number;
  avgWaitTimeMs: number;
  avgProcessingTimeMs: number;
  throughputPerMinute: number;
  byTenant: Map<string, TenantQueueStats>;
}

export interface TenantQueueStats {
  tenantId: string;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  avgWaitTimeMs: number;
  quota: TenantQuota;
}

// Tenant quota configuration
export interface TenantQuota {
  maxConcurrent: number;
  maxQueueDepth: number;
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
  priorityBoost: number; // -10 to +10
  weight: number; // For weighted fair queuing (1-100)
}

// Default quotas by tier
export const DEFAULT_QUOTAS: Record<TenantConfig['tier'], TenantQuota> = {
  free: {
    maxConcurrent: 2,
    maxQueueDepth: 10,
    maxPerMinute: 5,
    maxPerHour: 100,
    maxPerDay: 500,
    priorityBoost: -5,
    weight: 10,
  },
  starter: {
    maxConcurrent: 5,
    maxQueueDepth: 50,
    maxPerMinute: 20,
    maxPerHour: 500,
    maxPerDay: 2000,
    priorityBoost: 0,
    weight: 25,
  },
  professional: {
    maxConcurrent: 20,
    maxQueueDepth: 200,
    maxPerMinute: 100,
    maxPerHour: 2000,
    maxPerDay: 10000,
    priorityBoost: 5,
    weight: 50,
  },
  enterprise: {
    maxConcurrent: 100,
    maxQueueDepth: 1000,
    maxPerMinute: 500,
    maxPerHour: 10000,
    maxPerDay: 50000,
    priorityBoost: 10,
    weight: 100,
  },
};

// Queue events
export interface QueueEvents {
  itemEnqueued: (item: QueueItem) => void;
  itemStarted: (item: QueueItem) => void;
  itemCompleted: (item: QueueItem) => void;
  itemFailed: (item: QueueItem, error: string) => void;
  itemTimeout: (item: QueueItem) => void;
  quotaExceeded: (tenantId: string, quotaType: string) => void;
  backpressure: (tenantId: string, queueDepth: number) => void;
}

export class FairQueue extends EventEmitter {
  private processingItems: Map<string, QueueItem> = new Map();
  private tenantQuotas: Map<string, TenantQuota> = new Map();
  private isProcessing: boolean = false;
  private processingInterval?: NodeJS.Timeout;

  constructor(
    private db: Database,
    private options: {
      pollIntervalMs?: number;
      defaultTimeoutMs?: number;
      maxGlobalConcurrent?: number;
    } = {}
  ) {
    super();
    this.initSchema();
    this.options = {
      pollIntervalMs: options.pollIntervalMs ?? 1000,
      defaultTimeoutMs: options.defaultTimeoutMs ?? 300000,
      maxGlobalConcurrent: options.maxGlobalConcurrent ?? 100,
    };
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queue_items (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 50,
        effective_priority REAL NOT NULL DEFAULT 50,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        created_at TEXT NOT NULL,
        scheduled_at TEXT,
        started_at TEXT,
        completed_at TEXT,
        result_json TEXT,
        error TEXT,
        timeout_ms INTEGER NOT NULL DEFAULT 300000,
        metadata_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_items(status);
      CREATE INDEX IF NOT EXISTS idx_queue_tenant ON queue_items(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_queue_priority ON queue_items(effective_priority DESC, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_queue_scheduled ON queue_items(scheduled_at);

      CREATE TABLE IF NOT EXISTS queue_tenant_quotas (
        tenant_id TEXT PRIMARY KEY,
        max_concurrent INTEGER NOT NULL,
        max_queue_depth INTEGER NOT NULL,
        max_per_minute INTEGER NOT NULL,
        max_per_hour INTEGER NOT NULL,
        max_per_day INTEGER NOT NULL,
        priority_boost INTEGER NOT NULL,
        weight INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS queue_rate_tracking (
        tenant_id TEXT NOT NULL,
        window_type TEXT NOT NULL,
        window_start TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (tenant_id, window_type, window_start)
      );
    `);
  }

  // Start the queue processor
  start(): void {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.processingInterval = setInterval(() => {
      this.processNextItems().catch(err => {
        console.error('Queue processing error:', err);
      });
    }, this.options.pollIntervalMs);

    // Check for timed out items
    setInterval(() => {
      this.checkTimeouts().catch(err => {
        console.error('Timeout check error:', err);
      });
    }, 10000); // Every 10 seconds
  }

  // Stop the queue processor
  stop(): void {
    this.isProcessing = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
  }

  // Enqueue a new item
  async enqueue(params: {
    tenantId: string;
    agentId: string;
    payload: unknown;
    priority?: number;
    scheduledAt?: Date;
    timeoutMs?: number;
    maxAttempts?: number;
    metadata?: Record<string, unknown>;
  }): Promise<QueueItem | { error: string; quotaType: string }> {
    const quota = await this.getTenantQuota(params.tenantId);

    // Check queue depth
    const currentDepth = await this.getTenantQueueDepth(params.tenantId);
    if (currentDepth >= quota.maxQueueDepth) {
      this.emit('backpressure', params.tenantId, currentDepth);
      return { error: 'Queue depth exceeded', quotaType: 'queue_depth' };
    }

    // Check rate limits
    const rateCheck = await this.checkRateLimits(params.tenantId, quota);
    if (!rateCheck.allowed) {
      this.emit('quotaExceeded', params.tenantId, rateCheck.quotaType!);
      return { error: `Rate limit exceeded: ${rateCheck.quotaType}`, quotaType: rateCheck.quotaType! };
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const basePriority = params.priority ?? 50;
    const effectivePriority = this.calculateEffectivePriority(basePriority, quota);

    const item: QueueItem = {
      id,
      tenantId: params.tenantId,
      agentId: params.agentId,
      priority: basePriority,
      payload: params.payload,
      status: 'pending',
      attempts: 0,
      maxAttempts: params.maxAttempts ?? 3,
      createdAt: now,
      scheduledAt: params.scheduledAt,
      timeoutMs: params.timeoutMs ?? this.options.defaultTimeoutMs!,
      metadata: params.metadata,
    };

    const stmt = this.db.prepare(`
      INSERT INTO queue_items (
        id, tenant_id, agent_id, priority, effective_priority, payload_json,
        status, attempts, max_attempts, created_at, scheduled_at, timeout_ms, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      item.id,
      item.tenantId,
      item.agentId,
      item.priority,
      effectivePriority,
      JSON.stringify(item.payload),
      item.status,
      item.attempts,
      item.maxAttempts,
      item.createdAt.toISOString(),
      item.scheduledAt?.toISOString() ?? null,
      item.timeoutMs,
      item.metadata ? JSON.stringify(item.metadata) : null
    );

    // Increment rate tracking
    await this.incrementRateTracking(params.tenantId);

    this.emit('itemEnqueued', item);
    return item;
  }

  // Get next items to process using weighted fair queuing
  private async processNextItems(): Promise<void> {
    if (this.processingItems.size >= this.options.maxGlobalConcurrent!) {
      return;
    }

    const availableSlots = this.options.maxGlobalConcurrent! - this.processingItems.size;

    // Get tenant processing counts
    const tenantProcessingCounts = new Map<string, number>();
    for (const item of this.processingItems.values()) {
      const count = tenantProcessingCounts.get(item.tenantId) || 0;
      tenantProcessingCounts.set(item.tenantId, count + 1);
    }

    // Get pending items, respecting tenant concurrency limits
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      SELECT * FROM queue_items
      WHERE status = 'pending'
      AND (scheduled_at IS NULL OR scheduled_at <= ?)
      ORDER BY effective_priority DESC, created_at ASC
      LIMIT ?
    `);

    const candidates = stmt.all(now, availableSlots * 2) as Record<string, unknown>[];

    let processed = 0;
    for (const row of candidates) {
      if (processed >= availableSlots) break;

      const tenantId = row.tenant_id as string;
      const quota = await this.getTenantQuota(tenantId);
      const currentProcessing = tenantProcessingCounts.get(tenantId) || 0;

      if (currentProcessing >= quota.maxConcurrent) {
        continue; // Skip - tenant at capacity
      }

      const item = this.rowToQueueItem(row);
      await this.startProcessing(item);
      tenantProcessingCounts.set(tenantId, currentProcessing + 1);
      processed++;
    }
  }

  // Start processing an item
  private async startProcessing(item: QueueItem): Promise<void> {
    const now = new Date();

    const stmt = this.db.prepare(`
      UPDATE queue_items
      SET status = 'processing', started_at = ?, attempts = attempts + 1
      WHERE id = ? AND status = 'pending'
    `);

    const result = stmt.run(now.toISOString(), item.id);

    if (result.changes === 0) {
      return; // Item was already picked up
    }

    item.status = 'processing';
    item.startedAt = now;
    item.attempts++;

    this.processingItems.set(item.id, item);
    this.emit('itemStarted', item);
  }

  // Mark item as completed
  async complete(itemId: string, result: unknown): Promise<void> {
    const item = this.processingItems.get(itemId);
    if (!item) return;

    const now = new Date();

    const stmt = this.db.prepare(`
      UPDATE queue_items
      SET status = 'completed', completed_at = ?, result_json = ?
      WHERE id = ?
    `);

    stmt.run(now.toISOString(), JSON.stringify(result), itemId);

    item.status = 'completed';
    item.completedAt = now;
    item.result = result;

    this.processingItems.delete(itemId);
    this.emit('itemCompleted', item);
  }

  // Mark item as failed
  async fail(itemId: string, error: string): Promise<void> {
    const item = this.processingItems.get(itemId);
    if (!item) return;

    const now = new Date();

    // Check if we should retry
    if (item.attempts < item.maxAttempts) {
      const stmt = this.db.prepare(`
        UPDATE queue_items
        SET status = 'pending', error = ?
        WHERE id = ?
      `);

      stmt.run(error, itemId);
      item.status = 'pending';
      item.error = error;
    } else {
      const stmt = this.db.prepare(`
        UPDATE queue_items
        SET status = 'failed', completed_at = ?, error = ?
        WHERE id = ?
      `);

      stmt.run(now.toISOString(), error, itemId);
      item.status = 'failed';
      item.completedAt = now;
      item.error = error;
    }

    this.processingItems.delete(itemId);
    this.emit('itemFailed', item, error);
  }

  // Cancel an item
  async cancel(itemId: string): Promise<boolean> {
    const stmt = this.db.prepare(`
      UPDATE queue_items
      SET status = 'cancelled', completed_at = ?
      WHERE id = ? AND status IN ('pending', 'processing')
    `);

    const result = stmt.run(new Date().toISOString(), itemId);

    if (result.changes > 0) {
      this.processingItems.delete(itemId);
      return true;
    }

    return false;
  }

  // Check for timed out items
  private async checkTimeouts(): Promise<void> {
    const now = Date.now();

    for (const [itemId, item] of this.processingItems) {
      if (item.startedAt) {
        const elapsed = now - item.startedAt.getTime();
        if (elapsed > item.timeoutMs) {
          await this.timeout(itemId);
        }
      }
    }
  }

  // Mark item as timed out
  private async timeout(itemId: string): Promise<void> {
    const item = this.processingItems.get(itemId);
    if (!item) return;

    const now = new Date();

    // Check if we should retry
    if (item.attempts < item.maxAttempts) {
      const stmt = this.db.prepare(`
        UPDATE queue_items
        SET status = 'pending', error = 'Timeout'
        WHERE id = ?
      `);

      stmt.run(itemId);
      item.status = 'pending';
      item.error = 'Timeout';
    } else {
      const stmt = this.db.prepare(`
        UPDATE queue_items
        SET status = 'timeout', completed_at = ?, error = 'Max retries exceeded after timeout'
        WHERE id = ?
      `);

      stmt.run(now.toISOString(), itemId);
      item.status = 'timeout';
      item.completedAt = now;
    }

    this.processingItems.delete(itemId);
    this.emit('itemTimeout', item);
  }

  // Quota management
  async setTenantQuota(tenantId: string, quota: TenantQuota): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO queue_tenant_quotas (
        tenant_id, max_concurrent, max_queue_depth, max_per_minute,
        max_per_hour, max_per_day, priority_boost, weight, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      tenantId,
      quota.maxConcurrent,
      quota.maxQueueDepth,
      quota.maxPerMinute,
      quota.maxPerHour,
      quota.maxPerDay,
      quota.priorityBoost,
      quota.weight,
      new Date().toISOString()
    );

    this.tenantQuotas.set(tenantId, quota);
  }

  async getTenantQuota(tenantId: string): Promise<TenantQuota> {
    if (this.tenantQuotas.has(tenantId)) {
      return this.tenantQuotas.get(tenantId)!;
    }

    const stmt = this.db.prepare('SELECT * FROM queue_tenant_quotas WHERE tenant_id = ?');
    const row = stmt.get(tenantId) as Record<string, unknown> | undefined;

    if (row) {
      const quota: TenantQuota = {
        maxConcurrent: row.max_concurrent as number,
        maxQueueDepth: row.max_queue_depth as number,
        maxPerMinute: row.max_per_minute as number,
        maxPerHour: row.max_per_hour as number,
        maxPerDay: row.max_per_day as number,
        priorityBoost: row.priority_boost as number,
        weight: row.weight as number,
      };

      this.tenantQuotas.set(tenantId, quota);
      return quota;
    }

    // Return default quota for starter tier
    return DEFAULT_QUOTAS.starter;
  }

  // Rate limit checking
  private async checkRateLimits(tenantId: string, quota: TenantQuota): Promise<{ allowed: boolean; quotaType?: string }> {
    const now = new Date();
    const minuteWindow = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
    const hourWindow = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const dayWindow = now.toISOString().slice(0, 10); // YYYY-MM-DD

    const stmt = this.db.prepare(`
      SELECT window_type, count FROM queue_rate_tracking
      WHERE tenant_id = ? AND (
        (window_type = 'minute' AND window_start = ?) OR
        (window_type = 'hour' AND window_start = ?) OR
        (window_type = 'day' AND window_start = ?)
      )
    `);

    const rows = stmt.all(tenantId, minuteWindow, hourWindow, dayWindow) as { window_type: string; count: number }[];

    for (const row of rows) {
      if (row.window_type === 'minute' && row.count >= quota.maxPerMinute) {
        return { allowed: false, quotaType: 'per_minute' };
      }
      if (row.window_type === 'hour' && row.count >= quota.maxPerHour) {
        return { allowed: false, quotaType: 'per_hour' };
      }
      if (row.window_type === 'day' && row.count >= quota.maxPerDay) {
        return { allowed: false, quotaType: 'per_day' };
      }
    }

    return { allowed: true };
  }

  private async incrementRateTracking(tenantId: string): Promise<void> {
    const now = new Date();
    const minuteWindow = now.toISOString().slice(0, 16);
    const hourWindow = now.toISOString().slice(0, 13);
    const dayWindow = now.toISOString().slice(0, 10);

    const stmt = this.db.prepare(`
      INSERT INTO queue_rate_tracking (tenant_id, window_type, window_start, count)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(tenant_id, window_type, window_start) DO UPDATE SET count = count + 1
    `);

    stmt.run(tenantId, 'minute', minuteWindow);
    stmt.run(tenantId, 'hour', hourWindow);
    stmt.run(tenantId, 'day', dayWindow);
  }

  // Get current queue depth for tenant
  private async getTenantQueueDepth(tenantId: string): Promise<number> {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM queue_items
      WHERE tenant_id = ? AND status IN ('pending', 'processing')
    `);

    const result = stmt.get(tenantId) as { count: number };
    return result.count;
  }

  // Calculate effective priority with tenant boost and aging
  private calculateEffectivePriority(basePriority: number, quota: TenantQuota): number {
    // Apply tenant priority boost
    let effective = basePriority + quota.priorityBoost;

    // Clamp to valid range
    effective = Math.max(0, Math.min(100, effective));

    return effective;
  }

  // Apply aging to pending items (increases priority over time)
  async applyAging(agingRatePerMinute: number = 0.5): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE queue_items
      SET effective_priority = MIN(100, effective_priority + ?)
      WHERE status = 'pending'
      AND created_at < datetime('now', '-1 minute')
    `);

    stmt.run(agingRatePerMinute);
  }

  // Get queue statistics
  async getStats(): Promise<QueueStats> {
    const statsStmt = this.db.prepare(`
      SELECT
        status,
        COUNT(*) as count,
        AVG(CASE WHEN started_at IS NOT NULL THEN
          (julianday(started_at) - julianday(created_at)) * 86400000
        END) as avg_wait_ms,
        AVG(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL THEN
          (julianday(completed_at) - julianday(started_at)) * 86400000
        END) as avg_process_ms
      FROM queue_items
      GROUP BY status
    `);

    const rows = statsStmt.all() as { status: string; count: number; avg_wait_ms: number; avg_process_ms: number }[];

    const stats: QueueStats = {
      totalPending: 0,
      totalProcessing: 0,
      totalCompleted: 0,
      totalFailed: 0,
      avgWaitTimeMs: 0,
      avgProcessingTimeMs: 0,
      throughputPerMinute: 0,
      byTenant: new Map(),
    };

    for (const row of rows) {
      switch (row.status) {
        case 'pending':
          stats.totalPending = row.count;
          break;
        case 'processing':
          stats.totalProcessing = row.count;
          break;
        case 'completed':
          stats.totalCompleted = row.count;
          stats.avgWaitTimeMs = row.avg_wait_ms || 0;
          stats.avgProcessingTimeMs = row.avg_process_ms || 0;
          break;
        case 'failed':
        case 'timeout':
          stats.totalFailed += row.count;
          break;
      }
    }

    // Calculate throughput (completed in last minute)
    const throughputStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM queue_items
      WHERE status = 'completed'
      AND completed_at > datetime('now', '-1 minute')
    `);

    const throughput = throughputStmt.get() as { count: number };
    stats.throughputPerMinute = throughput.count;

    // Get per-tenant stats
    const tenantStmt = this.db.prepare(`
      SELECT
        tenant_id,
        status,
        COUNT(*) as count,
        AVG(CASE WHEN started_at IS NOT NULL THEN
          (julianday(started_at) - julianday(created_at)) * 86400000
        END) as avg_wait_ms
      FROM queue_items
      GROUP BY tenant_id, status
    `);

    const tenantRows = tenantStmt.all() as { tenant_id: string; status: string; count: number; avg_wait_ms: number }[];

    const tenantMap = new Map<string, TenantQueueStats>();

    for (const row of tenantRows) {
      if (!tenantMap.has(row.tenant_id)) {
        const quota = await this.getTenantQuota(row.tenant_id);
        tenantMap.set(row.tenant_id, {
          tenantId: row.tenant_id,
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          avgWaitTimeMs: 0,
          quota,
        });
      }

      const tenantStats = tenantMap.get(row.tenant_id)!;

      switch (row.status) {
        case 'pending':
          tenantStats.pending = row.count;
          break;
        case 'processing':
          tenantStats.processing = row.count;
          break;
        case 'completed':
          tenantStats.completed = row.count;
          tenantStats.avgWaitTimeMs = row.avg_wait_ms || 0;
          break;
        case 'failed':
        case 'timeout':
          tenantStats.failed += row.count;
          break;
      }
    }

    stats.byTenant = tenantMap;

    return stats;
  }

  // Get item by ID
  async getItem(itemId: string): Promise<QueueItem | null> {
    const stmt = this.db.prepare('SELECT * FROM queue_items WHERE id = ?');
    const row = stmt.get(itemId) as Record<string, unknown> | undefined;
    return row ? this.rowToQueueItem(row) : null;
  }

  // List items for tenant
  async listItems(tenantId: string, options: {
    status?: QueueItem['status'];
    limit?: number;
    offset?: number;
  } = {}): Promise<QueueItem[]> {
    let query = 'SELECT * FROM queue_items WHERE tenant_id = ?';
    const params: unknown[] = [tenantId];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY created_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return rows.map(row => this.rowToQueueItem(row));
  }

  // Cleanup old completed items
  async cleanup(olderThanDays: number = 7): Promise<number> {
    const stmt = this.db.prepare(`
      DELETE FROM queue_items
      WHERE status IN ('completed', 'failed', 'cancelled', 'timeout')
      AND completed_at < datetime('now', '-' || ? || ' days')
    `);

    const result = stmt.run(olderThanDays);
    return result.changes;
  }

  // Cleanup old rate tracking data
  async cleanupRateTracking(): Promise<void> {
    this.db.exec(`
      DELETE FROM queue_rate_tracking
      WHERE window_type = 'minute' AND window_start < datetime('now', '-1 hour');

      DELETE FROM queue_rate_tracking
      WHERE window_type = 'hour' AND window_start < datetime('now', '-1 day');

      DELETE FROM queue_rate_tracking
      WHERE window_type = 'day' AND window_start < datetime('now', '-7 days');
    `);
  }

  private rowToQueueItem(row: Record<string, unknown>): QueueItem {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      agentId: row.agent_id as string,
      priority: row.priority as number,
      payload: JSON.parse(row.payload_json as string),
      status: row.status as QueueItem['status'],
      attempts: row.attempts as number,
      maxAttempts: row.max_attempts as number,
      createdAt: new Date(row.created_at as string),
      scheduledAt: row.scheduled_at ? new Date(row.scheduled_at as string) : undefined,
      startedAt: row.started_at ? new Date(row.started_at as string) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
      result: row.result_json ? JSON.parse(row.result_json as string) : undefined,
      error: row.error as string | undefined,
      timeoutMs: row.timeout_ms as number,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json as string) : undefined,
    };
  }
}

// Express middleware for queue integration
export function createQueueMiddleware(queue: FairQueue) {
  return {
    // Enqueue request instead of direct processing
    async enqueue(
      req: { tenantContext?: TenantContext; body: { agentId: string; payload: unknown; priority?: number } },
      res: { status: (code: number) => { json: (data: unknown) => void } }
    ) {
      if (!req.tenantContext) {
        return res.status(401).json({ error: 'Tenant context required' });
      }

      const result = await queue.enqueue({
        tenantId: req.tenantContext.tenantId,
        agentId: req.body.agentId,
        payload: req.body.payload,
        priority: req.body.priority,
      });

      if ('error' in result) {
        return res.status(429).json(result);
      }

      return res.status(202).json({
        itemId: result.id,
        status: result.status,
        position: await queue.getStats().then(s =>
          s.byTenant.get(req.tenantContext!.tenantId)?.pending ?? 0
        ),
      });
    },

    // Get queue status
    async status(
      req: { tenantContext?: TenantContext; params: { itemId: string } },
      res: { status: (code: number) => { json: (data: unknown) => void } }
    ) {
      if (!req.tenantContext) {
        return res.status(401).json({ error: 'Tenant context required' });
      }

      const item = await queue.getItem(req.params.itemId);

      if (!item || item.tenantId !== req.tenantContext.tenantId) {
        return res.status(404).json({ error: 'Item not found' });
      }

      return res.status(200).json(item);
    },
  };
}

export default FairQueue;
