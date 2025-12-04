/**
 * Approval Manager
 *
 * Implements human-in-the-loop for high-risk operations:
 * - Codified approval triggers based on cost, scope, egress
 * - Run pause/resume state machine
 * - Approval request lifecycle management
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../storage/database.js';
import { getRunsStorage } from '../storage/runs.js';
import type { ApprovalRequest, ToolDefinition } from '../core/types.js';
import { createLogger, StructuredLogger } from '../logging/logger.js';

export interface ApprovalTrigger {
  id: string;
  condition: ApprovalCondition;
  threshold: unknown;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export type ApprovalCondition =
  | 'cost_exceeds_usd'
  | 'cost_exceeds_percent_of_budget'
  | 'scope_includes'
  | 'scope_matches_pattern'
  | 'domain_not_in_allowlist'
  | 'operation_irreversible'
  | 'affects_users_exceeds'
  | 'data_sensitivity_level'
  | 'environment_is_production';

export interface ApprovalContext {
  runId: string;
  stepIndex: number;
  tool: ToolDefinition;
  input: unknown;
  estimatedCost: number;
  budgetRemaining: number;
  budgetTotal: number;
  environment: string;
}

export interface ApprovalDecision {
  approved: boolean;
  reason?: string;
  modifiedInput?: unknown;
  approvedBy: string;
  approvedAt: Date;
}

// Default approval triggers
const DEFAULT_TRIGGERS: ApprovalTrigger[] = [
  {
    id: 'cost_50_percent',
    condition: 'cost_exceeds_percent_of_budget',
    threshold: 50,
    riskLevel: 'medium',
    description: 'Operation exceeds 50% of remaining budget',
  },
  {
    id: 'cost_5_usd',
    condition: 'cost_exceeds_usd',
    threshold: 5.00,
    riskLevel: 'high',
    description: 'Operation costs more than $5',
  },
  {
    id: 'write_production',
    condition: 'scope_includes',
    threshold: 'write:production',
    riskLevel: 'critical',
    description: 'Write operation in production environment',
  },
  {
    id: 'delete_any',
    condition: 'scope_includes',
    threshold: 'delete:',
    riskLevel: 'critical',
    description: 'Delete operation',
  },
  {
    id: 'billing_operations',
    condition: 'scope_includes',
    threshold: 'billing:',
    riskLevel: 'critical',
    description: 'Billing-related operation',
  },
  {
    id: 'external_domain',
    condition: 'domain_not_in_allowlist',
    threshold: true,
    riskLevel: 'high',
    description: 'Accessing non-allowlisted domain',
  },
  {
    id: 'irreversible',
    condition: 'operation_irreversible',
    threshold: true,
    riskLevel: 'high',
    description: 'Irreversible operation',
  },
  {
    id: 'production_env',
    condition: 'environment_is_production',
    threshold: true,
    riskLevel: 'medium',
    description: 'Operation in production environment',
  },
];

export class ApprovalManager {
  private db = getDatabase();
  private runs = getRunsStorage();
  private triggers: ApprovalTrigger[];
  private logger: StructuredLogger;

  constructor(customTriggers?: ApprovalTrigger[]) {
    this.triggers = customTriggers ?? DEFAULT_TRIGGERS;
    this.logger = createLogger({ level: 'info' });
  }

  /**
   * Check if approval is required for an operation
   */
  checkApprovalRequired(context: ApprovalContext): {
    required: boolean;
    triggers: ApprovalTrigger[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  } {
    const matchedTriggers: ApprovalTrigger[] = [];

    for (const trigger of this.triggers) {
      if (this.evaluateTrigger(trigger, context)) {
        matchedTriggers.push(trigger);
      }
    }

    if (matchedTriggers.length === 0) {
      return { required: false, triggers: [], riskLevel: 'low' };
    }

    // Get highest risk level
    type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
    const riskOrder: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    const maxRisk = matchedTriggers.reduce<RiskLevel>((max, t) => {
      const maxIdx = riskOrder.indexOf(max);
      const tIdx = riskOrder.indexOf(t.riskLevel);
      return tIdx > maxIdx ? t.riskLevel : max;
    }, 'low');

    return {
      required: true,
      triggers: matchedTriggers,
      riskLevel: maxRisk,
    };
  }

  /**
   * Request approval for an operation
   */
  async requestApproval(
    context: ApprovalContext,
    triggers: ApprovalTrigger[],
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
  ): Promise<ApprovalRequest> {
    const id = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    const request: ApprovalRequest = {
      id,
      runId: context.runId,
      stepIndex: context.stepIndex,
      action: {
        toolName: context.tool.name,
        description: this.describeAction(context.tool, context.input),
        input: context.input,
      },
      riskLevel,
      riskFactors: triggers.map(t => t.description),
      requestedBy: context.tool.name,
      requestedAt: now,
      expiresAt,
      status: 'pending',
    };

    // Store in database
    this.db.prepare(`
      INSERT INTO approvals (
        id, run_id, step_index, tool_name, action_description, action_input,
        risk_level, risk_factors, requested_by, requested_at, expires_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      request.id,
      request.runId,
      request.stepIndex,
      request.action.toolName,
      request.action.description,
      JSON.stringify(request.action.input),
      request.riskLevel,
      JSON.stringify(request.riskFactors),
      request.requestedBy,
      request.requestedAt.toISOString(),
      request.expiresAt.toISOString(),
      request.status
    );

    // Pause the run
    this.runs.awaitApproval(context.runId);

    this.logger.info('approval_requested', {
      approval_id: id,
      run_id: context.runId,
      tool: context.tool.name,
      risk_level: riskLevel,
    });

    return request;
  }

  /**
   * Resolve an approval request
   */
  async resolve(
    approvalId: string,
    decision: ApprovalDecision
  ): Promise<void> {
    const request = this.getById(approvalId);
    if (!request) {
      throw new Error(`Approval request not found: ${approvalId}`);
    }

    if (request.status !== 'pending') {
      throw new Error(`Approval already resolved: ${request.status}`);
    }

    // Check expiration
    if (new Date() > request.expiresAt) {
      this.db.prepare(`
        UPDATE approvals SET status = 'expired' WHERE id = ?
      `).run(approvalId);
      throw new Error('Approval request has expired');
    }

    // Update approval
    const status = decision.approved ? 'approved' : 'declined';
    this.db.prepare(`
      UPDATE approvals SET
        status = ?,
        resolved_by = ?,
        resolved_at = ?,
        resolution = ?
      WHERE id = ?
    `).run(
      status,
      decision.approvedBy,
      decision.approvedAt.toISOString(),
      JSON.stringify({
        decision: decision.approved ? 'approve' : 'decline',
        reason: decision.reason,
        modifiedInput: decision.modifiedInput,
      }),
      approvalId
    );

    this.logger.info('approval_resolved', {
      approval_id: approvalId,
      decision: status,
      by: decision.approvedBy,
    });

    // Resume or fail the run
    if (decision.approved) {
      this.runs.updateStatus(request.runId, 'running');
    } else {
      this.runs.fail(request.runId, {
        message: `Approval declined: ${decision.reason ?? 'No reason provided'}`,
        code: 'APPROVAL_DECLINED',
        retryable: false,
        step: request.stepIndex,
      });
    }
  }

  /**
   * Get approval request by ID
   */
  getById(id: string): ApprovalRequest | null {
    const row = this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToRequest(row);
  }

  /**
   * Get pending approvals for a run
   */
  getPendingForRun(runId: string): ApprovalRequest[] {
    const rows = this.db.prepare(`
      SELECT * FROM approvals WHERE run_id = ? AND status = 'pending'
      ORDER BY requested_at DESC
    `).all(runId) as any[];

    return rows.map(r => this.rowToRequest(r));
  }

  /**
   * Get all pending approvals
   */
  getAllPending(options: { limit?: number } = {}): ApprovalRequest[] {
    const limit = options.limit ?? 100;
    const rows = this.db.prepare(`
      SELECT * FROM approvals WHERE status = 'pending'
      ORDER BY requested_at DESC LIMIT ?
    `).all(limit) as any[];

    return rows.map(r => this.rowToRequest(r));
  }

  /**
   * Expire old pending approvals
   */
  expireOld(): number {
    const result = this.db.prepare(`
      UPDATE approvals SET status = 'expired'
      WHERE status = 'pending' AND expires_at < datetime('now')
    `).run();

    if (result.changes > 0) {
      this.logger.info('approvals_expired', { count: result.changes });
    }

    return result.changes;
  }

  /**
   * Evaluate a single trigger
   */
  private evaluateTrigger(trigger: ApprovalTrigger, context: ApprovalContext): boolean {
    switch (trigger.condition) {
      case 'cost_exceeds_usd':
        return context.estimatedCost > (trigger.threshold as number);

      case 'cost_exceeds_percent_of_budget':
        const percent = (context.estimatedCost / context.budgetRemaining) * 100;
        return percent > (trigger.threshold as number);

      case 'scope_includes':
        return context.tool.scopes.some(s =>
          s.includes(trigger.threshold as string)
        );

      case 'scope_matches_pattern':
        const pattern = new RegExp(trigger.threshold as string);
        return context.tool.scopes.some(s => pattern.test(s));

      case 'domain_not_in_allowlist':
        // Check if tool would access non-allowlisted domain
        return context.tool.allowlistedDomains.length === 0 &&
               context.tool.sideEffectful;

      case 'operation_irreversible':
        return context.tool.sideEffectful && !context.tool.rollback;

      case 'affects_users_exceeds':
        // Would need to be determined from input
        return false;

      case 'data_sensitivity_level':
        // Would need data classification
        return false;

      case 'environment_is_production':
        return context.environment === 'production';

      default:
        return false;
    }
  }

  /**
   * Describe an action for human review
   */
  private describeAction(tool: ToolDefinition, input: unknown): string {
    const inputSummary = JSON.stringify(input).slice(0, 200);
    return `${tool.name}: ${tool.description}\nInput: ${inputSummary}${JSON.stringify(input).length > 200 ? '...' : ''}`;
  }

  /**
   * Convert database row to ApprovalRequest
   */
  private rowToRequest(row: any): ApprovalRequest {
    return {
      id: row.id,
      runId: row.run_id,
      stepIndex: row.step_index,
      action: {
        toolName: row.tool_name,
        description: row.action_description,
        input: JSON.parse(row.action_input),
      },
      riskLevel: row.risk_level,
      riskFactors: JSON.parse(row.risk_factors),
      requestedBy: row.requested_by,
      requestedAt: new Date(row.requested_at),
      expiresAt: new Date(row.expires_at),
      status: row.status,
      resolvedBy: row.resolved_by ?? undefined,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
      resolution: row.resolution ? JSON.parse(row.resolution) : undefined,
    };
  }
}

// Singleton instance
let instance: ApprovalManager | null = null;

export function getApprovalManager(): ApprovalManager {
  if (!instance) {
    instance = new ApprovalManager();
  }
  return instance;
}
