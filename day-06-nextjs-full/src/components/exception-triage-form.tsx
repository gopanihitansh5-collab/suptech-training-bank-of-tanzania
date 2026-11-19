'use client';

import { useState } from 'react';

interface ExceptionTriageFormProps {
  exceptionId: string;
  currentStatus: string;
  onSuccess: (newStatus: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  under_review: 'Under review',
  resolved: 'Resolved',
};

export function ExceptionTriageForm({ exceptionId, currentStatus, onSuccess }: ExceptionTriageFormProps) {
  const [status, setStatus] = useState(currentStatus);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const statuses = ['open', 'under_review', 'resolved'];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === currentStatus) {
      setError('Select a different status to update.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/exceptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exceptionId, status, note: note.trim() || undefined }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const msg =
          data && typeof data === 'object' && 'error' in data && typeof (data as Record<string, unknown>).error === 'string'
            ? (data as Record<string, string>).error
            : `HTTP ${response.status}`;
        throw new Error(msg);
      }
      setSuccess(`Status updated to "${STATUS_LABELS[status] ?? status}".`);
      setNote('');
      onSuccess(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="triage-form" onSubmit={handleSubmit} aria-label="Update review signal status">
      <div className="synthetic-banner" style={{ marginBottom: 16 }}>
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>Training action only.</strong> Updating status here affects only the synthetic
          training dataset. This is not an official supervisory determination.
        </div>
      </div>

      <div className="triage-fields">
        <label>
          New status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={loading}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
            ))}
          </select>
        </label>

        <label>
          Note <span style={{ fontWeight: 400, color: '#758197' }}>(optional, max 500 chars)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={3}
            maxLength={500}
            placeholder="Describe the review decision or outcome…"
            disabled={loading}
          />
        </label>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="form-success" role="status">{success}</p>}

      <div className="filter-actions">
        <button className="button-primary" type="submit" disabled={loading || status === currentStatus}>
          {loading ? 'Updating…' : 'Update status'}
        </button>
      </div>
    </form>
  );
}
