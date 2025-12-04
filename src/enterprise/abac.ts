/**
 * Attribute-Based Access Control (ABAC) Module
 *
 * Provides fine-grained access control based on:
 * - Subject attributes (user role, department, clearance level)
 * - Resource attributes (sensitivity, owner, classification)
 * - Action attributes (read, write, execute, admin)
 * - Environment attributes (time, IP, location)
 */

import { z } from 'zod';
import type { Database } from 'better-sqlite3';
import type { TenantContext } from './multi-tenant.js';

// Policy condition operators
export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'in'
  | 'not_in'
  | 'greater_than'
  | 'less_than'
  | 'between'
  | 'matches_regex'
  | 'starts_with'
  | 'ends_with'
  | 'is_null'
  | 'is_not_null';

// Policy condition schema
export const PolicyConditionSchema = z.object({
  attribute: z.string(),
  operator: z.enum([
    'equals', 'not_equals', 'contains', 'not_contains',
    'in', 'not_in', 'greater_than', 'less_than', 'between',
    'matches_regex', 'starts_with', 'ends_with', 'is_null', 'is_not_null'
  ]),
  value: z.unknown(),
});

export type PolicyCondition = z.infer<typeof PolicyConditionSchema>;

// Policy effect
export type PolicyEffect = 'allow' | 'deny';

// Policy schema
export const PolicySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  tenantId: z.string().uuid().optional(), // null = global policy
  priority: z.number().int().min(0).max(1000).default(100),
  effect: z.enum(['allow', 'deny']),
  enabled: z.boolean().default(true),

  // Subject conditions (who)
  subjects: z.object({
    conditions: z.array(PolicyConditionSchema),
    matchAll: z.boolean().default(true), // AND vs OR
  }),

  // Resource conditions (what)
  resources: z.object({
    conditions: z.array(PolicyConditionSchema),
    matchAll: z.boolean().default(true),
  }),

  // Action conditions (how)
  actions: z.object({
    allowed: z.array(z.string()), // e.g., ['read', 'execute']
    denied: z.array(z.string()).optional(),
  }),

  // Environment conditions (when/where)
  environment: z.object({
    conditions: z.array(PolicyConditionSchema),
    matchAll: z.boolean().default(true),
  }).optional(),

  // Time-based restrictions
  timeRestrictions: z.object({
    validFrom: z.date().optional(),
    validUntil: z.date().optional(),
    allowedDays: z.array(z.number().min(0).max(6)).optional(), // 0=Sunday
    allowedHours: z.object({
      start: z.number().min(0).max(23),
      end: z.number().min(0).max(23),
    }).optional(),
    timezone: z.string().default('UTC'),
  }).optional(),

  // IP restrictions
  ipRestrictions: z.object({
    allowlist: z.array(z.string()).optional(), // CIDR notation
    blocklist: z.array(z.string()).optional(),
  }).optional(),

  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Policy = z.infer<typeof PolicySchema>;

// Access request for evaluation
export interface AccessRequest {
  subject: {
    id: string;
    type: 'user' | 'service' | 'agent';
    tenantId: string;
    attributes: Record<string, unknown>;
  };
  resource: {
    id: string;
    type: 'agent' | 'run' | 'tool' | 'data';
    tenantId?: string;
    attributes: Record<string, unknown>;
  };
  action: string;
  environment: {
    timestamp: Date;
    sourceIp?: string;
    userAgent?: string;
    requestId: string;
    attributes: Record<string, unknown>;
  };
}

// Access decision
export interface AccessDecision {
  allowed: boolean;
  reason: string;
  matchedPolicies: Array<{
    policyId: string;
    policyName: string;
    effect: PolicyEffect;
  }>;
  evaluationTimeMs: number;
}

// Built-in roles with default permissions
export const BUILT_IN_ROLES = {
  admin: {
    name: 'Administrator',
    permissions: ['*'], // All permissions
  },
  developer: {
    name: 'Developer',
    permissions: [
      'agent:read', 'agent:create', 'agent:update',
      'run:read', 'run:create',
      'tool:read', 'tool:execute',
    ],
  },
  operator: {
    name: 'Operator',
    permissions: [
      'agent:read',
      'run:read', 'run:create', 'run:cancel',
      'tool:read',
    ],
  },
  viewer: {
    name: 'Viewer',
    permissions: [
      'agent:read',
      'run:read',
      'tool:read',
    ],
  },
  service: {
    name: 'Service Account',
    permissions: [
      'agent:read', 'agent:execute',
      'run:read', 'run:create',
      'tool:read', 'tool:execute',
    ],
  },
};

export class ABACManager {
  private policyCache: Map<string, Policy[]> = new Map();
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes
  private lastCacheRefresh: number = 0;

  constructor(private db: Database) {
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS abac_policies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        tenant_id TEXT,
        priority INTEGER NOT NULL DEFAULT 100,
        effect TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        subjects_json TEXT NOT NULL,
        resources_json TEXT NOT NULL,
        actions_json TEXT NOT NULL,
        environment_json TEXT,
        time_restrictions_json TEXT,
        ip_restrictions_json TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_policies_tenant ON abac_policies(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_policies_enabled ON abac_policies(enabled);
      CREATE INDEX IF NOT EXISTS idx_policies_priority ON abac_policies(priority);

      CREATE TABLE IF NOT EXISTS abac_role_assignments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        subject_type TEXT NOT NULL,
        role TEXT NOT NULL,
        assigned_at TEXT NOT NULL,
        assigned_by TEXT,
        expires_at TEXT,
        UNIQUE(tenant_id, subject_id, role)
      );

      CREATE INDEX IF NOT EXISTS idx_role_assignments_subject ON abac_role_assignments(tenant_id, subject_id);

      CREATE TABLE IF NOT EXISTS abac_audit_log (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        request_json TEXT NOT NULL,
        decision_json TEXT NOT NULL,
        evaluated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON abac_audit_log(tenant_id, evaluated_at);
    `);
  }

  // Policy management
  async createPolicy(policy: Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>): Promise<Policy> {
    const id = crypto.randomUUID();
    const now = new Date();

    const fullPolicy: Policy = {
      ...policy,
      id,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO abac_policies (
        id, name, description, tenant_id, priority, effect, enabled,
        subjects_json, resources_json, actions_json, environment_json,
        time_restrictions_json, ip_restrictions_json, metadata_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      fullPolicy.id,
      fullPolicy.name,
      fullPolicy.description ?? null,
      fullPolicy.tenantId ?? null,
      fullPolicy.priority,
      fullPolicy.effect,
      fullPolicy.enabled ? 1 : 0,
      JSON.stringify(fullPolicy.subjects),
      JSON.stringify(fullPolicy.resources),
      JSON.stringify(fullPolicy.actions),
      fullPolicy.environment ? JSON.stringify(fullPolicy.environment) : null,
      fullPolicy.timeRestrictions ? JSON.stringify(fullPolicy.timeRestrictions) : null,
      fullPolicy.ipRestrictions ? JSON.stringify(fullPolicy.ipRestrictions) : null,
      fullPolicy.metadata ? JSON.stringify(fullPolicy.metadata) : null,
      fullPolicy.createdAt.toISOString(),
      fullPolicy.updatedAt.toISOString()
    );

    this.invalidateCache();
    return fullPolicy;
  }

  async getPolicy(id: string): Promise<Policy | null> {
    const stmt = this.db.prepare('SELECT * FROM abac_policies WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToPolicy(row) : null;
  }

  async updatePolicy(id: string, updates: Partial<Policy>): Promise<Policy | null> {
    const existing = await this.getPolicy(id);
    if (!existing) return null;

    const updated: Policy = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };

    const stmt = this.db.prepare(`
      UPDATE abac_policies SET
        name = ?, description = ?, tenant_id = ?, priority = ?, effect = ?, enabled = ?,
        subjects_json = ?, resources_json = ?, actions_json = ?, environment_json = ?,
        time_restrictions_json = ?, ip_restrictions_json = ?, metadata_json = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.name,
      updated.description ?? null,
      updated.tenantId ?? null,
      updated.priority,
      updated.effect,
      updated.enabled ? 1 : 0,
      JSON.stringify(updated.subjects),
      JSON.stringify(updated.resources),
      JSON.stringify(updated.actions),
      updated.environment ? JSON.stringify(updated.environment) : null,
      updated.timeRestrictions ? JSON.stringify(updated.timeRestrictions) : null,
      updated.ipRestrictions ? JSON.stringify(updated.ipRestrictions) : null,
      updated.metadata ? JSON.stringify(updated.metadata) : null,
      updated.updatedAt.toISOString(),
      id
    );

    this.invalidateCache();
    return updated;
  }

  async deletePolicy(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM abac_policies WHERE id = ?');
    const result = stmt.run(id);
    this.invalidateCache();
    return result.changes > 0;
  }

  async listPolicies(tenantId?: string): Promise<Policy[]> {
    let query = 'SELECT * FROM abac_policies WHERE enabled = 1';
    const params: unknown[] = [];

    if (tenantId) {
      query += ' AND (tenant_id = ? OR tenant_id IS NULL)';
      params.push(tenantId);
    }

    query += ' ORDER BY priority ASC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Record<string, unknown>[];
    return rows.map(row => this.rowToPolicy(row));
  }

  // Access evaluation
  async evaluate(request: AccessRequest): Promise<AccessDecision> {
    const startTime = performance.now();
    const matchedPolicies: AccessDecision['matchedPolicies'] = [];

    // Get applicable policies (global + tenant-specific)
    const policies = await this.getApplicablePolicies(request.subject.tenantId);

    // Sort by priority (lower = higher priority)
    policies.sort((a, b) => a.priority - b.priority);

    let finalEffect: PolicyEffect | null = null;
    let reason = 'No matching policy found';

    for (const policy of policies) {
      const matches = this.evaluatePolicy(policy, request);

      if (matches) {
        matchedPolicies.push({
          policyId: policy.id,
          policyName: policy.name,
          effect: policy.effect,
        });

        // First matching policy wins (due to priority sorting)
        if (finalEffect === null) {
          finalEffect = policy.effect;
          reason = `Matched policy: ${policy.name}`;
        }

        // Deny always takes precedence
        if (policy.effect === 'deny') {
          finalEffect = 'deny';
          reason = `Denied by policy: ${policy.name}`;
          break;
        }
      }
    }

    const decision: AccessDecision = {
      allowed: finalEffect === 'allow',
      reason,
      matchedPolicies,
      evaluationTimeMs: performance.now() - startTime,
    };

    // Log the decision
    await this.logDecision(request, decision);

    return decision;
  }

  private evaluatePolicy(policy: Policy, request: AccessRequest): boolean {
    // Check time restrictions
    if (policy.timeRestrictions && !this.checkTimeRestrictions(policy.timeRestrictions, request.environment.timestamp)) {
      return false;
    }

    // Check IP restrictions
    if (policy.ipRestrictions && request.environment.sourceIp) {
      if (!this.checkIpRestrictions(policy.ipRestrictions, request.environment.sourceIp)) {
        return false;
      }
    }

    // Check subject conditions
    if (!this.evaluateConditions(policy.subjects.conditions, request.subject.attributes, policy.subjects.matchAll)) {
      return false;
    }

    // Check resource conditions
    if (!this.evaluateConditions(policy.resources.conditions, request.resource.attributes, policy.resources.matchAll)) {
      return false;
    }

    // Check action
    if (!policy.actions.allowed.includes(request.action) && !policy.actions.allowed.includes('*')) {
      return false;
    }

    if (policy.actions.denied?.includes(request.action)) {
      return false;
    }

    // Check environment conditions
    if (policy.environment) {
      if (!this.evaluateConditions(policy.environment.conditions, request.environment.attributes, policy.environment.matchAll)) {
        return false;
      }
    }

    return true;
  }

  private evaluateConditions(
    conditions: PolicyCondition[],
    attributes: Record<string, unknown>,
    matchAll: boolean
  ): boolean {
    if (conditions.length === 0) return true;

    const results = conditions.map(condition => this.evaluateCondition(condition, attributes));

    return matchAll
      ? results.every(r => r)
      : results.some(r => r);
  }

  private evaluateCondition(condition: PolicyCondition, attributes: Record<string, unknown>): boolean {
    const attrValue = this.getNestedAttribute(attributes, condition.attribute);

    switch (condition.operator) {
      case 'equals':
        return attrValue === condition.value;

      case 'not_equals':
        return attrValue !== condition.value;

      case 'contains':
        if (typeof attrValue === 'string') {
          return attrValue.includes(String(condition.value));
        }
        if (Array.isArray(attrValue)) {
          return attrValue.includes(condition.value);
        }
        return false;

      case 'not_contains':
        if (typeof attrValue === 'string') {
          return !attrValue.includes(String(condition.value));
        }
        if (Array.isArray(attrValue)) {
          return !attrValue.includes(condition.value);
        }
        return true;

      case 'in':
        if (Array.isArray(condition.value)) {
          return condition.value.includes(attrValue);
        }
        return false;

      case 'not_in':
        if (Array.isArray(condition.value)) {
          return !condition.value.includes(attrValue);
        }
        return true;

      case 'greater_than':
        return typeof attrValue === 'number' && typeof condition.value === 'number'
          ? attrValue > condition.value
          : false;

      case 'less_than':
        return typeof attrValue === 'number' && typeof condition.value === 'number'
          ? attrValue < condition.value
          : false;

      case 'between':
        if (typeof attrValue === 'number' && Array.isArray(condition.value) && condition.value.length === 2) {
          const [min, max] = condition.value as [number, number];
          return attrValue >= min && attrValue <= max;
        }
        return false;

      case 'matches_regex':
        if (typeof attrValue === 'string' && typeof condition.value === 'string') {
          try {
            return new RegExp(condition.value).test(attrValue);
          } catch {
            return false;
          }
        }
        return false;

      case 'starts_with':
        return typeof attrValue === 'string' && typeof condition.value === 'string'
          ? attrValue.startsWith(condition.value)
          : false;

      case 'ends_with':
        return typeof attrValue === 'string' && typeof condition.value === 'string'
          ? attrValue.endsWith(condition.value)
          : false;

      case 'is_null':
        return attrValue === null || attrValue === undefined;

      case 'is_not_null':
        return attrValue !== null && attrValue !== undefined;

      default:
        return false;
    }
  }

  private getNestedAttribute(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private checkTimeRestrictions(
    restrictions: NonNullable<Policy['timeRestrictions']>,
    timestamp: Date
  ): boolean {
    const now = new Date(timestamp);

    // Convert to specified timezone (simplified - in production use a proper timezone library)
    // For now, we'll work with UTC

    if (restrictions.validFrom && now < restrictions.validFrom) {
      return false;
    }

    if (restrictions.validUntil && now > restrictions.validUntil) {
      return false;
    }

    if (restrictions.allowedDays) {
      const day = now.getUTCDay();
      if (!restrictions.allowedDays.includes(day)) {
        return false;
      }
    }

    if (restrictions.allowedHours) {
      const hour = now.getUTCHours();
      const { start, end } = restrictions.allowedHours;

      if (start <= end) {
        // Normal range (e.g., 9-17)
        if (hour < start || hour > end) return false;
      } else {
        // Overnight range (e.g., 22-6)
        if (hour < start && hour > end) return false;
      }
    }

    return true;
  }

  private checkIpRestrictions(
    restrictions: NonNullable<Policy['ipRestrictions']>,
    sourceIp: string
  ): boolean {
    // Check blocklist first
    if (restrictions.blocklist?.some(cidr => this.ipInCidr(sourceIp, cidr))) {
      return false;
    }

    // If allowlist exists, IP must be in it
    if (restrictions.allowlist && restrictions.allowlist.length > 0) {
      return restrictions.allowlist.some(cidr => this.ipInCidr(sourceIp, cidr));
    }

    return true;
  }

  private ipInCidr(ip: string, cidr: string): boolean {
    // Simplified CIDR check - in production use a proper IP library
    if (cidr === ip) return true;

    const [network, prefixStr] = cidr.split('/');
    if (!prefixStr) return ip === network;

    const prefix = parseInt(prefixStr, 10);
    const ipParts = ip.split('.').map(Number);
    const networkParts = network.split('.').map(Number);

    if (ipParts.length !== 4 || networkParts.length !== 4) return false;

    const ipNum = ipParts.reduce((acc, part) => (acc << 8) + part, 0);
    const networkNum = networkParts.reduce((acc, part) => (acc << 8) + part, 0);
    const mask = ~((1 << (32 - prefix)) - 1);

    return (ipNum & mask) === (networkNum & mask);
  }

  // Role management
  async assignRole(
    tenantId: string,
    subjectId: string,
    subjectType: 'user' | 'service' | 'agent',
    role: string,
    assignedBy?: string,
    expiresAt?: Date
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO abac_role_assignments (id, tenant_id, subject_id, subject_type, role, assigned_at, assigned_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      crypto.randomUUID(),
      tenantId,
      subjectId,
      subjectType,
      role,
      new Date().toISOString(),
      assignedBy ?? null,
      expiresAt?.toISOString() ?? null
    );
  }

  async removeRole(tenantId: string, subjectId: string, role: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM abac_role_assignments WHERE tenant_id = ? AND subject_id = ? AND role = ?
    `);
    stmt.run(tenantId, subjectId, role);
  }

  async getRoles(tenantId: string, subjectId: string): Promise<string[]> {
    const stmt = this.db.prepare(`
      SELECT role FROM abac_role_assignments
      WHERE tenant_id = ? AND subject_id = ?
      AND (expires_at IS NULL OR expires_at > ?)
    `);

    const rows = stmt.all(tenantId, subjectId, new Date().toISOString()) as { role: string }[];
    return rows.map(r => r.role);
  }

  async getPermissionsForRoles(roles: string[]): Promise<string[]> {
    const permissions = new Set<string>();

    for (const role of roles) {
      const builtIn = BUILT_IN_ROLES[role as keyof typeof BUILT_IN_ROLES];
      if (builtIn) {
        builtIn.permissions.forEach(p => permissions.add(p));
      }
    }

    return Array.from(permissions);
  }

  // Quick permission check (uses roles)
  async hasPermission(
    tenantId: string,
    subjectId: string,
    permission: string
  ): Promise<boolean> {
    const roles = await this.getRoles(tenantId, subjectId);
    const permissions = await this.getPermissionsForRoles(roles);

    return permissions.includes('*') || permissions.includes(permission);
  }

  // Audit logging
  private async logDecision(request: AccessRequest, decision: AccessDecision): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO abac_audit_log (id, tenant_id, request_json, decision_json, evaluated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      crypto.randomUUID(),
      request.subject.tenantId,
      JSON.stringify(request),
      JSON.stringify(decision),
      new Date().toISOString()
    );
  }

  async getAuditLog(
    tenantId: string,
    options: { startDate?: Date; endDate?: Date; limit?: number } = {}
  ): Promise<Array<{ request: AccessRequest; decision: AccessDecision; evaluatedAt: Date }>> {
    let query = 'SELECT * FROM abac_audit_log WHERE tenant_id = ?';
    const params: unknown[] = [tenantId];

    if (options.startDate) {
      query += ' AND evaluated_at >= ?';
      params.push(options.startDate.toISOString());
    }

    if (options.endDate) {
      query += ' AND evaluated_at <= ?';
      params.push(options.endDate.toISOString());
    }

    query += ' ORDER BY evaluated_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Record<string, unknown>[];

    return rows.map(row => ({
      request: JSON.parse(row.request_json as string),
      decision: JSON.parse(row.decision_json as string),
      evaluatedAt: new Date(row.evaluated_at as string),
    }));
  }

  // Cache management
  private async getApplicablePolicies(tenantId: string): Promise<Policy[]> {
    const cacheKey = tenantId || '__global__';

    if (this.shouldRefreshCache()) {
      this.policyCache.clear();
      this.lastCacheRefresh = Date.now();
    }

    if (!this.policyCache.has(cacheKey)) {
      const policies = await this.listPolicies(tenantId || undefined);
      this.policyCache.set(cacheKey, policies);
    }

    return this.policyCache.get(cacheKey) || [];
  }

  private shouldRefreshCache(): boolean {
    return Date.now() - this.lastCacheRefresh > this.cacheExpiry;
  }

  private invalidateCache(): void {
    this.policyCache.clear();
    this.lastCacheRefresh = 0;
  }

  private rowToPolicy(row: Record<string, unknown>): Policy {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      tenantId: row.tenant_id as string | undefined,
      priority: row.priority as number,
      effect: row.effect as PolicyEffect,
      enabled: Boolean(row.enabled),
      subjects: JSON.parse(row.subjects_json as string),
      resources: JSON.parse(row.resources_json as string),
      actions: JSON.parse(row.actions_json as string),
      environment: row.environment_json ? JSON.parse(row.environment_json as string) : undefined,
      timeRestrictions: row.time_restrictions_json ? JSON.parse(row.time_restrictions_json as string) : undefined,
      ipRestrictions: row.ip_restrictions_json ? JSON.parse(row.ip_restrictions_json as string) : undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json as string) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}

// Express middleware for ABAC
export function createABACMiddleware(abacManager: ABACManager) {
  return (resourceType: string, action: string) => {
    return async (
      req: { tenantContext?: TenantContext; user?: { id: string; attributes: Record<string, unknown> } },
      res: { status: (code: number) => { json: (data: unknown) => void } },
      next: () => void
    ) => {
      if (!req.tenantContext) {
        return res.status(401).json({ error: 'Tenant context required' });
      }

      const request: AccessRequest = {
        subject: {
          id: req.user?.id || 'anonymous',
          type: 'user',
          tenantId: req.tenantContext.tenantId,
          attributes: req.user?.attributes || {},
        },
        resource: {
          id: '*', // Will be refined per-request
          type: resourceType as AccessRequest['resource']['type'],
          tenantId: req.tenantContext.tenantId,
          attributes: {},
        },
        action,
        environment: {
          timestamp: new Date(),
          sourceIp: req.tenantContext.sourceIp,
          requestId: req.tenantContext.requestId,
          attributes: {},
        },
      };

      const decision = await abacManager.evaluate(request);

      if (!decision.allowed) {
        return res.status(403).json({
          error: 'Access denied',
          reason: decision.reason,
        });
      }

      next();
    };
  };
}

export default ABACManager;
