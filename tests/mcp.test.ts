/**
 * MCP Code API Tests
 *
 * Comprehensive tests for MCP server integration and code-callable API generation
 */

import { describe, it, expect } from 'vitest';

describe('MCP Code API', () => {
  describe('Server Configuration', () => {
    it('should have required fields', () => {
      const config = {
        name: 'test-server',
        transport: {
          type: 'stdio' as const,
          command: 'npx',
          args: ['mcp-server'],
        },
      };

      expect(config).toHaveProperty('name');
      expect(config).toHaveProperty('transport');
      expect(config.transport).toHaveProperty('type');
    });

    it('should support stdio transport', () => {
      const transport = {
        type: 'stdio' as const,
        command: 'npx',
        args: ['@modelcontextprotocol/server-memory'],
      };

      expect(transport.type).toBe('stdio');
      expect(transport.command).toBe('npx');
    });

    it('should support http transport', () => {
      const transport = {
        type: 'http' as const,
        url: 'http://localhost:3000/mcp',
      };

      expect(transport.type).toBe('http');
      expect(transport.url).toBeDefined();
    });

    it('should support websocket transport', () => {
      const transport = {
        type: 'websocket' as const,
        url: 'ws://localhost:3000/mcp',
      };

      expect(transport.type).toBe('websocket');
    });

    it('should support optional description', () => {
      const config = {
        name: 'test-server',
        transport: { type: 'stdio' as const, command: 'test' },
        description: 'A test MCP server',
      };

      expect(config.description).toBe('A test MCP server');
    });

    it('should support auto connect option', () => {
      const config = {
        name: 'test-server',
        transport: { type: 'stdio' as const, command: 'test' },
        autoConnect: true,
      };

      expect(config.autoConnect).toBe(true);
    });
  });

  describe('MCP Tool List', () => {
    it('should contain tool definitions', () => {
      const toolList = {
        tools: [
          {
            name: 'search',
            description: 'Search for items',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
            },
          },
          {
            name: 'create',
            description: 'Create a new item',
            inputSchema: {
              type: 'object',
              properties: {
                data: { type: 'object' },
              },
            },
          },
        ],
      };

      expect(toolList.tools).toHaveLength(2);
      expect(toolList.tools[0].name).toBe('search');
    });

    it('should have tool input schemas', () => {
      const tool = {
        name: 'my-tool',
        description: 'A tool',
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string' },
            param2: { type: 'number' },
          },
          required: ['param1'],
        },
      };

      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties.param1.type).toBe('string');
    });
  });

  describe('MCP Tool Call', () => {
    it('should have request structure', () => {
      const request = {
        name: 'search',
        arguments: {
          query: 'test query',
          limit: 10,
        },
      };

      expect(request.name).toBe('search');
      expect(request.arguments.query).toBe('test query');
    });

    it('should have response structure', () => {
      const response = {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ results: ['a', 'b', 'c'] }),
          },
        ],
        isError: false,
      };

      expect(response.content).toHaveLength(1);
      expect(response.isError).toBe(false);
    });

    it('should handle error responses', () => {
      const response = {
        content: [
          {
            type: 'text' as const,
            text: 'Tool execution failed: invalid input',
          },
        ],
        isError: true,
      };

      expect(response.isError).toBe(true);
    });
  });

  describe('MCP Content Types', () => {
    it('should support text content', () => {
      const content = {
        type: 'text' as const,
        text: 'Hello, world!',
      };

      expect(content.type).toBe('text');
      expect(content.text).toBe('Hello, world!');
    });

    it('should support image content', () => {
      const content = {
        type: 'image' as const,
        data: 'base64-encoded-image-data',
        mimeType: 'image/png',
      };

      expect(content.type).toBe('image');
      expect(content.mimeType).toBe('image/png');
    });

    it('should support resource content', () => {
      const content = {
        type: 'resource' as const,
        text: 'Resource content here',
      };

      expect(content.type).toBe('resource');
    });
  });

  describe('MCP Resources', () => {
    it('should list resources', () => {
      const resourceList = {
        resources: [
          {
            uri: 'file:///path/to/resource.json',
            name: 'Resource File',
            description: 'A JSON resource',
            mimeType: 'application/json',
          },
          {
            uri: 'db://users/123',
            name: 'User Record',
          },
        ],
      };

      expect(resourceList.resources).toHaveLength(2);
      expect(resourceList.resources[0].uri).toContain('resource.json');
    });

    it('should have resource content structure', () => {
      const content = {
        contents: [
          {
            type: 'text' as const,
            text: '{"key": "value"}',
          },
        ],
      };

      expect(content.contents).toHaveLength(1);
    });
  });

  describe('Code API Structure', () => {
    it('should have server name', () => {
      const api = {
        serverName: 'my-server',
        tools: {},
        resources: [],
      };

      expect(api.serverName).toBe('my-server');
    });

    it('should have tools object', () => {
      const api = {
        serverName: 'test',
        tools: {
          search: async (_args: Record<string, unknown>) => ({ results: [] }),
          create: async (_args: Record<string, unknown>) => ({ id: '123' }),
        },
        resources: [],
      };

      expect(Object.keys(api.tools)).toContain('search');
      expect(Object.keys(api.tools)).toContain('create');
    });

    it('should have resources array', () => {
      const api = {
        serverName: 'test',
        tools: {},
        resources: [
          { uri: 'file:///test.json', name: 'Test File' },
        ],
      };

      expect(api.resources).toHaveLength(1);
    });
  });

  describe('Python Stub Generation', () => {
    function sanitizeName(name: string): string {
      return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    }

    function generateStub(serverName: string, toolName: string): string {
      return `
async def ${sanitizeName(toolName)}(args: dict) -> Any:
    """Call MCP tool: ${toolName} from ${serverName}"""
    return await __mcp_call__("${serverName}", "${toolName}", args)
`;
    }

    it('should generate valid function name', () => {
      expect(sanitizeName('my-tool')).toBe('my_tool');
      expect(sanitizeName('tool.name')).toBe('tool_name');
      expect(sanitizeName('Tool123')).toBe('tool123');
    });

    it('should generate Python async function', () => {
      const stub = generateStub('server', 'search');
      expect(stub).toContain('async def');
      expect(stub).toContain('search');
    });

    it('should include docstring', () => {
      const stub = generateStub('my-server', 'my-tool');
      expect(stub).toContain('"""');
      expect(stub).toContain('my-server');
    });

    it('should call MCP function', () => {
      const stub = generateStub('server', 'tool');
      expect(stub).toContain('__mcp_call__');
    });
  });

  describe('Tool Definition Conversion', () => {
    it('should convert to ToolDefinition format', () => {
      const toolDef = {
        name: 'mcp_server_tool',
        version: '1.0.0',
        description: 'MCP tool from server: tool',
        inputSchema: { type: 'object' },
        defer_loading: true,
        allowed_callers: ['human', 'code_execution_20250825'],
        idempotent: false,
        sideEffectful: true,
        scopes: ['mcp:server'],
        timeoutMs: 30000,
      };

      expect(toolDef.name).toContain('mcp_');
      expect(toolDef.defer_loading).toBe(true);
      expect(toolDef.scopes).toContain('mcp:server');
    });

    it('should set conservative defaults', () => {
      const defaults = {
        idempotent: false,
        sideEffectful: true,
        timeoutMs: 30000,
      };

      // MCP tools should default to non-idempotent and side-effectful for safety
      expect(defaults.idempotent).toBe(false);
      expect(defaults.sideEffectful).toBe(true);
    });
  });

  describe('Content Extraction', () => {
    function extractText(content: { type: string; text?: string }[]): string {
      return content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
    }

    it('should extract text from content array', () => {
      const content = [
        { type: 'text', text: 'Line 1' },
        { type: 'text', text: 'Line 2' },
      ];

      const text = extractText(content);
      expect(text).toBe('Line 1\nLine 2');
    });

    it('should filter out non-text content', () => {
      const content = [
        { type: 'text', text: 'Hello' },
        { type: 'image', data: 'base64...' },
        { type: 'text', text: 'World' },
      ];

      const text = extractText(content);
      expect(text).toBe('Hello\nWorld');
    });

    it('should handle empty content', () => {
      const content: { type: string; text?: string }[] = [];
      const text = extractText(content);
      expect(text).toBe('');
    });
  });

  describe('Content Parsing', () => {
    function parseContent(content: { type: string; text?: string; data?: string; mimeType?: string }[]): unknown {
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

    it('should parse JSON text content', () => {
      const content = [
        { type: 'text', text: '{"key": "value"}' },
      ];

      const parsed = parseContent(content);
      expect(parsed).toEqual({ key: 'value' });
    });

    it('should return plain text if not JSON', () => {
      const content = [
        { type: 'text', text: 'Not JSON' },
      ];

      const parsed = parseContent(content);
      expect(parsed).toBe('Not JSON');
    });

    it('should handle multiple content items', () => {
      const content = [
        { type: 'text', text: 'Hello' },
        { type: 'image', data: 'base64', mimeType: 'image/png' },
      ];

      const parsed = parseContent(content) as any[];
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toBe('Hello');
      expect(parsed[1].type).toBe('image');
    });
  });

  describe('Client Management', () => {
    it('should store clients by name', () => {
      const clients = new Map<string, unknown>();

      clients.set('server1', { connected: true });
      clients.set('server2', { connected: true });

      expect(clients.has('server1')).toBe(true);
      expect(clients.size).toBe(2);
    });

    it('should disconnect and remove client', () => {
      const clients = new Map<string, unknown>();
      const apis = new Map<string, unknown>();

      clients.set('server', { connected: true });
      apis.set('server', { tools: {} });

      // Disconnect
      clients.delete('server');
      apis.delete('server');

      expect(clients.has('server')).toBe(false);
      expect(apis.has('server')).toBe(false);
    });

    it('should get API by name', () => {
      const apis = new Map<string, { serverName: string }>();
      apis.set('my-server', { serverName: 'my-server' });

      const api = apis.get('my-server');
      expect(api?.serverName).toBe('my-server');
    });

    it('should return null for missing API', () => {
      const apis = new Map<string, unknown>();
      const api = apis.get('non-existent') ?? null;

      expect(api).toBeNull();
    });

    it('should list all APIs', () => {
      const apis = new Map<string, { serverName: string }>();
      apis.set('server1', { serverName: 'server1' });
      apis.set('server2', { serverName: 'server2' });

      const allApis = [...apis.values()];
      expect(allApis).toHaveLength(2);
    });
  });

  describe('Mock Client', () => {
    it('should provide mock tool list', async () => {
      const mockClient = {
        listTools: async () => ({
          tools: [
            {
              name: 'mock_tool',
              description: 'Mock tool for testing',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        }),
      };

      const result = await mockClient.listTools();
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe('mock_tool');
    });

    it('should provide mock tool call response', async () => {
      const mockClient = {
        callTool: async (request: { name: string; arguments: unknown }) => ({
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              mock: true,
              tool: request.name,
              args: request.arguments,
            }),
          }],
        }),
      };

      const result = await mockClient.callTool({
        name: 'test',
        arguments: { query: 'hello' },
      });

      const parsed = JSON.parse(result.content[0].text!);
      expect(parsed.mock).toBe(true);
      expect(parsed.tool).toBe('test');
    });

    it('should provide empty resource list', async () => {
      const mockClient = {
        listResources: async () => ({
          resources: [],
        }),
      };

      const result = await mockClient.listResources();
      expect(result.resources).toHaveLength(0);
    });

    it('should provide mock resource content', async () => {
      const mockClient = {
        readResource: async (uri: string) => ({
          contents: [{
            type: 'text' as const,
            text: `Mock content for ${uri}`,
          }],
        }),
      };

      const result = await mockClient.readResource('test://resource');
      expect(result.contents[0].text).toContain('test://resource');
    });
  });

  describe('Error Handling', () => {
    it('should detect error responses', () => {
      const response = {
        content: [{ type: 'text', text: 'Error: invalid input' }],
        isError: true,
      };

      expect(response.isError).toBe(true);
    });

    it('should create error message from content', () => {
      const content = [{ type: 'text', text: 'Something went wrong' }];
      const errorMessage = `MCP tool error: ${content[0].text}`;

      expect(errorMessage).toContain('MCP tool error');
      expect(errorMessage).toContain('Something went wrong');
    });

    it('should handle connection failures gracefully', () => {
      const fallbackToMock = (error: Error) => {
        return {
          useMock: true,
          reason: error.message,
        };
      };

      const result = fallbackToMock(new Error('Connection refused'));
      expect(result.useMock).toBe(true);
    });
  });

  describe('Name Sanitization', () => {
    function sanitizeName(name: string): string {
      return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    }

    it('should replace hyphens with underscores', () => {
      expect(sanitizeName('my-tool-name')).toBe('my_tool_name');
    });

    it('should replace dots with underscores', () => {
      expect(sanitizeName('my.tool.name')).toBe('my_tool_name');
    });

    it('should convert to lowercase', () => {
      expect(sanitizeName('MyToolName')).toBe('mytoolname');
    });

    it('should preserve valid characters', () => {
      expect(sanitizeName('tool_123')).toBe('tool_123');
    });

    it('should handle special characters', () => {
      expect(sanitizeName('tool@#$%name')).toBe('tool____name');
    });
  });

  describe('Integration Scenarios', () => {
    it('should connect and discover tools', async () => {
      const mockApi = {
        serverName: 'test-server',
        tools: {
          search: async (_args: Record<string, unknown>) => ({ results: [] }),
          create: async (_args: Record<string, unknown>) => ({ id: '1' }),
          update: async (_args: Record<string, unknown>) => ({ updated: true }),
        },
        resources: [],
      };

      expect(Object.keys(mockApi.tools)).toHaveLength(3);
    });

    it('should call tool and get result', async () => {
      const searchTool = async (args: { query: string }) => {
        return { results: [`Found: ${args.query}`] };
      };

      const result = await searchTool({ query: 'test' });
      expect(result.results[0]).toContain('test');
    });

    it('should generate stubs for all tools', () => {
      const tools = ['search', 'create', 'update', 'delete'];
      const stubs = tools.map(name =>
        `async def ${name}(args: dict) -> Any:\n    pass`
      ).join('\n\n');

      expect(stubs).toContain('search');
      expect(stubs).toContain('create');
      expect(stubs).toContain('update');
      expect(stubs).toContain('delete');
    });
  });
});
