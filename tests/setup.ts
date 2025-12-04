/**
 * Test Setup
 *
 * Global test configuration and utilities
 */

import { beforeAll, afterAll } from 'vitest';

// Ensure crypto is available in test environment
beforeAll(() => {
  if (typeof globalThis.crypto === 'undefined') {
    // @ts-ignore - polyfill for older Node versions
    globalThis.crypto = require('crypto').webcrypto;
  }
});

// Clean up any resources after all tests
afterAll(() => {
  // Add any global cleanup here
});

// Test utilities
export function createTestBudget(overrides = {}) {
  return {
    maxTokens: 100000,
    maxCostUsd: 1.00,
    maxDurationMs: 60000,
    maxSteps: 10,
    maxToolCalls: 50,
    allowModelDowngrade: true,
    ...overrides,
  };
}

export function createTestAgentCard(overrides = {}) {
  return {
    id: `test-agent-${Date.now()}`,
    name: 'Test Agent',
    description: 'A test agent for testing purposes',
    version: '1.0.0',
    author: 'test-author',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', properties: {} },
    defaultModel: 'claude-sonnet-4-5-20250514',
    capabilities: ['testing'],
    tags: ['test'],
    ...overrides,
  };
}

export function createTestTool(overrides = {}) {
  return {
    name: `test-tool-${Date.now()}`,
    version: '1.0.0',
    description: 'A test tool for testing purposes',
    inputSchema: { type: 'object', properties: {} },
    defer_loading: false,
    allowed_callers: ['human'],
    idempotent: true,
    sideEffectful: false,
    scopes: [],
    allowlistedDomains: [],
    timeoutMs: 30000,
    ...overrides,
  };
}

export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomId(): string {
  return crypto.randomUUID();
}
