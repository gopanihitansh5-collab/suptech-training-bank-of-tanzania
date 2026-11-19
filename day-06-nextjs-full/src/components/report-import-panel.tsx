'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { REPORT_IMPORT_FIELDS } from '@/lib/report-import-schema';
import type {
  ReportImportField,
  ReportImportMapping,
  ReportImportPreview,
} from '@/lib/report-import-schema';
import type {
  ReportImportBatch,
  ReportImportResult,
} from '@/lib/report-import-store';

const MAX_FILE_BYTES = 1_000_000;

function responseError(payload: unknown): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof payload.error === 'string'
  ) {
    return payload.error;
  }
  return 'The import request failed. Check the file and try again.';
}

function formatBytes(bytes: number): string {
  return bytes < 1000 ? `${bytes} bytes` : `${(bytes / 1000).toFixed(1)} KB`;
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function isRequired(field: (typeof REPORT_IMPORT_FIELDS)[number]): boolean {
  return !('optional' in field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isImportPreview(value: unknown): value is ReportImportPreview {
  return (
    isRecord(value) &&
    Array.isArray(value.columns) &&
    Array.isArray(value.rows) &&
    typeof value.totalRows === 'number' &&
    typeof value.acceptedRows === 'number' &&
    typeof value.rejectedRows === 'number' &&
    Array.isArray(value.missingFields) &&
    Array.isArray(value.additionalColumns) &&
    isRecord(value.mapping) &&
    isRecord(value.suggestedMapping)
  );
}

function isImportResult(value: unknown): value is ReportImportResult {
  return isRecord(value) && isRecord(value.batch) && Array.isArray(value.rows);
}

export function ReportImportPanel({
  initialBatches,
}: {
  initialBatches: ReportImportBatch[];
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<ReportImportMapping>({});
  const [preview, setPreview] = useState<ReportImportPreview | null>(null);
  const [result, setResult] = useState<ReportImportResult | null>(null);
  const [batches, setBatches] = useState(initialBatches);
  const [syntheticOnlyConfirmed, setSyntheticOnlyConfirmed] = useState(false);
  const [mappingChanged, setMappingChanged] = useState(false);
  const [pending, setPending] = useState<'preview' | 'commit' | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  function chooseFile(selected: File | undefined) {
    if (!selected) return;
    setError('');
    setPreview(null);
    setResult(null);
    setMapping({});
    setMappingChanged(false);
    if (!selected.name.toLocaleLowerCase('en').endsWith('.csv')) {
      setFile(null);
      setError('Choose a CSV file. Other formats are not supported for report imports.');
      return;
    }
    if (selected.size === 0 || selected.size > MAX_FILE_BYTES) {
      setFile(null);
      setError('Choose a non-empty CSV file that is 1 MB or smaller.');
      return;
    }
    setFile(selected);
  }

  function clearFile() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setMapping({});
    setMappingChanged(false);
    setError('');
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.currentTarget.files?.[0]);
    event.currentTarget.value = '';
  }

  function updateMapping(field: ReportImportField, column: string) {
    setMapping((current) => {
      const next = { ...current };
      if (column) next[field] = column;
      else delete next[field];
      return next;
    });
    setMappingChanged(true);
    setResult(null);
    setError('');
  }

  async function submitPreview(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!file || !syntheticOnlyConfirmed) return;
    setPending('preview');
    setError('');
    setResult(null);
    try {
      const data = new FormData();
      data.set('mode', 'preview');
      data.set('syntheticOnlyConfirmed', 'true');
      data.set('file', file);
      if (Object.keys(mapping).length) data.set('mapping', JSON.stringify(mapping));
      const response = await fetch('/api/report-imports', { method: 'POST', body: data });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setError(responseError(payload));
        return;
      }
      if (!isRecord(payload) || !isImportPreview(payload.preview)) {
        throw new Error('The preview response was incomplete.');
      }
      const nextPreview = payload.preview;
      setPreview(nextPreview);
      setMapping(nextPreview.mapping);
      setMappingChanged(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not preview the CSV. Check the service and retry.',
      );
    } finally {
      setPending(null);
    }
  }

  async function commitImport() {
    if (!file || !preview || preview.acceptedRows === 0 || mappingChanged) return;
    setPending('commit');
    setError('');
    try {
      const data = new FormData();
      data.set('mode', 'commit');
      data.set('syntheticOnlyConfirmed', 'true');
      data.set('file', file);
      data.set('mapping', JSON.stringify(mapping));
      const response = await fetch('/api/report-imports', { method: 'POST', body: data });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setError(responseError(payload));
        return;
      }
      if (!isImportResult(payload)) {
        throw new Error('The import response was incomplete.');
      }
      const nextResult = payload;
      setResult(nextResult);
      setBatches((current) => [
        nextResult.batch,
        ...current.filter((batch) => batch.batchId !== nextResult.batch.batchId),
      ].slice(0, 10));
      setPreview(null);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not import the CSV. Check the service and retry.',
      );
    } finally {
      setPending(null);
    }
  }

  const missingMapping = REPORT_IMPORT_FIELDS.some(
    (field) => isRequired(field) && !mapping[field.key],
  );
  const shownRows = preview?.rows.slice(0, 20) ?? [];
  const rejectedResults = result?.rows.filter((row) => row.status === 'rejected') ?? [];

  return (
    <section className="panel report-import-panel" aria-labelledby="report-import-title">
      <div className="panel-header report-import-header">
        <div>
          <div className="eyebrow">Validated data intake</div>
          <h2 className="panel-title" id="report-import-title">Import synthetic reports</h2>
          <p className="panel-caption">
            Preview column matching and row checks before adding reports to the dashboard.
          </p>
        </div>
        <a className="button-secondary" href="/report-import-template.csv" download>
          Download CSV template
        </a>
      </div>

      <div className="report-import-body">
        <div className="import-notice" role="note">
          <strong>Training data only.</strong> CSV uploads update this shared demo dataset.
          Never upload real, confidential, or personal data. Existing institution/month
          reports are not overwritten.
        </div>

        <form className="report-import-form" onSubmit={submitPreview}>
          <label
            className={`import-file-field${dragging ? ' is-dragging' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              chooseFile(event.dataTransfer.files[0]);
            }}
          >
            <span className="import-file-icon" aria-hidden="true">↑</span>
            <span>
              <strong>{file ? file.name : 'Choose a CSV report file'}</strong>
              <small>{file ? formatBytes(file.size) : 'CSV only · up to 1 MB · maximum 500 rows'}</small>
            </span>
            <input
              accept=".csv,text/csv"
              aria-label="Choose a CSV report file"
              className="import-file-input"
              onChange={handleFileChange}
              type="file"
            />
            <span className="button-secondary">Browse</span>
          </label>

          <label className="import-confirmation">
            <input
              checked={syntheticOnlyConfirmed}
              onChange={(event) => setSyntheticOnlyConfirmed(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>I confirm this file contains synthetic training data only.</span>
          </label>

          <div className="import-actions">
            <button
              className="button-primary"
              disabled={!file || !syntheticOnlyConfirmed || pending !== null}
              type="submit"
            >
              {pending === 'preview' ? 'Checking file…' : preview ? 'Recheck preview' : 'Preview import'}
            </button>
            {file && (
              <button
                className="button-quiet"
                disabled={pending !== null}
                onClick={clearFile}
                type="button"
              >
                Clear file
              </button>
            )}
          </div>
        </form>

        {error && <div className="form-error" role="alert">{error}</div>}

        {preview && (
          <div className="import-preview" aria-live="polite">
            <div className="import-step-heading">
              <div>
                <span className="eyebrow">Step 2 · Review mapping</span>
                <h3>Match CSV columns to report fields</h3>
              </div>
              <span className="period-chip">{preview.totalRows} row(s)</span>
            </div>
            <p className="panel-caption">
              We matched familiar headers automatically. Required report values must be
              mapped; other columns are retained as row metadata.
            </p>

            <div className="import-mapping-grid">
              {REPORT_IMPORT_FIELDS.map((field) => (
                <label className="import-mapping-field" key={field.key}>
                  <span>{field.label}{isRequired(field) && <b aria-label="required"> *</b>}</span>
                  <select
                    onChange={(event) => updateMapping(field.key, event.currentTarget.value)}
                    value={mapping[field.key] ?? ''}
                  >
                    <option value="">{isRequired(field) ? 'Select a column' : 'Generate from row number'}</option>
                    {preview.columns.map((column) => (
                      <option key={`${field.key}-${column}`} value={column}>{column}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            {mappingChanged && (
              <div className="import-mapping-warning" role="status">
                Mapping changed. Run the preview again to validate with these selections.
              </div>
            )}
            {preview.additionalColumns.length > 0 && (
              <p className="import-extra-fields">
                <strong>{preview.additionalColumns.length} extra column(s)</strong> will be
                preserved as metadata: {preview.additionalColumns.join(', ')}
              </p>
            )}

            <div className="import-summary-grid" aria-label="Preview row summary">
              <div><span>Ready to import</span><strong>{mappingChanged ? '—' : preview.acceptedRows}</strong></div>
              <div><span>Rows to reject</span><strong>{mappingChanged ? '—' : preview.rejectedRows}</strong></div>
              <div><span>Columns detected</span><strong>{preview.columns.length}</strong></div>
            </div>

            <div className="table-wrap import-preview-table">
              <table>
                <thead>
                  <tr><th>CSV row</th><th>Institution</th><th>Period</th><th>Source ID</th><th>Result</th><th>Validation</th></tr>
                </thead>
                <tbody>
                  {shownRows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="mono">{row.rowNumber}</td>
                      <td className="mono">{row.institutionId ?? '—'}</td>
                      <td className="mono">{row.period ?? '—'}</td>
                      <td className="mono">{row.sourceRecordId ?? 'Generated'}</td>
                      <td><span className={`status-pill ${row.status === 'ready' ? 'import-status-ready' : 'import-status-rejected'}`}>{row.status}</span></td>
                      <td>{row.errors.length ? row.errors.join(' ') : `${row.additionalFieldCount} extra field(s)`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.totalRows > shownRows.length && (
              <p className="panel-caption">
                Showing the first {shownRows.length} of {preview.totalRows} rows. All rows
                are validated before import.
              </p>
            )}

            {!mappingChanged && preview.acceptedRows === 0 && (
              <div className="import-mapping-warning" role="status">
                No rows are ready to import. Fix the validation issues above or adjust the
                column mapping, then preview again.
              </div>
            )}

            <div className="import-actions import-commit-actions">
              <button
                className="button-primary"
                disabled={
                  pending !== null ||
                  preview.acceptedRows === 0 ||
                  missingMapping ||
                  mappingChanged
                }
                onClick={commitImport}
                type="button"
              >
                {pending === 'commit'
                  ? 'Importing reports…'
                  : `Import ${preview.acceptedRows} valid report(s)`}
              </button>
              {preview.rejectedRows > 0 && (
                <span className="import-inline-warning">
                  {preview.rejectedRows} invalid or duplicate row(s) will be skipped.
                </span>
              )}
            </div>
          </div>
        )}

        {result && (
          <div className="import-result" role="status">
            <div className="import-result-heading">
              <div>
                <span className="eyebrow">Import complete</span>
                <h3>{result.batch.filename}</h3>
              </div>
              <span className={`status-pill import-status-${result.batch.status}`}>
                {result.batch.status.replaceAll('_', ' ')}
              </span>
            </div>
            <div className="import-summary-grid">
              <div><span>Accepted</span><strong>{result.batch.acceptedRows}</strong></div>
              <div><span>Rejected</span><strong>{result.batch.rejectedRows}</strong></div>
              <div><span>Batch</span><strong className="mono">{result.batch.batchId.slice(0, 8)}</strong></div>
            </div>
            <p className="panel-caption">
              Accepted reports and calculated indicators are now available in the dashboard.
              Batch checksum: <span className="mono">{result.batch.checksum.slice(0, 16)}…</span>
            </p>
            {rejectedResults.length > 0 && (
              <details className="import-rejected-details">
                <summary>Review {rejectedResults.length} rejected row(s)</summary>
                <ul>
                  {rejectedResults.map((row) => (
                    <li key={row.rowNumber}>
                      <strong>Row {row.rowNumber}:</strong> {row.errors.join(' ')}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="import-history">
          <div className="import-step-heading">
            <div>
              <span className="eyebrow">Traceability</span>
              <h3>Recent import batches</h3>
            </div>
            <span className="period-chip">{batches.length} shown</span>
          </div>
          {batches.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>File</th><th>Status</th><th>Accepted / rejected</th><th>Uploaded by</th><th>Time</th><th>Checksum</th></tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.batchId}>
                      <td>{batch.filename}</td>
                      <td><span className={`status-pill import-status-${batch.status}`}>{batch.status.replaceAll('_', ' ')}</span></td>
                      <td className="mono">{batch.acceptedRows} / {batch.rejectedRows}</td>
                      <td className="mono">{batch.uploadedBy}</td>
                      <td>{formatTimestamp(batch.createdAt)}</td>
                      <td className="mono" title={batch.checksum}>{batch.checksum.slice(0, 12)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="import-history-empty">
              <strong>No report imports yet</strong>
              <span>Completed and partially accepted CSV batches will be recorded here.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
