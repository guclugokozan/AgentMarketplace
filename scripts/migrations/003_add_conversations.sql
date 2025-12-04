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
