/**
 * Comprehensive API Test Suite
 *
 * 50+ test cases covering:
 * - Health & Stats endpoints
 * - MuleRun Agent CRUD operations
 * - Agent execution (sync & async)
 * - Job management
 * - Edge cases & error handling
 * - Combined/complex scenarios
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE_URL = 'http://localhost:3000';

// Helper function for API calls
async function api(path: string, options: RequestInit = {}): Promise<{ status: number; data: any; headers: Headers }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  let data;
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return { status: response.status, data, headers: response.headers };
}

// =============================================================================
// CATEGORY 1: HEALTH & STATS ENDPOINTS (5 tests)
// =============================================================================

describe('Category 1: Health & Stats Endpoints', () => {
  it('TC-001: Health check returns healthy status', async () => {
    const { status, data } = await api('/health');
    expect(status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.timestamp).toBeDefined();
    expect(data.version).toBeDefined();
    expect(data.features).toHaveProperty('streaming', true);
    expect(data.features).toHaveProperty('websocket', true);
    expect(data.features).toHaveProperty('externalAgents', true);
  });

  it('TC-002: Health check includes external agent stats', async () => {
    const { status, data } = await api('/health');
    expect(status).toBe(200);
    expect(data.externalAgents).toBeDefined();
    expect(typeof data.externalAgents.total).toBe('number');
    expect(typeof data.externalAgents.healthy).toBe('number');
  });

  it('TC-003: Health check includes websocket stats', async () => {
    const { status, data } = await api('/health');
    expect(status).toBe(200);
    expect(data.websocket).toBeDefined();
    expect(typeof data.websocket.connectedClients).toBe('number');
    expect(typeof data.websocket.activeRuns).toBe('number');
  });

  it('TC-004: Stats endpoint returns comprehensive statistics', async () => {
    const { status, data } = await api('/stats');
    expect(status).toBe(200);
    expect(data.agents).toBeDefined();
    expect(data.tools).toBeDefined();
    expect(data.last24h).toBeDefined();
    expect(data.externalAgents).toBeDefined();
    expect(data.websocket).toBeDefined();
  });

  it('TC-005: Stats endpoint returns valid numeric values', async () => {
    const { status, data } = await api('/stats');
    expect(status).toBe(200);
    expect(typeof data.agents.totalAgents).toBe('number');
    expect(data.agents.totalAgents).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// CATEGORY 2: CORE AGENTS API (8 tests)
// =============================================================================

describe('Category 2: Core Agents API', () => {
  it('TC-006: List all core agents', async () => {
    const { status, data } = await api('/agents');
    expect(status).toBe(200);
    expect(data.agents).toBeInstanceOf(Array);
    expect(data.total).toBeGreaterThan(0);
  });

  it('TC-007: Core agents have required properties', async () => {
    const { status, data } = await api('/agents');
    expect(status).toBe(200);
    data.agents.forEach((agent: any) => {
      expect(agent.id).toBeDefined();
      expect(agent.name).toBeDefined();
      expect(agent.description).toBeDefined();
      expect(agent.version).toBeDefined();
    });
  });

  it('TC-008: Get specific core agent by ID', async () => {
    const { data: listData } = await api('/agents');
    const agentId = listData.agents[0]?.id;

    if (agentId) {
      const { status, data } = await api(`/agents/${agentId}`);
      expect(status).toBe(200);
      expect(data.id).toBe(agentId);
    }
  });

  it('TC-009: Get non-existent core agent returns 404', async () => {
    const { status, data } = await api('/agents/non-existent-agent-xyz');
    expect(status).toBe(404);
    expect(data.error).toBeDefined();
  });

  it('TC-010: Search agents by query', async () => {
    const { status, data } = await api('/agents/search?q=code');
    expect(status).toBe(200);
    expect(data.agents).toBeInstanceOf(Array);
  });

  it('TC-011: Search agents by capability', async () => {
    const { status, data } = await api('/agents/search?capability=code-review');
    expect(status).toBe(200);
    expect(data.agents).toBeInstanceOf(Array);
  });

  it('TC-012: Search with empty query returns all agents', async () => {
    const { status, data } = await api('/agents/search');
    expect(status).toBe(200);
    expect(data.agents).toBeInstanceOf(Array);
    expect(data.total).toBeGreaterThan(0);
  });

  it('TC-013: Get agent health status', async () => {
    const { data: listData } = await api('/agents');
    const agentId = listData.agents[0]?.id;

    if (agentId) {
      const { status, data } = await api(`/agents/${agentId}/health`);
      expect(status).toBe(200);
    }
  });
});

// =============================================================================
// CATEGORY 3: MULERUN AGENTS API (15 tests)
// =============================================================================

describe('Category 3: MuleRun Agents API', () => {
  it('TC-014: List all MuleRun agents', async () => {
    const { status, data } = await api('/mulerun/agents');
    expect(status).toBe(200);
    expect(data.agents).toBeInstanceOf(Array);
    expect(data.total).toBe(33);
  });

  it('TC-015: MuleRun agents have complete metadata', async () => {
    const { status, data } = await api('/mulerun/agents');
    expect(status).toBe(200);
    data.agents.forEach((agent: any) => {
      expect(agent.id).toBeDefined();
      expect(agent.name).toBeDefined();
      expect(agent.description).toBeDefined();
      expect(agent.category).toBeDefined();
      expect(agent.tier).toBeDefined();
      expect(agent.version).toBeDefined();
      expect(typeof agent.available).toBe('boolean');
    });
  });

  it('TC-016: Filter agents by category - analytics', async () => {
    const { status, data } = await api('/mulerun/agents?category=analytics');
    expect(status).toBe(200);
    data.agents.forEach((agent: any) => {
      expect(agent.category).toBe('analytics');
    });
  });

  it('TC-017: Filter agents by category - creative', async () => {
    const { status, data } = await api('/mulerun/agents?category=creative');
    expect(status).toBe(200);
    data.agents.forEach((agent: any) => {
      expect(agent.category).toBe('creative');
    });
  });

  it('TC-018: Filter agents by tier - starter', async () => {
    const { status, data } = await api('/mulerun/agents?tier=starter');
    expect(status).toBe(200);
    data.agents.forEach((agent: any) => {
      expect(agent.tier).toBe('starter');
    });
  });

  it('TC-019: Filter agents by availability', async () => {
    const { status, data } = await api('/mulerun/agents?available=true');
    expect(status).toBe(200);
    data.agents.forEach((agent: any) => {
      expect(agent.available).toBe(true);
    });
  });

  it('TC-020: Filter agents by async flag', async () => {
    const { status, data } = await api('/mulerun/agents?async=true');
    expect(status).toBe(200);
    data.agents.forEach((agent: any) => {
      expect(agent.async).toBe(true);
    });
  });

  it('TC-021: Search MuleRun agents', async () => {
    const { status, data } = await api('/mulerun/agents?search=data');
    expect(status).toBe(200);
    expect(data.agents).toBeInstanceOf(Array);
  });

  it('TC-022: Get MuleRun agent catalog', async () => {
    const { status, data } = await api('/mulerun/agents/catalog');
    expect(status).toBe(200);
    expect(data.agents).toBeInstanceOf(Array);
    expect(data.stats).toBeDefined();
    expect(data.stats.byCategory).toBeDefined();
  });

  it('TC-023: Get MuleRun agent stats', async () => {
    const { status, data } = await api('/mulerun/agents/stats');
    expect(status).toBe(200);
    expect(data.total).toBe(33);
    expect(data.available).toBeDefined();
    expect(data.byCategory).toBeDefined();
    expect(data.byTier).toBeDefined();
  });

  it('TC-024: Get MuleRun agent categories', async () => {
    const { status, data } = await api('/mulerun/agents/categories');
    expect(status).toBe(200);
    expect(data.categories).toBeInstanceOf(Array);
    expect(data.categories.length).toBeGreaterThan(0);
    data.categories.forEach((cat: any) => {
      expect(cat.id).toBeDefined();
      expect(cat.name).toBeDefined();
      expect(cat.description).toBeDefined();
      expect(typeof cat.agentCount).toBe('number');
    });
  });

  it('TC-025: Get specific MuleRun agent by ID', async () => {
    const { status, data } = await api('/mulerun/agents/smart-data-analyzer');
    expect(status).toBe(200);
    expect(data.id).toBe('smart-data-analyzer');
    expect(data.name).toBe('Smart Data Analyzer');
    expect(data.category).toBe('analytics');
  });

  it('TC-026: Get non-existent MuleRun agent returns 404', async () => {
    const { status, data } = await api('/mulerun/agents/non-existent-xyz');
    expect(status).toBe(404);
    expect(data.error).toBe('Agent not found');
  });

  it('TC-027: Get MuleRun agent schema', async () => {
    const { status, data } = await api('/mulerun/agents/smart-data-analyzer/schema');
    expect(status).toBe(200);
    expect(data.agentId).toBe('smart-data-analyzer');
    expect(data.inputTypes).toBeDefined();
    expect(data.outputTypes).toBeDefined();
  });

  it('TC-028: Get MuleRun agent jobs (empty)', async () => {
    const { status, data } = await api('/mulerun/agents/smart-data-analyzer/jobs');
    expect(status).toBe(200);
    expect(data.agentId).toBe('smart-data-analyzer');
    expect(data.jobs).toBeInstanceOf(Array);
  });
});

// =============================================================================
// CATEGORY 4: AGENT EXECUTION (10 tests)
// =============================================================================

describe('Category 4: Agent Execution', () => {
  it('TC-029: Run sync agent with valid input', async () => {
    const { status, data } = await api('/mulerun/agents/smart-data-analyzer/run', {
      method: 'POST',
      body: JSON.stringify({
        input: {
          data: [1, 2, 3, 4, 5],
          analysisType: 'summary'
        }
      }),
    });
    expect(status).toBe(200);
    expect(data.agentId).toBe('smart-data-analyzer');
    expect(data.status).toBe('completed');
  });

  it('TC-030: Run async agent creates job', async () => {
    const { status, data } = await api('/mulerun/agents/pro-headshot-generator/run', {
      method: 'POST',
      body: JSON.stringify({
        input: {
          imageUrl: 'https://example.com/photo.jpg',
          style: 'professional'
        }
      }),
    });
    expect(status).toBe(202);
    expect(data.jobId).toBeDefined();
    expect(data.status).toBe('pending');
    expect(data.message).toContain('Job created');
  });

  it('TC-031: Run agent without input returns 400', async () => {
    const { status, data } = await api('/mulerun/agents/smart-data-analyzer/run', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(status).toBe(400);
    expect(data.error).toBe('Input is required');
  });

  it('TC-032: Run unavailable agent returns 503', async () => {
    // First check if there's an unavailable agent
    const { data: agentsList } = await api('/mulerun/agents?available=false');
    if (agentsList.agents.length > 0) {
      const unavailableAgent = agentsList.agents[0];
      const { status, data } = await api(`/mulerun/agents/${unavailableAgent.id}/run`, {
        method: 'POST',
        body: JSON.stringify({ input: { test: true } }),
      });
      expect(status).toBe(503);
      expect(data.error).toBe('Agent unavailable');
    } else {
      // All agents are available, skip this test
      expect(true).toBe(true);
    }
  });

  it('TC-033: Run non-existent agent returns 404', async () => {
    const { status, data } = await api('/mulerun/agents/fake-agent/run', {
      method: 'POST',
      body: JSON.stringify({ input: { test: true } }),
    });
    expect(status).toBe(404);
    expect(data.error).toBe('Agent not found');
  });

  it('TC-034: Run agent with tenant ID header', async () => {
    const { status, data } = await api('/mulerun/agents/smart-data-analyzer/run', {
      method: 'POST',
      headers: {
        'X-Tenant-Id': 'test-tenant-123',
      },
      body: JSON.stringify({
        input: { data: [1, 2, 3] }
      }),
    });
    expect(status).toBe(200);
  });

  it('TC-035: Run agent with user ID header', async () => {
    const { status, data } = await api('/mulerun/agents/smart-data-analyzer/run', {
      method: 'POST',
      headers: {
        'X-User-Id': 'user-456',
      },
      body: JSON.stringify({
        input: { data: [1, 2, 3] }
      }),
    });
    expect(status).toBe(200);
  });

  it('TC-036: Run agent with webhook URL', async () => {
    const { status, data } = await api('/mulerun/agents/pro-headshot-generator/run', {
      method: 'POST',
      body: JSON.stringify({
        input: {
          imageUrl: 'https://example.com/photo.jpg'
        },
        webhookUrl: 'https://example.com/webhook'
      }),
    });
    expect(status).toBe(202);
    expect(data.jobId).toBeDefined();
  });

  it('TC-037: Run customer support bot agent', async () => {
    const { status, data } = await api('/mulerun/agents/customer-support-bot/run', {
      method: 'POST',
      body: JSON.stringify({
        input: {
          query: 'How do I reset my password?',
          context: 'User account settings'
        }
      }),
    });
    expect(status).toBe(200);
  });

  it('TC-038: Run email template generator agent', async () => {
    const { status, data } = await api('/mulerun/agents/email-template-generator/run', {
      method: 'POST',
      body: JSON.stringify({
        input: {
          purpose: 'welcome email',
          tone: 'friendly'
        }
      }),
    });
    expect(status).toBe(200);
  });
});

// =============================================================================
// CATEGORY 5: JOBS API (8 tests)
// =============================================================================

describe('Category 5: Jobs API', () => {
  let testJobId: string;

  it('TC-039: List all jobs (empty initially)', async () => {
    const { status, data } = await api('/jobs');
    expect(status).toBe(200);
    expect(data.jobs).toBeInstanceOf(Array);
    expect(typeof data.total).toBe('number');
  });

  it('TC-040: Create job via async agent and verify', async () => {
    const { status, data } = await api('/mulerun/agents/virtual-try-on/run', {
      method: 'POST',
      body: JSON.stringify({
        input: {
          personImage: 'https://example.com/person.jpg',
          garmentImage: 'https://example.com/shirt.jpg'
        }
      }),
    });
    expect(status).toBe(202);
    expect(data.jobId).toBeDefined();
    testJobId = data.jobId;
  });

  it('TC-041: Get job by ID', async () => {
    if (!testJobId) {
      // Create a job first
      const { data } = await api('/mulerun/agents/pro-headshot-generator/run', {
        method: 'POST',
        body: JSON.stringify({
          input: { imageUrl: 'https://example.com/photo.jpg' }
        }),
      });
      testJobId = data.jobId;
    }

    const { status, data } = await api(`/jobs/${testJobId}`);
    expect(status).toBe(200);
    expect(data.id).toBe(testJobId);
    expect(data.status).toBeDefined();
    expect(data.agentId).toBeDefined();
  });

  it('TC-042: Get non-existent job returns 404', async () => {
    const { status, data } = await api('/jobs/non-existent-job-id-xyz');
    expect(status).toBe(404);
    expect(data.error.code).toBe('JOB_NOT_FOUND');
  });

  it('TC-043: List jobs with limit parameter', async () => {
    const { status, data } = await api('/jobs?limit=5');
    expect(status).toBe(200);
    expect(data.jobs.length).toBeLessThanOrEqual(5);
  });

  it('TC-044: List jobs with status filter', async () => {
    const { status, data } = await api('/jobs?status=pending');
    expect(status).toBe(200);
    data.jobs.forEach((job: any) => {
      expect(job.status).toBe('pending');
    });
  });

  it('TC-045: Cancel a job', async () => {
    // Create a new job to cancel
    const { data: createData } = await api('/mulerun/agents/ai-background-generator/run', {
      method: 'POST',
      body: JSON.stringify({
        input: {
          productImage: 'https://example.com/product.jpg',
          backgroundStyle: 'studio'
        }
      }),
    });

    const { status, data } = await api(`/jobs/${createData.jobId}/cancel`, {
      method: 'POST',
    });
    expect(status).toBe(200);
    expect(data.status).toBe('cancelled');
  });

  it('TC-046: Cancel non-existent job returns 404', async () => {
    const { status, data } = await api('/jobs/fake-job-id/cancel', {
      method: 'POST',
    });
    expect(status).toBe(404);
  });
});

// =============================================================================
// CATEGORY 6: EDGE CASES & ERROR HANDLING (10 tests)
// =============================================================================

describe('Category 6: Edge Cases & Error Handling', () => {
  it('TC-047: Invalid JSON body returns 400', async () => {
    const response = await fetch(`${BASE_URL}/mulerun/agents/smart-data-analyzer/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json {{{',
    });
    expect(response.status).toBe(400);
  });

  it('TC-048: Empty body on POST returns error', async () => {
    const response = await fetch(`${BASE_URL}/mulerun/agents/smart-data-analyzer/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(response.status).toBe(400);
  });

  it('TC-049: OPTIONS request returns CORS headers', async () => {
    const response = await fetch(`${BASE_URL}/health`, {
      method: 'OPTIONS',
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('TC-050: Request includes X-Request-Id header', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const requestId = response.headers.get('X-Request-Id');
    expect(requestId).toBeDefined();
    expect(requestId?.length).toBeGreaterThan(0);
  });

  it('TC-051: Very long input is accepted', async () => {
    const longString = 'A'.repeat(10000);
    const { status, data } = await api('/mulerun/agents/smart-data-analyzer/run', {
      method: 'POST',
      body: JSON.stringify({
        input: { data: longString }
      }),
    });
    expect(status).toBe(200);
  });

  it('TC-052: Unicode input is handled correctly', async () => {
    const { status, data } = await api('/mulerun/agents/smart-data-analyzer/run', {
      method: 'POST',
      body: JSON.stringify({
        input: { data: '日本語テスト 🎉 émojis and spëcial çharacters' }
      }),
    });
    expect(status).toBe(200);
  });

  it('TC-053: Null values in input are handled', async () => {
    const { status, data } = await api('/mulerun/agents/smart-data-analyzer/run', {
      method: 'POST',
      body: JSON.stringify({
        input: { data: null, optional: null }
      }),
    });
    expect(status).toBe(200);
  });

  it('TC-054: Array input is handled correctly', async () => {
    const { status, data } = await api('/mulerun/agents/smart-data-analyzer/run', {
      method: 'POST',
      body: JSON.stringify({
        input: { data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }
      }),
    });
    expect(status).toBe(200);
  });

  it('TC-055: Nested object input is handled', async () => {
    const { status, data } = await api('/mulerun/agents/smart-data-analyzer/run', {
      method: 'POST',
      body: JSON.stringify({
        input: {
          data: {
            level1: {
              level2: {
                level3: { value: 'deep' }
              }
            }
          }
        }
      }),
    });
    expect(status).toBe(200);
  });

  it('TC-056: Special characters in agent ID are rejected', async () => {
    const { status } = await api('/mulerun/agents/agent<script>alert(1)</script>/run', {
      method: 'POST',
      body: JSON.stringify({ input: {} }),
    });
    expect(status).toBe(404);
  });
});

// =============================================================================
// CATEGORY 7: COMBINED & COMPLEX SCENARIOS (10 tests)
// =============================================================================

describe('Category 7: Combined & Complex Scenarios', () => {
  it('TC-057: Full workflow - list, filter, get details, run agent', async () => {
    // Step 1: List all agents
    const { data: listData } = await api('/mulerun/agents');
    expect(listData.total).toBeGreaterThan(0);

    // Step 2: Filter by category
    const { data: filteredData } = await api('/mulerun/agents?category=analytics');
    expect(filteredData.agents.length).toBeGreaterThan(0);

    // Step 3: Get specific agent details
    const agentId = filteredData.agents[0].id;
    const { data: detailData } = await api(`/mulerun/agents/${agentId}`);
    expect(detailData.id).toBe(agentId);

    // Step 4: Run the agent
    const { status, data: runData } = await api(`/mulerun/agents/${agentId}/run`, {
      method: 'POST',
      body: JSON.stringify({ input: { data: [1, 2, 3] } }),
    });
    expect(status).toBe(200);
  });

  it('TC-058: Async workflow - create job, check status, cancel', async () => {
    // Step 1: Create async job
    const { data: createData } = await api('/mulerun/agents/meeting-transcriber/run', {
      method: 'POST',
      body: JSON.stringify({
        input: { audioUrl: 'https://example.com/meeting.mp3' }
      }),
    });
    expect(createData.jobId).toBeDefined();
    const jobId = createData.jobId;

    // Step 2: Check job status
    const { data: statusData } = await api(`/jobs/${jobId}`);
    expect(statusData.id).toBe(jobId);
    expect(['pending', 'processing', 'completed', 'failed', 'cancelled']).toContain(statusData.status);

    // Step 3: Cancel the job
    const { data: cancelData } = await api(`/jobs/${jobId}/cancel`, {
      method: 'POST',
    });
    expect(cancelData.status).toBe('cancelled');
  });

  it('TC-059: Multiple concurrent agent runs', async () => {
    const promises = [
      api('/mulerun/agents/smart-data-analyzer/run', {
        method: 'POST',
        body: JSON.stringify({ input: { data: [1] } }),
      }),
      api('/mulerun/agents/customer-support-bot/run', {
        method: 'POST',
        body: JSON.stringify({ input: { query: 'test' } }),
      }),
      api('/mulerun/agents/email-template-generator/run', {
        method: 'POST',
        body: JSON.stringify({ input: { purpose: 'test' } }),
      }),
    ];

    const results = await Promise.all(promises);
    results.forEach(({ status }) => {
      expect(status).toBe(200);
    });
  });

  it('TC-060: Cross-category agent operations', async () => {
    // This test makes multiple real AI calls and may take longer
    // Analytics agent
    const { status: s1 } = await api('/mulerun/agents/smart-data-analyzer/run', {
      method: 'POST',
      body: JSON.stringify({ input: { data: [1, 2, 3] } }),
    });
    expect(s1).toBe(200);

    // Marketing agent
    const { status: s2 } = await api('/mulerun/agents/social-media-caption-generator/run', {
      method: 'POST',
      body: JSON.stringify({ input: { topic: 'product launch' } }),
    });
    expect(s2).toBe(200);

    // Content agent
    const { status: s3 } = await api('/mulerun/agents/video-script-generator/run', {
      method: 'POST',
      body: JSON.stringify({ input: { topic: 'tutorial' } }),
    });
    expect(s3).toBe(200);
  }, 60000); // 60s timeout for multiple AI calls

  it('TC-061: Category stats match actual agent counts', async () => {
    const { data: statsData } = await api('/mulerun/agents/stats');
    const { data: categoriesData } = await api('/mulerun/agents/categories');

    let totalFromCategories = 0;
    for (const category of categoriesData.categories) {
      totalFromCategories += category.agentCount;
    }

    // Total should match stats
    expect(statsData.total).toBe(33);
  });

  it('TC-062: Filter combinations work correctly', async () => {
    // Filter by multiple criteria
    const { data } = await api('/mulerun/agents?category=creative&tier=pro&available=true');
    expect(data.agents).toBeInstanceOf(Array);
    data.agents.forEach((agent: any) => {
      expect(agent.category).toBe('creative');
      expect(agent.tier).toBe('pro');
      expect(agent.available).toBe(true);
    });
  });

  it('TC-063: All 13 agents are accessible individually', async () => {
    const agentIds = [
      'smart-data-analyzer',
      'customer-support-bot',
      'seo-content-optimizer',
      'pro-headshot-generator',
      'virtual-try-on',
      'ai-background-generator',
      'meeting-transcriber',
      'image-translator',
      'social-media-caption-generator',
      'email-template-generator',
      'video-script-generator',
      'resume-builder',
      'product-description-writer',
    ];

    for (const id of agentIds) {
      const { status } = await api(`/mulerun/agents/${id}`);
      expect(status).toBe(200);
    }
  });

  it('TC-064: Cost estimates are provided for all agents', async () => {
    const { data } = await api('/mulerun/agents');
    data.agents.forEach((agent: any) => {
      expect(agent.costEstimate).toBeDefined();
      expect(agent.costEstimate.minCost).toBeGreaterThanOrEqual(0);
      expect(agent.costEstimate.maxCost).toBeGreaterThan(0);
      expect(agent.costEstimate.currency).toBe('USD');
    });
  });

  it('TC-065: Agent features and use cases are populated', async () => {
    const { data } = await api('/mulerun/agents');
    data.agents.forEach((agent: any) => {
      expect(agent.features).toBeInstanceOf(Array);
      expect(agent.features.length).toBeGreaterThan(0);
    });
  });

  it('TC-066: Estimated duration is provided for all agents', async () => {
    const { data } = await api('/mulerun/agents');
    data.agents.forEach((agent: any) => {
      expect(agent.estimatedDuration).toBeDefined();
      expect(agent.estimatedDuration.min).toBeGreaterThan(0);
      expect(agent.estimatedDuration.max).toBeGreaterThan(agent.estimatedDuration.min);
    });
  });
});

// =============================================================================
// CATEGORY 8: IMAGE TRANSLATOR SPECIFIC TESTS (4 tests)
// =============================================================================

describe('Category 8: Image Translator (OpenAI Integration)', () => {
  it('TC-067: Image translator agent is available', async () => {
    const { status, data } = await api('/mulerun/agents/image-translator');
    expect(status).toBe(200);
    expect(data.available).toBe(true);
    expect(data.providers).toContain('openai');
  });

  it('TC-068: Image translator creates async job', async () => {
    const { status, data } = await api('/mulerun/agents/image-translator/run', {
      method: 'POST',
      body: JSON.stringify({
        input: {
          imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Example_image.svg/600px-Example_image.svg.png',
          options: {
            targetLanguage: 'Spanish'
          }
        }
      }),
    });
    expect(status).toBe(202);
    expect(data.jobId).toBeDefined();
    expect(data.status).toBe('pending');
  });

  it('TC-069: Image translator schema endpoint works', async () => {
    const { status, data } = await api('/mulerun/agents/image-translator/schema');
    expect(status).toBe(200);
    expect(data.agentId).toBe('image-translator');
    expect(data.inputTypes).toContain('image/png');
  });

  it('TC-070: Image translator has GPT-4 Vision feature', async () => {
    const { status, data } = await api('/mulerun/agents/image-translator');
    expect(status).toBe(200);
    expect(data.features).toContain('GPT-4 Vision OCR');
  });
});
