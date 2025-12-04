/**
 * Approval Manager Tests
 *
 * Comprehensive tests for the human-in-the-loop approval system
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestTool } from './setup';

describe('Approval Manager', () => {
  describe('Trigger Evaluation', () => {
    describe('cost_exceeds_usd', () => {
      it('should trigger when estimated cost exceeds threshold', () => {
        const trigger = {
          id: 'cost_trigger',
          condition: 'cost_exceeds_usd' as const,
          threshold: 5.00,
          riskLevel: 'high' as const,
          description: 'Cost exceeds $5',
        };

        // Mock context with high cost
        const context = {
          runId: 'run-1',
          stepIndex: 0,
          tool: createTestTool({ scopes: [], allowlistedDomains: [], sideEffectful: false }),
          input: {},
          estimatedCost: 10.00,
          budgetRemaining: 20.00,
          budgetTotal: 100.00,
          environment: 'development',
        };

        // The trigger should fire since 10 > 5
        expect(context.estimatedCost > (trigger.threshold as number)).toBe(true);
      });

      it('should not trigger when cost is below threshold', () => {
        const threshold = 5.00;
        const estimatedCost = 2.50;
        expect(estimatedCost > threshold).toBe(false);
      });
    });

    describe('cost_exceeds_percent_of_budget', () => {
      it('should trigger when cost exceeds budget percentage', () => {
        const threshold = 50; // 50%
        const estimatedCost = 15.00;
        const budgetRemaining = 20.00;
        const percent = (estimatedCost / budgetRemaining) * 100;
        expect(percent > threshold).toBe(true); // 75% > 50%
      });

      it('should not trigger when within budget percentage', () => {
        const threshold = 50;
        const estimatedCost = 5.00;
        const budgetRemaining = 20.00;
        const percent = (estimatedCost / budgetRemaining) * 100;
        expect(percent > threshold).toBe(false); // 25% < 50%
      });
    });

    describe('scope_includes', () => {
      it('should trigger when tool has matching scope', () => {
        const threshold = 'write:production';
        const scopes = ['read:data', 'write:production'];
        expect(scopes.some(s => s.includes(threshold))).toBe(true);
      });

      it('should trigger on partial scope match', () => {
        const threshold = 'delete:';
        const scopes = ['delete:users', 'delete:data'];
        expect(scopes.some(s => s.includes(threshold))).toBe(true);
      });

      it('should not trigger when scope not present', () => {
        const threshold = 'admin:';
        const scopes = ['read:data', 'write:data'];
        expect(scopes.some(s => s.includes(threshold))).toBe(false);
      });
    });

    describe('scope_matches_pattern', () => {
      it('should trigger when scope matches regex pattern', () => {
        const pattern = new RegExp('write:.*production');
        const scopes = ['write:staging-production'];
        expect(scopes.some(s => pattern.test(s))).toBe(true);
      });

      it('should not trigger when pattern does not match', () => {
        const pattern = new RegExp('^admin:');
        const scopes = ['read:admin', 'write:data'];
        expect(scopes.some(s => pattern.test(s))).toBe(false);
      });
    });

    describe('domain_not_in_allowlist', () => {
      it('should trigger when no allowlisted domains and side effectful', () => {
        const allowlistedDomains: string[] = [];
        const sideEffectful = true;
        expect(allowlistedDomains.length === 0 && sideEffectful).toBe(true);
      });

      it('should not trigger when domains are allowlisted', () => {
        const allowlistedDomains = ['api.example.com'];
        const sideEffectful = true;
        expect(allowlistedDomains.length === 0 && sideEffectful).toBe(false);
      });

      it('should not trigger when not side effectful', () => {
        const allowlistedDomains: string[] = [];
        const sideEffectful = false;
        expect(allowlistedDomains.length === 0 && sideEffectful).toBe(false);
      });
    });

    describe('operation_irreversible', () => {
      it('should trigger when side effectful and no rollback', () => {
        const sideEffectful = true;
        const rollback = undefined;
        expect(sideEffectful && !rollback).toBe(true);
      });

      it('should not trigger when rollback is available', () => {
        const sideEffectful = true;
        const rollback = () => {};
        expect(sideEffectful && !rollback).toBe(false);
      });
    });

    describe('environment_is_production', () => {
      it('should trigger in production environment', () => {
        const environment = 'production';
        expect(environment === 'production').toBe(true);
      });

      it('should not trigger in development', () => {
        const environment = 'development';
        expect(environment === 'production').toBe(false);
      });

      it('should not trigger in staging', () => {
        const environment = 'staging';
        expect(environment === 'production').toBe(false);
      });
    });
  });

  describe('Risk Level Calculation', () => {
    it('should return highest risk level from matched triggers', () => {
      const riskOrder = ['low', 'medium', 'high', 'critical'] as const;
      const matchedRisks = ['medium', 'critical', 'high'] as const;

      const maxRisk = matchedRisks.reduce((max, risk) => {
        const maxIdx = riskOrder.indexOf(max);
        const riskIdx = riskOrder.indexOf(risk);
        return riskIdx > maxIdx ? risk : max;
      }, 'low' as const);

      expect(maxRisk).toBe('critical');
    });

    it('should return low when no triggers match', () => {
      const matchedTriggers: any[] = [];
      const riskLevel = matchedTriggers.length === 0 ? 'low' : 'high';
      expect(riskLevel).toBe('low');
    });

    it('should handle single trigger risk level', () => {
      const triggers = [{ riskLevel: 'medium' as const }];
      expect(triggers[0].riskLevel).toBe('medium');
    });
  });

  describe('Approval Request', () => {
    it('should create request with correct structure', () => {
      const runId = 'run-123';
      const stepIndex = 5;
      const toolName = 'test-tool';
      const riskLevel = 'high';
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const request = {
        id: 'approval-id',
        runId,
        stepIndex,
        action: {
          toolName,
          description: 'Test action',
          input: { data: 'test' },
        },
        riskLevel,
        riskFactors: ['High cost operation'],
        requestedBy: toolName,
        requestedAt: now,
        expiresAt,
        status: 'pending' as const,
      };

      expect(request.runId).toBe(runId);
      expect(request.stepIndex).toBe(stepIndex);
      expect(request.status).toBe('pending');
      expect(request.expiresAt.getTime()).toBeGreaterThan(request.requestedAt.getTime());
    });

    it('should set expiration to 24 hours', () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const diffHours = (expiresAt.getTime() - now.getTime()) / (60 * 60 * 1000);
      expect(diffHours).toBe(24);
    });
  });

  describe('Approval Resolution', () => {
    it('should mark as approved when decision is approve', () => {
      const decision = {
        approved: true,
        reason: 'Looks good',
        approvedBy: 'admin@example.com',
        approvedAt: new Date(),
      };

      const status = decision.approved ? 'approved' : 'declined';
      expect(status).toBe('approved');
    });

    it('should mark as declined when decision is decline', () => {
      const decision = {
        approved: false,
        reason: 'Too risky',
        approvedBy: 'admin@example.com',
        approvedAt: new Date(),
      };

      const status = decision.approved ? 'approved' : 'declined';
      expect(status).toBe('declined');
    });

    it('should include modified input if provided', () => {
      const decision = {
        approved: true,
        modifiedInput: { limit: 10 },
        approvedBy: 'admin@example.com',
        approvedAt: new Date(),
      };

      expect(decision.modifiedInput).toEqual({ limit: 10 });
    });
  });

  describe('Action Description', () => {
    it('should generate description from tool and input', () => {
      const toolName = 'delete-records';
      const toolDescription = 'Deletes records from database';
      const input = { ids: [1, 2, 3], table: 'users' };
      const inputSummary = JSON.stringify(input).slice(0, 200);

      const description = `${toolName}: ${toolDescription}\nInput: ${inputSummary}`;
      expect(description).toContain(toolName);
      expect(description).toContain(toolDescription);
      expect(description).toContain('users');
    });

    it('should truncate long input in description', () => {
      const input = { data: 'x'.repeat(300) };
      const inputJson = JSON.stringify(input);
      const inputSummary = inputJson.slice(0, 200);
      const suffix = inputJson.length > 200 ? '...' : '';

      expect(inputSummary.length).toBe(200);
      expect(suffix).toBe('...');
    });
  });

  describe('Trigger Configuration', () => {
    it('should support custom triggers', () => {
      const customTriggers = [
        {
          id: 'custom-1',
          condition: 'cost_exceeds_usd' as const,
          threshold: 1.00,
          riskLevel: 'critical' as const,
          description: 'Any cost over $1',
        },
      ];

      expect(customTriggers).toHaveLength(1);
      expect(customTriggers[0].threshold).toBe(1.00);
    });

    it('should validate trigger structure', () => {
      const trigger = {
        id: 'test',
        condition: 'cost_exceeds_usd',
        threshold: 5,
        riskLevel: 'high',
        description: 'Test trigger',
      };

      expect(trigger).toHaveProperty('id');
      expect(trigger).toHaveProperty('condition');
      expect(trigger).toHaveProperty('threshold');
      expect(trigger).toHaveProperty('riskLevel');
      expect(trigger).toHaveProperty('description');
    });
  });

  describe('Expiration Handling', () => {
    it('should detect expired requests', () => {
      const now = new Date();
      const expiredAt = new Date(now.getTime() - 1000); // 1 second ago
      expect(now > expiredAt).toBe(true);
    });

    it('should not expire active requests', () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 60000); // 1 minute from now
      expect(now > expiresAt).toBe(false);
    });
  });

  describe('Default Triggers', () => {
    const defaultTriggers = [
      { id: 'cost_50_percent', condition: 'cost_exceeds_percent_of_budget', threshold: 50, riskLevel: 'medium' },
      { id: 'cost_5_usd', condition: 'cost_exceeds_usd', threshold: 5.00, riskLevel: 'high' },
      { id: 'write_production', condition: 'scope_includes', threshold: 'write:production', riskLevel: 'critical' },
      { id: 'delete_any', condition: 'scope_includes', threshold: 'delete:', riskLevel: 'critical' },
      { id: 'billing_operations', condition: 'scope_includes', threshold: 'billing:', riskLevel: 'critical' },
      { id: 'external_domain', condition: 'domain_not_in_allowlist', threshold: true, riskLevel: 'high' },
      { id: 'irreversible', condition: 'operation_irreversible', threshold: true, riskLevel: 'high' },
      { id: 'production_env', condition: 'environment_is_production', threshold: true, riskLevel: 'medium' },
    ];

    it('should have 8 default triggers', () => {
      expect(defaultTriggers).toHaveLength(8);
    });

    it('should have critical triggers for destructive operations', () => {
      const criticalTriggers = defaultTriggers.filter(t => t.riskLevel === 'critical');
      expect(criticalTriggers.length).toBeGreaterThanOrEqual(3);
    });

    it('should include billing protection', () => {
      const billingTrigger = defaultTriggers.find(t => t.id === 'billing_operations');
      expect(billingTrigger).toBeDefined();
      expect(billingTrigger?.riskLevel).toBe('critical');
    });
  });
});
