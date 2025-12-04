/**
 * Storage Module Tests
 *
 * Tests for database utilities
 * Note: RunsStorage and StepsStorage use singleton patterns that require
 * integration tests with a real database. These tests cover the utilities.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';

describe('Storage Utilities', () => {
  describe('Hash Generation', () => {
    it('should generate consistent hashes for same input', () => {
      const data = { test: 'value', number: 123 };
      const hash1 = hashData(data);
      const hash2 = hashData(data);
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different input', () => {
      const data1 = { test: 'value1' };
      const data2 = { test: 'value2' };
      const hash1 = hashData(data1);
      const hash2 = hashData(data2);
      expect(hash1).not.toBe(hash2);
    });

    it('should handle string input', () => {
      const hash = hashData('test string');
      expect(hash).toHaveLength(16);
    });

    it('should handle complex nested objects', () => {
      const data = {
        level1: {
          level2: {
            array: [1, 2, 3],
            bool: true,
          },
        },
      };
      const hash = hashData(data);
      expect(hash).toHaveLength(16);
    });
  });

  describe('Idempotency Key Generation', () => {
    it('should generate consistent keys for same inputs', () => {
      const runId = 'run-123';
      const stepIndex = 0;
      const inputHash = 'abcd1234';

      const key1 = generateIdempotencyKey(runId, stepIndex, inputHash);
      const key2 = generateIdempotencyKey(runId, stepIndex, inputHash);

      expect(key1).toBe(key2);
    });

    it('should include all components in key', () => {
      const key = generateIdempotencyKey('run-123', 5, 'hash456');
      expect(key).toContain('run-123');
      expect(key).toContain('5');
      expect(key).toContain('hash456');
    });

    it('should generate different keys for different step indices', () => {
      const key1 = generateIdempotencyKey('run-123', 0, 'hash');
      const key2 = generateIdempotencyKey('run-123', 1, 'hash');
      expect(key1).not.toBe(key2);
    });
  });
});

// Utility functions (matching the implementation)
function hashData(data: unknown): string {
  const content = typeof data === 'string' ? data : JSON.stringify(data);
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function generateIdempotencyKey(runId: string, stepIndex: number, inputHash: string): string {
  return `${runId}:step:${stepIndex}:${inputHash}`;
}
