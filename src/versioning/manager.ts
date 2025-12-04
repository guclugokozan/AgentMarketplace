/**
 * Versioning & Deprecation Manager
 *
 * Handles agent/tool lifecycle:
 * - Semver validation and comparison
 * - Deprecation policies
 * - Sunset enforcement
 * - Compatibility checks
 */

import { getDatabase } from '../storage/database.js';
import { AgentSunsetError } from '../core/errors.js';
import { createLogger, StructuredLogger } from '../logging/logger.js';

export interface VersionInfo {
  id: string;
  type: 'agent' | 'tool';
  version: string;
  status: 'active' | 'deprecated' | 'sunset';
  deprecatedAt?: Date;
  deprecationReason?: string;
  replacementId?: string;
  sunsetDate?: Date;
  minCompatibleVersion?: string;
  lastVerifiedAt?: Date;
  verificationStatus?: 'passed' | 'failed' | 'pending';
}

export interface DeprecationPolicy {
  warningPeriodDays: number;
  sunsetPeriodDays: number;
  requireReplacement: boolean;
  notifyOnUse: boolean;
}

export interface CompatibilityResult {
  compatible: boolean;
  currentVersion: string;
  requestedVersion: string;
  issues: string[];
  suggestions: string[];
}

const DEFAULT_DEPRECATION_POLICY: DeprecationPolicy = {
  warningPeriodDays: 30,
  sunsetPeriodDays: 90,
  requireReplacement: false,
  notifyOnUse: true,
};

export class VersioningManager {
  private db = getDatabase();
  private logger: StructuredLogger;
  private policy: DeprecationPolicy;

  constructor(policy: Partial<DeprecationPolicy> = {}) {
    this.logger = createLogger({ level: 'info' });
    this.policy = { ...DEFAULT_DEPRECATION_POLICY, ...policy };
    this.initializeSchema();
  }

  /**
   * Initialize versioning schema
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS version_registry (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        version TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        deprecated_at TEXT,
        deprecation_reason TEXT,
        replacement_id TEXT,
        sunset_date TEXT,
        min_compatible_version TEXT,
        last_verified_at TEXT,
        verification_status TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_version_type ON version_registry(type);
      CREATE INDEX IF NOT EXISTS idx_version_status ON version_registry(status);
    `);
  }

  /**
   * Register a version
   */
  register(info: Omit<VersionInfo, 'status'>): void {
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT OR REPLACE INTO version_registry (
        id, type, version, status, min_compatible_version, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', ?, ?, ?)
    `).run(
      info.id,
      info.type,
      info.version,
      info.minCompatibleVersion ?? null,
      now,
      now
    );

    this.logger.info('version_registered', {
      id: info.id,
      version: info.version,
      type: info.type,
    });
  }

  /**
   * Deprecate a version
   */
  deprecate(
    id: string,
    reason: string,
    options: {
      replacementId?: string;
      sunsetDate?: Date;
    } = {}
  ): void {
    const now = new Date();
    const sunsetDate = options.sunsetDate ??
      new Date(now.getTime() + this.policy.sunsetPeriodDays * 24 * 60 * 60 * 1000);

    this.db.prepare(`
      UPDATE version_registry SET
        status = 'deprecated',
        deprecated_at = ?,
        deprecation_reason = ?,
        replacement_id = ?,
        sunset_date = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      now.toISOString(),
      reason,
      options.replacementId ?? null,
      sunsetDate.toISOString(),
      now.toISOString(),
      id
    );

    this.logger.warn('version_deprecated', {
      id,
      reason,
      replacement: options.replacementId,
      sunset_date: sunsetDate.toISOString(),
    });
  }

  /**
   * Sunset a version
   */
  sunset(id: string): void {
    this.db.prepare(`
      UPDATE version_registry SET
        status = 'sunset',
        updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id);

    this.logger.warn('version_sunset', { id });
  }

  /**
   * Check version status before use
   */
  checkBeforeUse(id: string): {
    allowed: boolean;
    status: 'active' | 'deprecated' | 'sunset';
    warning?: string;
    replacement?: string;
  } {
    const info = this.getVersionInfo(id);

    if (!info) {
      return { allowed: true, status: 'active' };
    }

    // Check if sunset
    if (info.status === 'sunset') {
      throw new AgentSunsetError(id, info.replacementId);
    }

    // Check sunset date
    if (info.sunsetDate && new Date() > info.sunsetDate) {
      this.sunset(id);
      throw new AgentSunsetError(id, info.replacementId);
    }

    // Check deprecation
    if (info.status === 'deprecated') {
      const warning = this.buildDeprecationWarning(info);

      if (this.policy.notifyOnUse) {
        this.logger.warn('deprecated_version_used', {
          id,
          replacement: info.replacementId,
          sunset_date: info.sunsetDate?.toISOString(),
        });
      }

      return {
        allowed: true,
        status: 'deprecated',
        warning,
        replacement: info.replacementId,
      };
    }

    return { allowed: true, status: 'active' };
  }

  /**
   * Get version info
   */
  getVersionInfo(id: string): VersionInfo | null {
    const row = this.db.prepare('SELECT * FROM version_registry WHERE id = ?').get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      type: row.type,
      version: row.version,
      status: row.status,
      deprecatedAt: row.deprecated_at ? new Date(row.deprecated_at) : undefined,
      deprecationReason: row.deprecation_reason ?? undefined,
      replacementId: row.replacement_id ?? undefined,
      sunsetDate: row.sunset_date ? new Date(row.sunset_date) : undefined,
      minCompatibleVersion: row.min_compatible_version ?? undefined,
      lastVerifiedAt: row.last_verified_at ? new Date(row.last_verified_at) : undefined,
      verificationStatus: row.verification_status ?? undefined,
    };
  }

  /**
   * Check version compatibility
   */
  checkCompatibility(id: string, requestedVersion: string): CompatibilityResult {
    const info = this.getVersionInfo(id);

    if (!info) {
      return {
        compatible: true,
        currentVersion: 'unknown',
        requestedVersion,
        issues: [],
        suggestions: [],
      };
    }

    const issues: string[] = [];
    const suggestions: string[] = [];

    // Parse versions
    const current = this.parseVersion(info.version);
    const requested = this.parseVersion(requestedVersion);

    // Check major version compatibility
    if (current.major !== requested.major) {
      issues.push(`Major version mismatch: current ${info.version}, requested ${requestedVersion}`);
      suggestions.push(`Update to version ${info.version} or specify a compatible version`);
    }

    // Check minimum compatible version
    if (info.minCompatibleVersion) {
      const minCompat = this.parseVersion(info.minCompatibleVersion);
      if (this.compareVersions(requested, minCompat) < 0) {
        issues.push(`Version ${requestedVersion} is below minimum compatible version ${info.minCompatibleVersion}`);
        suggestions.push(`Use version ${info.minCompatibleVersion} or higher`);
      }
    }

    return {
      compatible: issues.length === 0,
      currentVersion: info.version,
      requestedVersion,
      issues,
      suggestions,
    };
  }

  /**
   * Update verification status
   */
  updateVerification(id: string, status: 'passed' | 'failed' | 'pending'): void {
    this.db.prepare(`
      UPDATE version_registry SET
        last_verified_at = ?,
        verification_status = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      new Date().toISOString(),
      status,
      new Date().toISOString(),
      id
    );
  }

  /**
   * Get all deprecated versions
   */
  getDeprecated(): VersionInfo[] {
    const rows = this.db.prepare(`
      SELECT * FROM version_registry WHERE status = 'deprecated'
      ORDER BY sunset_date ASC
    `).all() as any[];

    return rows.map(row => ({
      id: row.id,
      type: row.type,
      version: row.version,
      status: row.status,
      deprecatedAt: row.deprecated_at ? new Date(row.deprecated_at) : undefined,
      deprecationReason: row.deprecation_reason ?? undefined,
      replacementId: row.replacement_id ?? undefined,
      sunsetDate: row.sunset_date ? new Date(row.sunset_date) : undefined,
    }));
  }

  /**
   * Process pending sunsets
   */
  processSunsets(): number {
    const now = new Date().toISOString();

    const result = this.db.prepare(`
      UPDATE version_registry SET
        status = 'sunset',
        updated_at = ?
      WHERE status = 'deprecated' AND sunset_date < ?
    `).run(now, now);

    if (result.changes > 0) {
      this.logger.info('versions_sunset', { count: result.changes });
    }

    return result.changes;
  }

  /**
   * Build deprecation warning message
   */
  private buildDeprecationWarning(info: VersionInfo): string {
    let warning = `${info.id} v${info.version} is deprecated`;

    if (info.deprecationReason) {
      warning += `: ${info.deprecationReason}`;
    }

    if (info.replacementId) {
      warning += `. Use ${info.replacementId} instead`;
    }

    if (info.sunsetDate) {
      const daysLeft = Math.ceil(
        (info.sunsetDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      );
      warning += `. Will be removed in ${daysLeft} days`;
    }

    return warning;
  }

  /**
   * Parse semver string
   */
  private parseVersion(version: string): { major: number; minor: number; patch: number } {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
      return { major: 0, minor: 0, patch: 0 };
    }
    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
    };
  }

  /**
   * Compare two versions
   * Returns: -1 if a < b, 0 if a == b, 1 if a > b
   */
  private compareVersions(
    a: { major: number; minor: number; patch: number },
    b: { major: number; minor: number; patch: number }
  ): number {
    if (a.major !== b.major) return a.major < b.major ? -1 : 1;
    if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
    if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
    return 0;
  }
}

// Singleton instance
let instance: VersioningManager | null = null;

export function getVersioningManager(): VersioningManager {
  if (!instance) {
    instance = new VersioningManager();
  }
  return instance;
}
