/**
 * Consent Validator
 *
 * Validates and logs consent for biometric operations.
 * Required for: face swap, voice cloning, lipsync, etc.
 */

import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import { z } from 'zod';

// Schemas
export const ConsentEvidenceSchema = z.object({
  type: z.enum([
    'explicit_checkbox',
    'terms_acceptance',
    'api_attestation',
    'verbal_recorded',
    'written_document',
    'none'
  ]),
  timestamp: z.string().datetime().optional(),
  reference: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ConsentRequestSchema = z.object({
  operationType: z.enum([
    'face_swap',
    'face_detection',
    'voice_clone',
    'voice_synthesis',
    'lipsync',
    'face_analysis',
    'biometric_other'
  ]),
  subjectType: z.enum(['self', 'other', 'unknown']),
  consentEvidence: ConsentEvidenceSchema.optional(),
  purpose: z.string().min(1).max(500),
  intendedUse: z.string().optional(),
});

export type ConsentRequest = z.infer<typeof ConsentRequestSchema>;
export type ConsentEvidence = z.infer<typeof ConsentEvidenceSchema>;

export interface ConsentContext {
  runId: string;
  agentId: string;
  tenantId?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ConsentResult {
  valid: boolean;
  logId: string;
  restrictions: string[];
  requiresWatermark: boolean;
  message?: string;
}

// Operations that REQUIRE consent for 'other' subjects
const CONSENT_REQUIRED_OPERATIONS = new Set([
  'face_swap',
  'voice_clone',
  'lipsync',
]);

// Operations that require watermark for non-self subjects
const WATERMARK_REQUIRED_OPERATIONS = new Set([
  'face_swap',
  'voice_clone',
]);

export class ConsentValidator {
  private db: Database.Database;

  constructor(dbPath: string = './data/agent-marketplace.db') {
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
  }

  /**
   * Validate consent for a biometric operation
   */
  validate(request: ConsentRequest, context: ConsentContext): ConsentResult {
    // Parse and validate input
    const parsed = ConsentRequestSchema.parse(request);

    const logId = uuidv4();
    const restrictions: string[] = [];
    let valid = true;
    let message: string | undefined;

    // Determine if consent is required
    const requiresConsent =
      parsed.subjectType === 'other' &&
      CONSENT_REQUIRED_OPERATIONS.has(parsed.operationType);

    // Check consent for operations on others
    if (requiresConsent) {
      if (!parsed.consentEvidence || parsed.consentEvidence.type === 'none') {
        valid = false;
        message = `CONSENT_REQUIRED: ${parsed.operationType} on other individuals requires explicit consent. ` +
                  `Please provide consent evidence or confirm the subject is yourself.`;
      }
    }

    // Determine restrictions
    if (parsed.subjectType === 'other') {
      restrictions.push('no_commercial_without_license');
      if (valid && parsed.consentEvidence?.type === 'api_attestation') {
        restrictions.push('attestation_recorded');
      }
    }

    if (parsed.subjectType === 'unknown') {
      restrictions.push('personal_use_only');
      restrictions.push('no_redistribution');
    }

    // Determine watermark requirement
    const requiresWatermark =
      parsed.subjectType !== 'self' &&
      WATERMARK_REQUIRED_OPERATIONS.has(parsed.operationType);

    if (requiresWatermark) {
      restrictions.push('watermark_applied');
    }

    // Log the consent check
    this.logConsentCheck({
      id: logId,
      operationType: parsed.operationType,
      subjectType: parsed.subjectType,
      consentType: parsed.consentEvidence?.type || 'none',
      consentReference: parsed.consentEvidence?.reference,
      consentTimestamp: parsed.consentEvidence?.timestamp,
      purpose: parsed.purpose,
      intendedUse: parsed.intendedUse,
      validationResult: valid ? 'approved' : 'denied',
      restrictionsApplied: restrictions,
      runId: context.runId,
      agentId: context.agentId,
      tenantId: context.tenantId,
      userId: context.userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      valid,
      logId,
      restrictions,
      requiresWatermark,
      message,
    };
  }

  /**
   * Validate and throw if invalid (gate pattern)
   */
  validateOrThrow(request: ConsentRequest, context: ConsentContext): ConsentResult {
    const result = this.validate(request, context);
    if (!result.valid) {
      throw new Error(result.message || 'Consent validation failed');
    }
    return result;
  }

  /**
   * Log a consent check to the database
   */
  private logConsentCheck(params: {
    id: string;
    operationType: string;
    subjectType: string;
    consentType: string;
    consentReference?: string;
    consentTimestamp?: string;
    purpose: string;
    intendedUse?: string;
    validationResult: 'approved' | 'denied' | 'pending';
    restrictionsApplied: string[];
    runId: string;
    agentId: string;
    tenantId?: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): void {
    try {
      this.db.prepare(`
        INSERT INTO consent_log (
          id, operation_type, subject_type, consent_type, consent_reference,
          consent_timestamp, purpose, intended_use, validation_result,
          restrictions_applied, run_id, agent_id, tenant_id, user_id,
          ip_address, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        params.id,
        params.operationType,
        params.subjectType,
        params.consentType,
        params.consentReference || null,
        params.consentTimestamp || null,
        params.purpose,
        params.intendedUse || null,
        params.validationResult,
        JSON.stringify(params.restrictionsApplied),
        params.runId,
        params.agentId,
        params.tenantId || null,
        params.userId || null,
        params.ipAddress || null,
        params.userAgent || null
      );
    } catch (error) {
      // Log to console but don't fail the validation
      console.error('Failed to log consent check:', error);
    }
  }

  /**
   * Get consent log for a run
   */
  getConsentLog(runId: string): any[] {
    return this.db.prepare(`
      SELECT * FROM consent_log WHERE run_id = ? ORDER BY created_at DESC
    `).all(runId);
  }

  /**
   * Get consent statistics
   */
  getStats(tenantId?: string): {
    total: number;
    approved: number;
    denied: number;
    byOperation: Record<string, number>;
  } {
    const whereClause = tenantId ? 'WHERE tenant_id = ?' : '';
    const params = tenantId ? [tenantId] : [];

    const totals = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN validation_result = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN validation_result = 'denied' THEN 1 ELSE 0 END) as denied
      FROM consent_log
      ${whereClause}
    `).get(...params) as any;

    const byOperation = this.db.prepare(`
      SELECT operation_type, COUNT(*) as count
      FROM consent_log
      ${whereClause}
      GROUP BY operation_type
    `).all(...params) as any[];

    return {
      total: totals?.total || 0,
      approved: totals?.approved || 0,
      denied: totals?.denied || 0,
      byOperation: Object.fromEntries(
        byOperation.map(r => [r.operation_type, r.count])
      ),
    };
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance
let instance: ConsentValidator | null = null;

export function getConsentValidator(): ConsentValidator {
  if (!instance) {
    instance = new ConsentValidator();
  }
  return instance;
}

export function closeConsentValidator(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
