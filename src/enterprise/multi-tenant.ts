/**
 * Multi-tenant Isolation Module
 *
 * Provides tenant-level isolation for all marketplace resources including:
 * - Tenant ID injection on all records
 * - Agent allowlists per tenant
 * - Separate artifact storage
 * - Data residency tags
 */

import { z } from 'zod';
import type { Database } from 'better-sqlite3';

// Tenant configuration schema
export const TenantConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(1).max(63),
  status: z.enum(['active', 'suspended', 'pending', 'deleted']),
  tier: z.enum(['free', 'starter', 'professional', 'enterprise']),

  // Resource limits
  limits: z.object({
    maxAgents: z.number().int().positive(),
    maxRunsPerDay: z.number().int().positive(),
    maxConcurrentRuns: z.number().int().positive(),
    maxStorageBytes: z.number().int().positive(),
    maxCostPerDayUsd: z.number().positive(),
    maxTokensPerRun: z.number().int().positive(),
  }),

  // Data residency
  dataResidency: z.object({
    region: z.enum(['us', 'eu', 'ap', 'global']),
    allowedRegions: z.array(z.string()),
    dataRetentionDays: z.number().int().positive(),
    piiHandling: z.enum(['mask', 'tokenize', 'encrypt', 'none']),
  }),

  // Security settings
  security: z.object({
    allowedIpRanges: z.array(z.string()).optional(),
    requireMfa: z.boolean(),
    ssoProvider: z.string().optional(),
    apiKeyRotationDays: z.number().int().positive().optional(),
  }),

  // Agent access control
  agentAccess: z.object({
    allowlist: z.array(z.string()).optional(), // If set, only these agents allowed
    blocklist: z.array(z.string()).optional(), // Always blocked
    requireApprovalForNew: z.boolean(),
    maxAgentVersion: z.string().optional(), // Semver constraint
  }),

  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TenantConfig = z.infer<typeof TenantConfigSchema>;

// Tenant context passed through execution
export interface TenantContext {
  tenantId: string;
  tenant: TenantConfig;
  userId?: string;
  sessionId?: string;
  requestId: string;
  sourceIp?: string;
}

// Tenant usage tracking
export interface TenantUsage {
  tenantId: string;
  date: string; // YYYY-MM-DD
  runsCount: number;
  tokensUsed: number;
  costUsd: number;
  storageBytes: number;
  activeAgents: number;
}

// Tier-based default limits
export const TIER_LIMITS: Record<TenantConfig['tier'], TenantConfig['limits']> = {
  free: {
    maxAgents: 3,
    maxRunsPerDay: 100,
    maxConcurrentRuns: 2,
    maxStorageBytes: 100 * 1024 * 1024, // 100MB
    maxCostPerDayUsd: 5,
    maxTokensPerRun: 50000,
  },
  starter: {
    maxAgents: 10,
    maxRunsPerDay: 1000,
    maxConcurrentRuns: 5,
    maxStorageBytes: 1024 * 1024 * 1024, // 1GB
    maxCostPerDayUsd: 50,
    maxTokensPerRun: 100000,
  },
  professional: {
    maxAgents: 50,
    maxRunsPerDay: 10000,
    maxConcurrentRuns: 20,
    maxStorageBytes: 10 * 1024 * 1024 * 1024, // 10GB
    maxCostPerDayUsd: 500,
    maxTokensPerRun: 200000,
  },
  enterprise: {
    maxAgents: 1000,
    maxRunsPerDay: 100000,
    maxConcurrentRuns: 100,
    maxStorageBytes: 100 * 1024 * 1024 * 1024, // 100GB
    maxCostPerDayUsd: 10000,
    maxTokensPerRun: 500000,
  },
};

export class TenantManager {
  constructor(private db: Database) {
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        tier TEXT NOT NULL DEFAULT 'free',
        limits_json TEXT NOT NULL,
        data_residency_json TEXT NOT NULL,
        security_json TEXT NOT NULL,
        agent_access_json TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
      CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

      CREATE TABLE IF NOT EXISTS tenant_usage (
        tenant_id TEXT NOT NULL,
        date TEXT NOT NULL,
        runs_count INTEGER NOT NULL DEFAULT 0,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        storage_bytes INTEGER NOT NULL DEFAULT 0,
        active_agents INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (tenant_id, date),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );

      CREATE TABLE IF NOT EXISTS tenant_agent_allowlist (
        tenant_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        added_at TEXT NOT NULL,
        added_by TEXT,
        PRIMARY KEY (tenant_id, agent_id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );

      CREATE TABLE IF NOT EXISTS tenant_api_keys (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        scopes TEXT NOT NULL,
        expires_at TEXT,
        last_used_at TEXT,
        created_at TEXT NOT NULL,
        created_by TEXT,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );

      CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON tenant_api_keys(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON tenant_api_keys(key_hash);
    `);
  }

  async create(config: Omit<TenantConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<TenantConfig> {
    const id = crypto.randomUUID();
    const now = new Date();

    const tenant: TenantConfig = {
      ...config,
      id,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO tenants (
        id, name, slug, status, tier,
        limits_json, data_residency_json, security_json, agent_access_json,
        metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      tenant.id,
      tenant.name,
      tenant.slug,
      tenant.status,
      tenant.tier,
      JSON.stringify(tenant.limits),
      JSON.stringify(tenant.dataResidency),
      JSON.stringify(tenant.security),
      JSON.stringify(tenant.agentAccess),
      tenant.metadata ? JSON.stringify(tenant.metadata) : null,
      tenant.createdAt.toISOString(),
      tenant.updatedAt.toISOString()
    );

    return tenant;
  }

  async getById(id: string): Promise<TenantConfig | null> {
    const stmt = this.db.prepare('SELECT * FROM tenants WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToTenant(row) : null;
  }

  async getBySlug(slug: string): Promise<TenantConfig | null> {
    const stmt = this.db.prepare('SELECT * FROM tenants WHERE slug = ?');
    const row = stmt.get(slug) as Record<string, unknown> | undefined;
    return row ? this.rowToTenant(row) : null;
  }

  async update(id: string, updates: Partial<TenantConfig>): Promise<TenantConfig | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const updated: TenantConfig = {
      ...existing,
      ...updates,
      id: existing.id, // Prevent ID change
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };

    const stmt = this.db.prepare(`
      UPDATE tenants SET
        name = ?, slug = ?, status = ?, tier = ?,
        limits_json = ?, data_residency_json = ?, security_json = ?, agent_access_json = ?,
        metadata_json = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.name,
      updated.slug,
      updated.status,
      updated.tier,
      JSON.stringify(updated.limits),
      JSON.stringify(updated.dataResidency),
      JSON.stringify(updated.security),
      JSON.stringify(updated.agentAccess),
      updated.metadata ? JSON.stringify(updated.metadata) : null,
      updated.updatedAt.toISOString(),
      id
    );

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    // Soft delete by setting status to 'deleted'
    const result = await this.update(id, { status: 'deleted' });
    return result !== null;
  }

  async list(options: {
    status?: TenantConfig['status'];
    tier?: TenantConfig['tier'];
    limit?: number;
    offset?: number;
  } = {}): Promise<TenantConfig[]> {
    let query = 'SELECT * FROM tenants WHERE 1=1';
    const params: unknown[] = [];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    if (options.tier) {
      query += ' AND tier = ?';
      params.push(options.tier);
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
    return rows.map(row => this.rowToTenant(row));
  }

  // Usage tracking
  async recordUsage(tenantId: string, usage: Partial<TenantUsage>): Promise<void> {
    const date = new Date().toISOString().split('T')[0];

    const stmt = this.db.prepare(`
      INSERT INTO tenant_usage (tenant_id, date, runs_count, tokens_used, cost_usd, storage_bytes, active_agents)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, date) DO UPDATE SET
        runs_count = runs_count + excluded.runs_count,
        tokens_used = tokens_used + excluded.tokens_used,
        cost_usd = cost_usd + excluded.cost_usd,
        storage_bytes = COALESCE(excluded.storage_bytes, storage_bytes),
        active_agents = COALESCE(excluded.active_agents, active_agents)
    `);

    stmt.run(
      tenantId,
      date,
      usage.runsCount ?? 0,
      usage.tokensUsed ?? 0,
      usage.costUsd ?? 0,
      usage.storageBytes ?? 0,
      usage.activeAgents ?? 0
    );
  }

  async getUsage(tenantId: string, startDate: string, endDate: string): Promise<TenantUsage[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM tenant_usage
      WHERE tenant_id = ? AND date >= ? AND date <= ?
      ORDER BY date DESC
    `);

    const rows = stmt.all(tenantId, startDate, endDate) as Record<string, unknown>[];
    return rows.map(row => ({
      tenantId: row.tenant_id as string,
      date: row.date as string,
      runsCount: row.runs_count as number,
      tokensUsed: row.tokens_used as number,
      costUsd: row.cost_usd as number,
      storageBytes: row.storage_bytes as number,
      activeAgents: row.active_agents as number,
    }));
  }

  async getTodayUsage(tenantId: string): Promise<TenantUsage | null> {
    const today = new Date().toISOString().split('T')[0];
    const usage = await this.getUsage(tenantId, today, today);
    return usage[0] ?? null;
  }

  // Limit checking
  async checkLimits(tenantId: string): Promise<{
    withinLimits: boolean;
    violations: string[];
    usage: TenantUsage | null;
  }> {
    const tenant = await this.getById(tenantId);
    if (!tenant) {
      return { withinLimits: false, violations: ['Tenant not found'], usage: null };
    }

    const usage = await this.getTodayUsage(tenantId);
    const violations: string[] = [];

    if (usage) {
      if (usage.runsCount >= tenant.limits.maxRunsPerDay) {
        violations.push(`Daily run limit exceeded (${usage.runsCount}/${tenant.limits.maxRunsPerDay})`);
      }

      if (usage.costUsd >= tenant.limits.maxCostPerDayUsd) {
        violations.push(`Daily cost limit exceeded ($${usage.costUsd.toFixed(2)}/$${tenant.limits.maxCostPerDayUsd})`);
      }

      if (usage.storageBytes >= tenant.limits.maxStorageBytes) {
        violations.push(`Storage limit exceeded`);
      }
    }

    return {
      withinLimits: violations.length === 0,
      violations,
      usage,
    };
  }

  // Agent allowlist management
  async isAgentAllowed(tenantId: string, agentId: string): Promise<boolean> {
    const tenant = await this.getById(tenantId);
    if (!tenant) return false;

    // Check blocklist first
    if (tenant.agentAccess.blocklist?.includes(agentId)) {
      return false;
    }

    // If no allowlist, all non-blocked agents are allowed
    if (!tenant.agentAccess.allowlist || tenant.agentAccess.allowlist.length === 0) {
      return true;
    }

    // Check allowlist
    return tenant.agentAccess.allowlist.includes(agentId);
  }

  async addAgentToAllowlist(tenantId: string, agentId: string, addedBy?: string): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tenant_agent_allowlist (tenant_id, agent_id, added_at, added_by)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(tenantId, agentId, new Date().toISOString(), addedBy ?? null);
  }

  async removeAgentFromAllowlist(tenantId: string, agentId: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM tenant_agent_allowlist WHERE tenant_id = ? AND agent_id = ?
    `);

    stmt.run(tenantId, agentId);
  }

  async getAgentAllowlist(tenantId: string): Promise<string[]> {
    const stmt = this.db.prepare(`
      SELECT agent_id FROM tenant_agent_allowlist WHERE tenant_id = ?
    `);

    const rows = stmt.all(tenantId) as { agent_id: string }[];
    return rows.map(r => r.agent_id);
  }

  // API key management
  async createApiKey(tenantId: string, name: string, scopes: string[], expiresInDays?: number): Promise<{
    id: string;
    key: string; // Only returned once at creation
  }> {
    const id = crypto.randomUUID();
    const key = `amp_${this.generateSecureKey(32)}`;
    const keyHash = await this.hashKey(key);

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const stmt = this.db.prepare(`
      INSERT INTO tenant_api_keys (id, tenant_id, key_hash, name, scopes, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, tenantId, keyHash, name, JSON.stringify(scopes), expiresAt, new Date().toISOString());

    return { id, key };
  }

  async validateApiKey(key: string): Promise<{
    valid: boolean;
    tenantId?: string;
    scopes?: string[];
  }> {
    const keyHash = await this.hashKey(key);

    const stmt = this.db.prepare(`
      SELECT tenant_id, scopes, expires_at FROM tenant_api_keys WHERE key_hash = ?
    `);

    const row = stmt.get(keyHash) as { tenant_id: string; scopes: string; expires_at: string | null } | undefined;

    if (!row) {
      return { valid: false };
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return { valid: false };
    }

    // Update last used
    const updateStmt = this.db.prepare(`
      UPDATE tenant_api_keys SET last_used_at = ? WHERE key_hash = ?
    `);
    updateStmt.run(new Date().toISOString(), keyHash);

    return {
      valid: true,
      tenantId: row.tenant_id,
      scopes: JSON.parse(row.scopes),
    };
  }

  private rowToTenant(row: Record<string, unknown>): TenantConfig {
    return {
      id: row.id as string,
      name: row.name as string,
      slug: row.slug as string,
      status: row.status as TenantConfig['status'],
      tier: row.tier as TenantConfig['tier'],
      limits: JSON.parse(row.limits_json as string),
      dataResidency: JSON.parse(row.data_residency_json as string),
      security: JSON.parse(row.security_json as string),
      agentAccess: JSON.parse(row.agent_access_json as string),
      metadata: row.metadata_json ? JSON.parse(row.metadata_json as string) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private generateSecureKey(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => chars[byte % chars.length]).join('');
  }

  private async hashKey(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

// Middleware for tenant context injection
export function createTenantMiddleware(tenantManager: TenantManager) {
  return async (req: { headers: Record<string, string>; tenantContext?: TenantContext }, res: { status: (code: number) => { json: (data: unknown) => void } }, next: () => void) => {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    const validation = await tenantManager.validateApiKey(apiKey);

    if (!validation.valid || !validation.tenantId) {
      return res.status(401).json({ error: 'Invalid or expired API key' });
    }

    const tenant = await tenantManager.getById(validation.tenantId);

    if (!tenant || tenant.status !== 'active') {
      return res.status(403).json({ error: 'Tenant not active' });
    }

    // Check limits
    const limitCheck = await tenantManager.checkLimits(validation.tenantId);
    if (!limitCheck.withinLimits) {
      return res.status(429).json({
        error: 'Limit exceeded',
        violations: limitCheck.violations,
      });
    }

    req.tenantContext = {
      tenantId: validation.tenantId,
      tenant,
      requestId: crypto.randomUUID(),
      sourceIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'],
    };

    next();
  };
}

// Tenant-scoped query helper
export class TenantScopedQuery {
  constructor(
    private tenantId: string,
    private db: Database
  ) {}

  runs() {
    return {
      find: (conditions: Record<string, unknown> = {}) => {
        const where = ['tenant_id = ?', ...Object.keys(conditions).map(k => `${k} = ?`)];
        const params = [this.tenantId, ...Object.values(conditions)];

        const stmt = this.db.prepare(`SELECT * FROM runs WHERE ${where.join(' AND ')}`);
        return stmt.all(...params);
      },

      count: () => {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM runs WHERE tenant_id = ?');
        return (stmt.get(this.tenantId) as { count: number }).count;
      },
    };
  }

  agents() {
    return {
      find: (conditions: Record<string, unknown> = {}) => {
        const where = ['tenant_id = ?', ...Object.keys(conditions).map(k => `${k} = ?`)];
        const params = [this.tenantId, ...Object.values(conditions)];

        const stmt = this.db.prepare(`SELECT * FROM agents WHERE ${where.join(' AND ')}`);
        return stmt.all(...params);
      },
    };
  }
}

export default TenantManager;
