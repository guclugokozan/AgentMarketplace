# Agent Marketplace Guidelines

This folder contains all project guidelines, standards, and documentation for the Agent Marketplace platform.

---

## Quick Reference

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | Main project guidance for AI assistants |
| [ACC-CLAUDE.md](ACC-CLAUDE.md) | Agent with Chat Controls framework guidance |
| [design-system.md](design-system.md) | UI/UX design standards and component patterns |
| [model-provider-api.md](model-provider-api.md) | AI model configuration and API guidelines |
| [sse-streaming.md](sse-streaming.md) | Real-time streaming implementation patterns |
| [ai-features-implementation-plan.md](ai-features-implementation-plan.md) | 20 AI agent features implementation plan |

---

## Document Overview

### CLAUDE.md
**Purpose**: Primary guidance document for Claude Code and other AI assistants.

**Contents**:
- Development commands (npm scripts)
- Project architecture overview
- Directory structure
- Agent creation patterns
- API endpoint reference
- Testing guidelines

### ACC-CLAUDE.md
**Purpose**: Guidance for the Agent with Chat Controls (ACC) FastAPI/React framework.

**Contents**:
- Backend (FastAPI) development commands
- Frontend (React/Vite) development commands
- Architecture documentation
- Data flow patterns
- Environment configuration
- Browser testing with Playwright MCP

### design-system.md
**Purpose**: Visual design standards for frontend applications.

**Contents**:
- Color system (neutral, brand, semantic colors)
- Typography scale and font weights
- Spacing and sizing tokens
- Component patterns (buttons, inputs, cards, modals)
- Dark mode implementation
- Accessibility guidelines
- Animation standards

### model-provider-api.md
**Purpose**: AI model configuration, pricing, and integration guidelines.

**Contents**:
- Claude model configuration (Opus, Sonnet, Haiku)
- OpenAI configuration (ACC framework)
- Effort levels and budget presets
- Cost estimation formulas
- Environment variable reference
- Client patterns and best practices

### sse-streaming.md
**Purpose**: Real-time streaming implementation for chat applications.

**Contents**:
- SSE event protocol and message format
- Backend FastAPI streaming implementation
- Frontend React hooks for streaming
- Tool progress UI patterns
- Error handling strategies
- Performance optimization
- Testing approaches

### ai-features-implementation-plan.md
**Purpose**: Implementation plan for 20 advanced AI agent features.

**Contents**:
- 20 detailed agent specifications (Image Generator, Video Generator, Face Swap, Lipsync, etc.)
- Type definitions with Zod schemas for each agent
- Tool definitions and execution patterns
- Architecture patterns (file structure, providers)
- Implementation order by phase (14 weeks)
- External API integrations (DALL-E, Runway, ElevenLabs, etc.)
- Database schema additions
- Cost estimation per feature
- Testing strategy

---

## Usage

### For AI Assistants
Reference these documents when working on the codebase to ensure consistency with project standards.

### For Developers
Use these guidelines as the source of truth for:
- Code style and patterns
- API design decisions
- UI component implementation
- Model and provider configuration

---

## Maintenance

These guidelines should be updated when:
- Major architectural changes occur
- New patterns are established
- Dependencies are upgraded
- New features require documentation

---

## Related Files

Additional documentation in the repository:

| Location | Description |
|----------|-------------|
| `IMPLEMENTATION-GUIDE.md` | Phase-by-phase implementation guide |
| `COMPLETE-AGENT-CATALOG.md` | Full catalog of agent types |
| `AgentwithChatControls/README.md` | Comprehensive ACC documentation |
| `AgentwithChatControls/analysis-plan.md` | ACC architecture analysis |

---

## Version

Last updated: December 2024

Based on:
- Agent Marketplace v1.0
- ACC Framework (FastAPI + React)
- Claude API (claude-opus-4-5, claude-sonnet-4-5, claude-haiku-3-5)
- OpenAI API (gpt-4o-mini, dall-e-3)
