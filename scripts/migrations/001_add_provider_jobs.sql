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
