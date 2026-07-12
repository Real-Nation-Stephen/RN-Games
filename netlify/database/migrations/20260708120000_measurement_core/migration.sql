-- Measurement core schema (Run 1)
-- Apply locally via: netlify database migrations apply
-- Production: only after correct Netlify site is confirmed

CREATE TABLE IF NOT EXISTS events (
  event_id              TEXT PRIMARY KEY,
  event_version         INTEGER NOT NULL,
  schema_version        TEXT NOT NULL,
  event_name            TEXT NOT NULL,
  event_category        TEXT,
  occurred_at           TIMESTAMPTZ NOT NULL,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deployment_id         TEXT NOT NULL,
  deployment_context    TEXT NOT NULL,
  component_type        TEXT NOT NULL,
  component_instance_id TEXT NOT NULL,
  session_id            TEXT NOT NULL,
  course_id             TEXT,
  course_session_id     TEXT,
  course_item_id        TEXT,
  flow_id               TEXT,
  flow_session_id       TEXT,
  flow_step_id          TEXT,
  participant_id        TEXT,
  preview               BOOLEAN NOT NULL DEFAULT FALSE,
  properties            JSONB NOT NULL DEFAULT '{}',
  privacy               JSONB NOT NULL DEFAULT '{}',
  raw_envelope          JSONB
);

CREATE INDEX IF NOT EXISTS idx_events_deployment_occurred
  ON events (deployment_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_events_session
  ON events (session_id);

CREATE INDEX IF NOT EXISTS idx_events_name
  ON events (event_name);

CREATE TABLE IF NOT EXISTS measurement_config (
  deployment_id TEXT PRIMARY KEY,
  config        JSONB NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingest_replay_runs (
  id               TEXT PRIMARY KEY,
  started_at       TIMESTAMPTZ NOT NULL,
  completed_at     TIMESTAMPTZ,
  blob_keys        TEXT[],
  events_scanned   INTEGER NOT NULL DEFAULT 0,
  events_inserted  INTEGER NOT NULL DEFAULT 0,
  events_skipped   INTEGER NOT NULL DEFAULT 0,
  errors           JSONB NOT NULL DEFAULT '[]'
);
