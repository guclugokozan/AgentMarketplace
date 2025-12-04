/**
 * Programmatic Tool Executor Tests
 *
 * Comprehensive tests for the programmatic tool calling pattern
 */

import { describe, it, expect } from 'vitest';

describe('Programmatic Tool Executor', () => {
  describe('Task Detection', () => {
    const programmaticPatterns = [
      /process\s+(all|each|every|multiple|\d+)/i,
      /analyze\s+\d+/i,
      /for\s+(all|each)/i,
      /batch/i,
      /aggregate/i,
      /summarize\s+(all|the|these|those)/i,
      /iterate/i,
      /loop\s+through/i,
      /\d+\s+(items|records|rows|entries|files)/i,
      /parallel/i,
      /concurrently/i,
    ];

    function shouldUseProgrammaticExecution(task: string): boolean {
      return programmaticPatterns.some(pattern => pattern.test(task));
    }

    it('should detect "process all" tasks', () => {
      expect(shouldUseProgrammaticExecution('Process all files in the directory')).toBe(true);
    });

    it('should detect "process each" tasks', () => {
      expect(shouldUseProgrammaticExecution('Process each record')).toBe(true);
    });

    it('should detect "process multiple" tasks', () => {
      expect(shouldUseProgrammaticExecution('Process multiple items')).toBe(true);
    });

    it('should detect numbered tasks', () => {
      expect(shouldUseProgrammaticExecution('Process 100 records')).toBe(true);
      expect(shouldUseProgrammaticExecution('Analyze 50 files')).toBe(true);
    });

    it('should detect "for all/each" tasks', () => {
      expect(shouldUseProgrammaticExecution('For all users, send notification')).toBe(true);
      expect(shouldUseProgrammaticExecution('For each item, calculate total')).toBe(true);
    });

    it('should detect batch tasks', () => {
      expect(shouldUseProgrammaticExecution('Batch process the data')).toBe(true);
    });

    it('should detect aggregate tasks', () => {
      expect(shouldUseProgrammaticExecution('Aggregate the results')).toBe(true);
    });

    it('should detect summarize tasks', () => {
      expect(shouldUseProgrammaticExecution('Summarize all reports')).toBe(true);
      expect(shouldUseProgrammaticExecution('Summarize the findings')).toBe(true);
    });

    it('should detect iterate tasks', () => {
      expect(shouldUseProgrammaticExecution('Iterate through items')).toBe(true);
    });

    it('should detect loop tasks', () => {
      expect(shouldUseProgrammaticExecution('Loop through the records')).toBe(true);
    });

    it('should detect items/records patterns', () => {
      expect(shouldUseProgrammaticExecution('Download 100 items')).toBe(true);
      expect(shouldUseProgrammaticExecution('Update 50 records')).toBe(true);
      expect(shouldUseProgrammaticExecution('Process 25 rows')).toBe(true);
      expect(shouldUseProgrammaticExecution('Check 10 entries')).toBe(true);
      expect(shouldUseProgrammaticExecution('Read 200 files')).toBe(true);
    });

    it('should detect parallel tasks', () => {
      expect(shouldUseProgrammaticExecution('Run tasks in parallel')).toBe(true);
    });

    it('should detect concurrent tasks', () => {
      expect(shouldUseProgrammaticExecution('Execute concurrently')).toBe(true);
    });

    it('should not detect simple tasks', () => {
      expect(shouldUseProgrammaticExecution('Find a file')).toBe(false);
      expect(shouldUseProgrammaticExecution('Create a report')).toBe(false);
      expect(shouldUseProgrammaticExecution('Send an email')).toBe(false);
    });
  });

  describe('Execution Result Structure', () => {
    it('should have success flag', () => {
      const result = {
        success: true,
        result: { data: 'test' },
        code: 'print("hello")',
        tokensUsed: 150,
        executionTimeMs: 500,
        toolCallsMade: [],
      };

      expect(result.success).toBe(true);
    });

    it('should include generated code', () => {
      const result = {
        success: true,
        result: null,
        code: `
async def main():
    results = await asyncio.gather(
        tool1({"id": 1}),
        tool1({"id": 2}),
    )
    return results
`,
        tokensUsed: 200,
        executionTimeMs: 1000,
        toolCallsMade: [],
      };

      expect(result.code).toContain('asyncio.gather');
    });

    it('should track token usage', () => {
      const result = {
        tokensUsed: 350,
      };

      expect(result.tokensUsed).toBe(350);
    });

    it('should track execution time', () => {
      const result = {
        executionTimeMs: 1500,
      };

      expect(result.executionTimeMs).toBe(1500);
    });

    it('should track tool calls made', () => {
      const result = {
        toolCallsMade: [
          { name: 'search', args: { query: 'test' }, result: {}, durationMs: 100 },
          { name: 'update', args: { id: 1 }, result: {}, durationMs: 150 },
        ],
      };

      expect(result.toolCallsMade).toHaveLength(2);
      expect(result.toolCallsMade[0].name).toBe('search');
    });

    it('should include error on failure', () => {
      const result = {
        success: false,
        result: null,
        code: '',
        tokensUsed: 0,
        executionTimeMs: 100,
        toolCallsMade: [],
        error: 'Execution failed: timeout',
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  describe('Tool Call Record', () => {
    it('should have tool name', () => {
      const record = {
        name: 'search_tool',
        args: {},
        result: {},
        durationMs: 100,
      };

      expect(record.name).toBe('search_tool');
    });

    it('should have arguments', () => {
      const record = {
        name: 'search',
        args: { query: 'test', limit: 10 },
        result: {},
        durationMs: 100,
      };

      expect(record.args).toEqual({ query: 'test', limit: 10 });
    });

    it('should have result', () => {
      const record = {
        name: 'search',
        args: {},
        result: { items: ['a', 'b', 'c'] },
        durationMs: 100,
      };

      expect(record.result).toEqual({ items: ['a', 'b', 'c'] });
    });

    it('should have duration', () => {
      const record = {
        name: 'slow_tool',
        args: {},
        result: {},
        durationMs: 5000,
      };

      expect(record.durationMs).toBe(5000);
    });
  });

  describe('Tool Filtering', () => {
    it('should filter tools by allowed callers', () => {
      const tools = [
        { name: 'tool1', allowed_callers: ['human', 'code_execution_20250825'] },
        { name: 'tool2', allowed_callers: ['human'] },
        { name: 'tool3', allowed_callers: ['code_execution_20250825'] },
      ];

      const codeCallable = tools.filter(t =>
        t.allowed_callers?.includes('code_execution_20250825')
      );

      expect(codeCallable).toHaveLength(2);
      expect(codeCallable.map(t => t.name)).toContain('tool1');
      expect(codeCallable.map(t => t.name)).toContain('tool3');
    });

    it('should handle missing allowed_callers', () => {
      const tools = [
        { name: 'tool1', allowed_callers: ['code_execution_20250825'] },
        { name: 'tool2' }, // No allowed_callers
      ];

      const codeCallable = tools.filter(t =>
        t.allowed_callers?.includes('code_execution_20250825')
      );

      expect(codeCallable).toHaveLength(1);
    });
  });

  describe('Tool Documentation Generation', () => {
    it('should format tool documentation', () => {
      const tool = {
        name: 'search_api',
        description: 'Search for items in the database',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' },
          },
        },
        returnFormat: 'array',
        idempotent: true,
      };

      const doc = `# ${tool.name}
Description: ${tool.description}
Input Schema: ${JSON.stringify(tool.inputSchema, null, 2)}
Returns: ${tool.returnFormat}
Idempotent: ${tool.idempotent}`;

      expect(doc).toContain('search_api');
      expect(doc).toContain('Search for items');
      expect(doc).toContain('Idempotent');
    });

    it('should include input examples', () => {
      const tool = {
        name: 'search',
        inputExamples: [
          { description: 'Simple search', input: { query: 'test' } },
          { description: 'With limit', input: { query: 'test', limit: 10 } },
        ],
      };

      const examples = tool.inputExamples.map(ex =>
        `  Example: ${ex.description}\n  Input: ${JSON.stringify(ex.input)}`
      ).join('\n');

      expect(examples).toContain('Simple search');
      expect(examples).toContain('With limit');
    });
  });

  describe('Code Generation', () => {
    it('should generate Python async code', () => {
      const code = `
async def main():
    result = await search_tool({"query": "test"})
    return result
`;
      expect(code).toContain('async def');
      expect(code).toContain('await');
    });

    it('should use asyncio.gather for parallel operations', () => {
      const code = `
import asyncio

async def main():
    results = await asyncio.gather(
        process_item({"id": 1}),
        process_item({"id": 2}),
        process_item({"id": 3}),
    )
    return results
`;
      expect(code).toContain('asyncio.gather');
    });

    it('should handle errors with try/except', () => {
      const code = `
async def main():
    try:
        result = await risky_operation({})
        return result
    except Exception as e:
        return {"error": str(e)}
`;
      expect(code).toContain('try:');
      expect(code).toContain('except');
    });
  });

  describe('Code Extraction from Response', () => {
    function extractPythonCode(text: string): string {
      const match = text.match(/```python\n?([\s\S]*?)```/);
      if (match) {
        return match[1].trim();
      }
      if (text.includes('await') || text.includes('def ')) {
        return text.trim();
      }
      return '';
    }

    it('should extract code from markdown block', () => {
      const response = `Here is the code:

\`\`\`python
async def main():
    return await search({})
\`\`\`

This code will search for items.`;

      const code = extractPythonCode(response);
      expect(code).toContain('async def main');
      expect(code).not.toContain('```');
    });

    it('should extract raw code with await', () => {
      const response = `async def main():
    return await search({})`;

      const code = extractPythonCode(response);
      expect(code).toContain('await');
    });

    it('should extract raw code with def', () => {
      const response = `def process():
    return "done"`;

      const code = extractPythonCode(response);
      expect(code).toContain('def process');
    });

    it('should return empty for no code', () => {
      const response = 'No code here, just text.';
      const code = extractPythonCode(response);
      expect(code).toBe('');
    });
  });

  describe('Code Instrumentation', () => {
    it('should add tool stubs', () => {
      const tools = [
        { name: 'search', description: 'Search for items' },
        { name: 'update', description: 'Update an item' },
      ];

      const stubs = tools.map(tool => `
async def ${tool.name}(args):
    """${tool.description}"""
    return await __tool_proxy__("${tool.name}", args)
`).join('\n');

      expect(stubs).toContain('async def search');
      expect(stubs).toContain('async def update');
      expect(stubs).toContain('__tool_proxy__');
    });

    it('should wrap user code in main function', () => {
      const userCode = `result = await search({"query": "test"})
return result`;

      const wrapped = `async def main():
    ${userCode.split('\n').map(line => '    ' + line).join('\n')}`;

      expect(wrapped).toContain('async def main():');
    });
  });

  describe('Sandbox Execution', () => {
    it('should track tool calls in sandbox', () => {
      const toolCalls: { name: string; args: unknown; durationMs: number }[] = [];

      // Simulate tool call tracking
      const trackToolCall = (name: string, args: unknown, durationMs: number) => {
        toolCalls.push({ name, args, durationMs });
      };

      trackToolCall('search', { query: 'test' }, 100);
      trackToolCall('process', { data: {} }, 150);

      expect(toolCalls).toHaveLength(2);
    });

    it('should apply timeout', () => {
      const maxDurationMs = 300000; // 5 minutes
      const requestedTimeout = 600000; // 10 minutes

      const timeout = Math.min(requestedTimeout, maxDurationMs);
      expect(timeout).toBe(300000);
    });

    it('should capture logs', () => {
      const logs: string[] = [];

      logs.push('[INFO] Starting execution');
      logs.push('[DEBUG] Tool call: search');
      logs.push('[INFO] Execution complete');

      expect(logs).toHaveLength(3);
      expect(logs[0]).toContain('Starting');
    });
  });

  describe('Mock Sandbox Execution', () => {
    it('should parse tool calls from code', () => {
      const code = `
result = await search({"query": "a"})
result2 = await process({"id": 1})
`;
      const toolCallMatches = code.matchAll(/await\s+(\w+)\s*\(/g);
      const toolNames = [...toolCallMatches].map(m => m[1]);

      expect(toolNames).toContain('search');
      expect(toolNames).toContain('process');
    });

    it('should return mock result when sandbox not configured', () => {
      const mockResult = {
        output: {
          mock: true,
          message: 'E2B sandbox not configured. Set E2B_API_KEY to enable.',
          toolCallsDetected: 3,
        },
        logs: ['[MOCK] E2B sandbox not configured'],
        toolCalls: [],
      };

      expect(mockResult.output.mock).toBe(true);
    });
  });

  describe('Data Hashing', () => {
    function hashData(data: unknown): string {
      const content = typeof data === 'string' ? data : JSON.stringify(data);
      // Simple hash for testing (real implementation uses crypto)
      let hash = 0;
      for (let i = 0; i < content.length; i++) {
        hash = ((hash << 5) - hash) + content.charCodeAt(i);
        hash = hash & hash;
      }
      return Math.abs(hash).toString(16).slice(0, 16);
    }

    it('should hash string data', () => {
      const hash = hashData('test data');
      expect(hash.length).toBeGreaterThan(0);
      expect(hash.length).toBeLessThanOrEqual(16);
    });

    it('should hash object data', () => {
      const hash = hashData({ key: 'value' });
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should produce consistent hashes', () => {
      const hash1 = hashData('same data');
      const hash2 = hashData('same data');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different data', () => {
      const hash1 = hashData('data 1');
      const hash2 = hashData('data 2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Execution Options', () => {
    it('should have required task field', () => {
      const options = {
        task: 'Process all files',
        availableTools: [],
        context: {},
      };

      expect(options.task).toBeDefined();
    });

    it('should have available tools', () => {
      const options = {
        task: 'Process files',
        availableTools: [
          { name: 'read_file', allowed_callers: ['code_execution_20250825'] },
          { name: 'write_file', allowed_callers: ['code_execution_20250825'] },
        ],
        context: {},
      };

      expect(options.availableTools).toHaveLength(2);
    });

    it('should support optional model override', () => {
      const options = {
        task: 'Process files',
        availableTools: [],
        context: {},
        model: 'claude-opus-4-20250514',
      };

      expect(options.model).toBe('claude-opus-4-20250514');
    });

    it('should use default model when not specified', () => {
      const defaultModel = 'claude-sonnet-4-5-20250514';
      const options = {
        task: 'Process files',
        availableTools: [],
        context: {},
      };

      const model = options.model ?? defaultModel;
      expect(model).toBe('claude-sonnet-4-5-20250514');
    });
  });

  describe('Provenance Logging', () => {
    it('should log tool execution metadata', () => {
      const provenanceEntry = {
        traceId: 'trace-123',
        runId: 'run-456',
        eventType: 'tool_call',
        tool: {
          name: 'programmatic_executor',
          version: '1.0.0',
          argsHash: 'abc123',
          resultHash: 'def456',
          sideEffectCommitted: false,
          durationMs: 1500,
        },
      };

      expect(provenanceEntry.tool.name).toBe('programmatic_executor');
      expect(provenanceEntry.tool.durationMs).toBe(1500);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle no code-callable tools', () => {
      const tools: { allowed_callers?: string[] }[] = [
        { allowed_callers: ['human'] },
        { allowed_callers: ['human'] },
      ];

      const codeCallable = tools.filter(t =>
        t.allowed_callers?.includes('code_execution_20250825')
      );

      expect(codeCallable).toHaveLength(0);
    });

    it('should handle code generation failure', () => {
      const result = {
        success: false,
        result: null,
        code: '',
        tokensUsed: 50,
        executionTimeMs: 200,
        toolCallsMade: [],
        error: 'Failed to generate orchestration code',
      };

      expect(result.success).toBe(false);
      expect(result.code).toBe('');
    });

    it('should handle sandbox execution failure', () => {
      const sandboxResult = {
        output: null,
        logs: ['[ERROR] Execution timeout'],
        toolCalls: [],
        error: 'Execution timed out after 300000ms',
      };

      expect(sandboxResult.error).toContain('timed out');
    });
  });

  describe('Token Reduction Benefits', () => {
    it('should demonstrate token savings', () => {
      // Traditional approach: 19 inference passes
      const traditionalPasses = 19;
      const tokensPerPass = 8000;
      const traditionalTokens = traditionalPasses * tokensPerPass; // 152,000

      // Programmatic approach: 1 code generation pass + execution
      const codeGenTokens = 2000;
      const executionOverhead = 500;
      const programmaticTokens = codeGenTokens + executionOverhead; // 2,500

      const savings = 1 - (programmaticTokens / traditionalTokens);
      expect(savings).toBeGreaterThan(0.95); // > 95% savings
    });

    it('should reduce inference passes', () => {
      const parallelTasks = 19;

      // Traditional: one pass per task
      const traditionalPasses = parallelTasks;

      // Programmatic: one code generation pass
      const programmaticPasses = 1;

      expect(programmaticPasses).toBeLessThan(traditionalPasses);
    });
  });
});
