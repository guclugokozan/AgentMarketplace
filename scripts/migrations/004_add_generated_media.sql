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
