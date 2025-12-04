/**
 * API Server
 *
 * Main entry point for the Agent Marketplace API.
 * Features:
 * - REST API for agent execution
 * - SSE streaming for real-time responses
 * - WebSocket support for bidirectional communication
 * - External agent integration (FastAPI, etc.)
 */

// Load environment variables first
import 'dotenv/config';

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../logging/logger.js';
import { getAgentRegistry } from '../agents/registry.js';
import { getToolRegistry } from '../tools/registry.js';
import { codeReviewerAgent } from '../agents/code-reviewer/index.js';
import { blogWriterAgent } from '../agents/blog-writer/index.js';
import { backgroundRemoverAgent } from '../agents/background-remover/index.js';
import { faceSwapAgent } from '../agents/face-swap/index.js';
import { AgentMarketplaceError } from '../core/errors.js';
import { getProvenanceLogger } from '../audit/provenance.js';
import { getExternalAgentRegistry } from '../external/registry.js';
import { getWebSocketManager } from '../streaming/websocket.js';
import { getAgentRegistry as getMuleRunRegistry } from '../agents/mulerun-registry.js';
import { validateProviderEnv } from '../config/providers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Routes
import executeRoutes from './routes/execute.js';
import runsRoutes from './routes/runs.js';
import agentsRoutes from './routes/agents.js';
import streamRoutes from './routes/stream.js';
import externalAgentsRoutes from './routes/external-agents.js';
import mulerunAgentsRoutes from './routes/mulerun-agents.js';
import jobsRoutes from './routes/jobs.js';

const app = express();
const httpServer = createServer(app);
const logger = createLogger({ level: 'info' });
const PORT = process.env.PORT ?? 3000;

// Middleware
app.use(express.json({ limit: '50mb' })); // Increased for image uploads

// CORS headers for cross-origin requests
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id, X-Run-Id');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

// Serve static files from public directory
const publicPath = path.join(__dirname, '../../public');
app.use(express.static(publicPath));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    // Don't log SSE keep-alive or static file requests
    if (!req.path.startsWith('/stream') || res.statusCode !== 200) {
      logger.info('http_request', {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: duration,
      });
    }
  });

  next();
});

// Higgsfield Test Page redirect
app.get('/higgsfield', (_req: Request, res: Response) => {
  res.redirect('/higgsfield-test.html');
});

// Agent Chat Page redirect (AgentwithChatControls style)
app.get('/agent-chat', (_req: Request, res: Response) => {
  res.redirect('/agent-chat.html');
});

app.get('/chat', (_req: Request, res: Response) => {
  res.redirect('/agent-chat.html');
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  const externalRegistry = getExternalAgentRegistry();
  const externalStats = externalRegistry.getStats();
  const wsManager = getWebSocketManager();
  const wsStats = wsManager.getStats();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.2.0',
    features: {
      streaming: true,
      websocket: true,
      externalAgents: true,
    },
    externalAgents: {
      total: externalStats.total,
      healthy: externalStats.healthy,
    },
    websocket: {
      connectedClients: wsStats.connectedClients,
      activeRuns: wsStats.activeRuns,
    },
  });
});

// Stats endpoint
app.get('/stats', async (_req: Request, res: Response) => {
  const agentRegistry = getAgentRegistry();
  const toolRegistry = getToolRegistry();
  const provenance = getProvenanceLogger();
  const externalRegistry = getExternalAgentRegistry();
  const wsManager = getWebSocketManager();

  const agentStats = agentRegistry.getStats();
  const toolStats = toolRegistry.getStats();
  const provenanceStats = provenance.getStats({ hours: 24 });
  const externalStats = externalRegistry.getStats();
  const wsStats = wsManager.getStats();

  res.json({
    agents: agentStats,
    tools: toolStats,
    last24h: provenanceStats,
    externalAgents: externalStats,
    websocket: wsStats,
  });
});

// API routes
app.use('/execute', executeRoutes);
app.use('/runs', runsRoutes);
app.use('/agents', agentsRoutes);
app.use('/stream', streamRoutes);
app.use('/external-agents', externalAgentsRoutes);
app.use('/mulerun/agents', mulerunAgentsRoutes);
app.use('/jobs', jobsRoutes);

// Error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('request_error', {
    method: req.method,
    path: req.path,
    error: {
      code: (err as any).code ?? 'UNKNOWN',
      message: err.message,
    },
  });

  // Handle JSON parsing errors
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
      },
    });
    return;
  }

  if (err instanceof AgentMarketplaceError) {
    res.status(getStatusCode(err.code)).json({
      error: {
        code: err.code,
        message: err.message,
        retryable: err.retryable,
        details: err.details,
      },
    });
    return;
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An internal error occurred'
        : err.message,
    },
  });
});

function getStatusCode(code: string): number {
  const codes: Record<string, number> = {
    INVALID_INPUT: 400,
    PREFLIGHT_REJECTED: 400,
    AGENT_NOT_FOUND: 404,
    TOOL_NOT_FOUND: 404,
    JOB_NOT_FOUND: 404,
    PERMISSION_DENIED: 403,
    APPROVAL_REQUIRED: 402,
    APPROVAL_DECLINED: 403,
    BUDGET_EXCEEDED: 402,
    RATE_LIMITED: 429,
    TIMEOUT: 504,
    AGENT_UNAVAILABLE: 503,
  };
  return codes[code] ?? 500;
}

// Initialize and start
async function start() {
  // Validate provider environment
  const providerStatus = validateProviderEnv();
  if (!providerStatus.valid) {
    logger.warn('provider_env_validation', {
      missingRequired: providerStatus.missingRequired,
      missingOptional: providerStatus.missingOptional,
    });
  }

  // Register built-in agents
  const agentRegistry = getAgentRegistry();
  agentRegistry.register(codeReviewerAgent);
  agentRegistry.register(blogWriterAgent);
  agentRegistry.register(backgroundRemoverAgent);
  agentRegistry.register(faceSwapAgent);
  logger.info('agents_initialized', { count: 4 });

  // Initialize MuleRun agent registry
  const muleRunRegistry = getMuleRunRegistry();
  const muleRunStats = muleRunRegistry.getStats();
  logger.info('mulerun_agents_initialized', {
    total: muleRunStats.total,
    available: muleRunStats.available,
  });

  // Initialize tool registry
  void getToolRegistry();

  // Initialize external agent registry
  const externalRegistry = getExternalAgentRegistry();

  // Register demo external agent (commented out - enable when FastAPI agent is running)
  // await externalRegistry.register({
  //   id: 'fastapi-demo',
  //   name: 'FastAPI Demo Agent',
  //   description: 'Demo external agent running on FastAPI',
  //   version: '1.0.0',
  //   endpoints: { baseUrl: 'http://localhost:8000' },
  //   streamingProtocol: 'sse',
  // });

  // Initialize WebSocket server
  const wsManager = getWebSocketManager();
  wsManager.initialize(httpServer, '/ws');

  // Start HTTP server
  httpServer.listen(PORT, () => {
    logger.info('server_started', {
      port: PORT,
      environment: process.env.NODE_ENV ?? 'development',
    });

    console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║   🤖 Agent Marketplace API v0.3.0                                          ║
║                                                                            ║
║   Server running at http://localhost:${PORT}                                  ║
║                                                                            ║
║   🌐 Test Interface: http://localhost:${PORT}                                 ║
║   🔌 WebSocket: ws://localhost:${PORT}/ws                                     ║
║                                                                            ║
║   📦 MuleRun Agents: ${muleRunStats.total} total, ${muleRunStats.available} available                              ║
║                                                                            ║
║   MuleRun Agent Endpoints:                                                 ║
║   ├─ GET  /mulerun/agents              List all MuleRun agents             ║
║   ├─ GET  /mulerun/agents/catalog      Full catalog with stats             ║
║   ├─ GET  /mulerun/agents/categories   List categories                     ║
║   ├─ GET  /mulerun/agents/:id          Get agent details                   ║
║   ├─ POST /mulerun/agents/:id/run      Execute agent                       ║
║   └─ GET  /mulerun/agents/:id/jobs     Get agent's jobs                    ║
║                                                                            ║
║   Jobs Endpoints:                                                          ║
║   ├─ GET  /jobs                        List jobs                           ║
║   ├─ GET  /jobs/:id                    Get job details                     ║
║   └─ POST /jobs/:id/cancel             Cancel a job                        ║
║                                                                            ║
║   Core Endpoints:                                                          ║
║   ├─ POST /execute              Execute an agent                           ║
║   ├─ GET  /agents               List core agents                           ║
║   ├─ POST /stream               Execute with SSE streaming                 ║
║   ├─ GET  /health               Health check                               ║
║   └─ GET  /stats                Statistics                                 ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
    `);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('shutdown_initiated');
    wsManager.shutdown();
    externalRegistry.shutdown();
    httpServer.close(() => {
      logger.info('server_shutdown_complete');
      process.exit(0);
    });
  });
}

start().catch((error) => {
  logger.error('server_start_failed', { error: error.message });
  process.exit(1);
});

export default app;
export { httpServer };
