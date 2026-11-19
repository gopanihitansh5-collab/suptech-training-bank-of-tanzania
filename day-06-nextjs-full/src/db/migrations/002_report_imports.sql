CREATE TABLE IF NOT EXISTS report_import_batches (
  batch_id uuid PRIMARY KEY,
  original_filename text NOT NULL,
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by text NOT NULL REFERENCES users(user_id),
  status text NOT NULL CHECK (status IN ('completed', 'completed_with_errors', 'rejected')),
  total_rows integer NOT NULL CHECK (total_rows >= 0),
  accepted_rows integer NOT NULL CHECK (accepted_rows >= 0),
  rejected_rows integer NOT NULL CHECK (rejected_rows >= 0),
  column_headers text[] NOT NULL,
  column_mapping jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (accepted_rows + rejected_rows = total_rows)
);

CREATE TABLE IF NOT EXISTS report_import_rows (
  batch_id uuid NOT NULL REFERENCES report_import_batches(batch_id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number >= 2),
  source_record_id text NOT NULL,
  report_id text,
  status text NOT NULL CHECK (status IN ('accepted', 'rejected')),
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  additional_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (batch_id, row_number),
  CHECK (
    (status = 'accepted' AND report_id IS NOT NULL AND jsonb_array_length(errors) = 0)
    OR
    (status = 'rejected' AND report_id IS NULL AND jsonb_array_length(errors) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_report_import_batches_created
  ON report_import_batches (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_import_rows_batch_status
  ON report_import_rows (batch_id, status, row_number);
