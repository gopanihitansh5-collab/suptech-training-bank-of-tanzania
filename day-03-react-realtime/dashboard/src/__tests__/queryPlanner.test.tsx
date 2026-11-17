import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AnalystChat } from '../components/AnalystChat';
import { planQuery } from '../queryPlanner';
import type { SupervisoryException } from '../types';

const exception: SupervisoryException = {
  exception_id: 'EXC-THR-002-TZ013-2026-11',
  run_id: 'run-2026-11',
  threshold_id: 'THR-002',
  threshold_name: 'ldr_critical',
  indicator_id: 'IND-003',
  indicator_name: 'loan_to_deposit_ratio',
  grain: 'institution',
  reporting_period: '2026-11',
  subject_id: 'TZ013',
  institution_id: 'TZ013',
  source_row_number: 16,
  severity: 'CRITICAL',
  observed_value: 9,
  observed_value_text: '9.0000',
  limit_description: 'above 1.5',
  message: 'Loan-to-deposit ratio is critically high',
  explanation: 'The funding position is the priority.',
  status: 'open',
  link_mode: 'record',
};

describe('the read-only query planner', () => {
  it('plans an exception query with validated filters', () => {
    expect(
      planQuery('Show exceptions for TZ013 in 2026-11'),
    ).toMatchObject({
      action: 'exceptions',
      endpoint: '/api/v1/exceptions',
      filters: {
        institution_id: 'TZ013',
        reporting_period: '2026-11',
      },
    });
  });

  it('rejects a period with an invalid month', () => {
    expect(() => planQuery('Show exceptions in 2026-13')).toThrow(
      /real month/i,
    );
  });

  it('plans ranking questions as a separate read-only analytical intent', () => {
    expect(
      planQuery('Which institutions have the highest number of exceptions?'),
    ).toMatchObject({
      action: 'exception_ranking',
      endpoint: '/api/v1/exceptions',
      filters: {},
    });
  });

  it('uses the requested institution filter for a flagged-institution question', () => {
    expect(planQuery('Why was TZ001 flagged?')).toMatchObject({
      action: 'exceptions',
      endpoint: '/api/v1/exceptions',
      filters: { institution_id: 'TZ001' },
    });
  });

  it('does not execute until the user confirms the plan', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ count: 1, exceptions: [exception] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      render(<AnalystChat />);
      fireEvent.change(screen.getByLabelText('Question'), {
        target: { value: 'Show exceptions for TZ013 in 2026-11' },
      });
      fireEvent.click(screen.getByRole('button', { name: /plan read-only query/i }));

      expect(fetchMock).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: /execute this query/i }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

      expect(fetchMock.mock.calls[0][0]).toBe(
        '/api/v1/exceptions?reporting_period=2026-11&institution_id=TZ013',
      );
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
      expect(await screen.findByText(/query result/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Observed 9\.0000; configured limit above 1\.5/),
      ).toBeInTheDocument();
      expect(screen.getByText(/The funding position is the priority/i)).toBeInTheDocument();
      expect(screen.getByText(/row 16; run run-2026-11/i)).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('ranks institution exceptions, excludes sector records, and cites source rows', async () => {
    const exceptions = [
      exception,
      {
        ...exception,
        exception_id: 'EXC-THR-004-TZ002-2026-11',
        institution_id: 'TZ002',
        subject_id: 'TZ002',
        source_row_number: 2,
        severity: 'HIGH',
      },
      {
        ...exception,
        exception_id: 'EXC-THR-003-TZ014-2026-11',
        institution_id: 'TZ014',
        subject_id: 'TZ014',
        source_row_number: 17,
      },
      {
        ...exception,
        exception_id: 'EXC-THR-009-SECTOR-2026-11',
        institution_id: null,
        subject_id: 'SECTOR',
        grain: 'sector',
        source_row_number: null,
      },
    ] satisfies SupervisoryException[];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ count: exceptions.length, exceptions }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      render(<AnalystChat />);
      fireEvent.change(screen.getByLabelText('Question'), {
        target: {
          value: 'Which institutions have the highest number of exceptions?',
        },
      });
      fireEvent.click(screen.getByRole('button', { name: /plan read-only query/i }));
      fireEvent.click(screen.getByRole('button', { name: /execute this query/i }));

      const table = await screen.findByRole('table', {
        name: 'Institution exception ranking',
      });
      const rows = within(table).getAllByRole('row').slice(1);
      expect(
        rows.map((row) =>
          within(row)
            .getAllByRole('cell')
            .map((cell) => cell.textContent),
        ),
      ).toEqual([
        ['1', 'TZ002', '1', '0', '2'],
        ['1', 'TZ013', '1', '1', '16'],
        ['1', 'TZ014', '1', '1', '17'],
      ]);
      expect(screen.getByText('TZ002')).toBeInTheDocument();
      expect(screen.getByText('TZ013')).toBeInTheDocument();
      expect(screen.getByText('TZ014')).toBeInTheDocument();
      expect(screen.queryByText('SECTOR')).not.toBeInTheDocument();
      expect(screen.getByText(/Sector-wide exceptions without an institution ID are excluded \(1\)/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Source row numbers are shown in the table/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/require human review/i)).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not invent a flag when no institution exception is returned', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ count: 0, exceptions: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      render(<AnalystChat />);
      fireEvent.change(screen.getByLabelText('Question'), {
        target: { value: 'Why was TZ001 flagged?' },
      });
      fireEvent.click(screen.getByRole('button', { name: /plan read-only query/i }));
      fireEvent.click(screen.getByRole('button', { name: /execute this query/i }));

      expect(await screen.findByText(/No exception records matched this question/i)).toBeInTheDocument();
      expect(screen.queryByText('Query result')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuses to calculate a ranking when the API count is inconsistent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ count: 2, exceptions: [exception] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      render(<AnalystChat />);
      fireEvent.change(screen.getByLabelText('Question'), {
        target: {
          value: 'Which institutions have the highest number of exceptions?',
        },
      });
      fireEvent.click(screen.getByRole('button', { name: /plan read-only query/i }));
      fireEvent.click(screen.getByRole('button', { name: /execute this query/i }));

      expect(
        await screen.findByText(/no ranking was calculated/i),
      ).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
