/**
 * External Agent Proxy
 *
 * Handles proxying requests to external agents (FastAPI, etc.)
 * with support for streaming, retries, and circuit breaking.
 */

import { createLogger } from '../logging/logger.js';
import { getExternalAgentRegistry } from './registry.js';
import { SSEWriter, SSEReader, proxySSEStream, streamifyResponse } from '../streaming/sse.js';
import type { Response } from 'express';
import type {
  ExternalAgent,
  ExternalExecuteRequest,
  StreamEvent,
  StreamHandlers,
  DoneEventData,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
} from './types.js';

const logger = createLogger({ level: 'info' });

/**
 * Result of executing an external agent
 */
export interface ProxyExecutionResult {
  success: boolean;
  runId: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
    durationMs: number;
  };
}

/**
 * External Agent Proxy
 *
 * Handles all communication with external agents including:
 * - Non-streaming requests
 * - SSE streaming
 * - WebSocket streaming
 * - Retries with exponential backoff
 * - Circuit breaking integration
 */
export class ExternalAgentProxy {
  private registry = getExternalAgentRegistry();

  /**
   * Execute an external agent (non-streaming)
   */
  async execute(
    agentId: string,
    request: ExternalExecuteRequest
  ): Promise<ProxyExecutionResult> {
    const agent = this.registry.get(agentId);
    if (!agent) {
      return {
        success: false,
        runId: request.requestId || crypto.randomUUID(),
        error: {
          code: 'AGENT_NOT_FOUND',
          message: `External agent '${agentId}' not found`,
          retryable: false,
        },
      };
    }

    if (!this.registry.isAvailable(agentId)) {
      return {
        success: false,
        runId: request.requestId || crypto.randomUUID(),
        error: {
          code: 'AGENT_UNAVAILABLE',
          message: `External agent '${agentId}' is unavailable`,
          retryable: true,
        },
      };
    }

    const runId = request.requestId || crypto.randomUUID();
    const startTime = Date.now();

    try {
      this.registry.recordRequestStart(agentId);

      const result = await this.executeWithRetry(agent, request, runId);

      const durationMs = Date.now() - startTime;
      this.registry.recordRequestEnd(agentId, durationMs, !result.success);

      return {
        ...result,
        usage: {
          ...result.usage,
          durationMs,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.registry.recordRequestEnd(agentId, durationMs, true);

      return {
        success: false,
        runId,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        },
        usage: { durationMs },
      };
    }
  }

  /**
   * Execute with streaming response
   */
  async executeStream(
    agentId: string,
    request: ExternalExecuteRequest,
    res: Response
  ): Promise<void> {
    const agent = this.registry.get(agentId);
    const runId = request.requestId || crypto.randomUUID();
    const writer = new SSEWriter(res, runId);

    if (!agent) {
      writer.sendError('AGENT_NOT_FOUND', `External agent '${agentId}' not found`);
      return;
    }

    if (!this.registry.isAvailable(agentId)) {
      writer.sendError('AGENT_UNAVAILABLE', `External agent '${agentId}' is unavailable`, true);
      return;
    }

    const startTime = Date.now();
    this.registry.recordRequestStart(agentId);

    try {
      writer.sendStart({ agentId, runId });

      const config = agent.config;
      const protocol = config.streamingProtocol;

      if (protocol === 'sse') {
        // Proxy SSE stream from external agent
        const streamUrl = `${config.endpoints.baseUrl}${config.endpoints.streamPath || '/execute/stream'}`;
        const headers = this.registry.buildHeaders(config);

        await proxySSEStream(
          streamUrl,
          headers,
          writer,
          this.buildRequestBody(request),
          config.timeoutMs || 120000
        );
      } else if (protocol === 'websocket') {
        // WebSocket streaming
        await this.executeWebSocketStream(agent, request, writer);
      } else {
        // Non-streaming agent - execute and streamify response
        const result = await this.executeWithRetry(agent, request, runId);

        if (result.success) {
          streamifyResponse(writer, {
            result: result.result,
            content: typeof result.result === 'string' ? result.result : JSON.stringify(result.result),
            usage: result.usage,
            runId,
          });
        } else {
          writer.sendError(
            result.error?.code || 'EXECUTION_ERROR',
            result.error?.message || 'Execution failed',
            result.error?.retryable
          );
        }
      }

      const durationMs = Date.now() - startTime;
      this.registry.recordRequestEnd(agentId, durationMs, false);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.registry.recordRequestEnd(agentId, durationMs, true);

      writer.sendError(
        'STREAM_ERROR',
        error instanceof Error ? error.message : 'Unknown error',
        true
      );
    }
  }

  /**
   * Execute with handlers for events
   */
  async executeWithHandlers(
    agentId: string,
    request: ExternalExecuteRequest,
    handlers: StreamHandlers
  ): Promise<ProxyExecutionResult> {
    const agent = this.registry.get(agentId);
    const runId = request.requestId || crypto.randomUUID();

    if (!agent) {
      handlers.onError?.({
        code: 'AGENT_NOT_FOUND',
        message: `External agent '${agentId}' not found`,
        retryable: false,
      });
      return {
        success: false,
        runId,
        error: { code: 'AGENT_NOT_FOUND', message: `External agent '${agentId}' not found`, retryable: false },
      };
    }

    if (!this.registry.isAvailable(agentId)) {
      handlers.onError?.({
        code: 'AGENT_UNAVAILABLE',
        message: `External agent '${agentId}' is unavailable`,
        retryable: true,
      });
      return {
        success: false,
        runId,
        error: { code: 'AGENT_UNAVAILABLE', message: `External agent '${agentId}' is unavailable`, retryable: true },
      };
    }

    const startTime = Date.now();
    this.registry.recordRequestStart(agentId);

    try {
      handlers.onStart?.();

      const config = agent.config;

      if (config.streamingProtocol === 'sse') {
        return await this.executeSSEWithHandlers(agent, request, handlers, runId, startTime);
      } else {
        // Non-streaming execution
        const result = await this.executeWithRetry(agent, request, runId);

        if (result.success && typeof result.result === 'string') {
          handlers.onToken?.({ content: result.result });
        }

        const durationMs = Date.now() - startTime;
        handlers.onDone?.({ result: result.result, usage: { ...result.usage, durationMs }, runId });

        this.registry.recordRequestEnd(agentId, durationMs, !result.success);
        return { ...result, usage: { ...result.usage, durationMs } };
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.registry.recordRequestEnd(agentId, durationMs, true);

      const errorData = {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        retryable: true,
      };
      handlers.onError?.(errorData);

      return { success: false, runId, error: errorData, usage: { durationMs } };
    }
  }

  /**
   * Execute with retries
   */
  private async executeWithRetry(
    agent: ExternalAgent,
    request: ExternalExecuteRequest,
    runId: string
  ): Promise<ProxyExecutionResult> {
    const config = agent.config;
    const retryConfig = config.retry as RetryConfig;
    const maxRetries = retryConfig?.maxRetries || 3;

    let lastError: Error | undefined;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const url = `${config.endpoints.baseUrl}${config.endpoints.executePath || '/execute'}`;
        const headers = this.registry.buildHeaders(config);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 120000);

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(this.buildRequestBody(request)),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const shouldRetry = retryConfig?.retryableStatuses?.includes(response.status);
          if (shouldRetry && attempt < maxRetries) {
            attempt++;
            await this.delay(this.calculateBackoff(attempt, retryConfig));
            continue;
          }

          const errorText = await response.text();
          return {
            success: false,
            runId,
            error: {
              code: `HTTP_${response.status}`,
              message: errorText || response.statusText,
              retryable: shouldRetry || false,
            },
          };
        }

        const data = await response.json();
        return {
          success: true,
          runId,
          result: data.result || data,
          usage: data.usage,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (error instanceof Error && error.name === 'AbortError') {
          return {
            success: false,
            runId,
            error: { code: 'TIMEOUT', message: 'Request timed out', retryable: true },
          };
        }

        if (attempt < maxRetries) {
          attempt++;
          await this.delay(this.calculateBackoff(attempt, retryConfig));
          continue;
        }
      }
    }

    return {
      success: false,
      runId,
      error: {
        code: 'MAX_RETRIES_EXCEEDED',
        message: lastError?.message || 'Max retries exceeded',
        retryable: false,
      },
    };
  }

  /**
   * Execute SSE stream with handlers
   */
  private async executeSSEWithHandlers(
    agent: ExternalAgent,
    request: ExternalExecuteRequest,
    handlers: StreamHandlers,
    runId: string,
    startTime: number
  ): Promise<ProxyExecutionResult> {
    const config = agent.config;
    const url = `${config.endpoints.baseUrl}${config.endpoints.streamPath || '/execute/stream'}`;
    const headers = this.registry.buildHeaders(config);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 120000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { ...headers, Accept: 'text/event-stream' },
        body: JSON.stringify(this.buildRequestBody(request)),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          runId,
          error: {
            code: `HTTP_${response.status}`,
            message: errorText || response.statusText,
            retryable: response.status >= 500,
          },
        };
      }

      if (!response.body) {
        return {
          success: false,
          runId,
          error: { code: 'NO_RESPONSE_BODY', message: 'No response body', retryable: false },
        };
      }

      const reader = new SSEReader();
      let finalResult: unknown;
      let finalUsage: DoneEventData['usage'];

      // Set up event handlers
      reader.on('token', (data) => handlers.onToken?.(data));
      reader.on('tool_call', (data) => handlers.onToolCall?.(data));
      reader.on('tool_result', (data) => handlers.onToolResult?.(data));
      reader.on('progress', (data) => handlers.onProgress?.(data));
      reader.on('error', (data) => handlers.onError?.(data));
      reader.on('event', (event) => handlers.onEvent?.(event));
      reader.on('done', (data: DoneEventData) => {
        finalResult = data.result;
        finalUsage = data.usage;
        handlers.onDone?.(data);
      });

      // Read the stream
      const textDecoder = new TextDecoder();
      const streamReader = response.body.getReader();

      try {
        while (true) {
          const { done, value } = await streamReader.read();
          if (done) break;
          reader.processChunk(textDecoder.decode(value, { stream: true }));
        }
      } finally {
        reader.end();
        streamReader.releaseLock();
      }

      const durationMs = Date.now() - startTime;
      return {
        success: true,
        runId,
        result: finalResult,
        usage: { ...finalUsage, durationMs },
      };
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          runId,
          error: { code: 'TIMEOUT', message: 'Request timed out', retryable: true },
        };
      }

      return {
        success: false,
        runId,
        error: {
          code: 'CONNECTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          retryable: true,
        },
      };
    }
  }

  /**
   * Execute WebSocket stream
   */
  private async executeWebSocketStream(
    agent: ExternalAgent,
    request: ExternalExecuteRequest,
    writer: SSEWriter
  ): Promise<void> {
    // WebSocket implementation placeholder
    // In a real implementation, this would:
    // 1. Establish WebSocket connection
    // 2. Send request
    // 3. Forward messages to SSE writer
    // 4. Handle errors and cleanup

    writer.sendError(
      'WEBSOCKET_NOT_IMPLEMENTED',
      'WebSocket streaming is not yet implemented. Use SSE protocol instead.',
      false
    );
  }

  /**
   * Build request body for external agent
   */
  private buildRequestBody(request: ExternalExecuteRequest): Record<string, unknown> {
    return {
      task: request.task,
      stream: request.stream,
      model: request.model,
      budget: request.budget,
      context: request.context,
      request_id: request.requestId,
    };
  }

  /**
   * Calculate backoff delay
   */
  private calculateBackoff(attempt: number, config?: Partial<RetryConfig>): number {
    const initialDelay = config?.initialDelayMs || 1000;
    const maxDelay = config?.maxDelayMs || 30000;
    const multiplier = config?.backoffMultiplier || 2;

    const delay = initialDelay * Math.pow(multiplier, attempt - 1);
    // Add jitter (±25%)
    const jitter = delay * (0.75 + Math.random() * 0.5);
    return Math.min(jitter, maxDelay);
  }

  /**
   * Delay for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let proxyInstance: ExternalAgentProxy | null = null;

export function getExternalAgentProxy(): ExternalAgentProxy {
  if (!proxyInstance) {
    proxyInstance = new ExternalAgentProxy();
  }
  return proxyInstance;
}
