/**
 * Agent SDK - defineAgent
 *
 * Type-safe helper for creating agents with:
 * - Zod schema validation for input/output
 * - Automatic AgentCard generation
 * - Built-in error handling
 * - Tool integration
 */

import { z } from 'zod';
import type {
  Agent,
  AgentCard,
  AgentInput,
  AgentOutput,
  ExecutionContext,
  ToolDefinition,
  ModelId,
  EffortLevel,
  JSONSchema,
} from '../core/types.js';

export interface AgentDefinition<
  TInput extends z.ZodType,
  TOutput extends z.ZodType
> {
  // Identity
  id: string;
  name: string;
  description: string;
  version: string;

  // Schemas
  input: TInput;
  output: TOutput;

  // Capabilities
  capabilities?: string[];

  // Model configuration
  models?: {
    default?: ModelId;
    fallback?: ModelId;
    premium?: ModelId;
  };

  // Effort level
  defaultEffortLevel?: EffortLevel;

  // Tools this agent can use
  tools?: ToolDefinition[];

  // Side effects
  sideEffects?: boolean;

  // Cost tier
  estimatedCostTier?: 'low' | 'medium' | 'high';

  // Execute function
  execute: (
    input: z.infer<TInput>,
    context: AgentExecutionContext
  ) => Promise<z.infer<TOutput>>;

  // Optional hooks
  beforeExecute?: (input: z.infer<TInput>, context: AgentExecutionContext) => Promise<void>;
  afterExecute?: (output: z.infer<TOutput>, context: AgentExecutionContext) => Promise<void>;
  onError?: (error: Error, context: AgentExecutionContext) => Promise<z.infer<TOutput> | null>;
}

export interface AgentExecutionContext extends ExecutionContext {
  tools: AgentToolContext;
}

export interface AgentToolContext {
  call<T = unknown>(name: string, args: Record<string, unknown>): Promise<T>;
  search(query: string): Promise<string[]>;
  available(): string[];
}

/**
 * Define a new agent with type-safe input/output
 */
export function defineAgent<
  TInput extends z.ZodType,
  TOutput extends z.ZodType
>(definition: AgentDefinition<TInput, TOutput>): Agent {
  // Generate AgentCard from definition
  const card: AgentCard = {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    version: definition.version,
    capabilities: definition.capabilities ?? inferCapabilities(definition),
    inputSchema: zodToJsonSchema(definition.input),
    outputSchema: zodToJsonSchema(definition.output),
    defaultModel: definition.models?.default ?? 'claude-sonnet-4-5-20250514',
    defaultEffortLevel: definition.defaultEffortLevel ?? 'medium',
    sideEffects: definition.sideEffects ?? false,
    estimatedCostTier: definition.estimatedCostTier ?? 'medium',
  };

  // Create agent implementation
  const agent: Agent = {
    card,

    async execute(input: AgentInput, context: ExecutionContext): Promise<AgentOutput> {
      const startTime = Date.now();

      try {
        // Validate input
        const parseResult = definition.input.safeParse(input.parameters);
        if (!parseResult.success) {
          return {
            status: 'failed',
            result: {
              error: 'Input validation failed',
              details: parseResult.error.errors,
            },
            usage: context.consumed,
          };
        }

        const validatedInput = parseResult.data;

        // Create tool context
        const toolContext = createToolContext(definition.tools ?? [], context);
        const agentContext: AgentExecutionContext = {
          ...context,
          tools: toolContext,
        };

        // Before hook
        if (definition.beforeExecute) {
          await definition.beforeExecute(validatedInput, agentContext);
        }

        // Execute
        const result = await definition.execute(validatedInput, agentContext);

        // Validate output
        const outputResult = definition.output.safeParse(result);
        if (!outputResult.success) {
          return {
            status: 'failed',
            result: {
              error: 'Output validation failed',
              details: outputResult.error.errors,
            },
            usage: context.consumed,
          };
        }

        // After hook
        if (definition.afterExecute) {
          await definition.afterExecute(outputResult.data, agentContext);
        }

        return {
          status: 'success',
          result: outputResult.data,
          usage: {
            ...context.consumed,
            durationMs: Date.now() - startTime,
          },
        };
      } catch (error) {
        // Error hook
        if (definition.onError) {
          const recovered = await definition.onError(
            error as Error,
            { ...context, tools: createToolContext(definition.tools ?? [], context) }
          );
          if (recovered !== null) {
            return {
              status: 'success',
              result: recovered,
              warnings: [`Recovered from error: ${(error as Error).message}`],
              usage: {
                ...context.consumed,
                durationMs: Date.now() - startTime,
              },
            };
          }
        }

        return {
          status: 'failed',
          result: {
            error: (error as Error).message,
            stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined,
          },
          usage: {
            ...context.consumed,
            durationMs: Date.now() - startTime,
          },
        };
      }
    },
  };

  return agent;
}

/**
 * Create tool context for agent execution
 */
function createToolContext(
  tools: ToolDefinition[],
  context: ExecutionContext
): AgentToolContext {
  return {
    async call<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
      const tool = tools.find(t => t.name === name);
      if (!tool) {
        throw new Error(`Tool not found: ${name}`);
      }

      const result = await tool.execute(args, {
        runId: context.runId,
        stepId: `tool_${name}`,
        traceId: context.traceId,
        allowedScopes: tool.scopes,
        timeout: AbortSignal.timeout(tool.timeoutMs),
        logger: context.logger,
      });

      return result as T;
    },

    async search(query: string): Promise<string[]> {
      // Return tool names matching query
      const queryLower = query.toLowerCase();
      return tools
        .filter(t =>
          t.name.toLowerCase().includes(queryLower) ||
          t.description.toLowerCase().includes(queryLower)
        )
        .map(t => t.name);
    },

    available(): string[] {
      return tools.map(t => t.name);
    },
  };
}

/**
 * Infer capabilities from agent definition
 */
function inferCapabilities<TInput extends z.ZodType, TOutput extends z.ZodType>(
  definition: AgentDefinition<TInput, TOutput>
): string[] {
  const caps: string[] = [];

  // Infer from name/description
  const text = `${definition.name} ${definition.description}`.toLowerCase();

  if (text.includes('code') || text.includes('review')) caps.push('code-analysis');
  if (text.includes('data') || text.includes('analyz')) caps.push('data-analysis');
  if (text.includes('search') || text.includes('find')) caps.push('search');
  if (text.includes('write') || text.includes('generate')) caps.push('content-generation');
  if (text.includes('summar')) caps.push('summarization');
  if (text.includes('translat')) caps.push('translation');

  // Infer from tools
  if (definition.tools?.some(t => t.sideEffectful)) {
    caps.push('side-effects');
  }

  return caps.length > 0 ? caps : ['general'];
}

/**
 * Convert Zod schema to JSON Schema
 */
function zodToJsonSchema(schema: z.ZodType): JSONSchema {
  // Simplified conversion - for full support use zod-to-json-schema
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape();
    const properties: Record<string, JSONSchema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType);
      if (!(value as z.ZodType).isOptional()) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema._def.type),
    };
  }

  if (schema instanceof z.ZodEnum) {
    return {
      type: 'string',
      enum: schema._def.values,
    };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema._def.innerType);
  }

  if (schema instanceof z.ZodNullable) {
    return zodToJsonSchema(schema._def.innerType);
  }

  return { type: 'object' };
}

/**
 * Helper to create a simple tool definition
 */
export function defineTool<TInput extends z.ZodType>(config: {
  name: string;
  description: string;
  input: TInput;
  execute: (args: z.infer<TInput>) => Promise<unknown>;
  sideEffectful?: boolean;
  idempotent?: boolean;
  timeoutMs?: number;
}): ToolDefinition {
  return {
    name: config.name,
    version: '1.0.0',
    description: config.description,
    inputSchema: zodToJsonSchema(config.input),
    defer_loading: false,
    allowed_callers: ['human', 'code_execution_20250825'],
    idempotent: config.idempotent ?? true,
    sideEffectful: config.sideEffectful ?? false,
    scopes: [],
    allowlistedDomains: [],
    timeoutMs: config.timeoutMs ?? 30000,
    execute: async (input: unknown) => {
      const parsed = config.input.parse(input);
      return config.execute(parsed);
    },
  };
}
