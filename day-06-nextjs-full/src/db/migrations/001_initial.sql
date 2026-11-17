CREATE TABLE IF NOT EXISTS roles (
  role_id text PRIMARY KEY,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  permission_id text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id text NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
  permission_id text NOT NULL REFERENCES permissions(permission_id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  user_id text PRIMARY KEY,
  role_id text NOT NULL REFERENCES roles(role_id),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS institutions (
  institution_id text PRIMARY KEY,
  institution_name text NOT NULL,
  institution_type text NOT NULL,
  region text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('Tier 1', 'Tier 2', 'Tier 3')),
  status text NOT NULL CHECK (status IN ('active', 'monitoring')),
  synthetic boolean NOT NULL DEFAULT true CHECK (synthetic)
);

CREATE TABLE IF NOT EXISTS institution_reports (
  report_id text PRIMARY KEY,
  institution_id text NOT NULL REFERENCES institutions(institution_id),
  reporting_period text NOT NULL CHECK (reporting_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  deposits_tzs_billions numeric(18, 4) NOT NULL CHECK (deposits_tzs_billions >= 0),
  loans_tzs_billions numeric(18, 4) NOT NULL CHECK (loans_tzs_billions >= 0),
  capital_adequacy_ratio_percent numeric(8, 4) NOT NULL,
  liquidity_ratio_percent numeric(8, 4) NOT NULL,
  npl_ratio_percent numeric(8, 4) NOT NULL,
  report_completeness_percent numeric(7, 4) NOT NULL CHECK (report_completeness_percent BETWEEN 0 AND 100),
  late_submission_days integer NOT NULL CHECK (late_submission_days >= 0),
  records_submitted integer NOT NULL CHECK (records_submitted >= 0),
  records_rejected integer NOT NULL CHECK (records_rejected >= 0),
  source_record_ids text[] NOT NULL DEFAULT '{}',
  submitted_at timestamptz NOT NULL,
  synthetic boolean NOT NULL DEFAULT true CHECK (synthetic),
  UNIQUE (institution_id, reporting_period)
);

CREATE TABLE IF NOT EXISTS indicator_definitions (
  indicator_id text PRIMARY KEY,
  label text NOT NULL,
  unit text NOT NULL,
  formula text NOT NULL,
  description text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  is_training_configuration boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS threshold_configurations (
  threshold_id text PRIMARY KEY,
  indicator_id text NOT NULL REFERENCES indicator_definitions(indicator_id),
  label text NOT NULL,
  operator text NOT NULL CHECK (operator IN ('lt', 'gt')),
  threshold_value numeric NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  rationale text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  is_training_configuration boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS supervisory_indicators (
  indicator_value_id bigserial PRIMARY KEY,
  indicator_id text NOT NULL REFERENCES indicator_definitions(indicator_id),
  grain text NOT NULL CHECK (grain IN ('institution', 'sector')),
  reporting_period text NOT NULL,
  institution_id text REFERENCES institutions(institution_id),
  subject_key text NOT NULL,
  indicator_value numeric,
  unit text NOT NULL,
  formula text NOT NULL,
  source_report_ids text[] NOT NULL DEFAULT '{}',
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (indicator_id, grain, reporting_period, subject_key)
);

CREATE TABLE IF NOT EXISTS supervisory_exceptions (
  exception_id text PRIMARY KEY,
  institution_id text NOT NULL REFERENCES institutions(institution_id),
  report_id text NOT NULL REFERENCES institution_reports(report_id),
  reporting_period text NOT NULL,
  indicator_id text NOT NULL REFERENCES indicator_definitions(indicator_id),
  observed_value numeric NOT NULL,
  threshold_value numeric NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved')),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS uploaded_documents (
  document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_filename text NOT NULL,
  checksum_sha256 text NOT NULL UNIQUE,
  content_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  storage_path text NOT NULL,
  institution_id text REFERENCES institutions(institution_id),
  reporting_period text,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  extracted_characters integer NOT NULL DEFAULT 0,
  chunk_count integer NOT NULL DEFAULT 0,
  error_message text,
  uploaded_by text NOT NULL REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES uploaded_documents(document_id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_chunks (
  chunk_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES uploaded_documents(document_id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  content text NOT NULL,
  source_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding jsonb,
  content_search tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, content)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_reports_period_institution
  ON institution_reports (reporting_period DESC, institution_id);
CREATE INDEX IF NOT EXISTS idx_reports_institution_period
  ON institution_reports (institution_id, reporting_period DESC);
CREATE INDEX IF NOT EXISTS idx_exceptions_period_severity
  ON supervisory_exceptions (reporting_period DESC, severity, status);
CREATE INDEX IF NOT EXISTS idx_exceptions_institution
  ON supervisory_exceptions (institution_id, reporting_period DESC);
CREATE INDEX IF NOT EXISTS idx_indicators_lookup
  ON supervisory_indicators (indicator_id, reporting_period DESC, institution_id);
CREATE INDEX IF NOT EXISTS idx_documents_scope_status
  ON uploaded_documents (institution_id, reporting_period, status);
CREATE INDEX IF NOT EXISTS idx_chunks_search
  ON document_chunks USING gin (content_search);
CREATE INDEX IF NOT EXISTS idx_chunks_document
  ON document_chunks (document_id, chunk_index);

CREATE TABLE IF NOT EXISTS report_definitions (
  report_definition_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  configuration jsonb NOT NULL,
  created_by text NOT NULL REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_runs (
  report_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_definition_id uuid REFERENCES report_definitions(report_definition_id),
  filters jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'completed', 'failed')),
  result_count integer NOT NULL DEFAULT 0 CHECK (result_count >= 0),
  created_by text NOT NULL REFERENCES users(user_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  audit_event_id bigserial PRIMARY KEY,
  actor_id text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  happened_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  conversation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(user_id),
  title text NOT NULL,
  active_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  agent_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(conversation_id) ON DELETE SET NULL,
  user_id text NOT NULL REFERENCES users(user_id),
  intent text NOT NULL,
  state text NOT NULL CHECK (state IN ('running', 'completed', 'failed')),
  tool_trace jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS saved_memory_records (
  memory_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(user_id),
  conversation_id uuid REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_events (
  event_id bigserial PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_time
  ON audit_events (happened_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_time
  ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_system_events_time
  ON system_events (event_id);

INSERT INTO roles (role_id, label) VALUES
  ('viewer', 'Demo viewer'),
  ('supervisor', 'Demo supervisor'),
  ('admin', 'Demo administrator')
ON CONFLICT (role_id) DO NOTHING;

INSERT INTO permissions (permission_id, description) VALUES
  ('read:synthetic', 'Read synthetic supervisory data'),
  ('upload:demo', 'Upload synthetic training documents'),
  ('configure:demo', 'Change local training configuration')
ON CONFLICT (permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id) VALUES
  ('viewer', 'read:synthetic'),
  ('supervisor', 'read:synthetic'),
  ('supervisor', 'upload:demo'),
  ('admin', 'read:synthetic'),
  ('admin', 'upload:demo'),
  ('admin', 'configure:demo')
ON CONFLICT (role_id, permission_id) DO NOTHING;
