/**
 * Programmatic Tool Executor
 *
 * Implements Anthropic's Programmatic Tool Calling pattern:
 * - Claude generates Python code to orchestrate tools
 * - Code executes in E2B sandbox with resource limits
 * - 37% token reduction on complex multi-step tasks
 * - Eliminates 19+ inference passes for parallel operations
 *
 * @see https://www.anthropic.com/engineering/advanced-tool-use
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  ToolDefinition,
  ExecutionContext,
  ModelId,
} from '../core/types.js';
// Tool registry for loading tools by name
import { getProvenanceLogger } from '../audit/provenance.js';
import { createLogger, StructuredLogger } from '../logging/logger.js';

// E2B types (install: npm install e2b)
interface SandboxResult {
  output: unknown;
  logs: string[];
  error?: string;
  toolCalls: ToolCallRecord[];
}

interface ToolCallRecord {
  name: string;
  args: unknown;
  result: unknown;
  durationMs: number;
}

export interface ProgrammaticExecutionResult {
  success: boolean;
  result: unknown;
  code: string;
  tokensUsed: number;
  executionTimeMs: number;
  toolCallsMade: ToolCallRecord[];
  error?: string;
}

export interface ProgrammaticExecutionOptions {
  task: string;
  availableTools: ToolDefinition[];
  context: ExecutionContext;
  model?: ModelId;
}

export class ProgrammaticToolExecutor {
  private anthropic: Anthropic;
  private provenance = getProvenanceLogger();
  private logger: StructuredLogger;

  constructor() {
    this.anthropic = new Anthropic();
    this.logger = createLogger({ level: 'info' });
  }

  /**
   * Determine if task should use programmatic execution
   */
  shouldUseProgrammaticExecution(task: string): boolean {
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

    return programmaticPatterns.some(pattern => pattern.test(task));
  }

  /**
   * Execute task using programmatic tool calling
   */
  async execute(options: ProgrammaticExecutionOptions): Promise<ProgrammaticExecutionResult> {
    const { task, availableTools, context, model = 'claude-sonnet-4-5-20250514' } = options;
    const startTime = Date.now();

    // Filter to tools that allow code execution
    const codeCallableTools = availableTools.filter(
      t => t.allowed_callers?.includes('code_execution_20250825')
    );

    if (codeCallableTools.length === 0) {
      return {
        success: false,
        result: null,
        code: '',
        tokensUsed: 0,
        executionTimeMs: 0,
        toolCallsMade: [],
        error: 'No tools available for programmatic execution',
      };
    }

    this.logger.info('programmatic_execution_start', {
      task_preview: task.slice(0, 100),
      tool_count: codeCallableTools.length,
    });

    try {
      // Step 1: Generate orchestration code
      const { code, tokensUsed } = await this.generateOrchestrationCode(
        task,
        codeCallableTools,
        model
      );

      // Step 2: Execute in sandbox
      const sandboxResult = await this.executeInSandbox(
        code,
        codeCallableTools,
        context
      );

      const executionTimeMs = Date.now() - startTime;

      // Log provenance
      this.provenance.log({
        traceId: context.traceId,
        runId: context.runId,
        eventType: 'tool_call',
        tool: {
          name: 'programmatic_executor',
          version: '1.0.0',
          argsHash: this.hashData(task),
          resultHash: this.hashData(sandboxResult.output),
          sideEffectCommitted: false,
          durationMs: executionTimeMs,
        },
      });

      this.logger.info('programmatic_execution_complete', {
        success: !sandboxResult.error,
        tool_calls: sandboxResult.toolCalls.length,
        duration_ms: executionTimeMs,
      });

      return {
        success: !sandboxResult.error,
        result: sandboxResult.output,
        code,
        tokensUsed,
        executionTimeMs,
        toolCallsMade: sandboxResult.toolCalls,
        error: sandboxResult.error,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error('programmatic_execution_failed', {
        error: errorMessage,
        duration_ms: executionTimeMs,
      });

      return {
        success: false,
        result: null,
        code: '',
        tokensUsed: 0,
        executionTimeMs,
        toolCallsMade: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Generate Python code to orchestrate tools
   */
  private async generateOrchestrationCode(
    task: string,
    tools: ToolDefinition[],
    model: ModelId
  ): Promise<{ code: string; tokensUsed: number }> {
    const toolDocs = tools.map(t => this.formatToolDocumentation(t)).join('\n---\n');

    const systemPrompt = `You are a code generator that writes Python code to orchestrate tool calls.

IMPORTANT RULES:
1. Use asyncio.gather() for parallel operations when tools are idempotent
2. Always return a final result, not intermediate data
3. Handle errors gracefully with try/except
4. Tools are called as: await tool_name(args_dict)
5. Keep code concise and efficient
6. Use list comprehensions where appropriate`;

    const userPrompt = `Generate Python code to accomplish this task:
${task}

Available Tools:
${toolDocs}

Write clean, efficient Python code that uses these tools to complete the task.
Return only the code, wrapped in \`\`\`python code blocks.`;

    const response = await this.anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    const code = this.extractPythonCode(response.content);

    return { code, tokensUsed };
  }

  /**
   * Format tool documentation for code generation
   */
  private formatToolDocumentation(tool: ToolDefinition): string {
    const examples = tool.inputExamples?.map(ex =>
      `  Example: ${ex.description}\n  Input: ${JSON.stringify(ex.input)}`
    ).join('\n') ?? '';

    return `# ${tool.name}
Description: ${tool.description}
Input Schema: ${JSON.stringify(tool.inputSchema, null, 2)}
Returns: ${tool.returnFormat ?? 'unknown'}
Idempotent: ${tool.idempotent}
${examples ? `Examples:\n${examples}` : ''}`;
  }

  /**
   * Execute code in E2B sandbox
   *
   * Note: This is a mock implementation. For production, use:
   * npm install e2b
   * import { Sandbox } from 'e2b';
   */
  private async executeInSandbox(
    code: string,
    tools: ToolDefinition[],
    context: ExecutionContext
  ): Promise<SandboxResult> {
    const toolCalls: ToolCallRecord[] = [];
    const logs: string[] = [];

    // Check if E2B is available
    const useRealSandbox = process.env.E2B_API_KEY !== undefined;

    if (useRealSandbox) {
      return this.executeInE2BSandbox(code, tools, context, toolCalls, logs);
    }

    // Mock execution for development/testing
    return this.mockSandboxExecution(code, tools, context, toolCalls, logs);
  }

  /**
   * Execute in real E2B sandbox
   *
   * Note: Requires e2b package to be installed: npm install e2b
   */
  private async executeInE2BSandbox(
    code: string,
    tools: ToolDefinition[],
    context: ExecutionContext,
    toolCalls: ToolCallRecord[],
    logs: string[]
  ): Promise<SandboxResult> {
    // Dynamic import to avoid requiring e2b when not installed
    let Sandbox: any;
    try {
      // @ts-expect-error - e2b is an optional dependency
      const e2b = await import('e2b');
      Sandbox = e2b.Sandbox;
    } catch {
      logs.push('[ERROR] e2b package not installed. Run: npm install e2b');
      return {
        output: null,
        logs,
        toolCalls,
        error: 'e2b package not installed',
      };
    }

    const sandbox = await Sandbox.create({
      timeout: Math.min(context.budget.maxDurationMs, 300000), // Max 5 min
    });

    try {
      // Instrument code with tool stubs
      const instrumentedCode = this.instrumentCode(code, tools);

      // Tool execution is handled by the sandbox runtime via __external_tool_call__
      // The sandbox injects this function that calls back to our tool executor
      // For now, we track any tools that would be called by parsing the code
      for (const tool of tools) {
        if (instrumentedCode.includes(`${tool.name}(`)) {
          toolCalls.push({
            name: tool.name,
            args: { _note: 'executed in sandbox' },
            result: { _note: 'result from sandbox' },
            durationMs: 0,
          });
        }
      }

      // Execute in sandbox
      const result = await sandbox.runCode(instrumentedCode);

      return {
        output: result,
        logs,
        toolCalls,
      };
    } finally {
      await sandbox.close();
    }
  }

  /**
   * Mock sandbox execution for development
   */
  private async mockSandboxExecution(
    code: string,
    tools: ToolDefinition[],
    _context: ExecutionContext,
    toolCalls: ToolCallRecord[],
    logs: string[]
  ): Promise<SandboxResult> {
    logs.push('[MOCK] E2B sandbox not configured, using mock execution');
    logs.push(`[MOCK] Would execute code:\n${code.slice(0, 500)}...`);

    // Parse code to extract tool calls (simplified)
    const toolCallMatches = code.matchAll(/await\s+(\w+)\s*\(/g);
    for (const match of toolCallMatches) {
      const toolName = match[1];
      const tool = tools.find(t => t.name === toolName);
      if (tool) {
        toolCalls.push({
          name: toolName,
          args: { mock: true },
          result: { mock: true, toolName },
          durationMs: 100,
        });
      }
    }

    return {
      output: {
        mock: true,
        message: 'E2B sandbox not configured. Set E2B_API_KEY to enable.',
        toolCallsDetected: toolCalls.length,
      },
      logs,
      toolCalls,
    };
  }

  /**
   * Instrument code with tool proxy stubs
   */
  private instrumentCode(code: string, tools: ToolDefinition[]): string {
    // Create tool stubs that call back to our system
    const stubs = tools.map(tool => `
async def ${tool.name}(args):
    """${tool.description}"""
    return await __tool_proxy__("${tool.name}", args)
`).join('\n');

    return `
import asyncio
from typing import Any, Dict

# Tool proxy will be injected by sandbox
async def __tool_proxy__(name: str, args: Dict[str, Any]) -> Any:
    return await __external_tool_call__(name, args)

# Tool stubs
${stubs}

# User code
async def main():
${code.split('\n').map(line => '    ' + line).join('\n')}

# Run
result = asyncio.run(main())
result
`;
  }

  /**
   * Extract Python code from response
   */
  private extractPythonCode(content: Anthropic.ContentBlock[]): string {
    for (const block of content) {
      if (block.type === 'text') {
        const match = block.text.match(/```python\n?([\s\S]*?)```/);
        if (match) {
          return match[1].trim();
        }
        // If no code block, assume the whole text is code
        if (block.text.includes('await') || block.text.includes('def ')) {
          return block.text.trim();
        }
      }
    }
    return '';
  }

  /**
   * Hash data for provenance
   */
  private hashData(data: unknown): string {
    const { createHash } = require('crypto');
    const content = typeof data === 'string' ? data : JSON.stringify(data);
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }
}

// Singleton instance
let instance: ProgrammaticToolExecutor | null = null;

export function getProgrammaticToolExecutor(): ProgrammaticToolExecutor {
  if (!instance) {
    instance = new ProgrammaticToolExecutor();
  }
  return instance;
}
