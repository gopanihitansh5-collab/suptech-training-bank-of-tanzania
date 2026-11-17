import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AnalystChat } from '../components/AnalystChat';
import { planQuery } from '../queryPlanner';

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

  it('does not execute until the user confirms the plan', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ count: 0, exceptions: [] }),
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
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
