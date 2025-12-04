/**
 * WebSocket Streaming Support
 *
 * Provides WebSocket-based streaming for real-time bidirectional
 * communication with agents.
 */

import { EventEmitter } from 'events';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { Server } from 'http';
import { createLogger } from '../logging/logger.js';
import { getExternalAgentRegistry } from '../external/registry.js';
import { getExternalAgentProxy } from '../external/proxy.js';
import type {
  StreamEvent,
  StreamEventType,
  ExternalExecuteRequest,
} from '../external/types.js';

const logger = createLogger({ level: 'info' });

/**
 * WebSocket message types
 */
export type WSMessageType =
  | 'execute'
  | 'cancel'
  | 'ping'
  | 'pong'
  | 'subscribe'
  | 'unsubscribe'
  | 'event'
  | 'error'
  | 'ack';

/**
 * WebSocket message structure
 */
export interface WSMessage {
  type: WSMessageType;
  id?: string;
  payload?: unknown;
  timestamp?: string;
}

/**
 * Execute request via WebSocket
 */
export interface WSExecutePayload {
  agentId: string;
  task: string | Record<string, unknown>;
  model?: string;
  budget?: {
    maxCostUsd?: number;
    maxTokens?: number;
    maxDurationMs?: number;
  };
  context?: Record<string, unknown>;
}

/**
 * Client connection state
 */
interface ClientConnection {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  activeRuns: Set<string>;
  lastPing: Date;
  authenticated: boolean;
  userId?: string;
  tenantId?: string;
}

/**
 * WebSocket Manager
 *
 * Manages WebSocket connections and message routing for
 * streaming agent execution.
 */
export class WebSocketManager extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientConnection> = new Map();
  private runToClients: Map<string, Set<string>> = new Map();
  private pingInterval?: NodeJS.Timeout;
  private proxy = getExternalAgentProxy();
  private registry = getExternalAgentRegistry();

  /**
   * Initialize WebSocket server
   */
  initialize(server: Server, path: string = '/ws'): void {
    this.wss = new WebSocketServer({ server, path });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      logger.error('websocket_server_error', { error: error.message });
    });

    // Start ping interval
    this.pingInterval = setInterval(() => {
      this.pingClients();
    }, 30000);

    logger.info('websocket_server_started', { path });
  }

  /**
   * Handle new connection
   */
  private handleConnection(ws: WebSocket, req: any): void {
    const clientId = crypto.randomUUID();
    const remoteAddress = req.socket.remoteAddress;

    const client: ClientConnection = {
      id: clientId,
      ws,
      subscriptions: new Set(),
      activeRuns: new Set(),
      lastPing: new Date(),
      authenticated: false, // Auth can be implemented based on token in URL or first message
    };

    this.clients.set(clientId, client);

    logger.info('websocket_client_connected', { clientId, remoteAddress });

    // Send welcome message
    this.sendToClient(client, {
      type: 'ack',
      id: clientId,
      payload: { message: 'Connected to Agent Marketplace WebSocket' },
    });

    ws.on('message', (data) => {
      this.handleMessage(client, data);
    });

    ws.on('close', () => {
      this.handleDisconnect(client);
    });

    ws.on('error', (error) => {
      logger.error('websocket_client_error', {
        clientId,
        error: error.message,
      });
    });

    ws.on('pong', () => {
      client.lastPing = new Date();
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(client: ClientConnection, data: RawData): void {
    try {
      const message: WSMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'execute':
          this.handleExecute(client, message);
          break;
        case 'cancel':
          this.handleCancel(client, message);
          break;
        case 'subscribe':
          this.handleSubscribe(client, message);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(client, message);
          break;
        case 'ping':
          this.sendToClient(client, { type: 'pong', id: message.id });
          break;
        default:
          this.sendError(client, message.id, 'UNKNOWN_MESSAGE_TYPE', `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error('websocket_message_parse_error', {
        clientId: client.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.sendError(client, undefined, 'PARSE_ERROR', 'Failed to parse message');
    }
  }

  /**
   * Handle execute request
   */
  private async handleExecute(client: ClientConnection, message: WSMessage): Promise<void> {
    const payload = message.payload as WSExecutePayload;
    if (!payload?.agentId || !payload?.task) {
      this.sendError(client, message.id, 'INVALID_REQUEST', 'agentId and task are required');
      return;
    }

    const runId = message.id || crypto.randomUUID();
    client.activeRuns.add(runId);

    // Track which clients are subscribed to this run
    if (!this.runToClients.has(runId)) {
      this.runToClients.set(runId, new Set());
    }
    this.runToClients.get(runId)!.add(client.id);

    // Send acknowledgment
    this.sendToClient(client, {
      type: 'ack',
      id: runId,
      payload: { message: 'Execution started', runId },
    });

    // Execute with handlers that forward to WebSocket
    const request: ExternalExecuteRequest = {
      task: payload.task,
      model: payload.model,
      budget: payload.budget,
      context: payload.context,
      requestId: runId,
      stream: true,
    };

    try {
      await this.proxy.executeWithHandlers(payload.agentId, request, {
        onStart: () => {
          this.broadcastToRun(runId, {
            type: 'event',
            id: runId,
            payload: { type: 'start', data: { runId } },
          });
        },
        onToken: (data) => {
          this.broadcastToRun(runId, {
            type: 'event',
            id: runId,
            payload: { type: 'token', data },
          });
        },
        onToolCall: (data) => {
          this.broadcastToRun(runId, {
            type: 'event',
            id: runId,
            payload: { type: 'tool_call', data },
          });
        },
        onToolResult: (data) => {
          this.broadcastToRun(runId, {
            type: 'event',
            id: runId,
            payload: { type: 'tool_result', data },
          });
        },
        onProgress: (data) => {
          this.broadcastToRun(runId, {
            type: 'event',
            id: runId,
            payload: { type: 'progress', data },
          });
        },
        onError: (data) => {
          this.broadcastToRun(runId, {
            type: 'error',
            id: runId,
            payload: data,
          });
        },
        onDone: (data) => {
          this.broadcastToRun(runId, {
            type: 'event',
            id: runId,
            payload: { type: 'done', data },
          });
          this.cleanupRun(runId);
        },
      });
    } catch (error) {
      this.broadcastToRun(runId, {
        type: 'error',
        id: runId,
        payload: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      this.cleanupRun(runId);
    }
  }

  /**
   * Handle cancel request
   */
  private handleCancel(client: ClientConnection, message: WSMessage): void {
    const runId = message.payload as string;
    if (!runId) {
      this.sendError(client, message.id, 'INVALID_REQUEST', 'runId is required');
      return;
    }

    // TODO: Implement actual cancellation logic
    // This would need to be coordinated with the proxy/external agent

    client.activeRuns.delete(runId);

    this.sendToClient(client, {
      type: 'ack',
      id: message.id,
      payload: { message: 'Cancellation requested', runId },
    });
  }

  /**
   * Handle subscribe request
   */
  private handleSubscribe(client: ClientConnection, message: WSMessage): void {
    const topic = message.payload as string;
    if (!topic) {
      this.sendError(client, message.id, 'INVALID_REQUEST', 'topic is required');
      return;
    }

    client.subscriptions.add(topic);

    this.sendToClient(client, {
      type: 'ack',
      id: message.id,
      payload: { message: 'Subscribed', topic },
    });
  }

  /**
   * Handle unsubscribe request
   */
  private handleUnsubscribe(client: ClientConnection, message: WSMessage): void {
    const topic = message.payload as string;
    if (!topic) {
      this.sendError(client, message.id, 'INVALID_REQUEST', 'topic is required');
      return;
    }

    client.subscriptions.delete(topic);

    this.sendToClient(client, {
      type: 'ack',
      id: message.id,
      payload: { message: 'Unsubscribed', topic },
    });
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(client: ClientConnection): void {
    // Clean up subscriptions
    for (const runId of client.activeRuns) {
      const clients = this.runToClients.get(runId);
      if (clients) {
        clients.delete(client.id);
        if (clients.size === 0) {
          this.runToClients.delete(runId);
        }
      }
    }

    this.clients.delete(client.id);
    logger.info('websocket_client_disconnected', { clientId: client.id });
  }

  /**
   * Clean up after run completes
   */
  private cleanupRun(runId: string): void {
    const clientIds = this.runToClients.get(runId);
    if (clientIds) {
      for (const clientId of clientIds) {
        const client = this.clients.get(clientId);
        if (client) {
          client.activeRuns.delete(runId);
        }
      }
    }
    this.runToClients.delete(runId);
  }

  /**
   * Send message to a specific client
   */
  private sendToClient(client: ClientConnection, message: WSMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        ...message,
        timestamp: new Date().toISOString(),
      }));
    }
  }

  /**
   * Send error to client
   */
  private sendError(client: ClientConnection, id: string | undefined, code: string, message: string): void {
    this.sendToClient(client, {
      type: 'error',
      id,
      payload: { code, message },
    });
  }

  /**
   * Broadcast message to all clients subscribed to a run
   */
  private broadcastToRun(runId: string, message: WSMessage): void {
    const clientIds = this.runToClients.get(runId);
    if (!clientIds) return;

    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client) {
        this.sendToClient(client, message);
      }
    }
  }

  /**
   * Broadcast message to all clients subscribed to a topic
   */
  broadcastToTopic(topic: string, message: WSMessage): void {
    for (const client of this.clients.values()) {
      if (client.subscriptions.has(topic)) {
        this.sendToClient(client, message);
      }
    }
  }

  /**
   * Broadcast message to all clients
   */
  broadcastToAll(message: WSMessage): void {
    for (const client of this.clients.values()) {
      this.sendToClient(client, message);
    }
  }

  /**
   * Ping all clients to keep connections alive
   */
  private pingClients(): void {
    const now = new Date();
    const timeout = 60000; // 60 seconds

    for (const [clientId, client] of this.clients) {
      if (now.getTime() - client.lastPing.getTime() > timeout) {
        // Client hasn't responded to pings, disconnect
        logger.warn('websocket_client_timeout', { clientId });
        client.ws.terminate();
        this.handleDisconnect(client);
      } else if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    connectedClients: number;
    activeRuns: number;
    totalSubscriptions: number;
  } {
    let totalSubscriptions = 0;
    for (const client of this.clients.values()) {
      totalSubscriptions += client.subscriptions.size;
    }

    return {
      connectedClients: this.clients.size,
      activeRuns: this.runToClients.size,
      totalSubscriptions,
    };
  }

  /**
   * Shutdown WebSocket server
   */
  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    for (const client of this.clients.values()) {
      client.ws.close(1001, 'Server shutting down');
    }

    this.clients.clear();
    this.runToClients.clear();

    if (this.wss) {
      this.wss.close();
    }

    logger.info('websocket_server_shutdown');
  }
}

// Singleton instance
let wsManager: WebSocketManager | null = null;

export function getWebSocketManager(): WebSocketManager {
  if (!wsManager) {
    wsManager = new WebSocketManager();
  }
  return wsManager;
}
