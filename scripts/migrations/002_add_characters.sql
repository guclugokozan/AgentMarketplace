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
