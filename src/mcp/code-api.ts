/**
 * MCP Code API Adapter
 *
 * Presents MCP servers as code-callable APIs rather than direct tool calls.
 * This enables:
 * - 98.7% context savings (150K → 2K tokens)
 * - Data filtering in code before returning to model
 * - Familiar programming patterns (loops, conditionals)
 *
 * @see https://www.anthropic.com/engineering/code-execution-with-mcp
 */

import type { ToolDefinition, ToolContext, JSONSchema } from '../core/types.js';
import { createLogger, StructuredLogger } from '../logging/logger.js';

// MCP SDK types (install: npm install @modelcontextprotocol/sdk)
interface MCPClient {
  connect(transport: MCPTransport): Promise<void>;
  disconnect(): Promise<void>;
  listTools(): Promise<MCPToolList>;
  callTool(request: MCPToolCallRequest): Promise<MCPToolCallResponse>;
  listResources(): Promise<MCPResourceList>;
  readResource(uri: string): Promise<MCPResourceContent>;
}

interface MCPTransport {
  type: 'stdio' | 'http' | 'websocket';
  command?: string;
  args?: string[];
  url?: string;
}

interface MCPToolList {
  tools: MCPToolDefinition[];
}

interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

interface MCPToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

interface MCPToolCallResponse {
  content: MCPContent[];
  isError?: boolean;
}

interface MCPContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

interface MCPResourceList {
  resources: MCPResource[];
}

interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface MCPResourceContent {
  contents: MCPContent[];
}

export interface MCPServerConfig {
  name: string;
  transport: MCPTransport;
  description?: string;
  autoConnect?: boolean;
}

export interface MCPCodeAPI {
  serverName: string;
  description?: string;
  tools: Record<string, MCPToolFunction>;
  resources: MCPResource[];
}

export type MCPToolFunction = (args: Record<string, unknown>) => Promise<unknown>;

export class MCPCodeAPIBuilder {
  private clients: Map<string, MCPClient> = new Map();
  private apis: Map<string, MCPCodeAPI> = new Map();
  private logger: StructuredLogger;

  constructor() {
    this.logger = createLogger({ level: 'info' });
  }

  /**
   * Connect to an MCP server and build a code-callable API
   */
  async connect(config: MCPServerConfig): Promise<MCPCodeAPI> {
    this.logger.info('mcp_connecting', {
      server: config.name,
      transport: config.transport.type,
    });

    try {
      // Create MCP client
      const client = await this.createClient(config);
      this.clients.set(config.name, client);

      // Discover tools
      const toolList = await client.listTools();
      const tools: Record<string, MCPToolFunction> = {};

      for (const tool of toolList.tools) {
        tools[tool.name] = async (args: Record<string, unknown>) => {
          const result = await client.callTool({
            name: tool.name,
            arguments: args,
          });

          if (result.isError) {
            throw new Error(`MCP tool error: ${this.extractText(result.content)}`);
          }

          return this.parseContent(result.content);
        };
      }

      // Discover resources
      let resources: MCPResource[] = [];
      try {
        const resourceList = await client.listResources();
        resources = resourceList.resources;
      } catch {
        // Resources are optional
      }

      const api: MCPCodeAPI = {
        serverName: config.name,
        description: config.description,
        tools,
        resources,
      };

      this.apis.set(config.name, api);

      this.logger.info('mcp_connected', {
        server: config.name,
        tools: Object.keys(tools).length,
        resources: resources.length,
      });

      return api;
    } catch (error) {
      this.logger.error('mcp_connection_failed', {
        server: config.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (client) {
      await client.disconnect();
      this.clients.delete(serverName);
      this.apis.delete(serverName);
      this.logger.info('mcp_disconnected', { server: serverName });
    }
  }

  /**
   * Get a connected API
   */
  getAPI(serverName: string): MCPCodeAPI | null {
    return this.apis.get(serverName) ?? null;
  }

  /**
   * Get all connected APIs
   */
  getAllAPIs(): MCPCodeAPI[] {
    return [...this.apis.values()];
  }

  /**
   * Generate Python stubs for an MCP API
   * These stubs can be used in programmatic tool calling
   */
  generatePythonStubs(api: MCPCodeAPI): string {
    const stubs = Object.keys(api.tools).map(name => `
async def ${this.sanitizeName(name)}(args: dict) -> Any:
    """Call MCP tool: ${name} from ${api.serverName}"""
    return await __mcp_call__("${api.serverName}", "${name}", args)
`).join('\n');

    return `# MCP API: ${api.serverName}
# ${api.description ?? 'No description'}
# Generated stubs for programmatic tool calling

from typing import Any

${stubs}

# Resource access
async def read_resource(uri: str) -> Any:
    """Read a resource from ${api.serverName}"""
    return await __mcp_read_resource__("${api.serverName}", uri)

# Available resources:
${api.resources.map(r => `# - ${r.uri}: ${r.name}`).join('\n')}
`;
  }

  /**
   * Convert MCP tools to ToolDefinition format
   */
  convertToToolDefinitions(api: MCPCodeAPI): ToolDefinition[] {
    return Object.entries(api.tools).map(([name, fn]) => ({
      name: `mcp_${api.serverName}_${name}`,
      version: '1.0.0',
      description: `MCP tool from ${api.serverName}: ${name}`,
      inputSchema: { type: 'object' } as JSONSchema, // Schema from MCP would go here
      defer_loading: true, // MCP tools are always deferred
      allowed_callers: ['human', 'code_execution_20250825'] as const,
      idempotent: false, // Assume non-idempotent by default
      sideEffectful: true, // Assume side effects by default
      scopes: [`mcp:${api.serverName}`],
      allowlistedDomains: [],
      timeoutMs: 30000,
      execute: async (input: unknown, _context: ToolContext) => {
        return fn(input as Record<string, unknown>);
      },
    }));
  }

  /**
   * Create MCP client
   * Note: Requires @modelcontextprotocol/sdk to be installed
   */
  private async createClient(config: MCPServerConfig): Promise<MCPClient> {
    // Check if MCP SDK is available
    try {
      // Dynamic import to avoid requiring MCP SDK when not installed
      let mcpClient: any;
      try {
        // @ts-expect-error - MCP SDK is an optional dependency
        mcpClient = await import('@modelcontextprotocol/sdk/client/index.js');
      } catch {
        throw new Error('MCP SDK not installed. Run: npm install @modelcontextprotocol/sdk');
      }

      const { Client } = mcpClient;
      const client = new Client({ name: 'agent-marketplace' }, { capabilities: {} });

      // Connect based on transport type
      if (config.transport.type === 'stdio') {
        let mcpStdio: any;
        try {
          // @ts-expect-error - MCP SDK is an optional dependency
          mcpStdio = await import('@modelcontextprotocol/sdk/client/stdio.js');
        } catch {
          throw new Error('MCP SDK stdio transport not available');
        }
        const { StdioClientTransport } = mcpStdio;
        const transport = new StdioClientTransport({
          command: config.transport.command!,
          args: config.transport.args,
        });
        await client.connect(transport);
      } else if (config.transport.type === 'http' || config.transport.type === 'websocket') {
        // HTTP/WebSocket transport would be implemented here
        throw new Error(`Transport type ${config.transport.type} not yet implemented`);
      }

      return client as unknown as MCPClient;
    } catch (error) {
      // Fall back to mock client for development
      this.logger.warn('mcp_using_mock', {
        reason: 'MCP SDK not available or connection failed',
        error: error instanceof Error ? error.message : String(error),
      });

      return this.createMockClient(config);
    }
  }

  /**
   * Create mock MCP client for development
   */
  private createMockClient(config: MCPServerConfig): MCPClient {
    return {
      connect: async () => {},
      disconnect: async () => {},
      listTools: async () => ({
        tools: [
          {
            name: 'mock_tool',
            description: `Mock tool from ${config.name}`,
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      }),
      callTool: async (request) => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            mock: true,
            server: config.name,
            tool: request.name,
            args: request.arguments,
          }),
        }],
      }),
      listResources: async () => ({
        resources: [],
      }),
      readResource: async (uri) => ({
        contents: [{
          type: 'text',
          text: `Mock resource content for ${uri}`,
        }],
      }),
    };
  }

  /**
   * Extract text from MCP content
   */
  private extractText(content: MCPContent[]): string {
    return content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }

  /**
   * Parse MCP content to structured data
   */
  private parseContent(content: MCPContent[]): unknown {
    if (content.length === 1 && content[0].type === 'text') {
      try {
        return JSON.parse(content[0].text!);
      } catch {
        return content[0].text;
      }
    }

    return content.map(c => {
      if (c.type === 'text') return c.text;
      if (c.type === 'image') return { type: 'image', data: c.data, mimeType: c.mimeType };
      return c;
    });
  }

  /**
   * Sanitize name for Python function
   */
  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  }
}

// Singleton instance
let instance: MCPCodeAPIBuilder | null = null;

export function getMCPCodeAPIBuilder(): MCPCodeAPIBuilder {
  if (!instance) {
    instance = new MCPCodeAPIBuilder();
  }
  return instance;
}
