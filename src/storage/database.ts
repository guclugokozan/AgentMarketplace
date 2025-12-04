/**
 * SQLite Database Connection
 *
 * Provides a singleton database connection for runs, steps, and provenance.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'agent-marketplace.db');

    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);

    // Enable WAL mode for better concurrent access
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');

    // Initialize schema
    initializeSchema(db);
  }

  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    -- Runs table
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT UNIQUE NOT NULL,
      agent_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      input TEXT NOT NULL,
      output TEXT,
      budget TEXT NOT NULL,
      consumed TEXT NOT NULL,
      current_model TEXT NOT NULL,
      effort_level TEXT NOT NULL,
      trace_id TEXT NOT NULL,
      tenant_id TEXT,
      user_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_runs_idempotency_key ON runs(idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_runs_agent_id ON runs(agent_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
    CREATE INDEX IF NOT EXISTS idx_runs_trace_id ON runs(trace_id);
    CREATE INDEX IF NOT EXISTS idx_runs_tenant_id ON runs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at);

    -- Steps table
    CREATE TABLE IF NOT EXISTS steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      step_index INTEGER NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      model TEXT,
      tool_name TEXT,
      input_hash TEXT NOT NULL,
      output_hash TEXT,
      input TEXT,
      output TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      cost_usd REAL NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      thinking_tokens INTEGER NOT NULL DEFAULT 0,
      side_effect_committed INTEGER,
      started_at TEXT,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_steps_run_id ON steps(run_id);
    CREATE INDEX IF NOT EXISTS idx_steps_idempotency_key ON steps(idempotency_key);

    -- Provenance table
    CREATE TABLE IF NOT EXISTS provenance (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      trace_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      step_id TEXT,
      tenant_id TEXT,
      event_type TEXT NOT NULL,
      model_id TEXT,
      prompt_hash TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      thinking_tokens INTEGER,
      cost_usd REAL,
      duration_ms INTEGER,
      effort_level TEXT,
      tool_name TEXT,
      tool_version TEXT,
      args_hash TEXT,
      result_hash TEXT,
      side_effect_committed INTEGER,
      error_message TEXT,
      error_code TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_provenance_trace_id ON provenance(trace_id);
    CREATE INDEX IF NOT EXISTS idx_provenance_run_id ON provenance(run_id);
    CREATE INDEX IF NOT EXISTS idx_provenance_timestamp ON provenance(timestamp);

    -- Approvals table
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      step_index INTEGER NOT NULL,
      tool_name TEXT NOT NULL,
      action_description TEXT NOT NULL,
      action_input TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      risk_factors TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      resolved_by TEXT,
      resolved_at TEXT,
      resolution TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_approvals_run_id ON approvals(run_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

    -- Agent health cache
    CREATE TABLE IF NOT EXISTS agent_health (
      agent_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      success_rate REAL NOT NULL DEFAULT 0,
      p50_latency_ms REAL NOT NULL DEFAULT 0,
      p95_latency_ms REAL NOT NULL DEFAULT 0,
      total_runs INTEGER NOT NULL DEFAULT 0,
      last_checked TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Jobs table (for async operations)
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      user_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      provider_job_id TEXT,
      provider TEXT,
      input TEXT NOT NULL,
      output TEXT,
      error TEXT,
      error_code TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      webhook_url TEXT,
      estimated_duration_ms INTEGER,
      cost REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_agent_id ON jobs(agent_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_tenant_id ON jobs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);

    -- Generated media table
    CREATE TABLE IF NOT EXISTS generated_media (
      id TEXT PRIMARY KEY,
      job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
      agent_id TEXT NOT NULL,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      filename TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      metadata TEXT,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_media_job_id ON generated_media(job_id);
    CREATE INDEX IF NOT EXISTS idx_media_tenant_id ON generated_media(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_media_type ON generated_media(type);
  `);
}

// Helper to reset database (for testing)
export function resetDatabase(): void {
  const database = getDatabase();
  database.exec(`
    DELETE FROM provenance;
    DELETE FROM steps;
    DELETE FROM approvals;
    DELETE FROM runs;
    DELETE FROM agent_health;
  `);
}
