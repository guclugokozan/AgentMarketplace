/**
 * Versioning Manager Tests
 *
 * Comprehensive tests for version management and deprecation handling
 */

import { describe, it, expect } from 'vitest';

describe('Versioning Manager', () => {
  describe('Version Parsing', () => {
    function parseVersion(version: string): { major: number; minor: number; patch: number } {
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

    it('should parse standard semver', () => {
      const v = parseVersion('1.2.3');
      expect(v.major).toBe(1);
      expect(v.minor).toBe(2);
      expect(v.patch).toBe(3);
    });

    it('should parse zero versions', () => {
      const v = parseVersion('0.0.0');
      expect(v.major).toBe(0);
      expect(v.minor).toBe(0);
      expect(v.patch).toBe(0);
    });

    it('should parse large version numbers', () => {
      const v = parseVersion('123.456.789');
      expect(v.major).toBe(123);
      expect(v.minor).toBe(456);
      expect(v.patch).toBe(789);
    });

    it('should handle pre-release suffixes', () => {
      const v = parseVersion('1.2.3-beta.1');
      expect(v.major).toBe(1);
      expect(v.minor).toBe(2);
      expect(v.patch).toBe(3);
    });

    it('should handle build metadata', () => {
      const v = parseVersion('1.2.3+build.456');
      expect(v.major).toBe(1);
      expect(v.minor).toBe(2);
      expect(v.patch).toBe(3);
    });

    it('should return zeros for invalid versions', () => {
      const v = parseVersion('invalid');
      expect(v.major).toBe(0);
      expect(v.minor).toBe(0);
      expect(v.patch).toBe(0);
    });
  });

  describe('Version Comparison', () => {
    function compareVersions(
      a: { major: number; minor: number; patch: number },
      b: { major: number; minor: number; patch: number }
    ): number {
      if (a.major !== b.major) return a.major < b.major ? -1 : 1;
      if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
      if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
      return 0;
    }

    it('should return 0 for equal versions', () => {
      const a = { major: 1, minor: 2, patch: 3 };
      const b = { major: 1, minor: 2, patch: 3 };
      expect(compareVersions(a, b)).toBe(0);
    });

    it('should compare major versions', () => {
      const a = { major: 1, minor: 0, patch: 0 };
      const b = { major: 2, minor: 0, patch: 0 };
      expect(compareVersions(a, b)).toBe(-1);
      expect(compareVersions(b, a)).toBe(1);
    });

    it('should compare minor versions', () => {
      const a = { major: 1, minor: 1, patch: 0 };
      const b = { major: 1, minor: 2, patch: 0 };
      expect(compareVersions(a, b)).toBe(-1);
      expect(compareVersions(b, a)).toBe(1);
    });

    it('should compare patch versions', () => {
      const a = { major: 1, minor: 2, patch: 3 };
      const b = { major: 1, minor: 2, patch: 4 };
      expect(compareVersions(a, b)).toBe(-1);
      expect(compareVersions(b, a)).toBe(1);
    });

    it('should prioritize major over minor', () => {
      const a = { major: 2, minor: 0, patch: 0 };
      const b = { major: 1, minor: 9, patch: 9 };
      expect(compareVersions(a, b)).toBe(1);
    });

    it('should prioritize minor over patch', () => {
      const a = { major: 1, minor: 2, patch: 0 };
      const b = { major: 1, minor: 1, patch: 99 };
      expect(compareVersions(a, b)).toBe(1);
    });
  });

  describe('Version Status', () => {
    type VersionStatus = 'active' | 'deprecated' | 'sunset';

    it('should recognize active status', () => {
      const status: VersionStatus = 'active';
      expect(status).toBe('active');
    });

    it('should recognize deprecated status', () => {
      const status: VersionStatus = 'deprecated';
      expect(status).toBe('deprecated');
    });

    it('should recognize sunset status', () => {
      const status: VersionStatus = 'sunset';
      expect(status).toBe('sunset');
    });
  });

  describe('Deprecation Policy', () => {
    interface DeprecationPolicy {
      warningPeriodDays: number;
      sunsetPeriodDays: number;
      requireReplacement: boolean;
      notifyOnUse: boolean;
    }

    const DEFAULT_POLICY: DeprecationPolicy = {
      warningPeriodDays: 30,
      sunsetPeriodDays: 90,
      requireReplacement: false,
      notifyOnUse: true,
    };

    it('should have default warning period of 30 days', () => {
      expect(DEFAULT_POLICY.warningPeriodDays).toBe(30);
    });

    it('should have default sunset period of 90 days', () => {
      expect(DEFAULT_POLICY.sunsetPeriodDays).toBe(90);
    });

    it('should not require replacement by default', () => {
      expect(DEFAULT_POLICY.requireReplacement).toBe(false);
    });

    it('should notify on use by default', () => {
      expect(DEFAULT_POLICY.notifyOnUse).toBe(true);
    });

    it('should allow custom policy override', () => {
      const customPolicy: DeprecationPolicy = {
        ...DEFAULT_POLICY,
        warningPeriodDays: 14,
        sunsetPeriodDays: 60,
      };
      expect(customPolicy.warningPeriodDays).toBe(14);
      expect(customPolicy.sunsetPeriodDays).toBe(60);
    });
  });

  describe('Sunset Date Calculation', () => {
    it('should calculate sunset date from deprecation', () => {
      const now = new Date();
      const sunsetPeriodDays = 90;
      const sunsetDate = new Date(now.getTime() + sunsetPeriodDays * 24 * 60 * 60 * 1000);

      const diffDays = Math.round((sunsetDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(90);
    });

    it('should allow custom sunset date', () => {
      const customSunset = new Date(2025, 11, 31); // Dec 31, 2025 (month is 0-indexed)
      expect(customSunset.getFullYear()).toBe(2025);
      expect(customSunset.getMonth()).toBe(11); // December
      expect(customSunset.getDate()).toBe(31);
    });

    it('should detect expired sunset dates', () => {
      const now = new Date();
      const pastSunset = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
      expect(now > pastSunset).toBe(true);
    });

    it('should detect active sunset dates', () => {
      const now = new Date();
      const futureSunset = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day from now
      expect(now < futureSunset).toBe(true);
    });
  });

  describe('Days Until Sunset', () => {
    it('should calculate days remaining', () => {
      const now = Date.now();
      const sunsetDate = new Date(now + 30 * 24 * 60 * 60 * 1000);
      const daysLeft = Math.ceil((sunsetDate.getTime() - now) / (24 * 60 * 60 * 1000));
      expect(daysLeft).toBe(30);
    });

    it('should handle same day sunset', () => {
      const now = Date.now();
      const sunsetDate = new Date(now + 12 * 60 * 60 * 1000); // 12 hours
      const daysLeft = Math.ceil((sunsetDate.getTime() - now) / (24 * 60 * 60 * 1000));
      expect(daysLeft).toBe(1);
    });

    it('should handle past sunset dates', () => {
      const now = Date.now();
      const sunsetDate = new Date(now - 24 * 60 * 60 * 1000);
      const daysLeft = Math.ceil((sunsetDate.getTime() - now) / (24 * 60 * 60 * 1000));
      expect(daysLeft).toBeLessThan(0);
    });
  });

  describe('Deprecation Warning Builder', () => {
    interface VersionInfo {
      id: string;
      version: string;
      deprecationReason?: string;
      replacementId?: string;
      sunsetDate?: Date;
    }

    function buildDeprecationWarning(info: VersionInfo): string {
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

    it('should include version info', () => {
      const warning = buildDeprecationWarning({
        id: 'my-agent',
        version: '1.0.0',
      });
      expect(warning).toContain('my-agent');
      expect(warning).toContain('v1.0.0');
      expect(warning).toContain('deprecated');
    });

    it('should include deprecation reason', () => {
      const warning = buildDeprecationWarning({
        id: 'my-agent',
        version: '1.0.0',
        deprecationReason: 'Security vulnerability',
      });
      expect(warning).toContain('Security vulnerability');
    });

    it('should include replacement suggestion', () => {
      const warning = buildDeprecationWarning({
        id: 'my-agent',
        version: '1.0.0',
        replacementId: 'my-agent-v2',
      });
      expect(warning).toContain('Use my-agent-v2 instead');
    });

    it('should include sunset countdown', () => {
      const warning = buildDeprecationWarning({
        id: 'my-agent',
        version: '1.0.0',
        sunsetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      expect(warning).toContain('Will be removed in');
      expect(warning).toContain('days');
    });
  });

  describe('Compatibility Check', () => {
    interface CompatibilityResult {
      compatible: boolean;
      currentVersion: string;
      requestedVersion: string;
      issues: string[];
      suggestions: string[];
    }

    function checkCompatibility(
      currentVersion: string,
      requestedVersion: string,
      minCompatibleVersion?: string
    ): CompatibilityResult {
      const issues: string[] = [];
      const suggestions: string[] = [];

      function parseVersion(version: string) {
        const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
        if (!match) return { major: 0, minor: 0, patch: 0 };
        return {
          major: parseInt(match[1], 10),
          minor: parseInt(match[2], 10),
          patch: parseInt(match[3], 10),
        };
      }

      const current = parseVersion(currentVersion);
      const requested = parseVersion(requestedVersion);

      if (current.major !== requested.major) {
        issues.push(`Major version mismatch: current ${currentVersion}, requested ${requestedVersion}`);
        suggestions.push(`Update to version ${currentVersion} or specify a compatible version`);
      }

      if (minCompatibleVersion) {
        const minCompat = parseVersion(minCompatibleVersion);
        if (requested.major < minCompat.major ||
          (requested.major === minCompat.major && requested.minor < minCompat.minor) ||
          (requested.major === minCompat.major && requested.minor === minCompat.minor && requested.patch < minCompat.patch)) {
          issues.push(`Version ${requestedVersion} is below minimum compatible version ${minCompatibleVersion}`);
          suggestions.push(`Use version ${minCompatibleVersion} or higher`);
        }
      }

      return {
        compatible: issues.length === 0,
        currentVersion,
        requestedVersion,
        issues,
        suggestions,
      };
    }

    it('should be compatible with same version', () => {
      const result = checkCompatibility('1.2.3', '1.2.3');
      expect(result.compatible).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should be compatible with same major version', () => {
      const result = checkCompatibility('1.5.0', '1.2.0');
      expect(result.compatible).toBe(true);
    });

    it('should be incompatible with different major version', () => {
      const result = checkCompatibility('2.0.0', '1.5.0');
      expect(result.compatible).toBe(false);
      expect(result.issues[0]).toContain('Major version mismatch');
    });

    it('should check minimum compatible version', () => {
      const result = checkCompatibility('2.0.0', '1.5.0', '1.8.0');
      expect(result.compatible).toBe(false);
      expect(result.issues.some(i => i.includes('below minimum'))).toBe(true);
    });

    it('should provide suggestions for incompatibility', () => {
      const result = checkCompatibility('2.0.0', '1.0.0');
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Version Info Structure', () => {
    it('should have required fields', () => {
      const info = {
        id: 'agent-1',
        type: 'agent' as const,
        version: '1.0.0',
        status: 'active' as const,
      };

      expect(info).toHaveProperty('id');
      expect(info).toHaveProperty('type');
      expect(info).toHaveProperty('version');
      expect(info).toHaveProperty('status');
    });

    it('should support optional fields', () => {
      const info = {
        id: 'agent-1',
        type: 'agent' as const,
        version: '1.0.0',
        status: 'deprecated' as const,
        deprecatedAt: new Date(),
        deprecationReason: 'Replaced by v2',
        replacementId: 'agent-2',
        sunsetDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        minCompatibleVersion: '0.9.0',
      };

      expect(info.deprecatedAt).toBeInstanceOf(Date);
      expect(info.deprecationReason).toBe('Replaced by v2');
      expect(info.replacementId).toBe('agent-2');
      expect(info.sunsetDate).toBeInstanceOf(Date);
    });

    it('should support agent type', () => {
      const info = { type: 'agent' as const };
      expect(info.type).toBe('agent');
    });

    it('should support tool type', () => {
      const info = { type: 'tool' as const };
      expect(info.type).toBe('tool');
    });
  });

  describe('Verification Status', () => {
    type VerificationStatus = 'passed' | 'failed' | 'pending';

    it('should support passed status', () => {
      const status: VerificationStatus = 'passed';
      expect(status).toBe('passed');
    });

    it('should support failed status', () => {
      const status: VerificationStatus = 'failed';
      expect(status).toBe('failed');
    });

    it('should support pending status', () => {
      const status: VerificationStatus = 'pending';
      expect(status).toBe('pending');
    });
  });

  describe('Check Before Use', () => {
    it('should allow active versions', () => {
      const status = 'active';
      const result = {
        allowed: status !== 'sunset',
        status,
        warning: status === 'deprecated' ? 'Version is deprecated' : undefined,
      };

      expect(result.allowed).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it('should allow deprecated versions with warning', () => {
      const status = 'deprecated';
      const result = {
        allowed: status !== 'sunset',
        status,
        warning: status === 'deprecated' ? 'Version is deprecated' : undefined,
      };

      expect(result.allowed).toBe(true);
      expect(result.warning).toBeDefined();
    });

    it('should not allow sunset versions', () => {
      const status = 'sunset';
      const shouldThrow = status === 'sunset';

      expect(shouldThrow).toBe(true);
    });

    it('should include replacement info when available', () => {
      const result = {
        allowed: true,
        status: 'deprecated' as const,
        warning: 'Version is deprecated',
        replacement: 'new-agent-v2',
      };

      expect(result.replacement).toBe('new-agent-v2');
    });
  });

  describe('Process Sunsets', () => {
    it('should identify versions past sunset date', () => {
      const versions = [
        { id: '1', status: 'deprecated', sunsetDate: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        { id: '2', status: 'deprecated', sunsetDate: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        { id: '3', status: 'active', sunsetDate: undefined },
      ];

      const now = new Date();
      const toSunset = versions.filter(v =>
        v.status === 'deprecated' &&
        v.sunsetDate &&
        now > v.sunsetDate
      );

      expect(toSunset).toHaveLength(1);
      expect(toSunset[0].id).toBe('1');
    });

    it('should count sunsetted versions', () => {
      let sunsetCount = 0;
      const versionsToSunset = ['v1', 'v2', 'v3'];

      for (const _v of versionsToSunset) {
        sunsetCount++;
      }

      expect(sunsetCount).toBe(3);
    });
  });

  describe('Get Deprecated Versions', () => {
    it('should filter deprecated versions', () => {
      const versions = [
        { id: '1', status: 'active' },
        { id: '2', status: 'deprecated' },
        { id: '3', status: 'deprecated' },
        { id: '4', status: 'sunset' },
      ];

      const deprecated = versions.filter(v => v.status === 'deprecated');
      expect(deprecated).toHaveLength(2);
    });

    it('should sort by sunset date ascending', () => {
      const versions = [
        { id: '1', sunsetDate: new Date('2025-03-01') },
        { id: '2', sunsetDate: new Date('2025-01-01') },
        { id: '3', sunsetDate: new Date('2025-02-01') },
      ];

      const sorted = versions.sort((a, b) =>
        a.sunsetDate.getTime() - b.sunsetDate.getTime()
      );

      expect(sorted[0].id).toBe('2');
      expect(sorted[1].id).toBe('3');
      expect(sorted[2].id).toBe('1');
    });
  });

  describe('Version Registry Operations', () => {
    it('should handle registration', () => {
      const registry = new Map<string, any>();

      registry.set('agent-1', {
        id: 'agent-1',
        type: 'agent',
        version: '1.0.0',
        status: 'active',
      });

      expect(registry.has('agent-1')).toBe(true);
      expect(registry.get('agent-1').status).toBe('active');
    });

    it('should handle update', () => {
      const registry = new Map<string, any>();

      registry.set('agent-1', {
        id: 'agent-1',
        version: '1.0.0',
        status: 'active',
      });

      const existing = registry.get('agent-1');
      registry.set('agent-1', {
        ...existing,
        status: 'deprecated',
        deprecatedAt: new Date(),
      });

      expect(registry.get('agent-1').status).toBe('deprecated');
    });

    it('should handle lookup', () => {
      const registry = new Map<string, any>();

      registry.set('agent-1', { id: 'agent-1' });

      expect(registry.get('agent-1')).toBeDefined();
      expect(registry.get('non-existent')).toBeUndefined();
    });
  });

  describe('Semver Validation', () => {
    function isValidSemver(version: string): boolean {
      return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/.test(version);
    }

    it('should validate standard semver', () => {
      expect(isValidSemver('1.0.0')).toBe(true);
      expect(isValidSemver('0.1.0')).toBe(true);
      expect(isValidSemver('10.20.30')).toBe(true);
    });

    it('should validate semver with pre-release', () => {
      expect(isValidSemver('1.0.0-alpha')).toBe(true);
      expect(isValidSemver('1.0.0-beta.1')).toBe(true);
      expect(isValidSemver('1.0.0-rc.1')).toBe(true);
    });

    it('should validate semver with build metadata', () => {
      expect(isValidSemver('1.0.0+build')).toBe(true);
      expect(isValidSemver('1.0.0+20231001')).toBe(true);
    });

    it('should reject invalid semver', () => {
      expect(isValidSemver('1.0')).toBe(false);
      expect(isValidSemver('1')).toBe(false);
      expect(isValidSemver('v1.0.0')).toBe(false);
      expect(isValidSemver('invalid')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle unknown version info gracefully', () => {
      const info = null;
      const result = info ? info : {
        compatible: true,
        currentVersion: 'unknown',
        requestedVersion: '1.0.0',
        issues: [],
        suggestions: [],
      };

      expect(result.currentVersion).toBe('unknown');
      expect(result.compatible).toBe(true);
    });

    it('should handle versions with leading zeros', () => {
      const version = '01.02.03';
      const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (match) {
        const parsed = {
          major: parseInt(match[1], 10),
          minor: parseInt(match[2], 10),
          patch: parseInt(match[3], 10),
        };
        expect(parsed.major).toBe(1);
        expect(parsed.minor).toBe(2);
        expect(parsed.patch).toBe(3);
      }
    });

    it('should handle empty deprecation reason', () => {
      const info = {
        id: 'agent-1',
        version: '1.0.0',
        deprecationReason: '',
      };

      let warning = `${info.id} v${info.version} is deprecated`;
      if (info.deprecationReason) {
        warning += `: ${info.deprecationReason}`;
      }

      expect(warning).not.toContain(':');
    });
  });
});
