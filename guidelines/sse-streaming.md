# SSE Streaming Guidelines

This document defines the Server-Sent Events (SSE) streaming patterns for real-time AI chat applications in the Agent Marketplace platform.

---

## Overview

SSE streaming enables real-time communication between backend and frontend, providing:
- Incremental content delivery (token-by-token)
- Tool execution progress updates
- Artifact and attachment delivery
- Error handling without breaking connection

---

## SSE Event Protocol

### Message Format

All SSE messages follow this structure:

```
data: {"type": "<event_type>", "data": {<payload>}}\n\n
```

### Event Types

| Event Type | Description | Payload |
|------------|-------------|---------|
| `content` | Text content chunk | `{ text: string }` |
| `tool_status` | Tool execution started | `{ tool: string, status: "running", message: string }` |
| `tool_result` | Tool execution completed | `{ tool: string, status: "complete", result: any }` |
| `tool_error` | Tool execution failed | `{ tool: string, error: string }` |
| `artifact` | Code/HTML artifact | `{ type: string, title: string, content: string }` |
| `done` | Stream complete | `{ session_id: string }` |
| `error` | Fatal error | `{ message: string }` |

---

## Backend Implementation

### FastAPI Streaming Endpoint

```python
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator
import json

router = APIRouter()

def sse_message(event_type: str, data: dict) -> str:
    """Format Server-Sent Event message"""
    return f"data: {json.dumps({'type': event_type, 'data': data})}\n\n"

@router.post("/chat/stream")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            # 1. Setup: Build messages, system prompt, enabled tools
            messages = build_messages(request)
            tools = build_enabled_tools(request.settings)

            # 2. First OpenAI call with streaming
            stream = await client.chat.completions.create(
                model=settings.openai_model,
                messages=messages,
                tools=tools,
                stream=True,
                stream_options={"include_usage": True}
            )

            # 3. Process stream
            tool_calls_buffer = {}
            async for chunk in stream:
                delta = chunk.choices[0].delta

                # Stream content tokens
                if delta.content:
                    yield sse_message("content", {"text": delta.content})

                # Buffer tool calls
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        # Accumulate tool call data...
                        pass

                # Handle completion
                if chunk.choices[0].finish_reason == "tool_calls":
                    async for event in execute_tools(tool_calls_buffer):
                        yield event

            # 4. Done
            yield sse_message("done", {"session_id": session.id})

        except Exception as e:
            yield sse_message("error", {"message": str(e)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
            "Connection": "keep-alive"
        }
    )
```

### Tool Execution with Progress

```python
async def execute_tools_streaming(tool_calls_buffer: Dict) -> AsyncGenerator[str, None]:
    for tool_call in sorted(tool_calls_buffer.values(), key=lambda x: x['index']):
        tool_name = tool_call["function"]["name"]
        args = json.loads(tool_call["function"]["arguments"])

        # Emit running status
        yield sse_message("tool_status", {
            "tool": tool_name,
            "status": "running",
            "message": get_progress_message(tool_name, args)
        })

        try:
            result = await execute_tool(tool_name, args)

            # Emit result
            yield sse_message("tool_result", {
                "tool": tool_name,
                "status": "complete",
                "result": result
            })

        except Exception as e:
            yield sse_message("tool_error", {
                "tool": tool_name,
                "error": str(e)
            })
```

### Progress Messages

```python
def get_progress_message(tool_name: str, args: dict) -> str:
    messages = {
        "web_search": lambda a: f"Searching for '{a.get('query', '...')}'",
        "rag_retrieve": lambda a: f"Searching documents for '{a.get('query', '...')}'",
        "generate_image": lambda a: f"Generating image: '{a.get('prompt', '')[:50]}...'",
        "analyze_data": lambda a: f"Analyzing data: {a.get('instruction', '...')}",
        "think_mode": lambda a: f"Thinking about: {a.get('question', '')[:50]}...",
    }
    return messages.get(tool_name, lambda a: f"Running {tool_name}...")(args)
```

---

## Frontend Implementation

### React Hook for Streaming

```typescript
import { useState, useCallback, useRef } from 'react';

interface StreamEvent {
  type: 'content' | 'tool_status' | 'tool_result' | 'tool_error' | 'done' | 'error';
  data: any;
}

interface ToolProgress {
  tool: string;
  status: 'running' | 'complete' | 'error';
  message?: string;
  result?: any;
  error?: string;
}

export function useStreamingChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [toolProgress, setToolProgress] = useState<ToolProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (
    message: string,
    history: ChatMessage[],
    settings: ChatSettings
  ) => {
    // Reset state
    setIsStreaming(true);
    setStreamingContent('');
    setToolProgress([]);
    setError(null);

    // Create abort controller
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, settings }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Read stream
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;

          try {
            const event: StreamEvent = JSON.parse(line.slice(6));
            handleStreamEvent(event);
          } catch (e) {
            console.error('Parse error:', e);
          }
        }
      }

      setIsStreaming(false);

    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Request cancelled');
      } else {
        setError(err.message);
      }
      setIsStreaming(false);
    }
  }, []);

  const handleStreamEvent = (event: StreamEvent) => {
    switch (event.type) {
      case 'content':
        setStreamingContent(prev => prev + event.data.text);
        break;

      case 'tool_status':
        setToolProgress(prev => [...prev, {
          tool: event.data.tool,
          status: event.data.status,
          message: event.data.message
        }]);
        break;

      case 'tool_result':
        setToolProgress(prev =>
          prev.map(p => p.tool === event.data.tool
            ? { ...p, status: 'complete', result: event.data.result }
            : p
          )
        );
        break;

      case 'tool_error':
        setToolProgress(prev =>
          prev.map(p => p.tool === event.data.tool
            ? { ...p, status: 'error', error: event.data.error }
            : p
          )
        );
        break;

      case 'error':
        setError(event.data.message);
        break;
    }
  };

  const cancelStream = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return {
    isStreaming,
    streamingContent,
    toolProgress,
    error,
    sendMessage,
    cancelStream
  };
}
```

### Streaming Message Component

```tsx
interface StreamingMessageProps {
  content: string;
  toolProgress: ToolProgress[];
  isStreaming: boolean;
}

export function StreamingMessage({ content, toolProgress, isStreaming }: StreamingMessageProps) {
  return (
    <div className="rounded-xl bg-neutral-800 p-4">
      {/* Tool progress */}
      {toolProgress.length > 0 && (
        <div className="mb-4 space-y-2">
          {toolProgress.map((tool, idx) => (
            <ToolProgressItem key={idx} progress={tool} />
          ))}
        </div>
      )}

      {/* Streaming content */}
      {content && (
        <div className="prose prose-invert">
          <ReactMarkdown>{content}</ReactMarkdown>
          {isStreaming && <span className="animate-pulse">|</span>}
        </div>
      )}
    </div>
  );
}
```

---

## Tool Progress UI Patterns

### Tool Icons

```typescript
const TOOL_ICONS = {
  web_search: '🔍',
  rag_retrieve: '📄',
  generate_image: '🎨',
  analyze_data: '📊',
  think_mode: '🧠',
  crawl_page: '🌐'
};

const TOOL_NAMES = {
  web_search: 'Web Search',
  rag_retrieve: 'Document Search',
  generate_image: 'Image Generation',
  analyze_data: 'Data Analysis',
  think_mode: 'Deep Thinking',
  crawl_page: 'Web Crawler'
};
```

### Progress States CSS

```css
.tool-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  transition: all 0.3s ease;
}

.tool-item.running {
  background: rgba(255, 193, 7, 0.15);
  border-left: 3px solid #ffc107;
  animation: pulse 2s ease-in-out infinite;
}

.tool-item.complete {
  background: rgba(67, 235, 163, 0.15);
  border-left: 3px solid #43eba3;
}

.tool-item.error {
  background: rgba(243, 121, 89, 0.15);
  border-left: 3px solid #f37959;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```

---

## User Experience Timeline

### Example: Web Search Flow

```
[0.0s] User sends: "Search for recent AI news"

[0.1s] ┌─────────────────────────────────────────────┐
       │ 🤖 Assistant                                │
       │                                             │
       │ 🔍 Web Search — Searching for 'AI news'... │
       │ [spinner]                                   │
       └─────────────────────────────────────────────┘

[2.3s] ┌─────────────────────────────────────────────┐
       │ 🤖 Assistant                                │
       │                                             │
       │ ✓ Web Search                                │
       │   ├─ OpenAI announces GPT-5                 │
       │   ├─ Google releases Gemini Ultra           │
       │   └─ Anthropic launches Claude 3.5          │
       │                                             │
       │ Based on recent news, here are the key AI   │
       │ developments...█                            │
       └─────────────────────────────────────────────┘

[4.0s] ┌─────────────────────────────────────────────┐
       │ 🤖 Assistant                                │
       │                                             │
       │ ✓ Web Search                                │
       │   (results shown above)                     │
       │                                             │
       │ Based on recent news, here are the key AI   │
       │ developments:                               │
       │                                             │
       │ 1. **OpenAI GPT-5**: Expected improvements  │
       │    in reasoning and multimodal...           │
       │                                             │
       │ 2. **Google Gemini Ultra**: Strong coding   │
       │    performance...                           │
       │ [complete]                                  │
       └─────────────────────────────────────────────┘
```

---

## Error Handling

### Backend Error Events

```python
try:
    result = await execute_tool(tool_name, args)
    yield sse_message("tool_result", {"tool": tool_name, "result": result})
except ToolTimeoutError:
    yield sse_message("tool_error", {
        "tool": tool_name,
        "error": "Tool timed out after 30 seconds"
    })
except ExternalAPIError as e:
    yield sse_message("tool_error", {
        "tool": tool_name,
        "error": f"External API error: {e.message}"
    })
except Exception as e:
    yield sse_message("tool_error", {
        "tool": tool_name,
        "error": "An unexpected error occurred"
    })
    logger.exception(f"Tool {tool_name} failed")
```

### Frontend Error Display

```tsx
{error && (
  <div className="rounded-lg bg-danger-500/10 border border-danger-500/20 p-4">
    <div className="flex items-center gap-2 text-danger-400">
      <AlertIcon />
      <span>{error}</span>
    </div>
    <button
      onClick={retry}
      className="mt-2 text-sm text-danger-300 hover:text-danger-200"
    >
      Try again
    </button>
  </div>
)}
```

---

## Performance Optimization

### Backend: Parallel Tool Execution

```python
async def execute_tools_parallel(tool_calls: list, session: Session):
    """Execute independent tools in parallel"""
    # Detect dependencies
    has_rag = any(tc['name'] == 'rag_retrieve' for tc in tool_calls)
    has_analysis = any(tc['name'] == 'analyze_data' for tc in tool_calls)

    if has_rag and has_analysis:
        # Sequential: analysis might need RAG results
        return await execute_tools_sequential(tool_calls, session)
    else:
        # Parallel: tools are independent
        tasks = [execute_tool(tc['name'], tc['args'], session) for tc in tool_calls]
        return await asyncio.gather(*tasks)
```

### Frontend: Debounced State Updates

```typescript
// Batch multiple rapid content updates
const contentBuffer = useRef('');
const flushContent = useDebouncedCallback(() => {
  setStreamingContent(prev => prev + contentBuffer.current);
  contentBuffer.current = '';
}, 16); // ~60fps

const handleStreamEvent = (event: StreamEvent) => {
  if (event.type === 'content') {
    contentBuffer.current += event.data.text;
    flushContent();
  }
  // ... other handlers
};
```

---

## Testing

### Backend Stream Testing

```python
def test_streaming_with_tool_calls():
    with TestClient(app) as client:
        with client.stream(
            "POST",
            "/api/chat/stream",
            json={"message": "Search for Python", "settings": {"web_search": True}}
        ) as response:
            events = []
            for line in response.iter_lines():
                if line.startswith(b"data: "):
                    events.append(json.loads(line[6:]))

            # Verify event sequence
            assert events[0]['type'] == 'tool_status'
            assert events[0]['data']['status'] == 'running'

            assert any(e['type'] == 'tool_result' for e in events)
            assert any(e['type'] == 'content' for e in events)
            assert events[-1]['type'] == 'done'
```

### Frontend Stream Testing

```typescript
describe('useStreamingChat', () => {
  it('handles tool progress events', async () => {
    const { result } = renderHook(() => useStreamingChat());

    // Mock SSE response
    mockFetch(createSSEResponse([
      { type: 'tool_status', data: { tool: 'web_search', status: 'running' } },
      { type: 'tool_result', data: { tool: 'web_search', status: 'complete' } },
      { type: 'content', data: { text: 'Results found' } },
      { type: 'done', data: {} }
    ]));

    await act(async () => {
      await result.current.sendMessage('test', [], {});
    });

    expect(result.current.toolProgress).toHaveLength(1);
    expect(result.current.toolProgress[0].status).toBe('complete');
    expect(result.current.streamingContent).toBe('Results found');
  });
});
```

---

## Best Practices

1. **Always flush SSE events immediately** - Don't buffer SSE messages
2. **Use abort controllers** - Enable users to cancel long-running requests
3. **Show progress for all tools** - Never leave users wondering what's happening
4. **Handle partial tool calls** - Buffer tool call chunks before execution
5. **Log all errors** - But show user-friendly messages in UI
6. **Test with slow networks** - Ensure graceful handling of timeouts
7. **Include usage tracking** - Enable `stream_options.include_usage` for monitoring
