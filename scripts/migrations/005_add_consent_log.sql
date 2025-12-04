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
