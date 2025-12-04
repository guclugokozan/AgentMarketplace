# Agent Marketplace: Higgsfield AI Features - Revised with Codex Critiques

## Analysis Summary

This document analyzes all 20 Higgsfield-inspired features with Codex's valid critiques applied. Each feature is evaluated for SDK compatibility, tool schema completeness, execution model, and implementation feasibility.

---

## Critical Corrections Applied Across All Features

### 1. SDK API Alignment

| Original (WRONG) | Corrected (RIGHT) |
|------------------|-------------------|
| `context.useTool('name', args)` | `context.tools.call('name', args)` |

Actual SDK interface from `src/sdk/define-agent.ts:76-80`:
```typescript
export interface AgentToolContext {
  call<T = unknown>(name: string, args: Record<string, unknown>): Promise<T>;
  search(query: string): Promise<string[]>;
  available(): string[];
}
```

### 2. Complete Tool Schema Requirements

Every tool MUST include these fields per `src/core/types.ts:84-116`:
```typescript
{
  name: string;                    // REQUIRED
  version: string;                 // REQUIRED
  description: string;             // REQUIRED
  inputSchema: JSONSchema;         // REQUIRED
  defer_loading: boolean;          // REQUIRED - for tool search
  allowed_callers: ('human' | 'code_execution_20250825')[]; // REQUIRED
  idempotent: boolean;             // REQUIRED
  sideEffectful: boolean;          // REQUIRED
  scopes: string[];                // REQUIRED
  allowlistedDomains: string[];    // REQUIRED
  timeoutMs: number;               // REQUIRED
  rateLimit?: {...};               // Optional but recommended
}
```

### 3. Execution Model

**What WORKS**: Agent-driven tool calling via `context.tools.call()`
**What DOESN'T WORK**: LLM-autonomous tool orchestration (executor returns `complete: false` but doesn't execute tools in loop)

All agents use agent-driven pattern where `execute()` explicitly orchestrates tool calls.

### 4. Async Job Pattern for Long Operations

Video, audio, and heavy processing require:
```typescript
interface AsyncJobFlow {
  startJob(params): Promise<{ jobId: string }>;
  pollJob(jobId): Promise<{ status, progress }>;
  getResult(jobId): Promise<JobResult>;
}
```

### 5. Consent Gates for Biometric Operations

Face swap, voice cloning, lipsync require consent validation before execution.

---

## Feature-by-Feature Analysis with Codex Critiques

---

## Feature 1: AI Image Generator

### Codex Critique Applicability

| Critique | Applies? | Resolution |
|----------|----------|------------|
| SDK mismatch | YES | Use `context.tools.call()` |
| Tool schema incomplete | YES | Add all required fields |
| Async job needed | NO | Image gen is fast enough (< 60s) |
| Consent required | NO | Not biometric |
| Provider hand-wavy | YES | Implement real provider adapters |

### Corrected Tool Definition

```typescript
const generateImageDalleTool: ToolDefinition = {
  name: 'generate_image_dalle',
  version: '1.0.0',
  description: 'Generate image using OpenAI DALL-E 3',
  category: 'image-generation',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', maxLength: 4000 },
      size: { type: 'string', enum: ['1024x1024', '1792x1024', '1024x1792'] },
      quality: { type: 'string', enum: ['standard', 'hd'] },
    },
    required: ['prompt'],
  },

  // THESE WERE MISSING IN ORIGINAL PLAN:
  defer_loading: false,
  allowed_callers: ['human', 'code_execution_20250825'],
  idempotent: false,  // Same prompt can yield different images

  sideEffectful: true,  // Costs money, creates content
  scopes: ['write:images', 'external:openai'],
  allowlistedDomains: ['api.openai.com'],
  timeoutMs: 60000,
  rateLimit: { requests: 50, windowMs: 60000 },

  execute: async (input, context) => {
    const { prompt, size, quality } = input as any;
    const openai = getOpenAIClient();

    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      size: size || '1024x1024',
      quality: quality || 'standard',
      n: 1,
    });

    const costUsd = quality === 'hd' ? 0.080 : 0.040;

    return {
      url: response.data[0].url,
      revisedPrompt: response.data[0].revised_prompt,
      costUsd,
    };
  },
};
```

### Corrected Agent Execute

```typescript
execute: async (input, context) => {
  // CORRECT: Using context.tools.call() not context.useTool()
  const enhanced = await context.tools.call<{ enhancedPrompt: string }>(
    'enhance_image_prompt',
    { prompt: input.prompt, style: input.style }
  );

  const result = await context.tools.call<{ url: string; costUsd: number }>(
    'generate_image_dalle',
    { prompt: enhanced.enhancedPrompt, size: '1024x1024', quality: input.quality }
  );

  return { images: [{ url: result.url }], costUsd: result.costUsd };
}
```

### Provider Implementation Required

```typescript
// src/providers/openai.ts
import OpenAI from 'openai';

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY required');
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}
```

---

## Feature 2: Video Generator

### Codex Critique Applicability

| Critique | Applies? | Resolution |
|----------|----------|------------|
| SDK mismatch | YES | Use `context.tools.call()` |
| Tool schema incomplete | YES | Add all required fields |
| Async job needed | **YES - CRITICAL** | Video gen takes 60-300s |
| Consent required | NO | Not biometric |
| Provider hand-wavy | **YES - CRITICAL** | Need full job lifecycle |

### Why Async is Critical

Video generation takes 1-5 minutes. Without async:
- HTTP connections timeout
- Budget tracking breaks
- User gets no feedback

### Required Infrastructure

```sql
-- migrations/001_add_provider_jobs.sql
CREATE TABLE provider_jobs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  external_job_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  status TEXT DEFAULT 'processing',
  progress INTEGER DEFAULT 0,
  result_url TEXT,
  error_message TEXT,
  cost_usd REAL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);
```

### Corrected Tools with Async Pattern

```typescript
const startVideoJobTool: ToolDefinition = {
  name: 'start_video_generation_job',
  version: '1.0.0',
  description: 'Start async video generation - returns jobId for polling',
  inputSchema: { /* ... */ },

  defer_loading: false,
  allowed_callers: ['human', 'code_execution_20250825'],
  idempotent: false,

  sideEffectful: true,
  scopes: ['write:videos', 'external:runway'],
  allowlistedDomains: ['api.runwayml.com'],
  timeoutMs: 30000,  // Just for starting the job
  rateLimit: { requests: 10, windowMs: 60000 },

  execute: async (input, context) => {
    // Start job with provider
    const response = await fetch('https://api.runwayml.com/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ /* params */ }),
    });

    const { id: externalJobId } = await response.json();

    // Store in our job manager
    const jobManager = getJobManager();
    const jobId = jobManager.create({
      provider: 'runway',
      externalJobId,
      agentId: 'video-generator',
      runId: context.runId,
    });

    return { jobId, status: 'processing', estimatedSeconds: 120 };
  },
};

const pollVideoJobTool: ToolDefinition = {
  name: 'poll_video_job',
  version: '1.0.0',
  description: 'Check video generation job status',
  inputSchema: { type: 'object', properties: { jobId: { type: 'string' } } },

  defer_loading: false,
  allowed_callers: ['human', 'code_execution_20250825'],
  idempotent: true,  // Polling is idempotent

  sideEffectful: false,
  scopes: ['read:videos'],
  allowlistedDomains: ['api.runwayml.com'],
  timeoutMs: 10000,

  execute: async (input, context) => {
    const { jobId } = input as { jobId: string };
    const jobManager = getJobManager();

    // Check if already complete in our DB
    const job = jobManager.getStatus(jobId);
    if (job?.status === 'complete') return job;

    // Poll provider
    const providerStatus = await pollRunwayJob(job.externalJobId);

    if (providerStatus.status === 'complete') {
      jobManager.complete(jobId, providerStatus.url, {}, providerStatus.cost);
    }

    return jobManager.getStatus(jobId);
  },
};
```

### Corrected Agent with Polling Loop

```typescript
execute: async (input, context) => {
  const startTime = Date.now();

  // 1. Start the job
  const job = await context.tools.call<{ jobId: string; status: string }>(
    'start_video_generation_job',
    { prompt: input.prompt, duration: input.duration, provider: input.provider }
  );

  // 2. If user doesn't want to wait, return immediately
  if (!input.waitForCompletion) {
    return {
      jobId: job.jobId,
      status: 'processing',
      pollEndpoint: `/jobs/${job.jobId}`,
    };
  }

  // 3. Poll with timeout
  const maxWaitMs = 5 * 60 * 1000;
  let elapsed = 0;

  while (elapsed < maxWaitMs) {
    await sleep(5000);
    elapsed += 5000;

    const status = await context.tools.call<{
      status: 'processing' | 'complete' | 'failed';
      resultUrl?: string;
      costUsd: number;
    }>('poll_video_job', { jobId: job.jobId });

    if (status.status === 'complete') {
      return {
        videoUrl: status.resultUrl,
        jobId: job.jobId,
        status: 'complete',
        generationTimeMs: Date.now() - startTime,
        costUsd: status.costUsd,
      };
    }

    if (status.status === 'failed') {
      throw new Error('Video generation failed');
    }
  }

  // Timeout - return for async polling
  return { jobId: job.jobId, status: 'processing', pollEndpoint: `/jobs/${job.jobId}` };
}
```

---

## Feature 3: Face Swap Video

### Codex Critique Applicability

| Critique | Applies? | Resolution |
|----------|----------|------------|
| SDK mismatch | YES | Use `context.tools.call()` |
| Tool schema incomplete | YES | Add all required fields |
| Async job needed | YES | Video processing takes time |
| Consent required | **YES - CRITICAL** | Biometric operation |
| Provider hand-wavy | YES | Need real face-swap provider |

### Why Consent is Critical

Face swap on other individuals without consent is:
- Ethically problematic
- Legally risky (GDPR, CCPA, etc.)
- Platform liability

### Consent Validation Tool

```typescript
const validateFaceSwapConsentTool: ToolDefinition = {
  name: 'validate_face_swap_consent',
  version: '1.0.0',
  description: 'Validate consent for biometric face swap operation',
  inputSchema: {
    type: 'object',
    properties: {
      subjectType: { type: 'string', enum: ['self', 'other', 'unknown'] },
      consentEvidence: { type: 'object' },
      purpose: { type: 'string' },
    },
    required: ['subjectType', 'purpose'],
  },

  defer_loading: false,
  allowed_callers: ['human', 'code_execution_20250825'],
  idempotent: true,

  sideEffectful: false,  // Just validation + logging
  scopes: ['policy:consent'],
  allowlistedDomains: [],
  timeoutMs: 5000,

  execute: async (input, context) => {
    const args = input as { subjectType: string; consentEvidence?: any; purpose: string };

    // Log consent check for audit
    await logConsentCheck({
      operationType: 'face_swap',
      subjectType: args.subjectType,
      hasConsent: !!args.consentEvidence,
      runId: context.runId,
    });

    // BLOCK if operating on others without consent
    if (args.subjectType === 'other' && !args.consentEvidence) {
      throw new Error(
        'CONSENT_REQUIRED: Face swap on other individuals requires explicit consent. ' +
        'Provide consent evidence or confirm subject is yourself.'
      );
    }

    return {
      valid: true,
      restrictions: args.subjectType === 'other' ? ['watermark_required'] : [],
      requiresWatermark: args.subjectType !== 'self',
    };
  },
};
```

### Corrected Agent with Consent Gate

```typescript
execute: async (input, context) => {
  // FIRST: Validate consent - this is a GATE
  const consent = await context.tools.call<{
    valid: boolean;
    restrictions: string[];
    requiresWatermark: boolean;
  }>('validate_face_swap_consent', {
    subjectType: input.subjectType,
    consentEvidence: input.consentEvidence,
    purpose: input.purpose,
  });

  // If consent throws, execution stops here

  // Continue with face detection...
  const faces = await context.tools.call('detect_faces', { /* ... */ });

  // Process with watermark if required
  const result = await context.tools.call('process_face_swap', {
    /* ... */
    addWatermark: consent.requiresWatermark,
  });

  return {
    /* ... */
    watermarkApplied: consent.requiresWatermark,
    restrictions: consent.restrictions,
  };
}
```

---

## Feature 4: Lipsync Studio

### Codex Critique Applicability

| Critique | Applies? | Resolution |
|----------|----------|------------|
| Async job needed | YES | Audio-video sync takes time |
| Consent required | **YES** | Voice operations on others |

### Additional Consent for Voice

```typescript
// Same pattern as face swap but for voice
const validateVoiceConsentTool: ToolDefinition = {
  name: 'validate_voice_consent',
  // ... similar to face swap consent
  execute: async (input, context) => {
    if (input.subjectType === 'other' && !input.consentEvidence) {
      throw new Error('CONSENT_REQUIRED: Voice operations on other individuals require consent');
    }
    return { valid: true, restrictions: [] };
  },
};
```

---

## Feature 5: Video Upscaler

### Codex Critique Applicability

| Critique | Applies? | Resolution |
|----------|----------|------------|
| Async job needed | YES | Upscaling takes time |
| Consent required | NO | Not biometric |

Standard async pattern applies. No consent needed.

---

## Feature 6: Image Inpainting

### Codex Critique Applicability

| Critique | Applies? | Resolution |
|----------|----------|------------|
| Async job needed | NO | Fast enough (< 30s) |
| Consent required | NO | Not biometric |

This feature is straightforward. Just fix SDK usage and tool schemas.

---

## Feature 7: Character Creator

### Codex Critique Applicability

| Critique | Applies? | Resolution |
|----------|----------|------------|
| Async job needed | NO | Image-based, fast |
| Consent required | NO | Creating new characters, not using existing faces |
| Database storage | YES | Need character table for persistence |

### Required Migration

```sql
-- migrations/002_add_characters.sql
CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  traits JSON,
  style TEXT,
  face_embedding BLOB,  -- For consistent generation
  reference_images JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id TEXT,
  user_id TEXT
);
```

---

## Features 8-20: Summary Analysis

| # | Feature | Async? | Consent? | Key Codex Fix |
|---|---------|--------|----------|---------------|
| 8 | Style Transfer | Sync for images, Async for video | NO | Provider implementations |
| 9 | Product Enhancer | NO | NO | Tool schemas |
| 10 | Avatar Generator | NO | NO | Tool schemas |
| 11 | Storyboard Generator | Partial (multi-image) | NO | Character consistency |
| 12 | VFX Transformer | YES (video) | NO | Async job pattern |
| 13 | Click-to-Ad Generator | YES | NO | Multi-step async |
| 14 | Photo Editor Suite | NO | NO | Tool schemas |
| 15 | Video Effects Editor | YES | NO | Async job pattern |
| 16 | Motion Graphics | YES | NO | Async job pattern |
| 17 | Sketch to Image | NO | NO | Tool schemas |
| 18 | Music Generator | YES | NO | Async job pattern |
| 19 | Voice Cloner | YES | **YES** | Consent + async |
| 20 | AI Assistant | NO | NO | Conversation storage |

---

## Infrastructure Requirements Summary

### 1. Database Migrations Needed

```
scripts/migrations/
├── 001_add_provider_jobs.sql     # Async job tracking
├── 002_add_characters.sql        # Character persistence
├── 003_add_conversations.sql     # AI Assistant memory
├── 004_add_generated_media.sql   # Media storage references
└── 005_add_consent_log.sql       # Consent audit trail
```

### 2. Provider Implementations Needed

```typescript
// src/providers/
├── openai.ts      // DALL-E, GPT
├── stability.ts   // Stable Diffusion
├── runway.ts      // Video generation
├── replicate.ts   // Various models
├── elevenlabs.ts  // Voice
└── suno.ts        // Music
```

### 3. Shared Infrastructure

```typescript
// src/providers/job-manager.ts  - Async job lifecycle
// src/safety/consent.ts         - Consent validation
// src/storage/media.ts          - Generated media storage
```

### 4. API Endpoints for Async

```typescript
// src/api/jobs.ts
GET  /jobs/:id          // Poll job status
POST /webhooks/:provider // Provider callbacks
```

---

## Testing Requirements

### Provider Mocks

```typescript
// tests/mocks/providers.ts
export const mockDalle = {
  images: { generate: vi.fn().mockResolvedValue({ data: [{ url: '...' }] }) },
};

export const mockRunway = {
  startJob: vi.fn().mockResolvedValue({ id: 'job-123' }),
  getJob: vi.fn().mockResolvedValue({ status: 'complete', output: { url: '...' } }),
};
```

### Consent Validation Tests

```typescript
describe('Face Swap Consent', () => {
  it('blocks face swap on others without consent', async () => {
    await expect(
      faceSwapAgent.execute({
        task: 'Swap',
        parameters: { subjectType: 'other' }, // No consent
      }, context)
    ).rejects.toThrow('CONSENT_REQUIRED');
  });

  it('allows face swap on self without consent', async () => {
    const result = await faceSwapAgent.execute({
      task: 'Swap',
      parameters: { subjectType: 'self' },
    }, context);
    expect(result.status).toBe('success');
  });
});
```

---

## Codex Critique Assessment Summary

| Critique | Valid? | Impact | Resolution Applied |
|----------|--------|--------|---------------------|
| SDK mismatch | **YES** | All agents broken | Fixed all to use `context.tools.call()` |
| Tool schema incomplete | **YES** | ATU features broken | Added all required fields |
| Executor doesn't loop | **PARTIALLY** | LLM tools don't work | Use agent-driven tools (works) |
| Async job missing | **YES** | Video/audio fails | Added ProviderJobManager |
| Provider hand-wavy | **YES** | Nothing actually runs | Added real implementations |
| Migrations missing | **YES** | Schema drift | Added migration system |
| Consent missing | **YES** | Legal/ethical risk | Added ConsentValidator |
| Testing unrealistic | **YES** | Can't CI without burning $ | Added provider mocks |
| MVP scope | **VALID BUT REJECTED** | User wants all 20 | Keeping all 20 |

---

## Final Recommendations

### Before Starting Implementation

1. **Run migration system first** - Set up the database tables
2. **Implement ProviderJobManager** - Required for 8+ features
3. **Implement ConsentValidator** - Required for 3 features
4. **Create provider adapters** - At least skeleton implementations

### Implementation Order (Optimized for Dependencies)

**Wave 1: Foundation (builds shared infra)**
1. Image Generator - Tests provider pattern
2. AI Assistant - Tests conversation storage
3. Image Inpainting - Simple, builds confidence

**Wave 2: Async Pattern (builds job manager)**
4. Video Generator - Establishes async pattern
5. Video Upscaler - Reuses async pattern

**Wave 3: Character System**
6. Character Creator - Establishes character storage
7. Storyboard Generator - Uses character system

**Wave 4: Consent Pattern (builds consent system)**
8. Face Swap Video - Establishes consent pattern
9. Voice Cloner - Reuses consent pattern
10. Lipsync Studio - Reuses both patterns

**Wave 5: Remaining Features**
11-20. Rest in any order (all dependencies satisfied)

---

## Approval Required

This analysis applies all valid Codex critiques to the 20 Higgsfield-inspired features. Ready for your review and approval before implementation.

**Document Version**: 2.0.0
**Status**: Awaiting Approval
