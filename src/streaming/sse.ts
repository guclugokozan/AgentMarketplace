/**
 * Server-Sent Events (SSE) Streaming Utilities
 *
 * Provides SSE streaming support for real-time agent responses.
 */

import type { Response } from 'express';
import { EventEmitter } from 'events';
import { createLogger } from '../logging/logger.js';
import type {
  StreamEvent,
  StreamEventType,
  TokenEventData,
  ToolCallEventData,
  ToolResultEventData,
  ProgressEventData,
  ErrorEventData,
  DoneEventData,
} from '../external/types.js';

const logger = createLogger({ level: 'info' });

/**
 * SSE Writer - writes events to an Express response in SSE format
 */
export class SSEWriter {
  private res: Response;
  private seq: number = 0;
  private closed: boolean = false;
  private requestId: string;
  private keepAliveInterval?: NodeJS.Timeout;

  constructor(res: Response, requestId: string) {
    this.res = res;
    this.requestId = requestId;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Start keep-alive
    this.startKeepAlive();

    // Handle client disconnect
    res.on('close', () => {
      this.close();
    });
  }

  /**
   * Send a raw SSE event
   */
  private sendRaw(event: string, data: string, id?: string): void {
    if (this.closed) return;

    try {
      let message = '';
      if (id) message += `id: ${id}\n`;
      message += `event: ${event}\n`;
      message += `data: ${data}\n\n`;

      this.res.write(message);
    } catch (error) {
      logger.error('sse_write_error', {
        requestId: this.requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.close();
    }
  }

  /**
   * Send a typed event
   */
  send(type: StreamEventType, data: unknown): void {
    if (this.closed) return;

    const event: StreamEvent = {
      type,
      data,
      timestamp: new Date(),
      seq: this.seq++,
      requestId: this.requestId,
    };

    this.sendRaw(type, JSON.stringify(event), String(event.seq));
  }

  /**
   * Send start event
   */
  sendStart(data?: Record<string, unknown>): void {
    this.send('start', { requestId: this.requestId, ...data });
  }

  /**
   * Send a token/text chunk
   */
  sendToken(content: string, index?: number, finishReason?: string): void {
    const data: TokenEventData = { content };
    if (index !== undefined) data.index = index;
    if (finishReason) data.finishReason = finishReason as TokenEventData['finishReason'];
    this.send('token', data);
  }

  /**
   * Send a tool call event
   */
  sendToolCall(name: string, input: Record<string, unknown>, callId: string): void {
    const data: ToolCallEventData = { name, input, callId };
    this.send('tool_call', data);
  }

  /**
   * Send a tool result event
   */
  sendToolResult(callId: string, result: unknown, error: boolean = false): void {
    const data: ToolResultEventData = { callId, result, error };
    this.send('tool_result', data);
  }

  /**
   * Send a progress event
   */
  sendProgress(percent: number, message?: string, step?: number, totalSteps?: number): void {
    const data: ProgressEventData = { percent };
    if (message) data.message = message;
    if (step !== undefined) data.step = step;
    if (totalSteps !== undefined) data.totalSteps = totalSteps;
    this.send('progress', data);
  }

  /**
   * Send an error event
   */
  sendError(code: string, message: string, retryable: boolean = false, details?: Record<string, unknown>): void {
    const data: ErrorEventData = { code, message, retryable };
    if (details) data.details = details;
    this.send('error', data);
  }

  /**
   * Send done event and close
   */
  sendDone(result?: unknown, usage?: DoneEventData['usage'], runId?: string): void {
    const data: DoneEventData = {};
    if (result !== undefined) data.result = result;
    if (usage) data.usage = usage;
    if (runId) data.runId = runId;
    this.send('done', data);
    this.close();
  }

  /**
   * Send metadata event
   */
  sendMetadata(metadata: Record<string, unknown>): void {
    this.send('metadata', metadata);
  }

  /**
   * Send thinking/reasoning event
   */
  sendThinking(content: string): void {
    this.send('thinking', { content });
  }

  /**
   * Start keep-alive interval
   */
  private startKeepAlive(): void {
    // Send comment every 15 seconds to keep connection alive
    this.keepAliveInterval = setInterval(() => {
      if (!this.closed) {
        try {
          this.res.write(': keep-alive\n\n');
        } catch {
          this.close();
        }
      }
    }, 15000);
  }

  /**
   * Check if stream is still open
   */
  isOpen(): boolean {
    return !this.closed;
  }

  /**
   * Close the stream
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    try {
      this.res.end();
    } catch {
      // Ignore errors when closing
    }

    logger.info('sse_stream_closed', { requestId: this.requestId, eventsSent: this.seq });
  }
}

/**
 * SSE Reader - parses SSE events from a readable stream
 */
export class SSEReader extends EventEmitter {
  private buffer: string = '';
  private closed: boolean = false;

  constructor() {
    super();
  }

  /**
   * Process incoming data chunk
   */
  processChunk(chunk: string): void {
    if (this.closed) return;

    this.buffer += chunk;

    // Process complete events (separated by double newlines)
    const events = this.buffer.split('\n\n');
    this.buffer = events.pop() || ''; // Keep incomplete event in buffer

    for (const eventStr of events) {
      if (eventStr.trim()) {
        this.parseEvent(eventStr);
      }
    }
  }

  /**
   * Parse a single SSE event
   */
  private parseEvent(eventStr: string): void {
    const lines = eventStr.split('\n');
    let eventType = 'message';
    let data = '';
    let id: string | undefined;

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        data += line.slice(5).trim();
      } else if (line.startsWith('id:')) {
        id = line.slice(3).trim();
      } else if (line.startsWith(':')) {
        // Comment, ignore (used for keep-alive)
        continue;
      }
    }

    if (data) {
      try {
        const parsedData = JSON.parse(data);
        const event: StreamEvent = {
          type: eventType as StreamEventType,
          data: parsedData.data || parsedData,
          timestamp: new Date(parsedData.timestamp || Date.now()),
          seq: parsedData.seq || 0,
          requestId: parsedData.requestId,
        };

        this.emit('event', event);
        this.emit(eventType, event.data);
      } catch {
        // Emit raw data if not JSON
        this.emit('event', { type: eventType, data, timestamp: new Date(), seq: 0 });
        this.emit(eventType, data);
      }
    }
  }

  /**
   * Signal end of stream
   */
  end(): void {
    if (this.closed) return;
    this.closed = true;

    // Process any remaining data in buffer
    if (this.buffer.trim()) {
      this.parseEvent(this.buffer);
    }

    this.emit('end');
  }

  /**
   * Signal an error
   */
  error(err: Error): void {
    this.emit('error', err);
    this.close();
  }

  /**
   * Close the reader
   */
  close(): void {
    this.closed = true;
    this.removeAllListeners();
  }
}

/**
 * Create an SSE response stream from an external SSE source
 */
export async function proxySSEStream(
  sourceUrl: string,
  headers: Record<string, string>,
  targetWriter: SSEWriter,
  requestBody: unknown,
  timeoutMs: number = 120000
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(sourceUrl, {
      method: 'POST',
      headers: {
        ...headers,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      targetWriter.sendError(
        'UPSTREAM_ERROR',
        `External agent returned ${response.status}: ${errorText}`,
        response.status >= 500
      );
      return;
    }

    if (!response.body) {
      targetWriter.sendError('NO_RESPONSE_BODY', 'External agent returned no response body');
      return;
    }

    const reader = new SSEReader();

    // Forward events to target writer
    reader.on('event', (event: StreamEvent) => {
      if (targetWriter.isOpen()) {
        targetWriter.send(event.type, event.data);
      }
    });

    reader.on('done', () => {
      if (targetWriter.isOpen()) {
        targetWriter.close();
      }
    });

    // Read the stream
    const textDecoder = new TextDecoder();
    const streamReader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await streamReader.read();
        if (done) break;

        const chunk = textDecoder.decode(value, { stream: true });
        reader.processChunk(chunk);
      }
    } finally {
      reader.end();
      streamReader.releaseLock();
    }
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof Error && error.name === 'AbortError') {
      targetWriter.sendError('TIMEOUT', 'Request timed out', true);
    } else {
      targetWriter.sendError(
        'CONNECTION_ERROR',
        error instanceof Error ? error.message : 'Unknown error',
        true
      );
    }
  }
}

/**
 * Convert a non-streaming response to SSE events
 */
export function streamifyResponse(
  writer: SSEWriter,
  response: {
    result?: unknown;
    content?: string;
    usage?: DoneEventData['usage'];
    runId?: string;
  }
): void {
  writer.sendStart();

  // If there's content, stream it character by character (simulated)
  if (response.content) {
    const content = response.content;
    const chunkSize = 10; // Characters per chunk

    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.slice(i, i + chunkSize);
      writer.sendToken(chunk, Math.floor(i / chunkSize));
    }
  }

  writer.sendDone(response.result, response.usage, response.runId);
}
