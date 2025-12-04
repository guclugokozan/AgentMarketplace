# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A tool-calling AI chat application with FastAPI backend and React/TypeScript frontend. Features real-time SSE streaming, document RAG, web search, web page crawling, image generation, code artifacts, and E2B sandboxed execution.

## Development Commands

### Backend (FastAPI)

```bash
# Setup virtual environment
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run tests
cd backend
pytest tests/                           # All tests
pytest tests/test_bug_fixes.py          # Specific test file
pytest tests/test_bug_fixes.py -k test_name  # Single test
```

### Frontend (React/Vite)

```bash
cd frontend
npm install

# Development
npm run dev                # Start dev server (port 5173)
npm run build              # Build for production
npm run preview            # Preview production build
npm run lint               # ESLint

# Unit Tests (Vitest)
npm run test               # Run all unit tests
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage report
npm run test:ui            # Vitest UI

# E2E Tests (Playwright)
npm run test:e2e           # Run all tests
npm run test:headed        # With browser UI
npm run test:debug         # Debug mode
npm run test:report        # View test report
```

## Architecture

### Backend Structure (`backend/app/`)

- **api/** - FastAPI route handlers
  - `chat.py` - Main SSE streaming endpoint at `/api/chat/stream`
  - `files.py` - File upload/download endpoints
  - `tasks.py` - Task progress tracking (optional, controlled by `ENABLE_TASK_PROGRESS`)

- **services/** - Core business logic
  - `openai_client.py` - OpenAI API wrapper for chat completions
  - `tool_runner.py` - Executes tools based on LLM function calls
  - `prompt_builder.py` - Constructs system prompts with capability-aware tool definitions
  - `search_service.py` - Tavily web search integration
  - `crawler_service.py` - Web page crawler with Reddit/Jina.ai fallback support
  - `chroma_service.py` - ChromaDB vector store for RAG
  - `file_processor.py` - Document parsing (PDF, DOCX, CSV, XLSX)
  - `e2b_client.py` - E2B sandbox code execution

- **models/** - Pydantic models for request/response schemas
- **core/config.py** - Settings loaded from environment variables

### Frontend Structure (`frontend/src/`)

- `App.tsx` - Main component with chat UI, streaming logic, and state management
- `components/ArtifactsPanel.tsx` - Artifact viewer with code highlighting and HTML preview
- `components/TaskProgressCard.tsx` - Visual progress tracking for multi-step tasks
- `hooks/useTaskStream.ts` - Custom hook for task progress SSE streaming
- `types/` - TypeScript type definitions

### Data Flow

1. User sends message → `POST /api/chat/stream`
2. Backend builds prompt via `prompt_builder.py` based on enabled capabilities
3. OpenAI returns tool calls → `tool_runner.py` executes them
4. Results streamed back via SSE events: `content`, `tool_status`, `tool_result`, `artifact`, `done`
5. Frontend parses SSE stream and updates UI incrementally

## Environment Configuration

Backend environment variables (in `backend/.env` or root `.env`):

**Required:**
- `OPENAI_API_KEY` - OpenAI API key

**Optional:**
- `OPENAI_MODEL` - Model to use (default: `gpt-4o-mini`)
- `ANTHROPIC_API_KEY` - Anthropic Claude API key (alternative provider)
- `GEMINI_API_KEY` - Google Gemini API key (alternative provider)
- `SEARCH_API_KEY` / `TAVILY_API_KEY` - Tavily web search
- `E2B_API_KEY`, `E2B_ENABLED`, `ARTIFACT_RUN_ENABLED` - E2B sandbox execution
- `CHROMA_PERSIST_DIR`, `UPLOAD_DIR` - Storage paths
- `ALLOWED_ORIGINS` - CORS origins (default: `*`)
- `ENABLE_TASK_PROGRESS` - Enable task progress tracking

## Key Patterns

- **SSE Streaming**: Chat responses use Server-Sent Events for real-time streaming. The frontend uses a manual `ReadableStream` reader for fine-grained control.

- **Tool System**: Tools are conditionally included based on `ChatSettings` toggles. The `prompt_builder.py` generates tool definitions and `tool_runner.py` handles execution.

- **Artifacts**: Code/HTML/SVG artifacts are emitted as separate SSE events and rendered in `ArtifactsPanel`. HTML artifacts run in sandboxed iframes.

- **RAG**: Uploaded files are chunked, embedded via OpenAI, and stored in ChromaDB. The `rag_retrieve` tool queries relevant chunks.

- **Web Crawler**: The `crawler_service.py` fetches and converts web pages to markdown. Automatically handles Reddit (JSON API), JS-heavy sites (Jina.ai Reader fallback), and regular HTML pages (html2text).

## Browser Testing with Playwright MCP

This project is configured with Microsoft's official Playwright MCP server for real browser automation.

### Available Slash Commands

| Command | Description |
|---------|-------------|
| `/browser-test [url]` | Manual exploratory testing with documentation |
| `/generate-e2e <scenario>` | Generate automated Playwright tests from scenarios |
| `/visual-audit [url]` | Responsive design and visual regression testing |
| `/a11y-test [url]` | Accessibility testing (WCAG compliance) |
| `/chat-flow-test [focus]` | Test chat application core functionality |
| `/debug-browser <issue>` | Debug specific browser issues |

### Usage Examples

```bash
# Interactive testing
/browser-test http://localhost:5173

# Generate automated test
/generate-e2e User can send a message and receive a streaming response

# Visual audit at multiple viewports
/visual-audit

# Accessibility testing
/a11y-test http://localhost:5173

# Debug a specific issue
/debug-browser The send button is not responding when clicked
```

### Direct MCP Usage

You can also use Playwright MCP tools directly:
```
Use playwright mcp to open a browser to http://localhost:5173
```

Key tools:
- `browser_navigate` - Go to URL
- `browser_snapshot` - Get accessibility tree (how Claude "sees" the page)
- `browser_click` - Click elements
- `browser_type` / `browser_fill` - Enter text
- `browser_take_screenshot` - Capture screenshots
- `browser_evaluate` - Run JavaScript
- `browser_console_messages` - Check for JS errors

### Configuration Files

- `.mcp.json` - Playwright MCP server configuration
- `.claude/settings.local.json` - Permissions for MCP tools
- `.claude/commands/` - Custom slash command definitions
