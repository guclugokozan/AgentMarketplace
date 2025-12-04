# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Start development server with hot reload
npm run dev

# Build the project
npm run build

# Run all tests
npm test

# Run a single test file
npx vitest run tests/core.test.ts

# Run tests in watch mode
npx vitest

# Type check without emitting
npm run typecheck

# Initialize/reset the database
npm run db:init
```

## Project Overview

Agent Marketplace is an AI agent orchestration platform with:
- REST API for executing agents with budget controls
- SSE and WebSocket streaming for real-time responses
- External agent integration (FastAPI, etc.)
- Multi-tenant support with ABAC

## Architecture

### Core Flow
1. **API Server** ([src/api/server.ts](src/api/server.ts)) → receives execute requests
2. **PreFlight Checker** ([src/execution/preflight.ts](src/execution/preflight.ts)) → validates budget feasibility
3. **Agent Executor** ([src/execution/executor.ts](src/execution/executor.ts)) → runs agent with budget enforcement and model downgrade
4. **Storage** ([src/storage/](src/storage/)) → SQLite persistence for runs, steps, provenance

### Key Concepts

**Budget & Model Degradation**: Each run has token/cost/duration limits. When budget pressure detected, executor downgrades models (Opus → Sonnet → Haiku).

**Effort Levels**: `minimal`, `low`, `medium`, `high`, `maximum` - control Claude's extended thinking token budget. Defined in [src/core/models.ts](src/core/models.ts).

**Idempotency**: Every run/step has an idempotency key. Duplicate requests return cached results.

### Creating Agents

Use `defineAgent` from [src/sdk/define-agent.ts](src/sdk/define-agent.ts):
```typescript
import { defineAgent } from './sdk/define-agent.js';
import { z } from 'zod';

export const myAgent = defineAgent({
  id: 'my-agent',
  name: 'My Agent',
  description: 'Does something useful',
  version: '1.0.0',
  input: z.object({ ... }),
  output: z.object({ ... }),
  execute: async (input, context) => { ... }
});
```

Agents are registered in server startup ([src/api/server.ts:198-202](src/api/server.ts#L198-L202)).

### Directory Structure

- `src/core/` - Types, models, error definitions
- `src/agents/` - Built-in agent implementations (code-reviewer, blog-writer, etc.)
- `src/execution/` - Agent executor with budget enforcement
- `src/storage/` - SQLite database layer (better-sqlite3)
- `src/api/routes/` - Express route handlers
- `src/external/` - External agent proxy (FastAPI integration)
- `src/streaming/` - SSE and WebSocket managers
- `src/enterprise/` - Multi-tenant, ABAC, fair queue
- `src/sdk/` - Agent definition helpers

### API Endpoints

- `POST /execute` - Execute an agent
- `POST /stream` - Execute with SSE streaming
- `GET /agents` - List available agents
- `POST /external-agents/:id/execute` - Proxy to external agent
- `GET /runs/:id` - Get run details with steps

### Environment Variables

Copy `.env.example` to `.env`:
- `ANTHROPIC_API_KEY` - Required
- `DATABASE_PATH` - SQLite file location (default: `./data/agent-marketplace.db`)
- `STORE_FULL_INPUTS/OUTPUTS` - Enable for debugging (stores full request/response in DB)

### Testing

Tests use Vitest. Test files are in `tests/` directory. Use test utilities from [tests/setup.ts](tests/setup.ts).

## Agent With Chat Controls (ACC) Framework

The `AgentwithChatControls/` directory contains a full-stack agent framework:
- **Backend**: FastAPI with tool calling, SSE streaming, ChromaDB RAG
- **Frontend**: React + TypeScript with Zustand state management

### ACC Architecture
- [analysis-plan.md](AgentwithChatControls/analysis-plan.md) - Full architecture documentation
- [backend/app/api/chat.py](AgentwithChatControls/backend/app/api/chat.py) - Chat endpoints with tool execution
- [backend/app/models/chat.py](AgentwithChatControls/backend/app/models/chat.py) - Request/Response models

### ACC Key Patterns
1. **Tool Registry**: Tools are registered with schemas and executed via `run_tool()`
2. **SSE Streaming**: Real-time events for content, tool_status, tool_result, artifacts
3. **Attachments**: Images, charts, artifacts returned alongside responses
4. **Task Progress**: Multi-step task tracking with `set_task_plan` and `update_task_progress`

## Reference Sites for Agent Ideas

- https://mulerun.com/agent-store - AI agent marketplace
- https://higgsfield.ai/ - Creative AI apps and video effects

See [COMPLETE-AGENT-CATALOG.md](COMPLETE-AGENT-CATALOG.md) for full agent catalog from these sites.
