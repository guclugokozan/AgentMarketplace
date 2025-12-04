/**
 * External Agent Types
 *
 * Type definitions for connecting external agents (FastAPI, etc.)
 * with support for streaming protocols (SSE, WebSocket).
 */

import type { AgentCard } from '../core/types.js';

/**
 * Supported streaming protocols for external agents
 */
export type StreamingProtocol = 'sse' | 'websocket' | 'http-chunked' | 'none';

/**
 * Authentication methods for external agents
 */
export type AuthMethod = 'none' | 'api-key' | 'bearer' | 'basic' | 'oauth2' | 'custom';

/**
 * External agent health status
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Authentication configuration for external agents
 */
export interface ExternalAgentAuth {
  method: AuthMethod;
  /** API key or token value */
  credentials?: string;
  /** Header name for API key auth (default: X-API-Key) */
  headerName?: string;
  /** OAuth2 configuration */
  oauth2Config?: {
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
    scopes?: string[];
  };
  /** Custom auth handler function name */
  customHandler?: string;
}

/**
 * Endpoint configuration for external agents
 */
export interface ExternalAgentEndpoints {
  /** Base URL for the agent (e.g., http://localhost:8000) */
  baseUrl: string;
  /** Execute endpoint path (default: /execute or /agent) */
  executePath?: string;
  /** Streaming execute endpoint path (default: /execute/stream or /agent/stream) */
  streamPath?: string;
  /** Health check endpoint path (default: /health) */
  healthPath?: string;
  /** Agent info/card endpoint path (default: /info or /agent) */
  infoPath?: string;
  /** Tools list endpoint (default: /tools) */
  toolsPath?: string;
}

/**
 * Retry configuration for external agent calls
 */
export interface RetryConfig {
  /** Maximum number of retries */
  maxRetries: number;
  /** Initial delay in ms */
  initialDelayMs: number;
  /** Maximum delay in ms */
  maxDelayMs: number;
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
  /** HTTP status codes to retry on */
  retryableStatuses: number[];
}

/**
 * Configuration for an external agent connection
 */
export interface ExternalAgentConfig {
  /** Unique identifier for this external agent */
  id: string;
  /** Display name */
  name: string;
  /** Description of the agent */
  description: string;
  /** Agent version */
  version: string;

  /** Endpoint configuration */
  endpoints: ExternalAgentEndpoints;

  /** Streaming protocol supported by this agent */
  streamingProtocol: StreamingProtocol;

  /** Authentication configuration */
  auth?: ExternalAgentAuth;

  /** Request timeout in milliseconds */
  timeoutMs?: number;

  /** Connection timeout in milliseconds */
  connectionTimeoutMs?: number;

  /** Retry configuration */
  retry?: Partial<RetryConfig>;

  /** Custom headers to include in requests */
  headers?: Record<string, string>;

  /** Whether to verify SSL certificates */
  verifySsl?: boolean;

  /** Health check interval in milliseconds (0 to disable) */
  healthCheckIntervalMs?: number;

  /** Tags for categorization */
  tags?: string[];

  /** Capabilities this agent provides */
  capabilities?: string[];

  /** Maximum concurrent requests to this agent */
  maxConcurrency?: number;

  /** Rate limiting configuration */
  rateLimit?: {
    requestsPerSecond: number;
    burstSize: number;
  };

  /** Whether this agent is enabled */
  enabled?: boolean;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Runtime state for an external agent
 */
export interface ExternalAgentState {
  /** Current health status */
  healthStatus: HealthStatus;
  /** Last successful health check timestamp */
  lastHealthCheck?: Date;
  /** Last health check error */
  lastHealthError?: string;
  /** Number of active requests */
  activeRequests: number;
  /** Total requests made */
  totalRequests: number;
  /** Total errors */
  totalErrors: number;
  /** Average response time in ms */
  avgResponseTimeMs: number;
  /** Whether currently circuit broken */
  circuitBroken: boolean;
  /** Circuit breaker reset time */
  circuitResetTime?: Date;
}

/**
 * Full external agent definition with config and state
 */
export interface ExternalAgent {
  config: ExternalAgentConfig;
  state: ExternalAgentState;
  /** Derived agent card for marketplace compatibility */
  card: AgentCard;
}

/**
 * Request to execute an external agent
 */
export interface ExternalExecuteRequest {
  /** Task description or structured input */
  task: string | Record<string, unknown>;
  /** Whether to use streaming */
  stream?: boolean;
  /** Model override (if agent supports it) */
  model?: string;
  /** Budget constraints */
  budget?: {
    maxCostUsd?: number;
    maxTokens?: number;
    maxDurationMs?: number;
  };
  /** Additional context */
  context?: Record<string, unknown>;
  /** Request ID for tracing */
  requestId?: string;
}

/**
 * Streaming event types
 */
export type StreamEventType =
  | 'start'
  | 'token'
  | 'chunk'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'
  | 'progress'
  | 'error'
  | 'done'
  | 'metadata';

/**
 * A streaming event from an external agent
 */
export interface StreamEvent {
  /** Event type */
  type: StreamEventType;
  /** Event data */
  data: unknown;
  /** Timestamp */
  timestamp: Date;
  /** Sequence number */
  seq: number;
  /** Request/run ID */
  requestId?: string;
}

/**
 * Token/chunk event data
 */
export interface TokenEventData {
  /** The token or text chunk */
  content: string;
  /** Token index */
  index?: number;
  /** Finish reason if this is the last token */
  finishReason?: 'stop' | 'length' | 'tool_use' | 'error';
}

/**
 * Tool call event data
 */
export interface ToolCallEventData {
  /** Tool name */
  name: string;
  /** Tool input */
  input: Record<string, unknown>;
  /** Call ID */
  callId: string;
}

/**
 * Tool result event data
 */
export interface ToolResultEventData {
  /** Call ID this is a result for */
  callId: string;
  /** Result data */
  result: unknown;
  /** Whether there was an error */
  error?: boolean;
}

/**
 * Progress event data
 */
export interface ProgressEventData {
  /** Progress percentage (0-100) */
  percent: number;
  /** Status message */
  message?: string;
  /** Current step */
  step?: number;
  /** Total steps */
  totalSteps?: number;
}

/**
 * Error event data
 */
export interface ErrorEventData {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Whether this is retryable */
  retryable?: boolean;
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Completion/done event data
 */
export interface DoneEventData {
  /** Final result */
  result?: unknown;
  /** Usage statistics */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
    durationMs?: number;
  };
  /** Run ID */
  runId?: string;
}

/**
 * Stream handler callbacks
 */
export interface StreamHandlers {
  onStart?: () => void;
  onToken?: (data: TokenEventData) => void;
  onToolCall?: (data: ToolCallEventData) => void;
  onToolResult?: (data: ToolResultEventData) => void;
  onProgress?: (data: ProgressEventData) => void;
  onError?: (data: ErrorEventData) => void;
  onDone?: (data: DoneEventData) => void;
  onEvent?: (event: StreamEvent) => void;
}

/**
 * FastAPI-specific agent card format
 */
export interface FastAPIAgentCard {
  id: string;
  name: string;
  description: string;
  version: string;
  capabilities?: string[];
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  streaming?: boolean;
  tools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
  metadata?: Record<string, unknown>;
}

/**
 * Convert FastAPI agent card to marketplace format
 */
export function convertFastAPICard(fastApiCard: FastAPIAgentCard, baseUrl: string): AgentCard {
  return {
    id: fastApiCard.id,
    name: fastApiCard.name,
    description: fastApiCard.description,
    version: fastApiCard.version,
    capabilities: fastApiCard.capabilities || [],
    inputSchema: fastApiCard.input_schema || { type: 'object' },
    outputSchema: fastApiCard.output_schema || { type: 'object' },
    defaultModel: 'external',
    defaultEffortLevel: 'medium',
    sideEffects: true, // Assume external agents may have side effects
    estimatedCostTier: 'variable',
  };
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

/**
 * Default external agent configuration
 */
export const DEFAULT_EXTERNAL_AGENT_CONFIG: Partial<ExternalAgentConfig> = {
  timeoutMs: 120000,
  connectionTimeoutMs: 10000,
  verifySsl: true,
  healthCheckIntervalMs: 30000,
  maxConcurrency: 10,
  enabled: true,
  retry: DEFAULT_RETRY_CONFIG,
};
