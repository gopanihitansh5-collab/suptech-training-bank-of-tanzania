'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export function SearchForm({
  initialQuery = '',
  initialPeriod = '',
  initialInstitutionId = '',
  initialKind = '',
}: {
  initialQuery?: string;
  initialPeriod?: string;
  initialInstitutionId?: string;
  initialKind?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [period, setPeriod] = useState(initialPeriod);
  const [institutionId, setInstitutionId] = useState(initialInstitutionId);
  const [kind, setKind] = useState(initialKind);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set('q', trimmed);
    if (period) params.set('period', period);
    if (institutionId.trim()) params.set('institutionId', institutionId.trim());
    if (kind) params.set('kind', kind);
    router.push(params.size ? `/search?${params}` : '/search');
  }

  return (
    <form
      className="search-form evidence-search-form"
      role="search"
      method="get"
      action="/search"
      onSubmit={handleSubmit}
    >
      <label className="sr-only" htmlFor="search-query">
        Search documents, reports and institutions
      </label>
      <div className="evidence-search-main">
        <input
          className="search-input"
          id="search-query"
          name="q"
          type="search"
          maxLength={200}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search synthetic evidence (2–200 characters)"
          autoComplete="off"
        />
        <button className="button-primary" type="submit">Search</button>
      </div>
      <div className="evidence-search-filters" aria-label="Search filters">
        <label>
          Period
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>
        <label>
          Institution
          <input
            value={institutionId}
            maxLength={24}
            onChange={(event) => setInstitutionId(event.target.value)}
            placeholder="Optional ID"
          />
        </label>
        <label>
          Evidence type
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="">All evidence</option>
            <option value="document">Documents</option>
            <option value="report">Reports</option>
            <option value="institution">Institutions</option>
            <option value="exception">Review signals</option>
          </select>
        </label>
      </div>
    </form>
  );
}
