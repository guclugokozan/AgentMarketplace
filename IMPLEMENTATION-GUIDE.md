# Agent Marketplace: Higgsfield AI Features - Complete Implementation Guide

> **Status**: Ready for Implementation
> **Total Features**: 20
> **Estimated Files**: 80+
> **Prerequisites**: Node.js 20+, npm, SQLite

---

## Table of Contents

1. [Pre-Implementation Setup](#pre-implementation-setup)
2. [Infrastructure Components](#infrastructure-components)
3. [Feature Implementations](#feature-implementations)
4. [Testing Setup](#testing-setup)
5. [Final Integration](#final-integration)

---

## Pre-Implementation Setup

### Phase 0: Environment & Dependencies

- [ ] **0.1 Install Required Dependencies**

```bash
npm install openai @anthropic-ai/sdk replicate uuid zod better-sqlite3
npm install -D @types/better-sqlite3 @types/uuid vitest
```

- [ ] **0.2 Create Environment Variables File**

Create `.env.local`:
```bash
# Core
ANTHROPIC_API_KEY=your_key_here

# Image Generation
OPENAI_API_KEY=your_key_here
STABILITY_API_KEY=your_key_here
REPLICATE_API_TOKEN=your_key_here

# Video Generation
RUNWAY_API_KEY=your_key_here
LUMA_API_KEY=your_key_here

# Audio/Voice
ELEVENLABS_API_KEY=your_key_here
SUNO_API_KEY=your_key_here

# Storage (optional - for production)
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=

# Webhooks
WEBHOOK_SECRET=your_webhook_secret
BASE_URL=http://localhost:3000
```

- [ ] **0.3 Create Directory Structure**

```bash
mkdir -p src/providers
mkdir -p src/safety
mkdir -p src/agents/image-generator
mkdir -p src/agents/video-generator
mkdir -p src/agents/face-swap-video
mkdir -p src/agents/lipsync-studio
mkdir -p src/agents/video-upscaler
mkdir -p src/agents/image-inpainting
mkdir -p src/agents/character-creator
mkdir -p src/agents/style-transfer
mkdir -p src/agents/product-enhancer
mkdir -p src/agents/avatar-generator
mkdir -p src/agents/storyboard-generator
mkdir -p src/agents/vfx-transformer
mkdir -p src/agents/ad-generator
mkdir -p src/agents/photo-editor
mkdir -p src/agents/video-effects
mkdir -p src/agents/motion-graphics
mkdir -p src/agents/sketch-to-image
mkdir -p src/agents/music-generator
mkdir -p src/agents/voice-cloner
mkdir -p src/agents/ai-assistant
mkdir -p scripts/migrations
mkdir -p tests/mocks
mkdir -p tests/agents
```

---

## Infrastructure Components

### Phase 1: Database Migrations

- [ ] **1.1 Create Migration Runner**

**File**: `scripts/migrations/migrate.ts`

```typescript
/**
 * Database Migration Runner
 *
 * Runs all pending SQL migrations in order.
 * Tracks applied migrations in a migrations table.
 */

import Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function runMigrations(dbPath: string = './data/agent-marketplace.db'): void {
  const db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get applied migrations
  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r: any) => r.name)
  );

  // Get migration files
  const migrationsDir = join(__dirname);
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let migrationsRun = 0;

  for (const file of files) {
    if (!applied.has(file)) {
      console.log(`Applying migration: ${file}`);

      const sql = readFileSync(join(migrationsDir, file), 'utf-8');

      try {
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
        migrationsRun++;
        console.log(`  ✓ Applied successfully`);
      } catch (error) {
        console.error(`  ✗ Failed to apply: ${error}`);
        throw error;
      }
    }
  }

  if (migrationsRun === 0) {
    console.log('No pending migrations');
  } else {
    console.log(`\nApplied ${migrationsRun} migration(s)`);
  }

  db.close();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}
```

- [ ] **1.2 Create Migration: Provider Jobs**

**File**: `scripts/migrations/001_add_provider_jobs.sql`

```sql
-- Provider Jobs Table
-- Tracks async job status for video, audio, and heavy processing operations

CREATE TABLE IF NOT EXISTS provider_jobs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  external_job_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  run_id TEXT NOT NULL,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'complete', 'failed', 'cancelled')),
  progress INTEGER NOT NULL DEFAULT 0
    CHECK (progress >= 0 AND progress <= 100),

  -- Results
  result_url TEXT,
  result_metadata JSON,
  thumbnail_url TEXT,

  -- Error handling
  error_message TEXT,
  error_code TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,

  -- Webhook handling
  webhook_url TEXT,
  webhook_received BOOLEAN DEFAULT FALSE,
  webhook_payload JSON,

  -- Cost tracking
  cost_usd REAL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- Multi-tenancy
  tenant_id TEXT,
  user_id TEXT,

  -- Indexes
  UNIQUE(provider, external_job_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_jobs_status ON provider_jobs(status);
CREATE INDEX IF NOT EXISTS idx_provider_jobs_provider ON provider_jobs(provider, external_job_id);
CREATE INDEX IF NOT EXISTS idx_provider_jobs_run ON provider_jobs(run_id);
CREATE INDEX IF NOT EXISTS idx_provider_jobs_agent ON provider_jobs(agent_id);
CREATE INDEX IF NOT EXISTS idx_provider_jobs_tenant ON provider_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_provider_jobs_created ON provider_jobs(created_at);

-- Trigger to update updated_at
CREATE TRIGGER IF NOT EXISTS update_provider_jobs_timestamp
  AFTER UPDATE ON provider_jobs
BEGIN
  UPDATE provider_jobs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

- [ ] **1.3 Create Migration: Characters**

**File**: `scripts/migrations/002_add_characters.sql`

```sql
-- Characters Table
-- Stores AI-generated character definitions for consistent generation

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,

  -- Character traits as JSON
  traits JSON,

  -- Visual style
  style TEXT CHECK (style IN ('photorealistic', 'anime', 'cartoon', '3d', 'artistic')),

  -- Face embedding for consistency (stored as binary)
  face_embedding BLOB,
  embedding_model TEXT,
  embedding_version TEXT,

  -- Reference images (JSON array of URLs/base64)
  reference_images JSON,

  -- Generation settings
  default_prompt_prefix TEXT,
  default_negative_prompt TEXT,

  -- Metadata
  tags JSON,
  is_public BOOLEAN DEFAULT FALSE,
  usage_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Multi-tenancy
  tenant_id TEXT,
  user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_characters_tenant ON characters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);
CREATE INDEX IF NOT EXISTS idx_characters_style ON characters(style);
CREATE INDEX IF NOT EXISTS idx_characters_public ON characters(is_public);

CREATE TRIGGER IF NOT EXISTS update_characters_timestamp
  AFTER UPDATE ON characters
BEGIN
  UPDATE characters SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

- [ ] **1.4 Create Migration: Conversations**

**File**: `scripts/migrations/003_add_conversations.sql`

```sql
-- Conversations Table
-- Stores AI Assistant conversation history

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT,

  -- Messages stored as JSON array
  messages JSON NOT NULL DEFAULT '[]',

  -- Conversation metadata
  metadata JSON,
  system_prompt TEXT,

  -- Associated agent
  agent_id TEXT DEFAULT 'ai-assistant',

  -- Message counts
  message_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_message_at TIMESTAMP,

  -- Multi-tenancy
  tenant_id TEXT,
  user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at);

CREATE TRIGGER IF NOT EXISTS update_conversations_timestamp
  AFTER UPDATE ON conversations
BEGIN
  UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
```

- [ ] **1.5 Create Migration: Generated Media**

**File**: `scripts/migrations/004_add_generated_media.sql`

```sql
-- Generated Media Table
-- Tracks all AI-generated images, videos, and audio

CREATE TABLE IF NOT EXISTS generated_media (
  id TEXT PRIMARY KEY,

  -- Media type
  type TEXT NOT NULL CHECK (type IN ('image', 'video', 'audio', 'document', '3d')),

  -- Storage
  url TEXT,
  storage_path TEXT,
  thumbnail_url TEXT,

  -- File info
  file_size INTEGER,
  mime_type TEXT,
  file_name TEXT,

  -- Dimensions (for images/video)
  width INTEGER,
  height INTEGER,

  -- Duration (for video/audio)
  duration_seconds REAL,
  fps INTEGER,

  -- Generation info
  prompt TEXT,
  negative_prompt TEXT,
  seed INTEGER,
  model TEXT,
  provider TEXT,
  generation_params JSON,

  -- Cost
  cost_usd REAL DEFAULT 0,

  -- Relationships
  agent_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  job_id TEXT,
  character_id TEXT,

  -- Status
  status TEXT DEFAULT 'available' CHECK (status IN ('processing', 'available', 'expired', 'deleted')),

  -- Expiration
  expires_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Multi-tenancy
  tenant_id TEXT,
  user_id TEXT,

  -- Foreign keys
  FOREIGN KEY (job_id) REFERENCES provider_jobs(id) ON DELETE SET NULL,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_generated_media_type ON generated_media(type);
CREATE INDEX IF NOT EXISTS idx_generated_media_run ON generated_media(run_id);
CREATE INDEX IF NOT EXISTS idx_generated_media_agent ON generated_media(agent_id);
CREATE INDEX IF NOT EXISTS idx_generated_media_job ON generated_media(job_id);
CREATE INDEX IF NOT EXISTS idx_generated_media_character ON generated_media(character_id);
CREATE INDEX IF NOT EXISTS idx_generated_media_status ON generated_media(status);
CREATE INDEX IF NOT EXISTS idx_generated_media_expires ON generated_media(expires_at);
CREATE INDEX IF NOT EXISTS idx_generated_media_tenant ON generated_media(tenant_id);
```

- [ ] **1.6 Create Migration: Consent Log**

**File**: `scripts/migrations/005_add_consent_log.sql`

```sql
-- Consent Log Table
-- Audit trail for biometric operations (face swap, voice clone, etc.)

CREATE TABLE IF NOT EXISTS consent_log (
  id TEXT PRIMARY KEY,

  -- Operation details
  operation_type TEXT NOT NULL CHECK (operation_type IN (
    'face_swap', 'face_detection', 'voice_clone', 'voice_synthesis',
    'lipsync', 'face_analysis', 'biometric_other'
  )),

  -- Subject info
  subject_type TEXT NOT NULL CHECK (subject_type IN ('self', 'other', 'unknown')),

  -- Consent evidence
  consent_type TEXT CHECK (consent_type IN (
    'explicit_checkbox', 'terms_acceptance', 'api_attestation',
    'verbal_recorded', 'written_document', 'none'
  )),
  consent_reference TEXT,
  consent_timestamp TIMESTAMP,

  -- Purpose
  purpose TEXT NOT NULL,
  intended_use TEXT,

  -- Validation result
  validation_result TEXT CHECK (validation_result IN ('approved', 'denied', 'pending')),
  restrictions_applied JSON,

  -- Request context
  ip_address TEXT,
  user_agent TEXT,

  -- Relationships
  run_id TEXT,
  agent_id TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Multi-tenancy
  tenant_id TEXT,
  user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_consent_log_operation ON consent_log(operation_type);
CREATE INDEX IF NOT EXISTS idx_consent_log_subject ON consent_log(subject_type);
CREATE INDEX IF NOT EXISTS idx_consent_log_result ON consent_log(validation_result);
CREATE INDEX IF NOT EXISTS idx_consent_log_user ON consent_log(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_log_run ON consent_log(run_id);
CREATE INDEX IF NOT EXISTS idx_consent_log_created ON consent_log(created_at);
```

- [ ] **1.7 Run Migrations**

```bash
npx tsx scripts/migrations/migrate.ts
```

---

### Phase 2: Provider Job Manager

- [ ] **2.1 Create Job Manager**

**File**: `src/providers/job-manager.ts`

```typescript
/**
 * Provider Job Manager
 *
 * Manages async job lifecycle for video, audio, and heavy processing.
 * Handles creation, polling, completion, and failure states.
 */

import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';

// Types
export interface JobCreateParams {
  provider: string;
  externalJobId: string;
  agentId: string;
  runId: string;
  webhookUrl?: string;
  tenantId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface JobStatus {
  id: string;
  provider: string;
  externalJobId: string;
  status: 'pending' | 'processing' | 'complete' | 'failed' | 'cancelled';
  progress: number;
  resultUrl?: string;
  resultMetadata?: Record<string, unknown>;
  thumbnailUrl?: string;
  errorMessage?: string;
  errorCode?: string;
  costUsd: number;
  createdAt: string;
  completedAt?: string;
}

export interface JobUpdateParams {
  status?: JobStatus['status'];
  progress?: number;
  resultUrl?: string;
  resultMetadata?: Record<string, unknown>;
  thumbnailUrl?: string;
  errorMessage?: string;
  errorCode?: string;
  costUsd?: number;
}

export class ProviderJobManager {
  private db: Database.Database;

  constructor(dbPath: string = './data/agent-marketplace.db') {
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
  }

  /**
   * Create a new job record
   */
  create(params: JobCreateParams): string {
    const id = uuidv4();

    this.db.prepare(`
      INSERT INTO provider_jobs (
        id, provider, external_job_id, agent_id, run_id,
        webhook_url, tenant_id, user_id, result_metadata, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      id,
      params.provider,
      params.externalJobId,
      params.agentId,
      params.runId,
      params.webhookUrl || null,
      params.tenantId || null,
      params.userId || null,
      params.metadata ? JSON.stringify(params.metadata) : null
    );

    return id;
  }

  /**
   * Get job status by ID
   */
  getStatus(id: string): JobStatus | null {
    const row = this.db.prepare(`
      SELECT
        id, provider, external_job_id, status, progress,
        result_url, result_metadata, thumbnail_url,
        error_message, error_code, cost_usd,
        created_at, completed_at
      FROM provider_jobs
      WHERE id = ?
    `).get(id) as any;

    if (!row) return null;

    return this.rowToStatus(row);
  }

  /**
   * Get job by external provider ID
   */
  findByExternalId(provider: string, externalJobId: string): JobStatus | null {
    const row = this.db.prepare(`
      SELECT
        id, provider, external_job_id, status, progress,
        result_url, result_metadata, thumbnail_url,
        error_message, error_code, cost_usd,
        created_at, completed_at
      FROM provider_jobs
      WHERE provider = ? AND external_job_id = ?
    `).get(provider, externalJobId) as any;

    if (!row) return null;

    return this.rowToStatus(row);
  }

  /**
   * List jobs by run ID
   */
  listByRun(runId: string): JobStatus[] {
    const rows = this.db.prepare(`
      SELECT
        id, provider, external_job_id, status, progress,
        result_url, result_metadata, thumbnail_url,
        error_message, error_code, cost_usd,
        created_at, completed_at
      FROM provider_jobs
      WHERE run_id = ?
      ORDER BY created_at DESC
    `).all(runId) as any[];

    return rows.map(row => this.rowToStatus(row));
  }

  /**
   * Update job progress
   */
  updateProgress(id: string, progress: number): void {
    this.db.prepare(`
      UPDATE provider_jobs
      SET progress = ?, status = 'processing', started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `).run(Math.min(100, Math.max(0, progress)), id);
  }

  /**
   * Mark job as complete
   */
  complete(
    id: string,
    resultUrl: string,
    metadata?: Record<string, unknown>,
    costUsd?: number,
    thumbnailUrl?: string
  ): void {
    this.db.prepare(`
      UPDATE provider_jobs
      SET
        status = 'complete',
        progress = 100,
        result_url = ?,
        result_metadata = ?,
        thumbnail_url = ?,
        cost_usd = COALESCE(?, cost_usd),
        completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      resultUrl,
      metadata ? JSON.stringify(metadata) : null,
      thumbnailUrl || null,
      costUsd || null,
      id
    );
  }

  /**
   * Mark job as failed
   */
  fail(id: string, errorMessage: string, errorCode?: string): void {
    this.db.prepare(`
      UPDATE provider_jobs
      SET
        status = 'failed',
        error_message = ?,
        error_code = ?,
        completed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(errorMessage, errorCode || null, id);
  }

  /**
   * Cancel a job
   */
  cancel(id: string): void {
    this.db.prepare(`
      UPDATE provider_jobs
      SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status IN ('pending', 'processing')
    `).run(id);
  }

  /**
   * Get pending jobs for a provider (for batch polling)
   */
  getPendingJobs(provider: string, limit: number = 50): JobStatus[] {
    const rows = this.db.prepare(`
      SELECT
        id, provider, external_job_id, status, progress,
        result_url, result_metadata, thumbnail_url,
        error_message, error_code, cost_usd,
        created_at, completed_at
      FROM provider_jobs
      WHERE provider = ? AND status IN ('pending', 'processing')
      ORDER BY created_at ASC
      LIMIT ?
    `).all(provider, limit) as any[];

    return rows.map(row => this.rowToStatus(row));
  }

  /**
   * Handle webhook callback
   */
  handleWebhook(
    provider: string,
    externalJobId: string,
    payload: Record<string, unknown>
  ): JobStatus | null {
    const job = this.findByExternalId(provider, externalJobId);
    if (!job) return null;

    this.db.prepare(`
      UPDATE provider_jobs
      SET webhook_received = TRUE, webhook_payload = ?
      WHERE id = ?
    `).run(JSON.stringify(payload), job.id);

    return this.getStatus(job.id);
  }

  /**
   * Get job statistics
   */
  getStats(tenantId?: string): {
    total: number;
    pending: number;
    processing: number;
    complete: number;
    failed: number;
    totalCostUsd: number;
  } {
    const whereClause = tenantId ? 'WHERE tenant_id = ?' : '';
    const params = tenantId ? [tenantId] : [];

    const row = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as complete,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(cost_usd) as total_cost_usd
      FROM provider_jobs
      ${whereClause}
    `).get(...params) as any;

    return {
      total: row.total || 0,
      pending: row.pending || 0,
      processing: row.processing || 0,
      complete: row.complete || 0,
      failed: row.failed || 0,
      totalCostUsd: row.total_cost_usd || 0,
    };
  }

  /**
   * Clean up old completed/failed jobs
   */
  cleanup(olderThanDays: number = 30): number {
    const result = this.db.prepare(`
      DELETE FROM provider_jobs
      WHERE status IN ('complete', 'failed', 'cancelled')
        AND completed_at < datetime('now', '-' || ? || ' days')
    `).run(olderThanDays);

    return result.changes;
  }

  private rowToStatus(row: any): JobStatus {
    return {
      id: row.id,
      provider: row.provider,
      externalJobId: row.external_job_id,
      status: row.status,
      progress: row.progress,
      resultUrl: row.result_url || undefined,
      resultMetadata: row.result_metadata ? JSON.parse(row.result_metadata) : undefined,
      thumbnailUrl: row.thumbnail_url || undefined,
      errorMessage: row.error_message || undefined,
      errorCode: row.error_code || undefined,
      costUsd: row.cost_usd || 0,
      createdAt: row.created_at,
      completedAt: row.completed_at || undefined,
    };
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance
let instance: ProviderJobManager | null = null;

export function getJobManager(): ProviderJobManager {
  if (!instance) {
    instance = new ProviderJobManager();
  }
  return instance;
}

export function closeJobManager(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
```

---

### Phase 3: Consent Validator

- [ ] **3.1 Create Consent Validator**

**File**: `src/safety/consent.ts`

```typescript
/**
 * Consent Validator
 *
 * Validates and logs consent for biometric operations.
 * Required for: face swap, voice cloning, lipsync, etc.
 */

import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import { z } from 'zod';

// Schemas
export const ConsentEvidenceSchema = z.object({
  type: z.enum([
    'explicit_checkbox',
    'terms_acceptance',
    'api_attestation',
    'verbal_recorded',
    'written_document',
    'none'
  ]),
  timestamp: z.string().datetime().optional(),
  reference: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const ConsentRequestSchema = z.object({
  operationType: z.enum([
    'face_swap',
    'face_detection',
    'voice_clone',
    'voice_synthesis',
    'lipsync',
    'face_analysis',
    'biometric_other'
  ]),
  subjectType: z.enum(['self', 'other', 'unknown']),
  consentEvidence: ConsentEvidenceSchema.optional(),
  purpose: z.string().min(1).max(500),
  intendedUse: z.string().optional(),
});

export type ConsentRequest = z.infer<typeof ConsentRequestSchema>;
export type ConsentEvidence = z.infer<typeof ConsentEvidenceSchema>;

export interface ConsentContext {
  runId: string;
  agentId: string;
  tenantId?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ConsentResult {
  valid: boolean;
  logId: string;
  restrictions: string[];
  requiresWatermark: boolean;
  message?: string;
}

// Operations that REQUIRE consent for 'other' subjects
const CONSENT_REQUIRED_OPERATIONS = new Set([
  'face_swap',
  'voice_clone',
  'lipsync',
]);

// Operations that require watermark for non-self subjects
const WATERMARK_REQUIRED_OPERATIONS = new Set([
  'face_swap',
  'voice_clone',
]);

export class ConsentValidator {
  private db: Database.Database;

  constructor(dbPath: string = './data/agent-marketplace.db') {
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
  }

  /**
   * Validate consent for a biometric operation
   */
  validate(request: ConsentRequest, context: ConsentContext): ConsentResult {
    // Parse and validate input
    const parsed = ConsentRequestSchema.parse(request);

    const logId = uuidv4();
    const restrictions: string[] = [];
    let valid = true;
    let message: string | undefined;

    // Determine if consent is required
    const requiresConsent =
      parsed.subjectType === 'other' &&
      CONSENT_REQUIRED_OPERATIONS.has(parsed.operationType);

    // Check consent for operations on others
    if (requiresConsent) {
      if (!parsed.consentEvidence || parsed.consentEvidence.type === 'none') {
        valid = false;
        message = `CONSENT_REQUIRED: ${parsed.operationType} on other individuals requires explicit consent. ` +
                  `Please provide consent evidence or confirm the subject is yourself.`;
      }
    }

    // Determine restrictions
    if (parsed.subjectType === 'other') {
      restrictions.push('no_commercial_without_license');
      if (valid && parsed.consentEvidence?.type === 'api_attestation') {
        restrictions.push('attestation_recorded');
      }
    }

    if (parsed.subjectType === 'unknown') {
      restrictions.push('personal_use_only');
      restrictions.push('no_redistribution');
    }

    // Determine watermark requirement
    const requiresWatermark =
      parsed.subjectType !== 'self' &&
      WATERMARK_REQUIRED_OPERATIONS.has(parsed.operationType);

    if (requiresWatermark) {
      restrictions.push('watermark_applied');
    }

    // Log the consent check
    this.logConsentCheck({
      id: logId,
      operationType: parsed.operationType,
      subjectType: parsed.subjectType,
      consentType: parsed.consentEvidence?.type || 'none',
      consentReference: parsed.consentEvidence?.reference,
      consentTimestamp: parsed.consentEvidence?.timestamp,
      purpose: parsed.purpose,
      intendedUse: parsed.intendedUse,
      validationResult: valid ? 'approved' : 'denied',
      restrictionsApplied: restrictions,
      runId: context.runId,
      agentId: context.agentId,
      tenantId: context.tenantId,
      userId: context.userId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    // Throw if invalid (acts as a gate)
    if (!valid) {
      throw new Error(message);
    }

    return {
      valid,
      logId,
      restrictions,
      requiresWatermark,
      message,
    };
  }

  /**
   * Log a consent check to the database
   */
  private logConsentCheck(params: {
    id: string;
    operationType: string;
    subjectType: string;
    consentType: string;
    consentReference?: string;
    consentTimestamp?: string;
    purpose: string;
    intendedUse?: string;
    validationResult: 'approved' | 'denied' | 'pending';
    restrictionsApplied: string[];
    runId: string;
    agentId: string;
    tenantId?: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): void {
    this.db.prepare(`
      INSERT INTO consent_log (
        id, operation_type, subject_type, consent_type, consent_reference,
        consent_timestamp, purpose, intended_use, validation_result,
        restrictions_applied, run_id, agent_id, tenant_id, user_id,
        ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      params.id,
      params.operationType,
      params.subjectType,
      params.consentType,
      params.consentReference || null,
      params.consentTimestamp || null,
      params.purpose,
      params.intendedUse || null,
      params.validationResult,
      JSON.stringify(params.restrictionsApplied),
      params.runId,
      params.agentId,
      params.tenantId || null,
      params.userId || null,
      params.ipAddress || null,
      params.userAgent || null
    );
  }

  /**
   * Get consent log for a run
   */
  getConsentLog(runId: string): any[] {
    return this.db.prepare(`
      SELECT * FROM consent_log WHERE run_id = ? ORDER BY created_at DESC
    `).all(runId);
  }

  /**
   * Get consent statistics
   */
  getStats(tenantId?: string): {
    total: number;
    approved: number;
    denied: number;
    byOperation: Record<string, number>;
  } {
    const whereClause = tenantId ? 'WHERE tenant_id = ?' : '';
    const params = tenantId ? [tenantId] : [];

    const totals = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN validation_result = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN validation_result = 'denied' THEN 1 ELSE 0 END) as denied
      FROM consent_log
      ${whereClause}
    `).get(...params) as any;

    const byOperation = this.db.prepare(`
      SELECT operation_type, COUNT(*) as count
      FROM consent_log
      ${whereClause}
      GROUP BY operation_type
    `).all(...params) as any[];

    return {
      total: totals.total || 0,
      approved: totals.approved || 0,
      denied: totals.denied || 0,
      byOperation: Object.fromEntries(
        byOperation.map(r => [r.operation_type, r.count])
      ),
    };
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance
let instance: ConsentValidator | null = null;

export function getConsentValidator(): ConsentValidator {
  if (!instance) {
    instance = new ConsentValidator();
  }
  return instance;
}

export function closeConsentValidator(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
```

---

### Phase 4: Provider Adapters

- [ ] **4.1 Create Base Provider**

**File**: `src/providers/base.ts`

```typescript
/**
 * Base Provider
 *
 * Abstract base class for all AI provider adapters.
 * Handles common functionality: auth, retries, rate limiting, error handling.
 */

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface ProviderError {
  code: string;
  message: string;
  retryable: boolean;
  retryAfter?: number;
  originalError?: unknown;
}

export abstract class BaseProvider {
  protected config: Required<ProviderConfig>;
  protected name: string;

  constructor(name: string, config: ProviderConfig) {
    this.name = name;
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      baseUrl: '',
      ...config,
    };

    if (!this.config.apiKey) {
      throw new Error(`${name}: API key is required`);
    }
  }

  /**
   * Make a fetch request with retries and error handling
   */
  protected async fetchWithRetry<T>(
    url: string,
    options: RequestInit = {},
    retries: number = this.config.maxRetries
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await this.parseError(response);

        if (error.retryable && retries > 0) {
          const delay = error.retryAfter
            ? error.retryAfter * 1000
            : this.config.retryDelay * (this.config.maxRetries - retries + 1);

          await this.sleep(delay);
          return this.fetchWithRetry(url, options, retries - 1);
        }

        throw new Error(`${this.name} API error: ${error.message} (${error.code})`);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`${this.name} API timeout after ${this.config.timeout}ms`);
      }

      throw error;
    }
  }

  /**
   * Get authorization headers
   */
  protected abstract getAuthHeaders(): Record<string, string>;

  /**
   * Parse error response
   */
  protected async parseError(response: Response): Promise<ProviderError> {
    try {
      const body = await response.json();
      return {
        code: body.error?.code || body.code || response.status.toString(),
        message: body.error?.message || body.message || response.statusText,
        retryable: response.status === 429 || response.status >= 500,
        retryAfter: parseInt(response.headers.get('retry-after') || '0', 10) || undefined,
        originalError: body,
      };
    } catch {
      return {
        code: response.status.toString(),
        message: response.statusText,
        retryable: response.status >= 500,
      };
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get provider name
   */
  getName(): string {
    return this.name;
  }
}
```

- [ ] **4.2 Create OpenAI Provider (DALL-E)**

**File**: `src/providers/openai.ts`

```typescript
/**
 * OpenAI Provider
 *
 * Handles DALL-E image generation and GPT operations.
 */

import OpenAI from 'openai';
import { BaseProvider, ProviderConfig } from './base.js';

export interface DalleGenerateParams {
  prompt: string;
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number;
}

export interface DalleGenerateResult {
  url: string;
  revisedPrompt?: string;
  width: number;
  height: number;
  costUsd: number;
}

// Pricing (as of 2024)
const DALLE_PRICING = {
  'standard': {
    '1024x1024': 0.040,
    '1792x1024': 0.080,
    '1024x1792': 0.080,
  },
  'hd': {
    '1024x1024': 0.080,
    '1792x1024': 0.120,
    '1024x1792': 0.120,
  },
} as const;

export class OpenAIProvider extends BaseProvider {
  private client: OpenAI;

  constructor(config?: Partial<ProviderConfig>) {
    const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key required. Set OPENAI_API_KEY or pass apiKey in config.');
    }

    super('OpenAI', { apiKey, ...config });
    this.client = new OpenAI({ apiKey });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
  }

  /**
   * Generate image with DALL-E 3
   */
  async generateImage(params: DalleGenerateParams): Promise<DalleGenerateResult> {
    const size = params.size || '1024x1024';
    const quality = params.quality || 'standard';

    const response = await this.client.images.generate({
      model: 'dall-e-3',
      prompt: params.prompt,
      size,
      quality,
      style: params.style || 'vivid',
      n: 1, // DALL-E 3 only supports n=1
      response_format: 'url',
    });

    const image = response.data[0];
    const [width, height] = size.split('x').map(Number);
    const costUsd = DALLE_PRICING[quality][size];

    return {
      url: image.url!,
      revisedPrompt: image.revised_prompt,
      width,
      height,
      costUsd,
    };
  }

  /**
   * Generate multiple images (calls DALL-E multiple times)
   */
  async generateImages(params: DalleGenerateParams, count: number): Promise<DalleGenerateResult[]> {
    const results: DalleGenerateResult[] = [];

    for (let i = 0; i < count; i++) {
      const result = await this.generateImage(params);
      results.push(result);
    }

    return results;
  }
}

// Singleton
let instance: OpenAIProvider | null = null;

export function getOpenAIProvider(): OpenAIProvider {
  if (!instance) {
    instance = new OpenAIProvider();
  }
  return instance;
}
```

- [ ] **4.3 Create Stability AI Provider**

**File**: `src/providers/stability.ts`

```typescript
/**
 * Stability AI Provider
 *
 * Handles Stable Diffusion image generation.
 */

import { BaseProvider, ProviderConfig } from './base.js';

export interface StabilityGenerateParams {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  style?: string;
}

export interface StabilityGenerateResult {
  base64: string;
  seed: number;
  width: number;
  height: number;
  costUsd: number;
}

export class StabilityProvider extends BaseProvider {
  constructor(config?: Partial<ProviderConfig>) {
    const apiKey = config?.apiKey || process.env.STABILITY_API_KEY;
    if (!apiKey) {
      throw new Error('Stability API key required. Set STABILITY_API_KEY or pass apiKey in config.');
    }

    super('Stability', {
      apiKey,
      baseUrl: 'https://api.stability.ai',
      ...config,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Accept': 'application/json',
    };
  }

  /**
   * Generate image with Stable Diffusion XL
   */
  async generateImage(params: StabilityGenerateParams): Promise<StabilityGenerateResult> {
    const width = params.width || 1024;
    const height = params.height || 1024;

    const response = await this.fetchWithRetry<{
      artifacts: Array<{
        base64: string;
        seed: number;
        finishReason: string;
      }>;
    }>(`${this.config.baseUrl}/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image`, {
      method: 'POST',
      body: JSON.stringify({
        text_prompts: [
          { text: params.prompt, weight: 1 },
          ...(params.negativePrompt ? [{ text: params.negativePrompt, weight: -1 }] : []),
        ],
        cfg_scale: params.cfgScale || 7,
        width,
        height,
        steps: params.steps || 30,
        seed: params.seed || 0,
        style_preset: params.style,
      }),
    });

    const artifact = response.artifacts[0];

    // Approximate cost: ~$0.002-0.006 per image
    const costUsd = 0.004;

    return {
      base64: artifact.base64,
      seed: artifact.seed,
      width,
      height,
      costUsd,
    };
  }
}

// Singleton
let instance: StabilityProvider | null = null;

export function getStabilityProvider(): StabilityProvider {
  if (!instance) {
    instance = new StabilityProvider();
  }
  return instance;
}
```

- [ ] **4.4 Create Runway Provider (Video)**

**File**: `src/providers/runway.ts`

```typescript
/**
 * Runway Provider
 *
 * Handles video generation with Runway Gen-3.
 */

import { BaseProvider, ProviderConfig } from './base.js';

export interface RunwayGenerateParams {
  prompt: string;
  duration?: 4 | 8 | 16;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  imageUrl?: string; // For image-to-video
  seed?: number;
}

export interface RunwayJobResult {
  id: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  progress?: number;
  output?: {
    url: string;
    duration: number;
    width: number;
    height: number;
  };
  error?: string;
}

// Runway pricing: approximately $0.05 per second of video
const RUNWAY_COST_PER_SECOND = 0.05;

export class RunwayProvider extends BaseProvider {
  constructor(config?: Partial<ProviderConfig>) {
    const apiKey = config?.apiKey || process.env.RUNWAY_API_KEY;
    if (!apiKey) {
      throw new Error('Runway API key required. Set RUNWAY_API_KEY or pass apiKey in config.');
    }

    super('Runway', {
      apiKey,
      baseUrl: 'https://api.runwayml.com/v1',
      timeout: 30000,
      ...config,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'X-Runway-Version': '2024-09-13',
    };
  }

  /**
   * Start a video generation job
   */
  async startGeneration(params: RunwayGenerateParams): Promise<{
    jobId: string;
    estimatedCost: number;
    estimatedDuration: number;
  }> {
    const duration = params.duration || 4;

    const body: Record<string, unknown> = {
      model: 'gen3a_turbo',
      promptText: params.prompt,
      duration,
      ratio: (params.aspectRatio || '16:9').replace(':', '_'),
    };

    if (params.imageUrl) {
      body.promptImage = params.imageUrl;
    }

    if (params.seed !== undefined) {
      body.seed = params.seed;
    }

    const response = await this.fetchWithRetry<{ id: string }>(`${this.config.baseUrl}/image_to_video`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      jobId: response.id,
      estimatedCost: duration * RUNWAY_COST_PER_SECOND,
      estimatedDuration: duration * 15, // Rough estimate: 15 seconds per video second
    };
  }

  /**
   * Poll job status
   */
  async getJobStatus(jobId: string): Promise<RunwayJobResult> {
    const response = await this.fetchWithRetry<{
      id: string;
      status: string;
      progress?: number;
      output?: string[];
      failure?: string;
      createdAt: string;
    }>(`${this.config.baseUrl}/tasks/${jobId}`, {
      method: 'GET',
    });

    const status = response.status.toLowerCase() as RunwayJobResult['status'];

    const result: RunwayJobResult = {
      id: response.id,
      status: status === 'succeeded' ? 'complete' : status as any,
      progress: response.progress,
    };

    if (status === 'complete' && response.output?.[0]) {
      result.output = {
        url: response.output[0],
        duration: 4, // Would need to parse from response
        width: 1280,
        height: 720,
      };
    }

    if (response.failure) {
      result.status = 'failed';
      result.error = response.failure;
    }

    return result;
  }

  /**
   * Wait for job completion (with polling)
   */
  async waitForCompletion(
    jobId: string,
    options: { maxWaitMs?: number; pollIntervalMs?: number } = {}
  ): Promise<RunwayJobResult> {
    const maxWait = options.maxWaitMs || 5 * 60 * 1000; // 5 minutes
    const pollInterval = options.pollIntervalMs || 5000; // 5 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const status = await this.getJobStatus(jobId);

      if (status.status === 'complete' || status.status === 'failed') {
        return status;
      }

      await this.sleep(pollInterval);
    }

    return {
      id: jobId,
      status: 'processing',
      progress: 0,
    };
  }
}

// Singleton
let instance: RunwayProvider | null = null;

export function getRunwayProvider(): RunwayProvider {
  if (!instance) {
    instance = new RunwayProvider();
  }
  return instance;
}
```

- [ ] **4.5 Create Replicate Provider**

**File**: `src/providers/replicate.ts`

```typescript
/**
 * Replicate Provider
 *
 * Handles various AI models via Replicate API.
 * Used for: face swap, face detection, style transfer, etc.
 */

import Replicate from 'replicate';
import { BaseProvider, ProviderConfig } from './base.js';

export interface ReplicateRunParams {
  model: string;
  version?: string;
  input: Record<string, unknown>;
}

export interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: unknown;
  error?: string;
  metrics?: {
    predict_time?: number;
  };
}

// Common model versions
export const REPLICATE_MODELS = {
  FACE_SWAP: 'lucataco/faceswap:9a4298548422074c3f57258c5d544497314ae4112df80d116f0d2109e843d20d',
  FACE_DETECTION: 'sczhou/codeformer:7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56',
  STYLE_TRANSFER: 'tencentarc/photomaker:ddfc2b08d209f9fa8c1edd57f1a4686e1ac4f11916e53b0bea4d8a34a9fb0842',
  BACKGROUND_REMOVAL: 'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003',
  UPSCALER: 'nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b',
} as const;

export class ReplicateProvider extends BaseProvider {
  private client: Replicate;

  constructor(config?: Partial<ProviderConfig>) {
    const apiKey = config?.apiKey || process.env.REPLICATE_API_TOKEN;
    if (!apiKey) {
      throw new Error('Replicate API token required. Set REPLICATE_API_TOKEN or pass apiKey in config.');
    }

    super('Replicate', { apiKey, ...config });
    this.client = new Replicate({ auth: apiKey });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Token ${this.config.apiKey}`,
    };
  }

  /**
   * Run a model and wait for completion
   */
  async run<T = unknown>(params: ReplicateRunParams): Promise<T> {
    const output = await this.client.run(params.model as `${string}/${string}:${string}`, {
      input: params.input,
    });

    return output as T;
  }

  /**
   * Start a prediction (for async operations)
   */
  async startPrediction(params: ReplicateRunParams): Promise<string> {
    const [owner, name] = params.model.split('/');
    const version = params.version || params.model.split(':')[1];

    const prediction = await this.client.predictions.create({
      version,
      input: params.input,
    });

    return prediction.id;
  }

  /**
   * Get prediction status
   */
  async getPrediction(id: string): Promise<ReplicatePrediction> {
    const prediction = await this.client.predictions.get(id);

    return {
      id: prediction.id,
      status: prediction.status as ReplicatePrediction['status'],
      output: prediction.output,
      error: prediction.error as string | undefined,
      metrics: prediction.metrics as { predict_time?: number } | undefined,
    };
  }

  /**
   * Wait for prediction completion
   */
  async waitForPrediction(id: string, maxWaitMs: number = 300000): Promise<ReplicatePrediction> {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < maxWaitMs) {
      const prediction = await this.getPrediction(id);

      if (prediction.status === 'succeeded' || prediction.status === 'failed' || prediction.status === 'canceled') {
        return prediction;
      }

      await this.sleep(pollInterval);
    }

    throw new Error(`Prediction ${id} timed out after ${maxWaitMs}ms`);
  }

  /**
   * Face swap convenience method
   */
  async faceSwap(sourceImage: string, targetImage: string): Promise<string> {
    const output = await this.run<string[]>({
      model: REPLICATE_MODELS.FACE_SWAP,
      input: {
        source_image: sourceImage,
        target_image: targetImage,
      },
    });

    return output[0];
  }

  /**
   * Remove background convenience method
   */
  async removeBackground(imageUrl: string): Promise<string> {
    const output = await this.run<string>({
      model: REPLICATE_MODELS.BACKGROUND_REMOVAL,
      input: {
        image: imageUrl,
      },
    });

    return output;
  }

  /**
   * Upscale image convenience method
   */
  async upscaleImage(imageUrl: string, scale: number = 4): Promise<string> {
    const output = await this.run<string>({
      model: REPLICATE_MODELS.UPSCALER,
      input: {
        image: imageUrl,
        scale,
        face_enhance: true,
      },
    });

    return output;
  }
}

// Singleton
let instance: ReplicateProvider | null = null;

export function getReplicateProvider(): ReplicateProvider {
  if (!instance) {
    instance = new ReplicateProvider();
  }
  return instance;
}
```

- [ ] **4.6 Create ElevenLabs Provider (Voice)**

**File**: `src/providers/elevenlabs.ts`

```typescript
/**
 * ElevenLabs Provider
 *
 * Handles voice cloning and text-to-speech.
 */

import { BaseProvider, ProviderConfig } from './base.js';

export interface TTSParams {
  text: string;
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
}

export interface VoiceCloneParams {
  name: string;
  description?: string;
  files: Array<{ data: Buffer; mimeType: string }>;
  labels?: Record<string, string>;
}

export interface Voice {
  voiceId: string;
  name: string;
  category: string;
  description?: string;
  previewUrl?: string;
}

// Default voices
export const ELEVENLABS_VOICES = {
  RACHEL: '21m00Tcm4TlvDq8ikWAM',
  DOMI: 'AZnzlk1XvdvUeBnXmlld',
  BELLA: 'EXAVITQu4vr4xnSDxMaL',
  ANTONI: 'ErXwobaYiN019PkySvjV',
  ELLI: 'MF3mGyEYCl7XYWbV9V6O',
  JOSH: 'TxGEqnHWrfWFTfGW9XjX',
  ARNOLD: 'VR6AewLTigWG4xSOukaG',
  ADAM: 'pNInz6obpgDQGcFmaJgB',
  SAM: 'yoZ06aMxZJJ28mfd3POQ',
} as const;

export class ElevenLabsProvider extends BaseProvider {
  constructor(config?: Partial<ProviderConfig>) {
    const apiKey = config?.apiKey || process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ElevenLabs API key required. Set ELEVENLABS_API_KEY or pass apiKey in config.');
    }

    super('ElevenLabs', {
      apiKey,
      baseUrl: 'https://api.elevenlabs.io/v1',
      ...config,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'xi-api-key': this.config.apiKey,
    };
  }

  /**
   * Text-to-speech generation
   */
  async textToSpeech(params: TTSParams): Promise<{
    audioBuffer: Buffer;
    costUsd: number;
  }> {
    const response = await fetch(
      `${this.config.baseUrl}/text-to-speech/${params.voiceId}`,
      {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: params.text,
          model_id: params.modelId || 'eleven_monolingual_v1',
          voice_settings: {
            stability: params.stability || 0.5,
            similarity_boost: params.similarityBoost || 0.75,
            style: params.style || 0,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`ElevenLabs TTS error: ${error.detail?.message || response.statusText}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    // Cost: approximately $0.30 per 1000 characters
    const costUsd = (params.text.length / 1000) * 0.30;

    return { audioBuffer, costUsd };
  }

  /**
   * Clone a voice from audio samples
   */
  async cloneVoice(params: VoiceCloneParams): Promise<Voice> {
    const formData = new FormData();
    formData.append('name', params.name);

    if (params.description) {
      formData.append('description', params.description);
    }

    if (params.labels) {
      formData.append('labels', JSON.stringify(params.labels));
    }

    for (let i = 0; i < params.files.length; i++) {
      const file = params.files[i];
      formData.append('files', new Blob([file.data], { type: file.mimeType }));
    }

    const response = await fetch(`${this.config.baseUrl}/voices/add`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`ElevenLabs voice clone error: ${error.detail?.message || response.statusText}`);
    }

    const result = await response.json();

    return {
      voiceId: result.voice_id,
      name: params.name,
      category: 'cloned',
      description: params.description,
    };
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<Voice[]> {
    const response = await this.fetchWithRetry<{ voices: any[] }>(`${this.config.baseUrl}/voices`, {
      method: 'GET',
    });

    return response.voices.map(v => ({
      voiceId: v.voice_id,
      name: v.name,
      category: v.category,
      description: v.description,
      previewUrl: v.preview_url,
    }));
  }

  /**
   * Delete a cloned voice
   */
  async deleteVoice(voiceId: string): Promise<void> {
    await this.fetchWithRetry<void>(`${this.config.baseUrl}/voices/${voiceId}`, {
      method: 'DELETE',
    });
  }
}

// Singleton
let instance: ElevenLabsProvider | null = null;

export function getElevenLabsProvider(): ElevenLabsProvider {
  if (!instance) {
    instance = new ElevenLabsProvider();
  }
  return instance;
}
```

---

### Phase 5: API Endpoints for Jobs

- [ ] **5.1 Create Jobs API Router**

**File**: `src/api/jobs.ts`

```typescript
/**
 * Jobs API Router
 *
 * REST endpoints for async job management.
 */

import { Router, Request, Response } from 'express';
import { getJobManager } from '../providers/job-manager.js';
import { createHmac } from 'crypto';

const router = Router();

/**
 * GET /jobs/:id - Get job status
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const jobManager = getJobManager();

    const status = jobManager.getStatus(id);

    if (!status) {
      return res.status(404).json({
        error: 'Job not found',
        code: 'JOB_NOT_FOUND',
      });
    }

    res.json(status);
  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * GET /jobs/run/:runId - List jobs for a run
 */
router.get('/run/:runId', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const jobManager = getJobManager();

    const jobs = jobManager.listByRun(runId);

    res.json({ jobs });
  } catch (error) {
    console.error('Error listing jobs:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * POST /jobs/:id/cancel - Cancel a job
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const jobManager = getJobManager();

    const status = jobManager.getStatus(id);

    if (!status) {
      return res.status(404).json({
        error: 'Job not found',
        code: 'JOB_NOT_FOUND',
      });
    }

    if (status.status !== 'pending' && status.status !== 'processing') {
      return res.status(400).json({
        error: 'Job cannot be cancelled',
        code: 'JOB_NOT_CANCELLABLE',
        currentStatus: status.status,
      });
    }

    jobManager.cancel(id);

    res.json({
      success: true,
      message: 'Job cancelled',
    });
  } catch (error) {
    console.error('Error cancelling job:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * GET /jobs/stats - Get job statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string | undefined;
    const jobManager = getJobManager();

    const stats = jobManager.getStats(tenantId);

    res.json(stats);
  } catch (error) {
    console.error('Error getting job stats:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * POST /webhooks/:provider - Handle provider webhooks
 */
router.post('/webhooks/:provider', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const signature = req.headers['x-webhook-signature'] as string;
    const body = req.body;

    // Verify webhook signature
    if (!verifyWebhookSignature(provider, body, signature)) {
      return res.status(401).json({
        error: 'Invalid webhook signature',
        code: 'INVALID_SIGNATURE',
      });
    }

    const jobManager = getJobManager();

    // Extract job ID based on provider format
    const externalJobId = extractJobId(provider, body);

    if (!externalJobId) {
      return res.status(400).json({
        error: 'Could not extract job ID from webhook',
        code: 'INVALID_WEBHOOK_PAYLOAD',
      });
    }

    // Update job via webhook handler
    const job = jobManager.handleWebhook(provider, externalJobId, body);

    if (!job) {
      return res.status(404).json({
        error: 'Job not found for webhook',
        code: 'JOB_NOT_FOUND',
      });
    }

    // Process webhook data
    const webhookStatus = extractWebhookStatus(provider, body);

    if (webhookStatus.complete) {
      jobManager.complete(
        job.id,
        webhookStatus.resultUrl!,
        webhookStatus.metadata,
        webhookStatus.cost
      );
    } else if (webhookStatus.failed) {
      jobManager.fail(job.id, webhookStatus.error || 'Unknown error');
    } else if (webhookStatus.progress !== undefined) {
      jobManager.updateProgress(job.id, webhookStatus.progress);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

// Helper functions
function verifyWebhookSignature(provider: string, body: any, signature: string): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true; // Skip verification if no secret configured

  const payload = JSON.stringify(body);
  const expectedSignature = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return signature === expectedSignature || signature === `sha256=${expectedSignature}`;
}

function extractJobId(provider: string, body: any): string | null {
  switch (provider) {
    case 'runway':
      return body.id || body.task_id;
    case 'replicate':
      return body.id || body.prediction?.id;
    case 'elevenlabs':
      return body.generation_id;
    default:
      return body.id || body.job_id;
  }
}

function extractWebhookStatus(provider: string, body: any): {
  complete: boolean;
  failed: boolean;
  progress?: number;
  resultUrl?: string;
  metadata?: Record<string, unknown>;
  cost?: number;
  error?: string;
} {
  const status = body.status?.toLowerCase() || '';

  return {
    complete: ['completed', 'succeeded', 'success'].includes(status),
    failed: ['failed', 'error', 'cancelled'].includes(status),
    progress: body.progress,
    resultUrl: body.output?.url || body.output?.[0] || body.result_url,
    metadata: body.output,
    cost: body.cost || body.credits_used,
    error: body.error?.message || body.error,
  };
}

export default router;
```

---

## Feature Implementations

### Feature 1: AI Image Generator

- [ ] **F1.1 Create Types**

**File**: `src/agents/image-generator/types.ts`

```typescript
import { z } from 'zod';

export const ImageStyle = z.enum([
  'photorealistic',
  'artistic',
  'anime',
  'digital-art',
  'oil-painting',
  'watercolor',
  '3d-render',
  'sketch',
  'cinematic',
  'fantasy',
  'minimalist',
  'vintage',
]);

export const AspectRatio = z.enum([
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '21:9',
]);

export const ImageProvider = z.enum(['dalle', 'stability', 'replicate']);

export const ImageQuality = z.enum(['draft', 'standard', 'hd', 'ultra']);

export const ImageGeneratorInput = z.object({
  prompt: z.string().min(1).max(4000).describe('Text description of the image to generate'),
  negativePrompt: z.string().max(2000).optional().describe('Elements to avoid in the image'),
  style: ImageStyle.default('photorealistic'),
  aspectRatio: AspectRatio.default('1:1'),
  quality: ImageQuality.default('standard'),
  numberOfImages: z.number().int().min(1).max(4).default(1),
  seed: z.number().int().optional().describe('Seed for reproducible generation'),
  provider: ImageProvider.default('dalle'),
});

export const GeneratedImage = z.object({
  url: z.string().url(),
  base64: z.string().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  seed: z.number().int().optional(),
  revisedPrompt: z.string().optional(),
});

export const ImageGeneratorOutput = z.object({
  images: z.array(GeneratedImage),
  provider: z.string(),
  model: z.string(),
  generationTimeMs: z.number(),
  costUsd: z.number(),
  enhancedPrompt: z.string().optional(),
});

export type ImageGeneratorInputType = z.infer<typeof ImageGeneratorInput>;
export type ImageGeneratorOutputType = z.infer<typeof ImageGeneratorOutput>;
export type ImageStyleType = z.infer<typeof ImageStyle>;
```

- [ ] **F1.2 Create Tools**

**File**: `src/agents/image-generator/tools.ts`

```typescript
import { z } from 'zod';
import type { ToolDefinition, ToolContext } from '../../core/types.js';
import { getOpenAIProvider } from '../../providers/openai.js';
import { getStabilityProvider } from '../../providers/stability.js';

// Style keywords for prompt enhancement
const STYLE_KEYWORDS: Record<string, string[]> = {
  'photorealistic': ['highly detailed', 'photorealistic', '8k resolution', 'professional photography', 'sharp focus'],
  'artistic': ['artistic', 'creative', 'expressive', 'fine art', 'masterpiece'],
  'anime': ['anime style', 'manga', 'japanese animation', 'cel shaded', 'vibrant colors'],
  'digital-art': ['digital art', 'concept art', 'digital painting', 'trending on artstation'],
  'oil-painting': ['oil painting', 'classical art', 'canvas texture', 'brush strokes', 'impasto'],
  'watercolor': ['watercolor painting', 'soft edges', 'flowing colors', 'wet on wet technique'],
  '3d-render': ['3D render', 'octane render', 'cinema 4d', 'ray tracing', 'volumetric lighting'],
  'sketch': ['pencil sketch', 'hand drawn', 'line art', 'graphite drawing'],
  'cinematic': ['cinematic', 'movie still', 'dramatic lighting', 'film grain', 'anamorphic'],
  'fantasy': ['fantasy art', 'magical', 'ethereal', 'mythical', 'enchanting'],
  'minimalist': ['minimalist', 'simple', 'clean design', 'negative space', 'modern'],
  'vintage': ['vintage', 'retro', 'old photograph', 'nostalgic', 'sepia tones'],
};

// Aspect ratio to size mapping for DALL-E
const ASPECT_RATIO_SIZES: Record<string, '1024x1024' | '1792x1024' | '1024x1792'> = {
  '1:1': '1024x1024',
  '16:9': '1792x1024',
  '9:16': '1024x1792',
  '4:3': '1024x1024',
  '3:4': '1024x1792',
  '21:9': '1792x1024',
};

export const enhancePromptTool: ToolDefinition = {
  name: 'enhance_image_prompt',
  version: '1.0.0',
  description: 'Enhance and optimize a user prompt for better image generation results',
  category: 'image-generation',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Original user prompt' },
      style: { type: 'string', description: 'Target style' },
      provider: { type: 'string', description: 'Target provider' },
    },
    required: ['prompt', 'style'],
  },

  defer_loading: false,
  allowed_callers: ['human', 'code_execution_20250825'],
  idempotent: true,
  returnFormat: '{ enhancedPrompt: string, styleKeywords: string[], tips: string[] }',

  sideEffectful: false,
  scopes: ['read:prompts'],
  allowlistedDomains: [],
  timeoutMs: 5000,

  execute: async (input: unknown, context: ToolContext) => {
    const { prompt, style, provider } = input as { prompt: string; style: string; provider?: string };

    const styleKeywords = STYLE_KEYWORDS[style] || [];
    const enhancedPrompt = styleKeywords.length > 0
      ? `${prompt}, ${styleKeywords.join(', ')}`
      : prompt;

    const tips: string[] = [];
    if (provider === 'dalle') {
      tips.push('Be specific about lighting and camera angles');
      tips.push('Include time of day for outdoor scenes');
    } else if (provider === 'stability') {
      tips.push('Use negative prompts to avoid unwanted elements');
      tips.push('Specify art style explicitly');
    }

    return {
      enhancedPrompt,
      originalPrompt: prompt,
      styleKeywords,
      tips,
    };
  },
};

export const generateImageDalleTool: ToolDefinition = {
  name: 'generate_image_dalle',
  version: '1.0.0',
  description: 'Generate an image using OpenAI DALL-E 3',
  category: 'image-generation',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', maxLength: 4000 },
      aspectRatio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'] },
      quality: { type: 'string', enum: ['standard', 'hd'] },
    },
    required: ['prompt'],
  },

  defer_loading: false,
  allowed_callers: ['human', 'code_execution_20250825'],
  idempotent: false,
  inputExamples: [
    {
      description: 'Generate a sunset landscape',
      input: { prompt: 'A beautiful sunset over mountains', aspectRatio: '16:9', quality: 'hd' },
    },
  ],

  sideEffectful: true,
  scopes: ['write:images', 'external:openai'],
  allowlistedDomains: ['api.openai.com'],
  timeoutMs: 60000,
  rateLimit: { requests: 50, windowMs: 60000 },

  execute: async (input: unknown, context: ToolContext) => {
    const { prompt, aspectRatio, quality } = input as {
      prompt: string;
      aspectRatio?: string;
      quality?: 'standard' | 'hd';
    };

    const provider = getOpenAIProvider();
    const size = ASPECT_RATIO_SIZES[aspectRatio || '1:1'];

    const result = await provider.generateImage({
      prompt,
      size,
      quality: quality || 'standard',
    });

    return {
      url: result.url,
      revisedPrompt: result.revisedPrompt,
      width: result.width,
      height: result.height,
      costUsd: result.costUsd,
      model: 'dall-e-3',
      provider: 'dalle',
    };
  },
};

export const generateImageStabilityTool: ToolDefinition = {
  name: 'generate_image_stability',
  version: '1.0.0',
  description: 'Generate an image using Stability AI Stable Diffusion',
  category: 'image-generation',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      negativePrompt: { type: 'string' },
      width: { type: 'number', minimum: 512, maximum: 2048 },
      height: { type: 'number', minimum: 512, maximum: 2048 },
      steps: { type: 'number', minimum: 10, maximum: 50 },
      seed: { type: 'number' },
    },
    required: ['prompt'],
  },

  defer_loading: false,
  allowed_callers: ['human', 'code_execution_20250825'],
  idempotent: false,

  sideEffectful: true,
  scopes: ['write:images', 'external:stability'],
  allowlistedDomains: ['api.stability.ai'],
  timeoutMs: 60000,
  rateLimit: { requests: 100, windowMs: 60000 },

  execute: async (input: unknown, context: ToolContext) => {
    const args = input as {
      prompt: string;
      negativePrompt?: string;
      width?: number;
      height?: number;
      steps?: number;
      seed?: number;
    };

    const provider = getStabilityProvider();

    const result = await provider.generateImage({
      prompt: args.prompt,
      negativePrompt: args.negativePrompt,
      width: args.width || 1024,
      height: args.height || 1024,
      steps: args.steps || 30,
      seed: args.seed,
    });

    return {
      base64: result.base64,
      seed: result.seed,
      width: result.width,
      height: result.height,
      costUsd: result.costUsd,
      model: 'stable-diffusion-xl',
      provider: 'stability',
    };
  },
};

export const imageGeneratorTools = [
  enhancePromptTool,
  generateImageDalleTool,
  generateImageStabilityTool,
];
```

- [ ] **F1.3 Create Agent**

**File**: `src/agents/image-generator/index.ts`

```typescript
/**
 * AI Image Generator Agent
 *
 * Generate high-quality images from text descriptions using multiple AI providers.
 */

import { defineAgent } from '../../sdk/define-agent.js';
import { ImageGeneratorInput, ImageGeneratorOutput } from './types.js';
import { imageGeneratorTools, enhancePromptTool, generateImageDalleTool, generateImageStabilityTool } from './tools.js';

export const imageGeneratorAgent = defineAgent({
  id: 'image-generator',
  name: 'AI Image Generator',
  description: 'Generate high-quality images from text descriptions using multiple AI providers (DALL-E, Stability AI). Supports various styles, aspect ratios, and quality settings.',
  version: '1.0.0',

  input: ImageGeneratorInput,
  output: ImageGeneratorOutput,

  capabilities: [
    'image-generation',
    'text-to-image',
    'creative-ai',
    'multi-provider',
    'style-customization',
  ],

  models: {
    default: 'claude-sonnet-4-5-20250514',
    fallback: 'claude-haiku-3-5-20241022',
  },

  defaultEffortLevel: 'medium',

  tools: imageGeneratorTools,

  sideEffects: true,
  estimatedCostTier: 'medium',

  execute: async (input, context) => {
    const startTime = Date.now();
    const images: Array<{
      url: string;
      base64?: string;
      width: number;
      height: number;
      seed?: number;
      revisedPrompt?: string;
    }> = [];
    let totalCost = 0;
    let model = '';
    let enhancedPrompt = input.prompt;

    // 1. Enhance the prompt
    try {
      const enhanced = await context.tools.call<{
        enhancedPrompt: string;
        styleKeywords: string[];
      }>('enhance_image_prompt', {
        prompt: input.prompt,
        style: input.style,
        provider: input.provider,
      });
      enhancedPrompt = enhanced.enhancedPrompt;
    } catch (error) {
      // Continue with original prompt if enhancement fails
      context.logger.warn('Prompt enhancement failed, using original', { error });
    }

    // 2. Generate images based on provider
    for (let i = 0; i < input.numberOfImages; i++) {
      try {
        if (input.provider === 'dalle') {
          const result = await context.tools.call<{
            url: string;
            revisedPrompt?: string;
            width: number;
            height: number;
            costUsd: number;
            model: string;
          }>('generate_image_dalle', {
            prompt: enhancedPrompt,
            aspectRatio: input.aspectRatio,
            quality: input.quality === 'hd' || input.quality === 'ultra' ? 'hd' : 'standard',
          });

          images.push({
            url: result.url,
            width: result.width,
            height: result.height,
            revisedPrompt: result.revisedPrompt,
          });
          totalCost += result.costUsd;
          model = result.model;

        } else if (input.provider === 'stability') {
          // Map aspect ratio to dimensions
          const dimensions = getStabilityDimensions(input.aspectRatio);

          const result = await context.tools.call<{
            base64: string;
            seed: number;
            width: number;
            height: number;
            costUsd: number;
            model: string;
          }>('generate_image_stability', {
            prompt: enhancedPrompt,
            negativePrompt: input.negativePrompt,
            width: dimensions.width,
            height: dimensions.height,
            seed: input.seed,
          });

          images.push({
            url: `data:image/png;base64,${result.base64}`,
            base64: result.base64,
            width: result.width,
            height: result.height,
            seed: result.seed,
          });
          totalCost += result.costUsd;
          model = result.model;

        } else {
          throw new Error(`Unsupported provider: ${input.provider}`);
        }
      } catch (error) {
        context.logger.error(`Failed to generate image ${i + 1}`, { error });
        throw error;
      }
    }

    return {
      images,
      provider: input.provider,
      model,
      generationTimeMs: Date.now() - startTime,
      costUsd: totalCost,
      enhancedPrompt,
    };
  },
});

function getStabilityDimensions(aspectRatio: string): { width: number; height: number } {
  const dimensions: Record<string, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1344, height: 768 },
    '9:16': { width: 768, height: 1344 },
    '4:3': { width: 1152, height: 896 },
    '3:4': { width: 896, height: 1152 },
    '21:9': { width: 1536, height: 640 },
  };
  return dimensions[aspectRatio] || dimensions['1:1'];
}

export default imageGeneratorAgent;
```

- [ ] **F1.4 Create Tests**

**File**: `tests/agents/image-generator.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { imageGeneratorAgent } from '../../src/agents/image-generator/index.js';

// Mock providers
vi.mock('../../src/providers/openai.js', () => ({
  getOpenAIProvider: () => ({
    generateImage: vi.fn().mockResolvedValue({
      url: 'https://mock.openai.com/image.png',
      revisedPrompt: 'Enhanced prompt',
      width: 1024,
      height: 1024,
      costUsd: 0.04,
    }),
  }),
}));

vi.mock('../../src/providers/stability.js', () => ({
  getStabilityProvider: () => ({
    generateImage: vi.fn().mockResolvedValue({
      base64: 'mock_base64_string',
      seed: 12345,
      width: 1024,
      height: 1024,
      costUsd: 0.004,
    }),
  }),
}));

// Mock execution context
function createMockContext() {
  return {
    runId: 'test-run-123',
    traceId: 'test-trace-123',
    budget: { maxCostUsd: 1, maxTokens: 10000, maxDurationMs: 60000, maxSteps: 10, maxToolCalls: 20, allowModelDowngrade: true },
    consumed: { inputTokens: 0, outputTokens: 0, totalTokens: 0, thinkingTokens: 0, costUsd: 0, durationMs: 0, modelUsed: 'claude-sonnet-4-5-20250514' as const, downgrades: 0, steps: 0, toolCalls: 0 },
    currentModel: 'claude-sonnet-4-5-20250514' as const,
    effortLevel: 'medium' as const,
    environment: 'development' as const,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    canContinue: () => true,
    shouldDowngrade: () => false,
    getRemainingBudget: () => ({}),
    tools: {
      call: vi.fn().mockImplementation(async (name: string, args: any) => {
        if (name === 'enhance_image_prompt') {
          return { enhancedPrompt: args.prompt + ', enhanced', styleKeywords: ['test'] };
        }
        if (name === 'generate_image_dalle') {
          return { url: 'https://mock.url/image.png', width: 1024, height: 1024, costUsd: 0.04, model: 'dall-e-3' };
        }
        if (name === 'generate_image_stability') {
          return { base64: 'mock', width: 1024, height: 1024, seed: 123, costUsd: 0.004, model: 'sdxl' };
        }
        throw new Error(`Unknown tool: ${name}`);
      }),
      search: vi.fn().mockResolvedValue([]),
      available: vi.fn().mockReturnValue([]),
    },
  };
}

describe('Image Generator Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have correct agent card', () => {
    expect(imageGeneratorAgent.card.id).toBe('image-generator');
    expect(imageGeneratorAgent.card.name).toBe('AI Image Generator');
    expect(imageGeneratorAgent.card.capabilities).toContain('image-generation');
  });

  it('should generate image with DALL-E provider', async () => {
    const context = createMockContext();

    const result = await imageGeneratorAgent.execute(
      {
        task: 'Generate an image',
        parameters: {
          prompt: 'A sunset over mountains',
          style: 'photorealistic',
          provider: 'dalle',
        },
      },
      context as any
    );

    expect(result.status).toBe('success');
    expect(result.result).toBeDefined();
    expect(result.result.images).toHaveLength(1);
    expect(result.result.provider).toBe('dalle');
    expect(context.tools.call).toHaveBeenCalledWith('enhance_image_prompt', expect.any(Object));
    expect(context.tools.call).toHaveBeenCalledWith('generate_image_dalle', expect.any(Object));
  });

  it('should generate multiple images', async () => {
    const context = createMockContext();

    const result = await imageGeneratorAgent.execute(
      {
        task: 'Generate images',
        parameters: {
          prompt: 'A cat',
          numberOfImages: 3,
          provider: 'dalle',
        },
      },
      context as any
    );

    expect(result.status).toBe('success');
    expect(result.result.images).toHaveLength(3);
  });

  it('should use Stability provider when specified', async () => {
    const context = createMockContext();

    const result = await imageGeneratorAgent.execute(
      {
        task: 'Generate an image',
        parameters: {
          prompt: 'A forest',
          provider: 'stability',
        },
      },
      context as any
    );

    expect(result.status).toBe('success');
    expect(result.result.provider).toBe('stability');
    expect(context.tools.call).toHaveBeenCalledWith('generate_image_stability', expect.any(Object));
  });

  it('should validate input schema', async () => {
    const context = createMockContext();

    const result = await imageGeneratorAgent.execute(
      {
        task: 'Generate',
        parameters: {
          prompt: '', // Empty prompt should fail validation
        },
      },
      context as any
    );

    expect(result.status).toBe('failed');
  });
});
```

---

### Remaining Features (2-20)

Due to the extensive nature of this guide, the remaining features follow the same pattern. Here are the checkboxes for tracking:

---

## Feature 2: Video Generator

- [ ] **F2.1** Create `src/agents/video-generator/types.ts`
- [ ] **F2.2** Create `src/agents/video-generator/tools.ts` (with async job tools)
- [ ] **F2.3** Create `src/agents/video-generator/index.ts`
- [ ] **F2.4** Create `tests/agents/video-generator.test.ts`

## Feature 3: Face Swap Video

- [ ] **F3.1** Create `src/agents/face-swap-video/types.ts`
- [ ] **F3.2** Create `src/agents/face-swap-video/tools.ts` (with consent validation)
- [ ] **F3.3** Create `src/agents/face-swap-video/index.ts`
- [ ] **F3.4** Create `tests/agents/face-swap-video.test.ts`

## Feature 4: Lipsync Studio

- [ ] **F4.1** Create `src/agents/lipsync-studio/types.ts`
- [ ] **F4.2** Create `src/agents/lipsync-studio/tools.ts`
- [ ] **F4.3** Create `src/agents/lipsync-studio/index.ts`
- [ ] **F4.4** Create `tests/agents/lipsync-studio.test.ts`

## Feature 5: Video Upscaler

- [ ] **F5.1** Create `src/agents/video-upscaler/types.ts`
- [ ] **F5.2** Create `src/agents/video-upscaler/tools.ts`
- [ ] **F5.3** Create `src/agents/video-upscaler/index.ts`
- [ ] **F5.4** Create `tests/agents/video-upscaler.test.ts`

## Feature 6: Image Inpainting

- [ ] **F6.1** Create `src/agents/image-inpainting/types.ts`
- [ ] **F6.2** Create `src/agents/image-inpainting/tools.ts`
- [ ] **F6.3** Create `src/agents/image-inpainting/index.ts`
- [ ] **F6.4** Create `tests/agents/image-inpainting.test.ts`

## Feature 7: Character Creator

- [ ] **F7.1** Create `src/agents/character-creator/types.ts`
- [ ] **F7.2** Create `src/agents/character-creator/tools.ts`
- [ ] **F7.3** Create `src/agents/character-creator/storage.ts`
- [ ] **F7.4** Create `src/agents/character-creator/index.ts`
- [ ] **F7.5** Create `tests/agents/character-creator.test.ts`

## Feature 8: Style Transfer

- [ ] **F8.1** Create `src/agents/style-transfer/types.ts`
- [ ] **F8.2** Create `src/agents/style-transfer/tools.ts`
- [ ] **F8.3** Create `src/agents/style-transfer/index.ts`
- [ ] **F8.4** Create `tests/agents/style-transfer.test.ts`

## Feature 9: Product Enhancer

- [ ] **F9.1** Create `src/agents/product-enhancer/types.ts`
- [ ] **F9.2** Create `src/agents/product-enhancer/tools.ts`
- [ ] **F9.3** Create `src/agents/product-enhancer/index.ts`
- [ ] **F9.4** Create `tests/agents/product-enhancer.test.ts`

## Feature 10: Avatar Generator

- [ ] **F10.1** Create `src/agents/avatar-generator/types.ts`
- [ ] **F10.2** Create `src/agents/avatar-generator/tools.ts`
- [ ] **F10.3** Create `src/agents/avatar-generator/index.ts`
- [ ] **F10.4** Create `tests/agents/avatar-generator.test.ts`

## Feature 11: Storyboard Generator

- [ ] **F11.1** Create `src/agents/storyboard-generator/types.ts`
- [ ] **F11.2** Create `src/agents/storyboard-generator/tools.ts`
- [ ] **F11.3** Create `src/agents/storyboard-generator/index.ts`
- [ ] **F11.4** Create `tests/agents/storyboard-generator.test.ts`

## Feature 12: VFX Transformer

- [ ] **F12.1** Create `src/agents/vfx-transformer/types.ts`
- [ ] **F12.2** Create `src/agents/vfx-transformer/tools.ts`
- [ ] **F12.3** Create `src/agents/vfx-transformer/index.ts`
- [ ] **F12.4** Create `tests/agents/vfx-transformer.test.ts`

## Feature 13: Click-to-Ad Generator

- [ ] **F13.1** Create `src/agents/ad-generator/types.ts`
- [ ] **F13.2** Create `src/agents/ad-generator/tools.ts`
- [ ] **F13.3** Create `src/agents/ad-generator/index.ts`
- [ ] **F13.4** Create `tests/agents/ad-generator.test.ts`

## Feature 14: Photo Editor Suite

- [ ] **F14.1** Create `src/agents/photo-editor/types.ts`
- [ ] **F14.2** Create `src/agents/photo-editor/tools.ts`
- [ ] **F14.3** Create `src/agents/photo-editor/index.ts`
- [ ] **F14.4** Create `tests/agents/photo-editor.test.ts`

## Feature 15: Video Effects Editor

- [ ] **F15.1** Create `src/agents/video-effects/types.ts`
- [ ] **F15.2** Create `src/agents/video-effects/tools.ts`
- [ ] **F15.3** Create `src/agents/video-effects/index.ts`
- [ ] **F15.4** Create `tests/agents/video-effects.test.ts`

## Feature 16: Motion Graphics Generator

- [ ] **F16.1** Create `src/agents/motion-graphics/types.ts`
- [ ] **F16.2** Create `src/agents/motion-graphics/tools.ts`
- [ ] **F16.3** Create `src/agents/motion-graphics/index.ts`
- [ ] **F16.4** Create `tests/agents/motion-graphics.test.ts`

## Feature 17: Sketch to Image

- [ ] **F17.1** Create `src/agents/sketch-to-image/types.ts`
- [ ] **F17.2** Create `src/agents/sketch-to-image/tools.ts`
- [ ] **F17.3** Create `src/agents/sketch-to-image/index.ts`
- [ ] **F17.4** Create `tests/agents/sketch-to-image.test.ts`

## Feature 18: AI Music Generator

- [ ] **F18.1** Create `src/agents/music-generator/types.ts`
- [ ] **F18.2** Create `src/agents/music-generator/tools.ts`
- [ ] **F18.3** Create `src/providers/suno.ts`
- [ ] **F18.4** Create `src/agents/music-generator/index.ts`
- [ ] **F18.5** Create `tests/agents/music-generator.test.ts`

## Feature 19: Voice Cloner

- [ ] **F19.1** Create `src/agents/voice-cloner/types.ts`
- [ ] **F19.2** Create `src/agents/voice-cloner/tools.ts` (with consent validation)
- [ ] **F19.3** Create `src/agents/voice-cloner/index.ts`
- [ ] **F19.4** Create `tests/agents/voice-cloner.test.ts`

## Feature 20: AI Assistant

- [ ] **F20.1** Create `src/agents/ai-assistant/types.ts`
- [ ] **F20.2** Create `src/agents/ai-assistant/tools.ts`
- [ ] **F20.3** Create `src/agents/ai-assistant/storage.ts` (conversation memory)
- [ ] **F20.4** Create `src/agents/ai-assistant/index.ts`
- [ ] **F20.5** Create `tests/agents/ai-assistant.test.ts`

---

## Testing Setup

- [ ] **T1** Create `tests/mocks/providers.ts`
- [ ] **T2** Create `tests/mocks/context.ts`
- [ ] **T3** Create `tests/setup.ts`
- [ ] **T4** Update `vitest.config.ts`

---

## Final Integration

- [ ] **I1** Create agent registry file
- [ ] **I2** Update `src/api/server.ts` to include jobs routes
- [ ] **I3** Update `src/index.ts` exports
- [ ] **I4** Create `scripts/register-agents.ts`
- [ ] **I5** Update `public/index.html` with new agent UIs
- [ ] **I6** Run full test suite
- [ ] **I7** Create production build

---

## Quick Start Commands

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local with your API keys

# 3. Run migrations
npx tsx scripts/migrations/migrate.ts

# 4. Run tests
npm test

# 5. Start development server
npm run dev
```

---

**Document Version**: 1.0.0
**Created**: December 2024
**Status**: Ready for Implementation
