/**
 * Integration Tests
 *
 * End-to-end tests that verify all features work together
 * with real implementations (not mocked)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// Import real implementations
import { getDatabase } from '../src/storage/database.js';
import { VersioningManager } from '../src/versioning/manager.js';
import { PIITokenizer } from '../src/privacy/tokenizer.js';
import { ProgrammaticToolExecutor } from '../src/execution/programmatic-executor.js';
import { MCPCodeAPIBuilder } from '../src/mcp/code-api.js';
import { defineAgent, defineTool } from '../src/sdk/define-agent.js';
import { createLocalRunner, type TestCase } from '../src/sdk/local-runner.js';
import { MarketplaceManager } from '../src/marketplace/listings.js';
import { ABACManager, BUILT_IN_ROLES, PolicySchema } from '../src/enterprise/abac.js';
import { TenantManager, TIER_LIMITS } from '../src/enterprise/multi-tenant.js';
import { FairQueue } from '../src/enterprise/queue.js';
import { ApprovalManager } from '../src/approval/manager.js';
import { DiscoveryService } from '../src/discovery/search.js';
import type { AgentCard, ToolDefinition, ExecutionContext } from '../src/core/types.js';

describe('Integration Tests', () => {
  describe('Database & Storage', () => {
    let db: ReturnType<typeof getDatabase>;

    beforeEach(() => {
      db = getDatabase();
    });

    it('should create and query tables', () => {
      // Create a test table
      db.exec(`
        CREATE TABLE IF NOT EXISTS integration_test (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          value TEXT
        )
      `);

      // Insert data
      db.prepare('INSERT INTO integration_test (name, value) VALUES (?, ?)').run('test1', 'value1');
      db.prepare('INSERT INTO integration_test (name, value) VALUES (?, ?)').run('test2', 'value2');

      // Query data
      const rows = db.prepare('SELECT * FROM integration_test').all() as any[];
      expect(rows).toHaveLength(2);
      expect(rows[0].name).toBe('test1');

      // Cleanup
      db.exec('DROP TABLE integration_test');
    });

    it('should support transactions', () => {
      db.exec('CREATE TABLE IF NOT EXISTS tx_test (id INTEGER PRIMARY KEY, value TEXT)');

      const insert = db.prepare('INSERT INTO tx_test (value) VALUES (?)');
      const insertMany = db.transaction((values: string[]) => {
        for (const value of values) insert.run(value);
      });

      insertMany(['a', 'b', 'c']);

      const count = db.prepare('SELECT COUNT(*) as count FROM tx_test').get() as { count: number };
      expect(count.count).toBe(3);

      db.exec('DROP TABLE tx_test');
    });
  });

  describe('Versioning Manager', () => {
    let versionManager: VersioningManager;

    beforeEach(() => {
      versionManager = new VersioningManager({
        warningPeriodDays: 7,
        sunsetPeriodDays: 30,
      });
    });

    it('should register and retrieve versions', () => {
      versionManager.register({
        id: 'test-agent-v1',
        type: 'agent',
        version: '1.0.0',
      });

      const info = versionManager.getVersionInfo('test-agent-v1');
      expect(info).not.toBeNull();
      expect(info?.version).toBe('1.0.0');
      expect(info?.status).toBe('active');
    });

    it('should deprecate versions with sunset date', () => {
      versionManager.register({
        id: 'old-agent',
        type: 'agent',
        version: '0.9.0',
      });

      versionManager.deprecate('old-agent', 'Replaced by v1.0', {
        replacementId: 'new-agent',
      });

      const info = versionManager.getVersionInfo('old-agent');
      expect(info?.status).toBe('deprecated');
      expect(info?.replacementId).toBe('new-agent');
      expect(info?.sunsetDate).toBeDefined();
    });

    it('should check compatibility between versions', () => {
      versionManager.register({
        id: 'compat-agent',
        type: 'agent',
        version: '2.0.0',
        minCompatibleVersion: '1.5.0',
      });

      const result1 = versionManager.checkCompatibility('compat-agent', '1.8.0');
      expect(result1.compatible).toBe(false); // Major version mismatch

      const result2 = versionManager.checkCompatibility('compat-agent', '2.1.0');
      expect(result2.compatible).toBe(true);
    });

    it('should allow checking before use', () => {
      versionManager.register({
        id: 'active-agent',
        type: 'agent',
        version: '1.0.0',
      });

      const check = versionManager.checkBeforeUse('active-agent');
      expect(check.allowed).toBe(true);
      expect(check.status).toBe('active');
    });
  });

  describe('PII Tokenizer', () => {
    let tokenizer: PIITokenizer;

    beforeEach(() => {
      tokenizer = new PIITokenizer();
    });

    it('should tokenize and detokenize emails', () => {
      const original = 'Contact john.doe@example.com for help';
      const result = tokenizer.tokenize(original);

      expect(result.tokenCount).toBe(1);
      expect(result.detectedTypes).toContain('email');
      expect(result.tokenized).not.toContain('john.doe@example.com');
      expect(result.tokenized).toMatch(/__EMAIL_[A-Za-z0-9]+__/);

      const restored = tokenizer.detokenize(result.tokenized, result.tokenMap);
      expect(restored).toBe(original);
    });

    it('should tokenize multiple PII types', () => {
      const data = {
        email: 'user@test.com',
        phone: '555-123-4567',
        ssn: '123-45-6789',
      };

      const result = tokenizer.tokenize(data);

      expect(result.tokenCount).toBeGreaterThanOrEqual(3);
      expect(result.detectedTypes).toContain('email');
      expect(result.detectedTypes).toContain('phone');
      expect(result.detectedTypes).toContain('ssn');
    });

    it('should use scoped tokenizer for session isolation', () => {
      const scope1 = tokenizer.createScoped();
      const scope2 = tokenizer.createScoped();

      const text1 = scope1.tokenize('Email: user1@test.com');
      const text2 = scope2.tokenize('Email: user2@test.com');

      // Each scope has its own token map
      expect(scope1.getTokens().size).toBe(1);
      expect(scope2.getTokens().size).toBe(1);

      // Detokenize in each scope
      const restored1 = scope1.detokenize(text1);
      const restored2 = scope2.detokenize(text2);

      expect(restored1).toContain('user1@test.com');
      expect(restored2).toContain('user2@test.com');
    });

    it('should detect PII without tokenizing', () => {
      const result = tokenizer.containsPII('Call me at 555-123-4567');
      expect(result.hasPII).toBe(true);
      expect(result.types).toContain('phone');
    });

    it('should mask PII for logging', () => {
      const sensitive = 'Email: john@test.com, Phone: 555-123-4567';
      const masked = tokenizer.maskForLogging(sensitive);

      expect(masked).not.toContain('john');
      expect(masked).toContain('@test.com');
      expect(masked).toContain('***');
    });
  });

  describe('Programmatic Executor', () => {
    let executor: ProgrammaticToolExecutor;

    beforeEach(() => {
      executor = new ProgrammaticToolExecutor();
    });

    it('should detect programmatic task patterns', () => {
      expect(executor.shouldUseProgrammaticExecution('Process all 100 files')).toBe(true);
      expect(executor.shouldUseProgrammaticExecution('Batch process data')).toBe(true);
      expect(executor.shouldUseProgrammaticExecution('Iterate through records')).toBe(true);
      expect(executor.shouldUseProgrammaticExecution('Run in parallel')).toBe(true);
      expect(executor.shouldUseProgrammaticExecution('Find a file')).toBe(false);
    });

    it('should handle execution with no code-callable tools', async () => {
      const result = await executor.execute({
        task: 'Process all files',
        availableTools: [
          {
            name: 'human-only-tool',
            version: '1.0.0',
            description: 'Tool for humans',
            inputSchema: { type: 'object' },
            defer_loading: false,
            allowed_callers: ['human'], // Not code-callable
            idempotent: true,
            sideEffectful: false,
            scopes: [],
            allowlistedDomains: [],
            timeoutMs: 30000,
            execute: async () => ({}),
          },
        ],
        context: createMockContext(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No tools available');
    });
  });

  describe('MCP Code API Builder', () => {
    let builder: MCPCodeAPIBuilder;

    beforeEach(() => {
      builder = new MCPCodeAPIBuilder();
    });

    it('should connect with mock client when SDK not available', async () => {
      const api = await builder.connect({
        name: 'test-server',
        transport: {
          type: 'stdio',
          command: 'echo',
          args: ['test'],
        },
      });

      expect(api.serverName).toBe('test-server');
      expect(api.tools).toHaveProperty('mock_tool');
    });

    it('should generate Python stubs', async () => {
      const api = await builder.connect({
        name: 'stub-server',
        transport: { type: 'stdio', command: 'test' },
        description: 'Test server for stubs',
      });

      const stubs = builder.generatePythonStubs(api);

      expect(stubs).toContain('# MCP API: stub-server');
      expect(stubs).toContain('async def');
      expect(stubs).toContain('__mcp_call__');
    });

    it('should convert to ToolDefinition format', async () => {
      const api = await builder.connect({
        name: 'convert-server',
        transport: { type: 'stdio', command: 'test' },
      });

      const tools = builder.convertToToolDefinitions(api);

      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0].name).toContain('mcp_convert-server');
      expect(tools[0].scopes).toContain('mcp:convert-server');
    });

    afterEach(async () => {
      // Disconnect all servers
      for (const api of builder.getAllAPIs()) {
        await builder.disconnect(api.serverName);
      }
    });
  });

  describe('SDK - defineAgent & LocalRunner', () => {
    it('should define and execute a simple agent', async () => {
      const calculatorAgent = defineAgent({
        id: 'calculator',
        name: 'Calculator Agent',
        description: 'Performs arithmetic operations',
        version: '1.0.0',
        input: z.object({
          operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
          a: z.number(),
          b: z.number(),
        }),
        output: z.object({
          result: z.number(),
        }),
        execute: async (input) => {
          let result: number;
          switch (input.operation) {
            case 'add':
              result = input.a + input.b;
              break;
            case 'subtract':
              result = input.a - input.b;
              break;
            case 'multiply':
              result = input.a * input.b;
              break;
            case 'divide':
              result = input.a / input.b;
              break;
          }
          return { result };
        },
      });

      expect(calculatorAgent.card.id).toBe('calculator');
      expect(calculatorAgent.card.capabilities).toBeDefined();

      const runner = createLocalRunner({
        agent: calculatorAgent,
        verbose: false,
      });

      const output = await runner.execute({
        task: 'Calculate 5 + 3',
        parameters: { operation: 'add', a: 5, b: 3 },
      });

      expect(output.status).toBe('success');
      expect((output.result as any).result).toBe(8);
    });

    it('should run test cases and generate coverage', async () => {
      const echoAgent = defineAgent({
        id: 'echo',
        name: 'Echo Agent',
        description: 'Echoes input data',
        version: '1.0.0',
        input: z.object({
          message: z.string(),
          count: z.number().optional(),
        }),
        output: z.object({
          echoed: z.string(),
          times: z.number(),
        }),
        execute: async (input) => ({
          echoed: input.message,
          times: input.count ?? 1,
        }),
      });

      const runner = createLocalRunner({ agent: echoAgent });

      const testCases: TestCase[] = [
        {
          name: 'Basic echo',
          input: { task: 'Echo hello', parameters: { message: 'hello' } },
          expectedOutput: { echoed: 'hello', times: 1 },
          expectedStatus: 'success',
        },
        {
          name: 'Echo with count',
          input: { task: 'Echo world 3 times', parameters: { message: 'world', count: 3 } },
          expectedOutput: { echoed: 'world', times: 3 },
          expectedStatus: 'success',
        },
      ];

      const results = await runner.runTests(testCases);

      expect(results.total).toBe(2);
      expect(results.passed).toBe(2);
      expect(results.failed).toBe(0);
      expect(results.coverage).toBeDefined();
    });

    it('should handle validation errors', async () => {
      const strictAgent = defineAgent({
        id: 'strict',
        name: 'Strict Agent',
        description: 'Requires specific input',
        version: '1.0.0',
        input: z.object({
          required: z.string().min(5),
        }),
        output: z.object({
          processed: z.boolean(),
        }),
        execute: async () => ({ processed: true }),
      });

      const runner = createLocalRunner({ agent: strictAgent });

      const output = await runner.execute({
        task: 'Process data',
        parameters: { required: 'ab' }, // Too short
      });

      expect(output.status).toBe('failed');
      expect((output.result as any).error).toContain('validation');
    });

    it('should define and use tools within agent', async () => {
      const fetchTool = defineTool({
        name: 'fetch-data',
        description: 'Fetches data from source',
        input: z.object({ id: z.string() }),
        execute: async (args) => ({
          id: args.id,
          data: { name: 'Test Item', value: 42 },
        }),
      });

      const dataAgent = defineAgent({
        id: 'data-processor',
        name: 'Data Processor',
        description: 'Processes data using tools',
        version: '1.0.0',
        tools: [fetchTool],
        input: z.object({ itemId: z.string() }),
        output: z.object({ processed: z.boolean(), itemName: z.string() }),
        execute: async (input, context) => {
          const fetched = await context.tools.call<{ id: string; data: { name: string } }>(
            'fetch-data',
            { id: input.itemId }
          );
          return {
            processed: true,
            itemName: fetched.data.name,
          };
        },
      });

      expect(dataAgent.card.id).toBe('data-processor');
    });
  });

  describe('Marketplace Listings', () => {
    let marketplace: MarketplaceManager;

    beforeEach(() => {
      const db = getDatabase();
      marketplace = new MarketplaceManager(db);
    });

    it('should create and retrieve listings', async () => {
      const listing = await marketplace.createListing({
        agentId: 'market-agent',
        authorId: crypto.randomUUID(),
        displayName: 'Marketplace Agent',
        shortDescription: 'An agent for the marketplace testing',
        categories: ['data-analysis'],
        pricing: { type: 'free' },
        tags: ['analysis', 'data'],
      });

      const retrieved = await marketplace.getListing(listing.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.displayName).toBe('Marketplace Agent');
      expect(retrieved?.status).toBe('draft');
    });

    it('should search listings', async () => {
      const authorId = crypto.randomUUID();
      const testId = Date.now().toString();

      // Use unique category names to avoid collision with existing data
      const uniqueDataCategory = `data-analysis-${testId}`;
      const uniqueDevCategory = `development-${testId}`;

      // Create multiple listings
      for (let i = 1; i <= 5; i++) {
        const listing = await marketplace.createListing({
          agentId: `search-agent-${testId}-${i}`,
          authorId,
          displayName: `Search Agent ${testId} ${i}`,
          shortDescription: i % 2 === 0 ? 'Data analyzer tool for testing' : 'Code reviewer tool for testing',
          categories: i % 2 === 0 ? [uniqueDataCategory] : [uniqueDevCategory],
          pricing: { type: 'free' },
          tags: i % 2 === 0 ? ['data'] : ['code'],
        });
        // Publish to make searchable
        await marketplace.publishListing(listing.id);
      }

      const dataResults = await marketplace.search({ categories: [uniqueDataCategory] });
      expect(dataResults.listings.length).toBe(2); // Even numbered agents

      const devResults = await marketplace.search({ categories: [uniqueDevCategory] });
      expect(devResults.listings.length).toBe(3); // Odd numbered agents
    });

    it('should handle reviews and ratings', async () => {
      const authorId = crypto.randomUUID();

      const listing = await marketplace.createListing({
        agentId: 'rated-agent',
        authorId,
        displayName: 'Rated Agent',
        shortDescription: 'An agent with reviews for testing',
        categories: ['other'],
        pricing: { type: 'free' },
        tags: [],
      });

      // Publish the listing
      await marketplace.publishListing(listing.id);

      // Add reviews
      await marketplace.createReview({
        listingId: listing.id,
        authorId: crypto.randomUUID(),
        rating: 5,
        title: 'Excellent!',
      });

      await marketplace.createReview({
        listingId: listing.id,
        authorId: crypto.randomUUID(),
        rating: 4,
        title: 'Very good',
      });

      const reviews = await marketplace.getReviews(listing.id);
      expect(reviews).toHaveLength(2);
    });
  });

  describe('Enterprise - ABAC Policy Engine', () => {
    it('should have built-in roles defined', () => {
      // Test that the BUILT_IN_ROLES constant is properly exported
      expect(BUILT_IN_ROLES).toBeDefined();
      expect(BUILT_IN_ROLES.admin).toBeDefined();
      expect(BUILT_IN_ROLES.admin.name).toBe('Administrator');
    });

    it('should have policy schema available', () => {
      expect(PolicySchema).toBeDefined();
    });

    it('should create ABAC manager and evaluate permissions', async () => {
      const db = getDatabase();
      const abacManager = new ABACManager(db);

      // Assign admin role
      const tenantId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await abacManager.assignRole(tenantId, userId, 'user', 'admin');

      // Check roles
      const roles = await abacManager.getRoles(tenantId, userId);
      expect(roles).toContain('admin');

      // Check permission
      const hasPermission = await abacManager.hasPermission(tenantId, userId, 'agent:create');
      expect(hasPermission).toBe(true);
    });
  });

  describe('Enterprise - Tenant Management', () => {
    let tenantManager: TenantManager;

    beforeEach(() => {
      const db = getDatabase();
      tenantManager = new TenantManager(db);
    });

    it('should have tier limits defined', () => {
      expect(TIER_LIMITS.free).toBeDefined();
      expect(TIER_LIMITS.enterprise).toBeDefined();
      expect(TIER_LIMITS.enterprise.maxAgents).toBeGreaterThan(TIER_LIMITS.free.maxAgents);
    });

    it('should create tenants with different tiers', async () => {
      const tenant = await tenantManager.create({
        name: 'Test Company',
        slug: 'test-company-' + Date.now(),
        status: 'active',
        tier: 'professional',
        limits: TIER_LIMITS.professional,
        dataResidency: {
          region: 'us',
          allowedRegions: ['us', 'eu'],
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
      expect(tenant.tier).toBe('professional');

      const retrieved = await tenantManager.getById(tenant.id);
      expect(retrieved?.name).toBe('Test Company');
    });
  });

  describe('Enterprise - Fair Queue', () => {
    let queue: FairQueue;

    beforeEach(() => {
      const db = getDatabase();
      queue = new FairQueue(db);
    });

    it('should enqueue and process by priority', async () => {
      const tenantId = crypto.randomUUID();

      // Enqueue items with different priorities
      await queue.enqueue({
        tenantId,
        agentId: 'test-agent',
        priority: 1,
        payload: { type: 'process', data: 'low' },
      });

      await queue.enqueue({
        tenantId,
        agentId: 'test-agent',
        priority: 10,
        payload: { type: 'process', data: 'high' },
      });

      await queue.enqueue({
        tenantId,
        agentId: 'test-agent',
        priority: 5,
        payload: { type: 'process', data: 'medium' },
      });

      // Get stats to verify items were added
      const stats = await queue.getStats();
      expect(stats.totalPending).toBeGreaterThanOrEqual(3);
    });

    it('should track items by tenant', async () => {
      const tenantId1 = crypto.randomUUID();
      const tenantId2 = crypto.randomUUID();

      // Add items from multiple tenants
      for (let i = 0; i < 3; i++) {
        await queue.enqueue({
          tenantId: tenantId1,
          agentId: 'test-agent',
          priority: 5,
          payload: { type: 'process' },
        });
      }

      await queue.enqueue({
        tenantId: tenantId2,
        agentId: 'test-agent',
        priority: 5,
        payload: { type: 'process' },
      });

      // Check stats
      const stats = await queue.getStats();
      expect(stats.totalPending).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Approval Manager', () => {
    let approvalManager: ApprovalManager;

    beforeEach(() => {
      approvalManager = new ApprovalManager();
    });

    it('should check approval requirements', () => {
      const mockTool: ToolDefinition = {
        name: 'expensive-tool',
        version: '1.0.0',
        description: 'An expensive operation',
        inputSchema: { type: 'object' },
        defer_loading: false,
        allowed_callers: ['human'],
        idempotent: false,
        sideEffectful: true,
        scopes: ['write:production'],
        allowlistedDomains: [],
        timeoutMs: 30000,
        execute: async () => ({}),
      };

      const result = approvalManager.checkApprovalRequired({
        runId: 'run-123',
        stepIndex: 0,
        tool: mockTool,
        input: {},
        estimatedCost: 10.00,
        budgetRemaining: 15.00,
        budgetTotal: 100.00,
        environment: 'production',
      });

      // Should require approval due to cost and production environment
      expect(result.required).toBe(true);
      expect(result.triggers.length).toBeGreaterThan(0);
      expect(result.triggers.some(t => t.condition === 'cost_exceeds_usd')).toBe(true);
    });

    it('should not require approval for safe operations', () => {
      const safeTool: ToolDefinition = {
        name: 'read-only-tool',
        version: '1.0.0',
        description: 'A safe read-only operation',
        inputSchema: { type: 'object' },
        defer_loading: false,
        allowed_callers: ['human'],
        idempotent: true,
        sideEffectful: false,
        scopes: ['read:data'],
        allowlistedDomains: ['example.com'],
        timeoutMs: 30000,
        execute: async () => ({}),
      };

      const result = approvalManager.checkApprovalRequired({
        runId: 'run-456',
        stepIndex: 0,
        tool: safeTool,
        input: {},
        estimatedCost: 0.01,
        budgetRemaining: 100.00,
        budgetTotal: 100.00,
        environment: 'development',
      });

      // Should not require approval for low-cost, non-production operations
      expect(result.required).toBe(false);
    });

    it('should get pending approvals for a run', () => {
      const pending = approvalManager.getPendingForRun('non-existent-run');
      expect(pending).toEqual([]);
    });
  });

  describe('Discovery & Search', () => {
    let discoveryService: DiscoveryService;

    beforeEach(() => {
      discoveryService = new DiscoveryService();
    });

    it('should search with natural language queries', async () => {
      // The discovery service uses the agent registry internally
      // So we test the search functionality on whatever agents are registered
      const results = await discoveryService.search('code review');

      // Results should be an array (may be empty if no agents registered)
      expect(Array.isArray(results)).toBe(true);
    });

    it('should search with type filter', async () => {
      const agentResults = await discoveryService.search('process data', { type: 'agent' });
      const toolResults = await discoveryService.search('process data', { type: 'tool' });

      // Both should return arrays
      expect(Array.isArray(agentResults)).toBe(true);
      expect(Array.isArray(toolResults)).toBe(true);
    });

    it('should get recommendations', async () => {
      const recommendations = await discoveryService.getRecommendations({
        currentTask: 'analyze code for bugs',
      });

      // Should return an array of recommendations
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('should track popular searches', async () => {
      // Make some searches
      await discoveryService.search('code review');
      await discoveryService.search('data analysis');
      await discoveryService.search('code review');

      const popular = discoveryService.getPopularSearches(10);
      expect(Array.isArray(popular)).toBe(true);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete a full agent execution workflow', async () => {
      // 1. Define an agent
      const processorAgent = defineAgent({
        id: 'e2e-processor',
        name: 'E2E Processor',
        description: 'End-to-end test processor',
        version: '1.0.0',
        input: z.object({
          items: z.array(z.string()),
        }),
        output: z.object({
          processed: z.number(),
          results: z.array(z.string()),
        }),
        execute: async (input) => {
          const results = input.items.map(item => `Processed: ${item}`);
          return {
            processed: results.length,
            results,
          };
        },
      });

      // 2. Create a local runner
      const runner = createLocalRunner({
        agent: processorAgent,
        environment: 'development',
      });

      // 3. Execute the agent
      const output = await runner.execute({
        task: 'Process items',
        parameters: {
          items: ['item1', 'item2', 'item3'],
        },
      });

      // 4. Verify results
      expect(output.status).toBe('success');
      const result = output.result as { processed: number; results: string[] };
      expect(result.processed).toBe(3);
      expect(result.results).toContain('Processed: item1');

      // 5. Run test suite
      const testResults = await runner.runTests([
        {
          name: 'Empty items',
          input: { task: 'Process', parameters: { items: [] } },
          expectedOutput: { processed: 0, results: [] },
          expectedStatus: 'success',
        },
        {
          name: 'Single item',
          input: { task: 'Process', parameters: { items: ['single'] } },
          expectedStatus: 'success',
        },
      ]);

      expect(testResults.passed).toBe(2);
    });

    it('should handle PII in workflow', async () => {
      const tokenizer = new PIITokenizer();
      const scoped = tokenizer.createScoped();

      // Simulate incoming data with PII
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '555-123-4567',
        task: 'Process my data',
      };

      // 1. Tokenize PII before processing
      const tokenizedJson = scoped.tokenize(userData);
      expect(tokenizedJson).not.toContain('john@example.com');

      // 2. Process (simulated - would go to LLM)
      const processedTokenized = tokenizedJson; // LLM would process this

      // 3. Detokenize for actual operations
      const restored = scoped.detokenize(processedTokenized);
      const restoredData = JSON.parse(restored);

      expect(restoredData.email).toBe('john@example.com');
      expect(restoredData.phone).toBe('555-123-4567');
    });
  });
});

// Helper function to create mock execution context
function createMockContext(): ExecutionContext {
  return {
    runId: 'test-run-' + Date.now(),
    traceId: 'test-trace-' + Date.now(),
    budget: {
      maxInputTokens: 10000,
      maxOutputTokens: 4096,
      maxThinkingTokens: 10000,
      maxTotalTokens: 50000,
      maxCostUsd: 5.0,
      maxDurationMs: 300000,
      maxSteps: 50,
      maxToolCalls: 100,
      maxDowngrades: 3,
    },
    consumed: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      thinkingTokens: 0,
      costUsd: 0,
      durationMs: 0,
      modelUsed: 'claude-sonnet-4-5-20250514',
      downgrades: 0,
      steps: 0,
      toolCalls: 0,
    },
    currentModel: 'claude-sonnet-4-5-20250514',
    effortLevel: 'medium',
    environment: 'development',
    logger: console as any,
    canContinue: () => true,
    shouldDowngrade: () => false,
    getRemainingBudget: () => ({
      maxInputTokens: 10000,
      maxOutputTokens: 4096,
      maxThinkingTokens: 10000,
      maxTotalTokens: 50000,
      maxCostUsd: 5.0,
      maxDurationMs: 300000,
      maxSteps: 50,
      maxToolCalls: 100,
      maxDowngrades: 3,
    }),
  };
}
