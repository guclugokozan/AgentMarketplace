/**
 * Enterprise Module Tests
 *
 * Tests for multi-tenant, ABAC, and queue modules
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { TenantManager, TIER_LIMITS, type TenantConfig } from '../src/enterprise/multi-tenant.js';
import { ABACManager, BUILT_IN_ROLES, type Policy, type AccessRequest } from '../src/enterprise/abac.js';
import { FairQueue, DEFAULT_QUOTAS } from '../src/enterprise/queue.js';

describe('Enterprise Modules', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('TenantManager', () => {
    let tenantManager: TenantManager;

    beforeEach(() => {
      tenantManager = new TenantManager(db);
    });

    describe('create', () => {
      it('should create a new tenant', async () => {
        const tenant = await tenantManager.create({
          name: 'Test Company',
          slug: 'test-company',
          status: 'active',
          tier: 'starter',
          limits: TIER_LIMITS.starter,
          dataResidency: {
            region: 'us',
            allowedRegions: ['us'],
            dataRetentionDays: 90,
            piiHandling: 'tokenize',
          },
          security: {
            requireMfa: false,
          },
          agentAccess: {
            requireApprovalForNew: false,
          },
        });

        expect(tenant.id).toBeDefined();
        expect(tenant.name).toBe('Test Company');
        expect(tenant.slug).toBe('test-company');
        expect(tenant.tier).toBe('starter');
      });

      it('should enforce unique slugs', async () => {
        await tenantManager.create({
          name: 'First Company',
          slug: 'unique-slug',
          status: 'active',
          tier: 'free',
          limits: TIER_LIMITS.free,
          dataResidency: { region: 'us', allowedRegions: ['us'], dataRetentionDays: 30, piiHandling: 'none' },
          security: { requireMfa: false },
          agentAccess: { requireApprovalForNew: false },
        });

        await expect(tenantManager.create({
          name: 'Second Company',
          slug: 'unique-slug', // Duplicate
          status: 'active',
          tier: 'free',
          limits: TIER_LIMITS.free,
          dataResidency: { region: 'us', allowedRegions: ['us'], dataRetentionDays: 30, piiHandling: 'none' },
          security: { requireMfa: false },
          agentAccess: { requireApprovalForNew: false },
        })).rejects.toThrow();
      });
    });

    describe('getById and getBySlug', () => {
      it('should retrieve tenant by ID', async () => {
        const created = await tenantManager.create({
          name: 'Get Test',
          slug: 'get-test',
          status: 'active',
          tier: 'professional',
          limits: TIER_LIMITS.professional,
          dataResidency: { region: 'eu', allowedRegions: ['eu'], dataRetentionDays: 365, piiHandling: 'encrypt' },
          security: { requireMfa: true },
          agentAccess: { requireApprovalForNew: true },
        });

        const retrieved = await tenantManager.getById(created.id);
        expect(retrieved).not.toBeNull();
        expect(retrieved!.name).toBe('Get Test');
      });

      it('should retrieve tenant by slug', async () => {
        await tenantManager.create({
          name: 'Slug Test',
          slug: 'slug-test',
          status: 'active',
          tier: 'enterprise',
          limits: TIER_LIMITS.enterprise,
          dataResidency: { region: 'global', allowedRegions: ['us', 'eu', 'ap'], dataRetentionDays: 730, piiHandling: 'encrypt' },
          security: { requireMfa: true },
          agentAccess: { requireApprovalForNew: true },
        });

        const retrieved = await tenantManager.getBySlug('slug-test');
        expect(retrieved).not.toBeNull();
        expect(retrieved!.tier).toBe('enterprise');
      });
    });

    describe('usage tracking', () => {
      it('should record and retrieve usage', async () => {
        const tenant = await tenantManager.create({
          name: 'Usage Test',
          slug: 'usage-test',
          status: 'active',
          tier: 'starter',
          limits: TIER_LIMITS.starter,
          dataResidency: { region: 'us', allowedRegions: ['us'], dataRetentionDays: 90, piiHandling: 'none' },
          security: { requireMfa: false },
          agentAccess: { requireApprovalForNew: false },
        });

        await tenantManager.recordUsage(tenant.id, {
          runsCount: 10,
          tokensUsed: 50000,
          costUsd: 0.50,
        });

        const todayUsage = await tenantManager.getTodayUsage(tenant.id);
        expect(todayUsage).not.toBeNull();
        expect(todayUsage!.runsCount).toBe(10);
        expect(todayUsage!.tokensUsed).toBe(50000);
      });

      it('should accumulate usage within same day', async () => {
        const tenant = await tenantManager.create({
          name: 'Accumulate Test',
          slug: 'accumulate-test',
          status: 'active',
          tier: 'starter',
          limits: TIER_LIMITS.starter,
          dataResidency: { region: 'us', allowedRegions: ['us'], dataRetentionDays: 90, piiHandling: 'none' },
          security: { requireMfa: false },
          agentAccess: { requireApprovalForNew: false },
        });

        await tenantManager.recordUsage(tenant.id, { runsCount: 5, tokensUsed: 1000, costUsd: 0.10 });
        await tenantManager.recordUsage(tenant.id, { runsCount: 3, tokensUsed: 2000, costUsd: 0.20 });

        const usage = await tenantManager.getTodayUsage(tenant.id);
        expect(usage!.runsCount).toBe(8);
        expect(usage!.tokensUsed).toBe(3000);
        expect(usage!.costUsd).toBeCloseTo(0.30);
      });
    });

    describe('limit checking', () => {
      it('should detect limit violations', async () => {
        const tenant = await tenantManager.create({
          name: 'Limit Test',
          slug: 'limit-test',
          status: 'active',
          tier: 'free',
          limits: { ...TIER_LIMITS.free, maxRunsPerDay: 5 },
          dataResidency: { region: 'us', allowedRegions: ['us'], dataRetentionDays: 30, piiHandling: 'none' },
          security: { requireMfa: false },
          agentAccess: { requireApprovalForNew: false },
        });

        await tenantManager.recordUsage(tenant.id, { runsCount: 6, tokensUsed: 1000, costUsd: 0.10 });

        const check = await tenantManager.checkLimits(tenant.id);
        expect(check.withinLimits).toBe(false);
        expect(check.violations.length).toBeGreaterThan(0);
        expect(check.violations[0]).toContain('run limit');
      });
    });

    describe('agent allowlist', () => {
      it('should manage agent allowlist', async () => {
        const tenant = await tenantManager.create({
          name: 'Allowlist Test',
          slug: 'allowlist-test',
          status: 'active',
          tier: 'starter',
          limits: TIER_LIMITS.starter,
          dataResidency: { region: 'us', allowedRegions: ['us'], dataRetentionDays: 90, piiHandling: 'none' },
          security: { requireMfa: false },
          agentAccess: { requireApprovalForNew: false, allowlist: ['agent-1', 'agent-2'] },
        });

        expect(await tenantManager.isAgentAllowed(tenant.id, 'agent-1')).toBe(true);
        expect(await tenantManager.isAgentAllowed(tenant.id, 'agent-3')).toBe(false);

        await tenantManager.addAgentToAllowlist(tenant.id, 'agent-3');
        const allowlist = await tenantManager.getAgentAllowlist(tenant.id);
        expect(allowlist).toContain('agent-3');
      });
    });

    describe('API key management', () => {
      it('should create and validate API keys', async () => {
        const tenant = await tenantManager.create({
          name: 'API Key Test',
          slug: 'api-key-test',
          status: 'active',
          tier: 'starter',
          limits: TIER_LIMITS.starter,
          dataResidency: { region: 'us', allowedRegions: ['us'], dataRetentionDays: 90, piiHandling: 'none' },
          security: { requireMfa: false },
          agentAccess: { requireApprovalForNew: false },
        });

        const { key } = await tenantManager.createApiKey(tenant.id, 'Test Key', ['read', 'write']);

        const validation = await tenantManager.validateApiKey(key);
        expect(validation.valid).toBe(true);
        expect(validation.tenantId).toBe(tenant.id);
        expect(validation.scopes).toContain('read');
      });

      it('should reject invalid API keys', async () => {
        const validation = await tenantManager.validateApiKey('invalid-key');
        expect(validation.valid).toBe(false);
      });
    });
  });

  describe('ABACManager', () => {
    let abacManager: ABACManager;
    let tenantId: string;

    beforeEach(async () => {
      abacManager = new ABACManager(db);
      tenantId = crypto.randomUUID();
    });

    describe('policy management', () => {
      it('should create a policy', async () => {
        const policy = await abacManager.createPolicy({
          name: 'Allow Developers',
          description: 'Allow developers to read and execute agents',
          tenantId,
          priority: 100,
          effect: 'allow',
          enabled: true,
          subjects: {
            conditions: [
              { attribute: 'role', operator: 'equals', value: 'developer' },
            ],
            matchAll: true,
          },
          resources: {
            conditions: [
              { attribute: 'type', operator: 'equals', value: 'agent' },
            ],
            matchAll: true,
          },
          actions: {
            allowed: ['read', 'execute'],
          },
        });

        expect(policy.id).toBeDefined();
        expect(policy.name).toBe('Allow Developers');
      });

      it('should list policies for tenant', async () => {
        await abacManager.createPolicy({
          name: 'Policy 1',
          tenantId,
          priority: 100,
          effect: 'allow',
          enabled: true,
          subjects: { conditions: [], matchAll: true },
          resources: { conditions: [], matchAll: true },
          actions: { allowed: ['*'] },
        });

        await abacManager.createPolicy({
          name: 'Policy 2',
          tenantId,
          priority: 50,
          effect: 'deny',
          enabled: true,
          subjects: { conditions: [], matchAll: true },
          resources: { conditions: [], matchAll: true },
          actions: { allowed: ['delete'] },
        });

        const policies = await abacManager.listPolicies(tenantId);
        expect(policies.length).toBe(2);
      });
    });

    describe('access evaluation', () => {
      beforeEach(async () => {
        // Create a basic allow policy
        await abacManager.createPolicy({
          name: 'Allow All Read',
          tenantId,
          priority: 100,
          effect: 'allow',
          enabled: true,
          subjects: { conditions: [], matchAll: true },
          resources: { conditions: [], matchAll: true },
          actions: { allowed: ['read'] },
        });

        // Create a deny policy for admin resources
        await abacManager.createPolicy({
          name: 'Deny Admin Resources',
          tenantId,
          priority: 50, // Higher priority (lower number)
          effect: 'deny',
          enabled: true,
          subjects: {
            conditions: [
              { attribute: 'role', operator: 'not_equals', value: 'admin' },
            ],
            matchAll: true,
          },
          resources: {
            conditions: [
              { attribute: 'sensitivity', operator: 'equals', value: 'admin' },
            ],
            matchAll: true,
          },
          actions: { allowed: ['*'] },
        });
      });

      it('should allow access based on policy', async () => {
        const request: AccessRequest = {
          subject: {
            id: 'user-1',
            type: 'user',
            tenantId,
            attributes: { role: 'developer' },
          },
          resource: {
            id: 'agent-1',
            type: 'agent',
            tenantId,
            attributes: { sensitivity: 'public' },
          },
          action: 'read',
          environment: {
            timestamp: new Date(),
            requestId: 'req-1',
            attributes: {},
          },
        };

        const decision = await abacManager.evaluate(request);
        expect(decision.allowed).toBe(true);
      });

      it('should deny access to admin resources for non-admins', async () => {
        const request: AccessRequest = {
          subject: {
            id: 'user-2',
            type: 'user',
            tenantId,
            attributes: { role: 'developer' },
          },
          resource: {
            id: 'admin-resource',
            type: 'data',
            tenantId,
            attributes: { sensitivity: 'admin' },
          },
          action: 'read',
          environment: {
            timestamp: new Date(),
            requestId: 'req-2',
            attributes: {},
          },
        };

        const decision = await abacManager.evaluate(request);
        expect(decision.allowed).toBe(false);
      });

      it('should allow admin access to admin resources', async () => {
        const request: AccessRequest = {
          subject: {
            id: 'admin-user',
            type: 'user',
            tenantId,
            attributes: { role: 'admin' },
          },
          resource: {
            id: 'admin-resource',
            type: 'data',
            tenantId,
            attributes: { sensitivity: 'admin' },
          },
          action: 'read',
          environment: {
            timestamp: new Date(),
            requestId: 'req-3',
            attributes: {},
          },
        };

        const decision = await abacManager.evaluate(request);
        expect(decision.allowed).toBe(true);
      });
    });

    describe('role management', () => {
      it('should assign and retrieve roles', async () => {
        await abacManager.assignRole(tenantId, 'user-1', 'user', 'developer');
        await abacManager.assignRole(tenantId, 'user-1', 'user', 'viewer');

        const roles = await abacManager.getRoles(tenantId, 'user-1');
        expect(roles).toContain('developer');
        expect(roles).toContain('viewer');
      });

      it('should check permissions based on roles', async () => {
        await abacManager.assignRole(tenantId, 'user-1', 'user', 'developer');

        const hasRead = await abacManager.hasPermission(tenantId, 'user-1', 'agent:read');
        expect(hasRead).toBe(true);

        const hasDelete = await abacManager.hasPermission(tenantId, 'user-1', 'agent:delete');
        expect(hasDelete).toBe(false);
      });

      it('should handle admin wildcard permissions', async () => {
        await abacManager.assignRole(tenantId, 'admin-user', 'user', 'admin');

        const hasAny = await abacManager.hasPermission(tenantId, 'admin-user', 'anything:here');
        expect(hasAny).toBe(true);
      });
    });

    describe('condition evaluation', () => {
      it('should evaluate various operators', async () => {
        // Create policy with complex conditions
        await abacManager.createPolicy({
          name: 'Complex Conditions',
          tenantId,
          priority: 100,
          effect: 'allow',
          enabled: true,
          subjects: {
            conditions: [
              { attribute: 'department', operator: 'in', value: ['engineering', 'product'] },
              { attribute: 'level', operator: 'greater_than', value: 2 },
            ],
            matchAll: true,
          },
          resources: {
            conditions: [
              { attribute: 'name', operator: 'starts_with', value: 'internal-' },
            ],
            matchAll: true,
          },
          actions: { allowed: ['read', 'write'] },
        });

        // Should allow - meets all conditions
        const allowedRequest: AccessRequest = {
          subject: {
            id: 'user-1',
            type: 'user',
            tenantId,
            attributes: { department: 'engineering', level: 5 },
          },
          resource: {
            id: 'res-1',
            type: 'data',
            attributes: { name: 'internal-docs' },
          },
          action: 'read',
          environment: { timestamp: new Date(), requestId: 'req-1', attributes: {} },
        };

        const allowed = await abacManager.evaluate(allowedRequest);
        expect(allowed.allowed).toBe(true);

        // Should deny - wrong department
        const deniedRequest: AccessRequest = {
          subject: {
            id: 'user-2',
            type: 'user',
            tenantId,
            attributes: { department: 'sales', level: 5 },
          },
          resource: {
            id: 'res-1',
            type: 'data',
            attributes: { name: 'internal-docs' },
          },
          action: 'read',
          environment: { timestamp: new Date(), requestId: 'req-2', attributes: {} },
        };

        const denied = await abacManager.evaluate(deniedRequest);
        expect(denied.allowed).toBe(false);
      });
    });
  });

  describe('FairQueue', () => {
    let queue: FairQueue;
    let tenantId: string;

    beforeEach(async () => {
      queue = new FairQueue(db, { pollIntervalMs: 100 });
      tenantId = crypto.randomUUID();
      await queue.setTenantQuota(tenantId, DEFAULT_QUOTAS.starter);
    });

    afterEach(() => {
      queue.stop();
    });

    describe('enqueue', () => {
      it('should enqueue an item', async () => {
        const result = await queue.enqueue({
          tenantId,
          agentId: 'test-agent',
          payload: { task: 'test' },
          priority: 50,
        });

        expect('id' in result).toBe(true);
        if ('id' in result) {
          expect(result.status).toBe('pending');
        }
      });

      it('should reject when queue depth exceeded', async () => {
        await queue.setTenantQuota(tenantId, { ...DEFAULT_QUOTAS.starter, maxQueueDepth: 2 });

        await queue.enqueue({ tenantId, agentId: 'agent', payload: {} });
        await queue.enqueue({ tenantId, agentId: 'agent', payload: {} });
        const result = await queue.enqueue({ tenantId, agentId: 'agent', payload: {} });

        expect('error' in result).toBe(true);
        if ('error' in result) {
          expect(result.quotaType).toBe('queue_depth');
        }
      });
    });

    describe('item lifecycle', () => {
      it('should track item in queue', async () => {
        const item = await queue.enqueue({
          tenantId,
          agentId: 'test-agent',
          payload: { task: 'test' },
        });

        if ('id' in item) {
          const retrieved = await queue.getItem(item.id);
          expect(retrieved).not.toBeNull();
          expect(retrieved!.status).toBe('pending');
          expect(retrieved!.payload).toEqual({ task: 'test' });
        }
      });

      it('should track item metadata', async () => {
        const item = await queue.enqueue({
          tenantId,
          agentId: 'test-agent',
          payload: { task: 'test' },
          maxAttempts: 3,
        });

        if ('id' in item) {
          const retrieved = await queue.getItem(item.id);
          expect(retrieved!.maxAttempts).toBe(3);
        }
      });

      it('should cancel an item', async () => {
        const item = await queue.enqueue({
          tenantId,
          agentId: 'test-agent',
          payload: { task: 'test' },
        });

        if ('id' in item) {
          const cancelled = await queue.cancel(item.id);
          expect(cancelled).toBe(true);

          const updated = await queue.getItem(item.id);
          expect(updated!.status).toBe('cancelled');
        }
      });
    });

    describe('quota management', () => {
      it('should apply tenant quotas', async () => {
        const customQuota = {
          maxConcurrent: 5,
          maxQueueDepth: 100,
          maxPerMinute: 10,
          maxPerHour: 100,
          maxPerDay: 500,
          priorityBoost: 5,
          weight: 50,
        };

        await queue.setTenantQuota(tenantId, customQuota);

        const retrieved = await queue.getTenantQuota(tenantId);
        expect(retrieved.maxConcurrent).toBe(5);
        expect(retrieved.priorityBoost).toBe(5);
      });
    });

    describe('statistics', () => {
      it('should track queue statistics', async () => {
        // Enqueue several items
        for (let i = 0; i < 5; i++) {
          await queue.enqueue({
            tenantId,
            agentId: 'test-agent',
            payload: { index: i },
          });
        }

        const stats = await queue.getStats();
        expect(stats.totalPending).toBe(5);
        expect(stats.byTenant.has(tenantId)).toBe(true);
      });
    });

    describe('list items', () => {
      it('should list items by tenant and status', async () => {
        await queue.enqueue({ tenantId, agentId: 'agent-1', payload: {} });
        await queue.enqueue({ tenantId, agentId: 'agent-2', payload: {} });

        const items = await queue.listItems(tenantId, { status: 'pending' });
        expect(items.length).toBe(2);
      });

      it('should support pagination', async () => {
        for (let i = 0; i < 5; i++) {
          await queue.enqueue({ tenantId, agentId: 'agent', payload: { i } });
        }

        const page1 = await queue.listItems(tenantId, { limit: 2 });
        const page2 = await queue.listItems(tenantId, { limit: 2, offset: 2 });

        expect(page1.length).toBe(2);
        expect(page2.length).toBe(2);
      });
    });
  });
});
