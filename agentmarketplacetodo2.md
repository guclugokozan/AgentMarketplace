# Agent Marketplace V2: Comprehensive Implementation Plan

## Using ACC (Agent With Chat Controls) Framework

**Status**: AWAITING APPROVAL - DO NOT CODE UNTIL APPROVED

This document provides a detailed, phase-by-phase implementation plan for 114 NEW agents using the ACC framework structure. All agents will use direct UI controls (image uploads, aspect ratios, style selectors) rather than being purely conversational.

---

## ACC Framework Architecture Summary

### Backend Structure (Python/FastAPI)
```
AgentwithChatControls/backend/app/
├── api/
│   ├── chat.py              # SSE streaming endpoint
│   └── agents/              # NEW: Agent-specific endpoints
│       ├── __init__.py
│       ├── face_swap.py
│       ├── video_generator.py
│       └── ...
├── models/
│   ├── chat.py              # ChatSettings, ChatRequest, etc.
│   └── agents/              # NEW: Agent-specific models
│       ├── __init__.py
│       ├── face_swap.py
│       └── ...
├── services/
│   ├── tool_runner.py       # Core tool execution
│   └── agents/              # NEW: Agent service implementations
│       ├── __init__.py
│       ├── face_swap_service.py
│       └── ...
└── core/
    └── providers.py         # NEW: Provider configurations
```

### Frontend Structure (React/TypeScript)
```
AgentwithChatControls/frontend/src/
├── App.tsx                  # Main app with capability toggles
├── components/
│   ├── ArtifactsPanel.tsx
│   └── agents/              # NEW: Agent UI components
│       ├── FaceSwapAgent.tsx
│       ├── VideoGeneratorAgent.tsx
│       ├── ImageUploaderPair.tsx
│       ├── StyleSelector.tsx
│       ├── AspectRatioSelector.tsx
│       └── ...
├── hooks/
│   └── useAgentStream.ts    # NEW: SSE hook for agents
└── types/
    └── agents.ts            # NEW: Agent type definitions
```

---

## Database Schema Additions

Add to `AgentwithChatControls/backend/app/models/database.py`:

```python
# Add to existing schema or create new migration

# Agent executions table
CREATE TABLE IF NOT EXISTS agent_executions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    input_data TEXT NOT NULL,  -- JSON
    output_data TEXT,          -- JSON
    provider TEXT,
    model TEXT,
    cost_usd REAL DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_exec_session ON agent_executions(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_exec_agent ON agent_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_exec_status ON agent_executions(status);

# Generated assets table
CREATE TABLE IF NOT EXISTS generated_assets (
    id TEXT PRIMARY KEY,
    execution_id TEXT NOT NULL REFERENCES agent_executions(id),
    type TEXT NOT NULL,        -- 'image', 'video', 'audio'
    url TEXT NOT NULL,
    filename TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,       -- For video/audio
    metadata TEXT,             -- JSON
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_assets_execution ON generated_assets(execution_id);
```

---

## Provider Configuration

Create `AgentwithChatControls/backend/app/core/providers.py`:

```python
from enum import Enum
from typing import Dict, List, Optional
from pydantic import BaseModel

class ProviderType(str, Enum):
    LLM = "llm"
    IMAGE_GENERATION = "image-generation"
    VIDEO_GENERATION = "video-generation"
    FACE_PROCESSING = "face-processing"
    AUDIO_GENERATION = "audio-generation"
    TRANSCRIPTION = "transcription"
    STORAGE = "storage"

class ProviderConfig(BaseModel):
    id: str
    name: str
    type: ProviderType
    env_key: str
    base_url: Optional[str] = None
    models: List[str] = []
    rate_limit_rpm: int = 100
    timeout_ms: int = 120000
    retries: int = 3

PROVIDERS: Dict[str, ProviderConfig] = {
    # Existing
    "anthropic": ProviderConfig(
        id="anthropic",
        name="Anthropic Claude",
        type=ProviderType.LLM,
        env_key="ANTHROPIC_API_KEY",
        base_url="https://api.anthropic.com",
        models=["claude-opus-4-5-20250514", "claude-sonnet-4-5-20250514", "claude-haiku-3-5-20241022"],
    ),
    "openai": ProviderConfig(
        id="openai",
        name="OpenAI",
        type=ProviderType.LLM,
        env_key="OPENAI_API_KEY",
        base_url="https://api.openai.com/v1",
        models=["gpt-4o", "gpt-4o-mini", "dall-e-3"],
    ),
    "replicate": ProviderConfig(
        id="replicate",
        name="Replicate",
        type=ProviderType.IMAGE_GENERATION,
        env_key="REPLICATE_API_TOKEN",
        base_url="https://api.replicate.com/v1",
        models=[
            "stability-ai/sdxl",
            "black-forest-labs/flux-schnell",
            "black-forest-labs/flux-dev",
            "lucataco/insightface",
            "tencentarc/gfpgan",
        ],
        timeout_ms=300000,
    ),

    # NEW PROVIDERS
    "fal": ProviderConfig(
        id="fal",
        name="fal.ai",
        type=ProviderType.VIDEO_GENERATION,
        env_key="FAL_API_KEY",
        base_url="https://fal.run",
        models=[
            "fal-ai/minimax/video-01-live",
            "fal-ai/kling-video/v1.6/pro",
            "fal-ai/wan/v2.1/1.3b/image-to-video",
            "fal-ai/hunyuan-video",
        ],
        timeout_ms=600000,  # 10 min for video
    ),
    "runway": ProviderConfig(
        id="runway",
        name="Runway ML",
        type=ProviderType.VIDEO_GENERATION,
        env_key="RUNWAY_API_KEY",
        base_url="https://api.runwayml.com",
        models=["gen-3"],
        timeout_ms=600000,
    ),
    "elevenlabs": ProviderConfig(
        id="elevenlabs",
        name="ElevenLabs",
        type=ProviderType.AUDIO_GENERATION,
        env_key="ELEVENLABS_API_KEY",
        base_url="https://api.elevenlabs.io/v1",
        models=["eleven_multilingual_v2", "eleven_turbo_v2"],
    ),
}

# Agent to Provider mapping
AGENT_PROVIDERS: Dict[str, Dict] = {
    "face-swap": {
        "required": ["replicate"],
        "optional": [],
        "primary_model": "lucataco/insightface",
    },
    "video-face-swap": {
        "required": ["replicate", "fal"],
        "optional": ["runway"],
        "primary_model": "fal-ai/face-swap",
    },
    "video-generator": {
        "required": ["fal"],
        "optional": ["runway", "replicate"],
        "primary_model": "fal-ai/kling-video/v1.6/pro",
    },
    "lipsync-studio": {
        "required": ["replicate", "elevenlabs"],
        "optional": [],
        "primary_model": "cjwbw/sadtalker",
    },
}
```

---

## EXISTING AGENTS (51 Total - DO NOT DUPLICATE)

### Category Agents (`src/agents/`)
`smart-data-analyzer`, `data-visualization`, `product-description-writer`, `virtual-try-on`, `ai-background-generator`, `resume-builder`, `meeting-transcriber`, `email-template-generator`, `seo-content-optimizer`, `social-media-caption-generator`, `pro-headshot-generator`, `video-script-generator`, `image-translator`, `customer-support-bot`, `code-reviewer`, `blog-writer`, `background-remover`, `face-swap`

### Higgsfield Agents (`src/agents/higgsfield/`)
`image-generator`, `video-generator`, `face-swap-video`, `lipsync-studio`, `video-upscaler`, `image-inpainting`, `character-creator`, `style-transfer`, `product-enhancer`, `avatar-generator`, `storyboard-generator`, `vfx-transformer`, `ad-generator`, `photo-editor`, `video-effects`, `motion-graphics`, `sketch-to-image`, `music-generator`, `voice-cloner`, `ai-assistant`

### Registry Additional
`portrait-retoucher`, `ai-model-swap`, `headshot-generator`, `image-upscaler`, `object-remover`, `background-replacer`, `scene-generator`, `product-photographer`, `portrait-enhancer`, `talking-avatar`, `image-animator`

---

## PHASE 1: Core Infrastructure & High-Value Agents (12 agents)

### 1.1 Face Swap Agent (Character Swap)

**Files to create:**

#### Backend Model: `backend/app/models/agents/face_swap.py`
```python
from typing import Optional, Literal
from pydantic import BaseModel, Field
import secrets

class FaceSwapRequest(BaseModel):
    """Face swap request with two images."""
    source_image_id: str = Field(..., description="File ID of source face image")
    target_image_id: str = Field(..., description="File ID of target image")

    # Options
    blend_mode: Literal["natural", "seamless", "vivid"] = Field(
        default="seamless",
        description="How to blend the swapped face"
    )
    preserve_expression: bool = Field(
        default=True,
        description="Preserve target face expression"
    )
    enhance_face: bool = Field(
        default=True,
        description="Apply face enhancement after swap"
    )

    session_id: Optional[str] = None

class FaceSwapResponse(BaseModel):
    """Face swap response with result image."""
    execution_id: str
    status: Literal["pending", "processing", "completed", "failed"]
    result_image_url: Optional[str] = None
    result_image_id: Optional[str] = None
    faces_detected: Optional[dict] = None  # {"source": 1, "target": 1}
    processing_time_ms: Optional[int] = None
    error: Optional[str] = None
```

#### Backend Service: `backend/app/services/agents/face_swap_service.py`
```python
import httpx
import base64
import os
import asyncio
import secrets
from typing import Tuple
from app.models.agents.face_swap import FaceSwapRequest, FaceSwapResponse
from app.services.file_service import FileService
import logging

logger = logging.getLogger(__name__)

REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN")
REPLICATE_FACE_SWAP_MODEL = "lucataco/insightface:2d6bc46f6a62c7f6fb7c1dade7e6ed54af9223f05b0d951e1c9c5a2c6fac7c2d"

async def run_face_swap(
    request: FaceSwapRequest,
    file_service: FileService,
) -> Tuple[FaceSwapResponse, dict]:
    """Execute face swap using Replicate InsightFace model."""

    execution_id = secrets.token_hex(8)

    try:
        # Load source and target images
        source_file = file_service.get(request.source_image_id)
        target_file = file_service.get(request.target_image_id)

        source_b64 = base64.b64encode(source_file.path.read_bytes()).decode()
        target_b64 = base64.b64encode(target_file.path.read_bytes()).decode()

        # Call Replicate API
        async with httpx.AsyncClient(timeout=300.0) as client:
            # Create prediction
            response = await client.post(
                "https://api.replicate.com/v1/predictions",
                headers={
                    "Authorization": f"Token {REPLICATE_API_TOKEN}",
                    "Content-Type": "application/json",
                },
                json={
                    "version": REPLICATE_FACE_SWAP_MODEL.split(":")[1],
                    "input": {
                        "source_image": f"data:image/jpeg;base64,{source_b64}",
                        "target_image": f"data:image/jpeg;base64,{target_b64}",
                    }
                }
            )
            prediction = response.json()

            # Poll for completion
            prediction_id = prediction["id"]
            while prediction["status"] not in ["succeeded", "failed", "canceled"]:
                await asyncio.sleep(1)
                poll_resp = await client.get(
                    f"https://api.replicate.com/v1/predictions/{prediction_id}",
                    headers={"Authorization": f"Token {REPLICATE_API_TOKEN}"}
                )
                prediction = poll_resp.json()

            if prediction["status"] == "succeeded":
                result_url = prediction["output"]

                # Download and save result
                img_resp = await client.get(result_url)
                saved = file_service.save_bytes(
                    img_resp.content,
                    f"face_swap_{execution_id}.png",
                    "image/png",
                    request.session_id
                )

                return FaceSwapResponse(
                    execution_id=execution_id,
                    status="completed",
                    result_image_url=f"/api/files/{saved.id}/download",
                    result_image_id=saved.id,
                    faces_detected={"source": 1, "target": 1},
                    processing_time_ms=int(prediction.get("metrics", {}).get("predict_time", 0) * 1000),
                ), {"result_url": result_url}
            else:
                return FaceSwapResponse(
                    execution_id=execution_id,
                    status="failed",
                    error=prediction.get("error", "Face swap failed"),
                ), {}

    except Exception as e:
        logger.exception("Face swap failed")
        return FaceSwapResponse(
            execution_id=execution_id,
            status="failed",
            error=str(e),
        ), {}
```

#### Backend API Endpoint: `backend/app/api/agents/face_swap.py`
```python
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
import json

from app.models.agents.face_swap import FaceSwapRequest, FaceSwapResponse
from app.services.agents.face_swap_service import run_face_swap
from app.services.file_service import FileService

router = APIRouter(prefix="/api/agents/face-swap", tags=["agents"])

def sse(event_type: str, data: dict) -> str:
    return f"data: {json.dumps({'type': event_type, 'data': data})}\n\n"

@router.post("/execute")
async def execute_face_swap(
    request: FaceSwapRequest,
    file_service: FileService = Depends(),
):
    """Execute face swap and return result."""
    result, _ = await run_face_swap(request, file_service)
    if result.status == "failed":
        raise HTTPException(status_code=500, detail=result.error)
    return result

@router.post("/stream")
async def stream_face_swap(
    request: FaceSwapRequest,
    file_service: FileService = Depends(),
):
    """Execute face swap with SSE streaming."""
    async def generate():
        yield sse("status", {"state": "processing", "message": "Starting face swap..."})
        yield sse("tool_status", {"tool": "face_swap", "status": "running"})

        result, payload = await run_face_swap(request, file_service)

        if result.status == "completed":
            yield sse("tool_result", {
                "tool": "face_swap",
                "result_summary": f"Face swap completed in {result.processing_time_ms}ms",
                "attachments": [{
                    "type": "image",
                    "url": result.result_image_url,
                    "description": "Face swap result"
                }]
            })
            yield sse("done", {"session_id": request.session_id})
        else:
            yield sse("error", {"message": result.error})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )
```

#### Frontend Component: `frontend/src/components/agents/FaceSwapAgent.tsx`
```tsx
import React, { useState, useCallback } from 'react'
import { ImageUploader } from '../shared/ImageUploader'
import { useAgentStream } from '../../hooks/useAgentStream'
import './FaceSwapAgent.css'

type BlendMode = 'natural' | 'seamless' | 'vivid'

interface FaceSwapAgentProps {
  sessionId: string | null
  onResult?: (result: { imageUrl: string; imageId: string }) => void
}

export function FaceSwapAgent({ sessionId, onResult }: FaceSwapAgentProps) {
  const [sourceImageId, setSourceImageId] = useState<string | null>(null)
  const [targetImageId, setTargetImageId] = useState<string | null>(null)
  const [blendMode, setBlendMode] = useState<BlendMode>('seamless')
  const [preserveExpression, setPreserveExpression] = useState(true)
  const [enhanceFace, setEnhanceFace] = useState(true)

  const { execute, isLoading, error, result, progress } = useAgentStream({
    endpoint: '/api/agents/face-swap/stream',
    onComplete: (data) => {
      if (data.result_image_url && onResult) {
        onResult({
          imageUrl: data.result_image_url,
          imageId: data.result_image_id
        })
      }
    }
  })

  const handleExecute = useCallback(() => {
    if (!sourceImageId || !targetImageId) return

    execute({
      source_image_id: sourceImageId,
      target_image_id: targetImageId,
      blend_mode: blendMode,
      preserve_expression: preserveExpression,
      enhance_face: enhanceFace,
      session_id: sessionId,
    })
  }, [sourceImageId, targetImageId, blendMode, preserveExpression, enhanceFace, sessionId, execute])

  const canExecute = sourceImageId && targetImageId && !isLoading

  return (
    <div className="agent-panel face-swap-agent">
      <header className="agent-header">
        <h2>Face Swap</h2>
        <p className="agent-description">
          Swap faces between two images with AI-powered blending
        </p>
      </header>

      <div className="agent-inputs">
        {/* Source Face Image */}
        <div className="input-group">
          <label>Source Face</label>
          <p className="input-hint">Upload the face you want to use</p>
          <ImageUploader
            sessionId={sessionId}
            onUpload={(fileId) => setSourceImageId(fileId)}
            accept="image/*"
            maxSizeMB={10}
          />
        </div>

        {/* Target Image */}
        <div className="input-group">
          <label>Target Image</label>
          <p className="input-hint">Upload the image to swap the face onto</p>
          <ImageUploader
            sessionId={sessionId}
            onUpload={(fileId) => setTargetImageId(fileId)}
            accept="image/*"
            maxSizeMB={10}
          />
        </div>

        {/* Options */}
        <div className="options-section">
          <h3>Options</h3>

          <div className="option-group">
            <label>Blend Mode</label>
            <select
              value={blendMode}
              onChange={(e) => setBlendMode(e.target.value as BlendMode)}
            >
              <option value="natural">Natural - Subtle blending</option>
              <option value="seamless">Seamless - Best quality</option>
              <option value="vivid">Vivid - Enhanced colors</option>
            </select>
          </div>

          <div className="option-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={preserveExpression}
                onChange={(e) => setPreserveExpression(e.target.checked)}
              />
              Preserve target expression
            </label>
          </div>

          <div className="option-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={enhanceFace}
                onChange={(e) => setEnhanceFace(e.target.checked)}
              />
              Enhance face quality
            </label>
          </div>
        </div>
      </div>

      {/* Progress */}
      {isLoading && (
        <div className="progress-section">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-text">Processing face swap...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="error-message">
          <span className="error-icon">!</span>
          {error}
        </div>
      )}

      {/* Result */}
      {result?.result_image_url && (
        <div className="result-section">
          <h3>Result</h3>
          <img
            src={result.result_image_url}
            alt="Face swap result"
            className="result-image"
          />
          <div className="result-actions">
            <a
              href={result.result_image_url}
              download="face_swap_result.png"
              className="download-btn"
            >
              Download
            </a>
          </div>
        </div>
      )}

      {/* Execute Button */}
      <button
        className="execute-btn"
        onClick={handleExecute}
        disabled={!canExecute}
      >
        {isLoading ? 'Processing...' : 'Swap Faces'}
      </button>
    </div>
  )
}
```

---

### 1.2 Video Generator Agent

#### Backend Model: `backend/app/models/agents/video_generator.py`
```python
from typing import Optional, Literal, List
from pydantic import BaseModel, Field

class VideoGeneratorRequest(BaseModel):
    """Video generation request."""
    mode: Literal["text-to-video", "image-to-video"] = Field(
        default="text-to-video",
        description="Generation mode"
    )

    # Text-to-video
    prompt: Optional[str] = Field(None, max_length=2000)
    negative_prompt: Optional[str] = Field(None, max_length=500)

    # Image-to-video
    source_image_id: Optional[str] = None

    # Video settings
    duration: Literal["4s", "8s", "16s"] = "4s"
    aspect_ratio: Literal["16:9", "9:16", "1:1"] = "16:9"
    fps: Literal[24, 30] = 24

    # Motion controls
    motion_intensity: Literal["subtle", "moderate", "dynamic"] = "moderate"
    camera_motion: Optional[Literal[
        "static", "pan-left", "pan-right", "zoom-in", "zoom-out", "orbit"
    ]] = None

    # Provider
    provider: Literal["fal-kling", "fal-minimax", "runway"] = "fal-kling"

    session_id: Optional[str] = None
    seed: Optional[int] = None

class VideoGeneratorResponse(BaseModel):
    execution_id: str
    status: Literal["pending", "processing", "completed", "failed"]
    video_url: Optional[str] = None
    video_id: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration_seconds: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[int] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    processing_time_ms: Optional[int] = None
    cost_usd: Optional[float] = None
    error: Optional[str] = None
```

#### Frontend Component: `frontend/src/components/agents/VideoGeneratorAgent.tsx`
```tsx
import React, { useState, useCallback } from 'react'
import { ImageUploader } from '../shared/ImageUploader'
import { AspectRatioSelector } from '../shared/AspectRatioSelector'
import { useAgentStream } from '../../hooks/useAgentStream'

type GenerationMode = 'text-to-video' | 'image-to-video'
type Duration = '4s' | '8s' | '16s'
type AspectRatio = '16:9' | '9:16' | '1:1'
type MotionIntensity = 'subtle' | 'moderate' | 'dynamic'
type CameraMotion = 'static' | 'pan-left' | 'pan-right' | 'zoom-in' | 'zoom-out' | 'orbit'
type Provider = 'fal-kling' | 'fal-minimax' | 'runway'

export function VideoGeneratorAgent({ sessionId, onResult }: { sessionId: string | null; onResult?: any }) {
  const [mode, setMode] = useState<GenerationMode>('text-to-video')
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [sourceImageId, setSourceImageId] = useState<string | null>(null)
  const [duration, setDuration] = useState<Duration>('4s')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [motionIntensity, setMotionIntensity] = useState<MotionIntensity>('moderate')
  const [cameraMotion, setCameraMotion] = useState<CameraMotion | ''>('')
  const [provider, setProvider] = useState<Provider>('fal-kling')

  const { execute, isLoading, error, result, progress } = useAgentStream({
    endpoint: '/api/agents/video-generator/stream',
  })

  const handleExecute = useCallback(() => {
    if (mode === 'text-to-video' && !prompt.trim()) return
    if (mode === 'image-to-video' && !sourceImageId) return

    execute({
      mode,
      prompt: prompt.trim() || undefined,
      negative_prompt: negativePrompt.trim() || undefined,
      source_image_id: sourceImageId || undefined,
      duration,
      aspect_ratio: aspectRatio,
      motion_intensity: motionIntensity,
      camera_motion: cameraMotion || undefined,
      provider,
      session_id: sessionId,
    })
  }, [mode, prompt, negativePrompt, sourceImageId, duration, aspectRatio, motionIntensity, cameraMotion, provider, sessionId, execute])

  return (
    <div className="agent-panel video-generator-agent">
      <header className="agent-header">
        <h2>Video Generator</h2>
        <p>Generate AI videos from text or images</p>
      </header>

      <div className="agent-inputs">
        {/* Mode Toggle */}
        <div className="mode-toggle">
          <button className={mode === 'text-to-video' ? 'active' : ''} onClick={() => setMode('text-to-video')}>
            Text to Video
          </button>
          <button className={mode === 'image-to-video' ? 'active' : ''} onClick={() => setMode('image-to-video')}>
            Image to Video
          </button>
        </div>

        {mode === 'text-to-video' ? (
          <div className="input-group">
            <label>Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the video you want to create..."
              maxLength={2000}
              rows={4}
            />
          </div>
        ) : (
          <div className="input-group">
            <label>Source Image</label>
            <ImageUploader sessionId={sessionId} onUpload={setSourceImageId} />
            <label>Motion Prompt (optional)</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the motion..."
              rows={2}
            />
          </div>
        )}

        {/* Video Settings */}
        <div className="settings-grid">
          <div className="setting">
            <label>Duration</label>
            <select value={duration} onChange={(e) => setDuration(e.target.value as Duration)}>
              <option value="4s">4 seconds</option>
              <option value="8s">8 seconds</option>
              <option value="16s">16 seconds</option>
            </select>
          </div>

          <div className="setting">
            <label>Aspect Ratio</label>
            <AspectRatioSelector
              value={aspectRatio}
              onChange={(v) => setAspectRatio(v as AspectRatio)}
              options={['16:9', '9:16', '1:1']}
            />
          </div>

          <div className="setting">
            <label>Motion Intensity</label>
            <select value={motionIntensity} onChange={(e) => setMotionIntensity(e.target.value as MotionIntensity)}>
              <option value="subtle">Subtle</option>
              <option value="moderate">Moderate</option>
              <option value="dynamic">Dynamic</option>
            </select>
          </div>

          <div className="setting">
            <label>Camera Motion</label>
            <select value={cameraMotion} onChange={(e) => setCameraMotion(e.target.value as CameraMotion | '')}>
              <option value="">Auto</option>
              <option value="static">Static</option>
              <option value="pan-left">Pan Left</option>
              <option value="pan-right">Pan Right</option>
              <option value="zoom-in">Zoom In</option>
              <option value="zoom-out">Zoom Out</option>
              <option value="orbit">Orbit</option>
            </select>
          </div>

          <div className="setting">
            <label>Provider</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
              <option value="fal-kling">Kling 1.6 Pro (Best)</option>
              <option value="fal-minimax">MiniMax (Fast)</option>
              <option value="runway">Runway Gen-3</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="progress-section">
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
          <span>Generating video... This may take 2-5 minutes</span>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {result?.video_url && (
        <div className="result-section">
          <video src={result.video_url} controls className="result-video" />
          <a href={result.video_url} download className="download-btn">Download MP4</a>
        </div>
      )}

      <button className="execute-btn" onClick={handleExecute} disabled={!((mode === 'text-to-video' ? prompt.trim() : sourceImageId) && !isLoading)}>
        {isLoading ? 'Generating...' : 'Generate Video'}
      </button>
    </div>
  )
}
```

---

### 1.3-1.12 Phase 1 Agent List

| # | Agent ID | Name | Input Type | Key Features |
|---|----------|------|-----------|--------------|
| 1 | `character-swap` | Character Swap | 2 images | Face/body replacement |
| 2 | `video-generator` | Video Generator | text/image | Text/image to video |
| 3 | `video-face-swap` | Video Face Swap | 1 video + 1 image | Temporal consistency |
| 4 | `lipsync-studio` | Lipsync Studio | image + audio/text | TTS integration |
| 5 | `recast-studio` | Recast Studio | 1 video + 1 image | Full character swap |
| 6 | `virtual-tryon` | Virtual Try-On | 1 model + 1 garment | Clothing simulation |
| 7 | `ai-model-swap` | AI Model Swap | 1 product photo | 40+ country diversity |
| 8 | `draw-to-edit` | Draw to Edit | 1 sketch | Sketch to photo |
| 9 | `instadump` | Instadump | 1 selfie | Content library |
| 10 | `click-to-ad` | Click to Ad | URL + prompt | Product ad generation |
| 11 | `angles` | Angles | 1 image + prompt | Multi-angle views |
| 12 | `transitions` | Transitions | 2 videos | Seamless morphs |

---

## PHASE 2: Creative Style Agents (25 agents)

### 2.1 VFX Transformation Agent Template

For VFX effects (On Fire, Storm Creature, etc.), use a unified template:

#### Backend Model: `backend/app/models/agents/vfx_transform.py`
```python
from typing import Optional, Literal
from pydantic import BaseModel, Field

class VFXTransformRequest(BaseModel):
    image_id: str = Field(..., description="File ID of source image")
    effect: Literal[
        "on-fire", "storm-creature", "burning-sunset",
        "sand-worm", "latex", "cyborg", "zombie",
        "disintegration", "portal", "hologram"
    ]
    intensity: float = Field(default=0.7, ge=0.0, le=1.0)
    animate: bool = Field(default=False)
    animation_duration: int = Field(default=3, ge=1, le=10)
    output_format: Literal["png", "jpg", "gif", "mp4"] = "png"
    session_id: Optional[str] = None
```

#### Frontend Component: `frontend/src/components/agents/VFXTransformAgent.tsx`
```tsx
const VFX_EFFECTS = [
  { id: 'on-fire', name: 'On Fire', description: 'This is Fine meme effect' },
  { id: 'storm-creature', name: 'Storm Creature', description: 'Epic storm scene' },
  { id: 'burning-sunset', name: 'Burning Sunset', description: 'Dramatic fire sky' },
  { id: 'sand-worm', name: 'Sand Worm', description: 'Dune-style desert scene' },
  { id: 'latex', name: 'Latex', description: 'Sleek glossy style' },
] as const

export function VFXTransformAgent({ sessionId }: { sessionId: string | null }) {
  const [imageId, setImageId] = useState<string | null>(null)
  const [effect, setEffect] = useState<string>('on-fire')
  const [intensity, setIntensity] = useState(0.7)
  const [animate, setAnimate] = useState(false)

  const { execute, isLoading, error, result } = useAgentStream({
    endpoint: '/api/agents/vfx-transform/stream',
  })

  return (
    <div className="agent-panel vfx-agent">
      <h2>VFX Transformation</h2>
      <ImageUploader sessionId={sessionId} onUpload={setImageId} />

      <div className="effect-grid">
        {VFX_EFFECTS.map((fx) => (
          <button
            key={fx.id}
            className={effect === fx.id ? 'active' : ''}
            onClick={() => setEffect(fx.id)}
          >
            {fx.name}
          </button>
        ))}
      </div>

      <div className="slider-group">
        <label>Intensity: {Math.round(intensity * 100)}%</label>
        <input type="range" min={0} max={1} step={0.1} value={intensity} onChange={(e) => setIntensity(parseFloat(e.target.value))} />
      </div>

      <label><input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} /> Animate effect</label>

      <button onClick={() => execute({ image_id: imageId, effect, intensity, animate, session_id: sessionId })} disabled={!imageId || isLoading}>
        Apply Effect
      </button>
    </div>
  )
}
```

### Phase 2 Complete List

| # | Agent ID | Category | Input | Output |
|---|----------|----------|-------|--------|
| 13 | `on-fire` | VFX | 1 image | image/video |
| 14 | `storm-creature` | VFX | 1 image | image/video |
| 15 | `burning-sunset` | VFX | 1 image | image/video |
| 16 | `sand-worm` | VFX | 1 image | image/video |
| 17 | `latex` | VFX | 1 image | image |
| 18 | `comic-book` | Art | 1 image | image |
| 19 | `renaissance` | Art | 1 image | image |
| 20 | `60s-cafe` | Art | 1 image | image |
| 21 | `pixel-game` | Art | 1 image | image |
| 22 | `sketch-to-real` | Art | 1 sketch | video |
| 23 | `asmr-add-on` | ASMR | 1 product | video |
| 24 | `asmr-classic` | ASMR | 1 image + prompt | video |
| 25 | `asmr-host` | ASMR | 1 image | image |
| 26 | `asmr-promo` | ASMR | 1 image + script | video |
| 27 | `idol` | Japanese | 1 image | image |
| 28 | `j-magazine` | Japanese | 1 image | image |
| 29 | `j-poster` | Japanese | 1 image | image |
| 30 | `cosplay-ahegao` | Japanese | 1 image | image |
| 31 | `ghoulgao` | Japanese | 1 image | image |
| 32 | `3d-render` | 3D | 1 image | image |
| 33 | `3d-figure` | 3D | 1 image | image |
| 34 | `3d-rotation` | 3D | 1 image | video |
| 35 | `mascot` | Viral | 1 image | image |
| 36 | `cloud-surf` | Viral | 1 image | image |
| 37 | `gtai` | Viral | 1 image | image |

---

## PHASE 3: Gaming & Entertainment (15 agents)

### 3.1 Game Style Agent

```python
# backend/app/models/agents/game_style.py
class GameStyleRequest(BaseModel):
    image_id: str
    game_style: Literal[
        "gta", "fortnite", "minecraft", "fifa", "cod",
        "tekken", "street-fighter", "mortal-kombat",
        "assassins", "cyberpunk", "elden-ring", "zelda",
        "sims", "counter-strike"
    ]
    output_count: int = Field(default=1, ge=1, le=12)
    include_logo: bool = True
    session_id: Optional[str] = None
```

### Phase 3 Complete List

| # | Agent ID | Category | Input | Output |
|---|----------|----------|-------|--------|
| 38 | `game-dump` | Gaming | 1 image | 12 images |
| 39 | `simlife` | Gaming | 1 image | image |
| 40 | `nano-theft` | Gaming | 1 image | image |
| 41 | `nano-strike` | Gaming | 1 image | image |
| 42 | `japanese-show` | Gaming | 1 image | 4-panel |
| 43 | `behind-scenes` | Arcade | 1 image | video |
| 44 | `style-snap` | Fashion | 1 image | 4 images |
| 45 | `urban-cuts` | Fashion | 1 image | video |
| 46 | `sticker-match-cut` | Animation | 1 video | video |
| 47 | `glitter-sticker` | Animation | 1 image | animated |
| 48 | `breakdown` | Creative | 1 image | image |
| 49 | `signboard` | Creative | 1 image | image |
| 50 | `outfit-vending` | Fashion | 1 image | image |
| 51 | `paint-app` | Creative | 1 image | image |
| 52 | `micro-beasts` | Fun | 1 image | image |

---

## PHASE 4: Product & Advertising (20 agents)

### 4.1 Product Ad Agent

```python
# backend/app/models/agents/product_ad.py
class ProductAdRequest(BaseModel):
    product_image_id: str
    ad_style: Literal[
        "bullet-time-scene", "bullet-time-splash", "bullet-time-white",
        "poster", "billboard", "packshot", "macro-scene", "magic-button"
    ]
    headline_text: Optional[str] = None
    generate_video: bool = True
    video_duration: Literal["6s", "15s", "30s"] = "15s"
    background_style: Literal["dynamic", "white", "gradient", "lifestyle"] = "dynamic"
    include_music: bool = False
    session_id: Optional[str] = None
```

### Phase 4 Complete List

| # | Agent ID | Category | Input | Output |
|---|----------|----------|-------|--------|
| 53 | `bullet-time-scene` | Styled Ads | 1 image | video |
| 54 | `bullet-time-splash` | Styled Ads | 1 image | video |
| 55 | `bullet-time-white` | Styled Ads | 1 image | video |
| 56 | `poster` | Styled Ads | 1 image + text | image |
| 57 | `billboard-ad` | Ads | 1 image | image |
| 58 | `packshot` | Ads | 1 image | video |
| 59 | `macro-scene` | Ads | 1 image | image |
| 60 | `magic-button` | Styled Ads | 1 image | image |
| 61 | `commercial-faces` | Ads | 1 image | image |
| 62 | `rap-god` | Viral | 1 image | video |
| 63 | `victory-card` | Viral | 1 image | image |
| 64 | `plushies` | Trending | 1 image | video |
| 65 | `product-creative-studio` | E-commerce | 1 image | images |
| 66 | `mockup-studio` | E-commerce | 1 image | images |
| 67 | `dynamic-style-studio` | E-commerce | 1 image | images |
| 68 | `core-burst` | E-commerce | 1 image | image |
| 69 | `style-clone` | E-commerce | 1 image | images |
| 70 | `white-background` | E-commerce | 1 image | image |
| 71 | `outfit-decomposition` | Fashion | 1 model photo | components |
| 72 | `pet-morph-wizard` | Fun | 1 pet image | image |

---

## PHASE 5: Content Creation (22 agents)

### 5.1 Content Generator Agent

```python
# backend/app/models/agents/content_generator.py
class ContentGeneratorRequest(BaseModel):
    content_type: Literal[
        "youtube-thumbnail", "youtube-title", "social-caption",
        "podcast", "presentation", "knowledge-card"
    ]
    text_input: Optional[str] = None
    image_id: Optional[str] = None
    document_id: Optional[str] = None
    url: Optional[str] = None
    platform: Optional[Literal["youtube", "instagram", "tiktok", "linkedin", "twitter"]] = None
    tone: Literal["professional", "casual", "energetic", "informative"] = "professional"
    output_count: int = Field(default=1, ge=1, le=10)
    include_emojis: bool = False
    session_id: Optional[str] = None
```

### Phase 5 Complete List

| # | Agent ID | Category | Input | Output |
|---|----------|----------|-------|--------|
| 73 | `youtube-thumbnail-gen` | Content | text/image | image |
| 74 | `youtube-title-generator` | Content | topic | 5 titles |
| 75 | `caption-ai` | Content | image/text | captions |
| 76 | `podcast-generator` | Audio | text | WAV |
| 77 | `doc2presentation` | Productivity | PDF/DOCX | PPTX |
| 78 | `knowledge-card-factory` | Education | article/URL | image |
| 79 | `educard-generator` | Education | topic | cards |
| 80 | `micro-course-builder` | Education | topic | 5-day course |
| 81 | `object-letter-crafter` | Creative | word | image |
| 82 | `the-humanizer` | Text | AI text | human text |
| 83 | `subtitle-translate-pro` | Video | SRT file | translated SRT |
| 84 | `content-pilot-ai` | Strategy | niche | content ideas |
| 85 | `auto-short-video` | Video | script | video |
| 86 | `youtube-to-social` | Repurpose | YouTube URL | posts |
| 87 | `illustrate-mind-spark` | Creative | quote | illustrated post |
| 88 | `studio-portrait` | Photography | image | portrait |
| 89 | `quipple-meme-generator` | Fun | pet image | meme |
| 90 | `frostypunster` | Fun | topic | jokes |
| 91 | `one-click-series` | Creative | image | 4 angles |
| 92 | `paper-review-agent` | Academic | topic | literature review |
| 93 | `resumepic-linkedin` | Professional | image | headshot |
| 94 | `smart-q` | Analytics | question + data | analysis |

---

## PHASE 6: Productivity & Life Assistant (20 agents)

### Phase 6 Complete List

| # | Agent ID | Category | Input | Output |
|---|----------|----------|-------|--------|
| 95 | `upcv-resume-gen` | Career | info | resume |
| 96 | `linkmatch-jobs` | Career | resume | job matches |
| 97 | `amazon-product-search` | E-commerce | query | product data |
| 98 | `amazon-seo-research` | E-commerce | ASIN | SEO report |
| 99 | `kw-seo-tool` | Marketing | keyword | 300+ keywords |
| 100 | `instant-seo-blog` | Content | topic | blog post |
| 101 | `ai-social-creator` | Automation | content | scheduled posts |
| 102 | `veeverse-tarot` | Lifestyle | question | reading |
| 103 | `vanisho` | Entertainment | magic request | trick guide |
| 104 | `nano-architect` | Design | sketch | rendering |
| 105 | `n8n-stylist` | Development | n8n JSON | styled workflow |
| 106 | `askheurist` | Crypto | question | analysis |
| 107 | `reddit-hunter` | Business | niche | leads |
| 108 | `one-prompt-10-replies` | Productivity | prompt | 10 responses |
| 109 | `html-landing-builder` | Development | idea | HTML page |
| 110 | `remove-video-bg` | Video | video | clean video |
| 111 | `watermark-remover-image` | Image | image | clean image |
| 112 | `watermark-remover-video` | Video | video | clean video |
| 113 | `chinese-dress-tryon` | Fashion | image | styled image |
| 114 | `sora-video-tool` | Video | product info | video |

---

## Shared UI Components

### ImageUploader Component
```tsx
// frontend/src/components/shared/ImageUploader.tsx
export function ImageUploader({ sessionId, onUpload, accept = 'image/*', maxSizeMB = 10 }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleFile = async (file: File) => {
    if (file.size > maxSizeMB * 1024 * 1024) return

    setIsUploading(true)
    const reader = new FileReader()
    reader.onload = (e) => setPreviewUrl(e.target?.result as string)
    reader.readAsDataURL(file)

    const formData = new FormData()
    formData.append('file', file)
    if (sessionId) formData.append('session_id', sessionId)

    const res = await fetch(`${API_BASE}/api/files`, { method: 'POST', body: formData })
    const data = await res.json()
    onUpload(data.id)
    setIsUploading(false)
  }

  return (
    <div className="image-uploader" onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}>
      {previewUrl ? (
        <div className="preview">
          <img src={previewUrl} alt="Preview" />
          <button onClick={() => { setPreviewUrl(null); onUpload('') }}>Remove</button>
        </div>
      ) : (
        <label>
          <input type="file" accept={accept} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          Drop image or click to upload
        </label>
      )}
    </div>
  )
}
```

### useAgentStream Hook
```tsx
// frontend/src/hooks/useAgentStream.ts
export function useAgentStream<T>({ endpoint, onComplete, onError }: Options<T>) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<T | null>(null)
  const [progress, setProgress] = useState(0)

  const execute = async (payload: Record<string, unknown>) => {
    setIsLoading(true)
    setError(null)

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      const events = decoder.decode(value).split('\n\n').filter(Boolean)
      for (const event of events) {
        if (!event.startsWith('data:')) continue
        const { type, data } = JSON.parse(event.slice(5))

        if (type === 'status') setProgress(data.progress || 0)
        if (type === 'tool_result') { setResult(data); onComplete?.(data) }
        if (type === 'error') { setError(data.message); onError?.(data.message) }
      }
    }

    setIsLoading(false)
    setProgress(100)
  }

  return { execute, isLoading, error, result, progress }
}
```

---

## Environment Variables

```bash
# Existing
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
REPLICATE_API_TOKEN=

# NEW: Video Generation
FAL_API_KEY=
RUNWAY_API_KEY=

# NEW: Audio Generation
ELEVENLABS_API_KEY=

# Storage
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

---

## Cost Estimates

| Agent | Provider | Cost per Run |
|-------|----------|--------------|
| Face Swap | Replicate | $0.02 - $0.05 |
| Video Generator (4s) | fal.ai | $0.10 - $0.30 |
| Video Generator (16s) | fal.ai | $0.40 - $1.00 |
| Video Face Swap | fal.ai | $0.20 - $0.50 |
| VFX Transform | Replicate | $0.02 - $0.10 |
| Click to Ad | Multiple | $0.30 - $1.00 |
| Podcast Generator | ElevenLabs | $0.10 - $0.50 |

---

## Summary

### Total: 114 NEW Agents

| Phase | Agents | Focus |
|-------|--------|-------|
| Phase 1 | 12 | Core Infrastructure & High-Value |
| Phase 2 | 25 | Creative Styles (VFX, Art, ASMR, Japanese, 3D) |
| Phase 3 | 15 | Gaming & Entertainment |
| Phase 4 | 20 | Product & Advertising |
| Phase 5 | 22 | Content Creation |
| Phase 6 | 20 | Productivity & Life Assistant |

### Key Features
- Direct UI controls (not conversational)
- Image uploaders, aspect ratio selectors, style pickers
- SSE streaming with progress updates
- Provider abstraction with fallbacks
- Unified response patterns

---

## APPROVAL REQUIRED

Please review this implementation plan and approve before coding begins.

### Questions to Consider:
1. Priority order - which phases should be first?
2. Provider preferences - fal.ai vs Runway vs others?
3. UI layout - sidebar agents vs modal vs full page?
4. Pricing model - per-run credits vs subscription?

---

**Document Version**: 5.0.0
**Created**: December 2024
**Status**: AWAITING APPROVAL - DO NOT CODE UNTIL APPROVED
