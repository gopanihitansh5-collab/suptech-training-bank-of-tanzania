'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export function SearchForm({ initialQuery = '' }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : '/search');
  }

  return (
    <form
      className="search-form"
      role="search"
      method="get"
      action="/search"
      onSubmit={handleSubmit}
    >
      <label className="sr-only" htmlFor="search-query">
        Search documents, reports and institutions
      </label>
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
    </form>
  );
}
