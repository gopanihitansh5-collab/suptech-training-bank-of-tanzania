'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

export function SelectableTable({
  children,
  className = 'table-wrap',
}: {
  children: ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedDetail, setSelectedDetail] = useState<string>('');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((row) => {
      row.tabIndex = 0;
      row.setAttribute('aria-selected', 'false');
    });
  }, [children]);

  function selectRow(row: HTMLTableRowElement) {
    const container = containerRef.current;
    if (!container) return;
    const alreadySelected = row.classList.contains('is-selected');
    container.querySelectorAll('tr.is-selected').forEach((current) => {
      current.classList.remove('is-selected');
      current.setAttribute('aria-selected', 'false');
    });
    if (!alreadySelected) {
      row.classList.add('is-selected');
      row.setAttribute('aria-selected', 'true');
      const headers = [...row.closest('table')?.querySelectorAll('th') ?? []];
      const values = [...row.querySelectorAll('td')].map((cell, index) =>
        `${headers[index]?.textContent?.trim() || `Column ${index + 1}`}: ${cell.textContent?.trim()}`,
      );
      setSelectedDetail(values.slice(0, 5).join(' · '));
    } else {
      setSelectedDetail('');
    }
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('a, button, input, select, textarea, summary')) return;
    const row = target.closest('tr');
    if (!row || !containerRef.current?.contains(row)) return;
    if (!row.querySelector('td')) return;

    selectRow(row as HTMLTableRowElement);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = target.closest('tr');
    if (!row || !row.querySelector('td')) return;
    event.preventDefault();
    selectRow(row);
  }

  function copySelection() {
    const selected = containerRef.current?.querySelector('tr.is-selected');
    const text = selected
      ? [...selected.querySelectorAll('td')].map((cell) => cell.textContent?.trim() ?? '').join('\t')
      : '';
    if (text) void navigator.clipboard?.writeText(text);
  }

  function exportCsv() {
    const table = containerRef.current?.querySelector('table');
    if (!table) return;
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [...table.querySelectorAll('tr')].map((row) =>
      [...row.querySelectorAll('th, td')].map((cell) => escape(cell.textContent?.trim() ?? '')).join(','),
    );
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'suptech-table.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      ref={containerRef}
      className={className}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="table-actions" aria-label="Table actions">
        <button type="button" className="table-action" onClick={copySelection}>Copy row</button>
        <button type="button" className="table-action" onClick={exportCsv}>Export CSV</button>
      </div>
      {children}
      {selectedDetail && (
        <aside className="selected-row-detail" aria-live="polite">
          <strong>Selected row</strong>
          <span>{selectedDetail}</span>
        </aside>
      )}
    </div>
  );
}
