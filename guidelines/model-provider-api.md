# Model Provider API Guidelines

This document defines the configuration, pricing, and usage patterns for AI model providers in the Agent Marketplace platform.

---

## Supported Providers

### Primary: Anthropic Claude

The main agent orchestration platform uses **Anthropic Claude** models for execution.

**Environment Variable:**
```bash
ANTHROPIC_API_KEY=your-api-key
```

### Secondary: OpenAI (ACC Framework)

The Agent with Chat Controls (ACC) framework uses **OpenAI** as its primary provider.

**Environment Variables:**
```bash
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4o-mini  # Default model
```

### Alternative Providers (ACC)

```bash
ANTHROPIC_API_KEY=your-api-key  # Claude alternative
GEMINI_API_KEY=your-api-key     # Google Gemini alternative
```

---

## Claude Model Configuration

### Available Models

| Model ID | Tier | Input $/1M | Output $/1M | Max Output Tokens |
|----------|------|------------|-------------|-------------------|
| `claude-opus-4-5-20250514` | Premium | $15.00 | $75.00 | 32,000 |
| `claude-sonnet-4-5-20250514` | Standard | $3.00 | $15.00 | 16,000 |
| `claude-haiku-3-5-20241022` | Fast | $0.25 | $1.25 | 8,000 |

### Model Capabilities

**Opus (Premium)**
- Extended thinking
- Complex reasoning
- Multi-agent coordination
- Long horizon tasks
- Novel problem solving

**Sonnet (Standard)**
- Extended thinking
- Reasoning
- Coding
- Analysis
- Tool orchestration

**Haiku (Fast)**
- Classification
- Extraction
- Simple tasks
- Routing
- Validation

### Model Degradation

When budget pressure is detected, models downgrade automatically:
```
Opus → Sonnet → Haiku
```

---

## Effort Levels

Effort levels control Claude's extended thinking token budget.

| Level | Budget Tokens | Recommended Model | Use Cases |
|-------|---------------|-------------------|-----------|
| `minimal` | 1,024 | Haiku | Intent classification, entity extraction, yes/no questions |
| `low` | 4,096 | Haiku | Code formatting, simple refactoring, documentation |
| `medium` | 10,000 | Sonnet | Code review, bug analysis, feature planning |
| `high` | 32,000 | Sonnet | Architecture design, security audit, complex debugging |
| `maximum` | 64,000 | Opus | Novel algorithms, complex system design, research tasks |

### Usage in Code

```typescript
import { selectModelForEffort, getThinkingBudget, EFFORT_PRESETS } from './core/models.js';

// Select model based on effort level
const model = selectModelForEffort('medium');  // Returns 'claude-sonnet-4-5-20250514'

// Get thinking budget
const budget = getThinkingBudget('high');  // Returns 32000
```

---

## Execution Budgets

### Default Budget

```typescript
const DEFAULT_BUDGET = {
  maxTokens: 50000,
  maxCostUsd: 1.00,
  maxDurationMs: 120000,  // 2 minutes
  maxSteps: 20,
  maxToolCalls: 50,
  allowModelDowngrade: true,
  effortLevel: 'medium',
};
```

### Task Complexity Budgets

| Complexity | Max Tokens | Max Cost | Max Duration | Max Steps | Max Tool Calls |
|------------|------------|----------|--------------|-----------|----------------|
| `simple` | 10,000 | $0.10 | 30s | 5 | 10 |
| `moderate` | 30,000 | $0.50 | 60s | 15 | 30 |
| `complex` | 100,000 | $2.00 | 180s | 30 | 100 |
| `very_complex` | 200,000 | $10.00 | 600s | 50 | 200 |

---

## Cost Estimation

### Token-Based Cost Calculation

```typescript
import { estimateCost, MODEL_CONFIG } from './core/models.js';

// Calculate cost for a request
const cost = estimateCost(
  'claude-sonnet-4-5-20250514',
  inputTokens: 1000,
  outputTokens: 500,
  thinkingTokens: 2000  // Charged at output rate
);
```

### Text-Based Estimation

```typescript
import { estimateCostFromText } from './core/models.js';

// Estimate cost from input text (rough: ~4 chars per token)
const estimatedCost = estimateCostFromText(
  'claude-sonnet-4-5-20250514',
  inputText: 'Your prompt here...',
  estimatedOutputMultiplier: 1.5  // Output tokens as multiple of input
);
```

---

## OpenAI Configuration (ACC Framework)

### Default Settings

```python
# app/core/config.py
openai_api_key: str = Field("", env="OPENAI_API_KEY")
openai_model: str = Field("gpt-4o-mini", env="OPENAI_MODEL")
```

### Timeout Configuration

```python
# app/services/openai_client.py
OPENAI_TIMEOUT = httpx.Timeout(
    timeout=120.0,  # Total timeout
    connect=10.0,   # Connection timeout
)
```

### Image Generation

The ACC framework supports image generation with fallback:
1. **Primary**: `gpt-image-1` (base64 response)
2. **Fallback**: `dall-e-3` (URL response)

```python
# Returns data URIs for inline rendering
urls = await client.generate_image(prompt="A beautiful sunset")
# Result: ["data:image/png;base64,..."]
```

---

## Client Patterns

### Singleton Pattern (ACC)

The OpenAI client uses class-level caching for connection reuse:

```python
class OpenAIClient:
    _cached_client: Optional[AsyncOpenAI] = None
    _cached_key: Optional[str] = None

    def _get_client(self) -> AsyncOpenAI:
        if self._cached_client and self._cached_key == self.api_key:
            return self._cached_client
        # Create new client if needed...
```

### Streaming Completions

```python
# Non-streaming
response = await client.create_chat_completion(messages, tools)

# Streaming (includes usage tracking)
stream = await client.create_chat_completion_stream(
    messages,
    tools,
    stream_options={"include_usage": True}
)
```

---

## Environment Variables Summary

### Agent Marketplace (Main Platform)

```bash
# Required
ANTHROPIC_API_KEY=your-anthropic-key

# Optional
DATABASE_PATH=./data/agent-marketplace.db
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Debug options
STORE_FULL_INPUTS=false
STORE_FULL_OUTPUTS=false
STORE_DEBUG_PROVENANCE=false
```

### ACC Framework

```bash
# Required
OPENAI_API_KEY=your-openai-key

# Model configuration
OPENAI_MODEL=gpt-4o-mini

# Alternative providers
ANTHROPIC_API_KEY=your-anthropic-key
GEMINI_API_KEY=your-gemini-key

# Search integration
SEARCH_API_KEY=your-search-key
TAVILY_API_KEY=your-tavily-key

# E2B Sandbox
E2B_API_KEY=your-e2b-key
E2B_ENABLED=false
ARTIFACT_RUN_ENABLED=false

# Storage
CHROMA_PERSIST_DIR=./chroma_db
UPLOAD_DIR=./uploads

# Server
ALLOWED_ORIGINS=*
ENVIRONMENT=development
ENABLE_TASK_PROGRESS=true
```

---

## Best Practices

1. **Always validate API keys** before making requests
2. **Use connection pooling** via singleton clients
3. **Set appropriate timeouts** (120s for complex tasks)
4. **Track token usage** with `stream_options.include_usage`
5. **Implement fallbacks** for image generation and alternative models
6. **Log masked API keys** for debugging (show first/last 4 chars only)
7. **Use effort levels** to optimize cost vs. quality tradeoffs
8. **Enable model degradation** when budget pressure is acceptable
