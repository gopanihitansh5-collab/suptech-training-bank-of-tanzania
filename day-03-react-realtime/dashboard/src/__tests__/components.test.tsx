import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ExceptionDetail } from '../components/ExceptionDetail';
import { ExceptionsTable } from '../components/ExceptionsTable';
import { InstitutionsTable } from '../components/InstitutionsTable';
import { LiveStatusBadge } from '../components/LiveStatusBadge';
import type {
  Institution,
  SupervisoryException,
} from '../types';

const exception: SupervisoryException = {
  exception_id: 'EXC-THR-002-TZ013-2026-11',
  run_id: 'a-run',
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

const institution: Institution = {
  institution_id: 'TZ013',
  institution_name: 'Institution Nu',
  institution_type: 'Microfinance Bank',
  licence_status: 'Active',
  region: 'Mbeya',
  reporting_frequency: 'Monthly',
  watchlist_flag: 'false',
  exceptions: 1,
  critical_exceptions: 1,
};

describe('the exceptions table', () => {
  it('shows the severity, the subject and the limit of every exception', () => {
    render(
      <ExceptionsTable exceptions={[exception]} onSelect={() => {}} />,
    );

    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText('TZ013')).toBeInTheDocument();
    expect(screen.getByText('9.0000')).toBeInTheDocument();
    expect(screen.getByText('above 1.5')).toBeInTheDocument();
  });

  it('says so when there is nothing to show', () => {
    render(<ExceptionsTable exceptions={[]} onSelect={() => {}} />);
    expect(
      screen.getByText(/No exception matches the current filters/i),
    ).toBeInTheDocument();
  });

  it('hands the clicked exception back to the caller', () => {
    const onSelect = vi.fn();
    render(<ExceptionsTable exceptions={[exception]} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('TZ013'));

    expect(onSelect).toHaveBeenCalledWith(exception);
  });
});

describe('the institutions table', () => {
  it('shows the register and the exception count', () => {
    render(
      <InstitutionsTable institutions={[institution]} onSelect={() => {}} />,
    );

    expect(screen.getByText('TZ013')).toBeInTheDocument();
    expect(screen.getByText('Institution Nu')).toBeInTheDocument();
    expect(screen.getByText('1 critical')).toBeInTheDocument();
  });

  it('hands the clicked institution back to the caller', () => {
    const onSelect = vi.fn();
    render(
      <InstitutionsTable institutions={[institution]} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByText('Institution Nu'));

    expect(onSelect).toHaveBeenCalledWith(institution);
  });
});

describe('the live status badge', () => {
  it('says that the connection is live', () => {
    render(<LiveStatusBadge status="live" eventsReceived={2} />);
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('2 events received')).toBeInTheDocument();
  });

  it('says that the connection is being re-established', () => {
    render(<LiveStatusBadge status="reconnecting" eventsReceived={0} />);
    expect(screen.getByText('Reconnecting')).toBeInTheDocument();
  });
});

describe('the exception detail', () => {
  it('shows the evidence and the explanation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...exception,
        audit_entries: [
          {
            exception_id: exception.exception_id,
            run_id: 'a-run',
            reporting_period: '2026-11',
            source_row_number: 16,
            rule_id: 'W001',
            rule_name: 'loan_to_deposit_ratio_out_of_band',
            severity: 'WARN',
            observed_value: '9.0',
            detail: 'loan to deposit ratio is above the expected band',
            relation: 'explains',
            link_mode: 'record',
          },
        ],
      }),
    });

    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl as never;

    render(
      <ExceptionDetail
        exception={exception}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText(/critically high/i)).toBeInTheDocument();
    expect(screen.getByText(/funding position/i)).toBeInTheDocument();

    globalThis.fetch = original;
  });
});
