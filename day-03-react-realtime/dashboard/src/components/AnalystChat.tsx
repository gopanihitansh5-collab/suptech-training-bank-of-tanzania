'use client';

import { useState, type FormEvent } from 'react';

import { rankExceptionRecords } from '../assistantAnswer';
import { executeQueryPlan, planQuery, type QueryPlan } from '../queryPlanner';
import type { SupervisoryException } from '../types';

const suggestedQuestions = [
  'Which institutions have the highest number of exceptions?',
  'Why was TZ013 flagged?',
  'Summarize reporting coverage for 2026-11.',
];

type ExceptionAnswerRecord = Pick<
  SupervisoryException,
  | 'exception_id'
  | 'run_id'
  | 'reporting_period'
  | 'institution_id'
  | 'indicator_name'
  | 'observed_value_text'
  | 'limit_description'
  | 'explanation'
  | 'severity'
  | 'source_row_number'
>;

type ExceptionAnswerList = {
  count: number;
  exceptions: ExceptionAnswerRecord[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isExceptionAnswerRecord(
  value: unknown,
): value is ExceptionAnswerRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.exception_id === 'string' &&
    typeof value.run_id === 'string' &&
    typeof value.reporting_period === 'string' &&
    (value.institution_id === null ||
      (typeof value.institution_id === 'string' &&
        value.institution_id.trim().length > 0)) &&
    typeof value.indicator_name === 'string' &&
    typeof value.observed_value_text === 'string' &&
    typeof value.limit_description === 'string' &&
    typeof value.explanation === 'string' &&
    (value.severity === 'CRITICAL' ||
      value.severity === 'HIGH' ||
      value.severity === 'MEDIUM' ||
      value.severity === 'LOW') &&
    ((typeof value.source_row_number === 'number' &&
      Number.isInteger(value.source_row_number)) ||
      value.source_row_number === null)
  );
}

function isExceptionList(value: unknown): value is ExceptionAnswerList {
  return (
    isRecord(value) &&
    typeof value.count === 'number' &&
    Number.isInteger(value.count) &&
    Array.isArray(value.exceptions) &&
    value.count === value.exceptions.length &&
    value.exceptions.every(isExceptionAnswerRecord)
  );
}

function ExceptionRankingAnswer({
  result,
  requestedPeriod,
}: {
  result: ExceptionAnswerList;
  requestedPeriod?: string;
}) {
  const rankings = rankExceptionRecords(result.exceptions);
  const institutionExceptions = result.exceptions.filter(
    (exception) => exception.institution_id !== null,
  );
  const sectorExceptionCount = result.exceptions.length - institutionExceptions.length;
  const periods = Array.from(
    new Set(result.exceptions.map((exception) => exception.reporting_period)),
  ).sort();
  const runIds = Array.from(
    new Set(result.exceptions.map((exception) => exception.run_id)),
  );
  const periodLabel =
    requestedPeriod ??
    (periods.length > 0 ? periods.join(', ') : 'all periods returned');
  const runLabel =
    runIds.length === 1
      ? runIds[0]
      : runIds.length > 1
        ? `${runIds.length} runs`
        : 'not available';

  return (
    <div className="analyst__answer">
      <p>
        Institution exception counts, ranked highest first, for reporting
        period {periodLabel}.
      </p>
      {rankings.length > 0 ? (
        <div className="table-scroll">
          <table className="data-table">
            <caption>Institution exception ranking</caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Institution ID</th>
                <th scope="col">Exceptions</th>
                <th scope="col">Critical</th>
                <th scope="col">Source rows</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((institution) => (
                <tr key={institution.institutionId}>
                  <td>{institution.rank}</td>
                  <td>{institution.institutionId}</td>
                  <td className="numeric">{institution.exceptionCount}</td>
                  <td className="numeric">{institution.criticalCount}</td>
                  <td>
                    {institution.sourceRows.length > 0
                      ? institution.sourceRows.join(', ')
                      : 'Not available'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No institution-linked exception records matched these filters.</p>
      )}
      <p>
        <strong>Calculation:</strong> count returned exception records by
        institution ID and sort by count descending. Sector-wide exceptions
        without an institution ID are excluded ({sectorExceptionCount}).
      </p>
      <p>
        <strong>Source:</strong> approved <code>GET /api/v1/exceptions</code>;
        {` ${institutionExceptions.length} institution-level records, `}
        run {runLabel}. Source row numbers are shown in the table.
      </p>
      <p className="analyst__review">
        Exceptions require human review; this ranking is not a supervisory
        determination.
      </p>
    </div>
  );
}

function ExceptionRecordsAnswer({ result }: { result: ExceptionAnswerList }) {
  if (result.exceptions.length === 0) {
    return <p>No exception records matched this question.</p>;
  }

  return (
    <div className="analyst__answer">
      <p>
        {result.count} exception record{result.count === 1 ? '' : 's'} returned.
        Review the configured threshold and source period for each record.
      </p>
      <div className="analyst__records">
        {result.exceptions.map((exception) => (
          <article className="analyst__record" key={exception.exception_id}>
            <p>
              <strong>{exception.severity}</strong>
              {' · '}
              {exception.institution_id ?? 'Sector-wide'}
              {' · '}
              {exception.reporting_period}
            </p>
            <h4>{exception.indicator_name}</h4>
            <p>
              Observed {exception.observed_value_text}; configured limit{' '}
              {exception.limit_description}.
            </p>
            <p>{exception.explanation}</p>
            <p>
              <strong>Source:</strong> {exception.exception_id}; row{' '}
              {exception.source_row_number ?? 'not provided'}; run{' '}
              {exception.run_id}.
            </p>
          </article>
        ))}
      </div>
      <p className="analyst__review">
        A threshold exception is a review signal, not an enforcement decision.
      </p>
    </div>
  );
}

export function AnalystChat() {
  const [question, setQuestion] = useState('');
  const [plan, setPlan] = useState<QueryPlan | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  const createPlan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult(null);
    setError(null);
    try {
      setPlan(planQuery(question));
    } catch (caught) {
      setPlan(null);
      setError(
        caught instanceof Error ? caught.message : 'The query plan could not be created.',
      );
    }
  };

  const runPlan = async () => {
    if (!plan) {
      return;
    }
    setExecuting(true);
    setResult(null);
    setError(null);
    try {
      setResult(await executeQueryPlan(plan));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The query failed.');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <section className="panel analyst" aria-labelledby="analyst-title">
      <div className="panel__head">
        <div>
          <h2 id="analyst-title">Supervisory analyst</h2>
          <p className="analyst__intro">
            Ask about the read model. Review the proposed API query, then choose
            whether to execute it.
          </p>
        </div>
        <span className="analyst__mode">Mock planner</span>
      </div>

      <form className="analyst__form" onSubmit={createPlan}>
        <label className="analyst__label" htmlFor="analyst-question">
          Question
        </label>
        <textarea
          id="analyst-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="For example: Show exceptions for an institution in 2026-11"
          rows={3}
        />
        <button type="submit" className="button button--primary">
          Plan read-only query
        </button>
      </form>

      <div className="analyst__suggestions" aria-label="Suggested questions">
        <span>Suggested questions</span>
        {suggestedQuestions.map((suggestion) => (
          <button
            type="button"
            className="button"
            key={suggestion}
            onClick={() => setQuestion(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <p className="analyst__safety">
        The mock planner uses only allowlisted read-only API requests. It does
        not generate or execute SQL, and it does not change data.
      </p>

      {plan ? (
        <section className="analyst__plan" aria-labelledby="plan-title">
          <h3 id="plan-title">Proposed plan</h3>
          <p>{plan.description}</p>
          <p>
            <strong>Request:</strong> <code>GET {plan.endpoint}</code>
          </p>
          {Object.keys(plan.filters).length > 0 ? (
            <p>
              <strong>Filters:</strong>{' '}
              {Object.entries(plan.filters)
                .map(([key, value]) => `${key}=${value}`)
                .join(', ')}
            </p>
          ) : null}
          <button
            type="button"
            className="button button--primary"
            disabled={executing}
            onClick={() => void runPlan()}
          >
            {executing ? 'Executing…' : 'Execute this query'}
          </button>
        </section>
      ) : null}

      {error ? (
        <p className="error error--banner" role="alert">
          {error}
        </p>
      ) : null}

      {result !== null ? (
        <section className="analyst__result" aria-live="polite">
          <h3>Query result</h3>
          {plan?.action === 'exception_ranking' ? (
            isExceptionList(result) ? (
              <ExceptionRankingAnswer
                result={result}
                requestedPeriod={plan.filters.reporting_period}
              />
            ) : (
              <p className="error" role="alert">
                The API response did not match the exception-list contract, so
                no ranking was calculated.
              </p>
            )
          ) : plan?.action === 'exceptions' ? (
            isExceptionList(result) ? (
              <ExceptionRecordsAnswer result={result} />
            ) : (
              <p className="error" role="alert">
                The API response did not match the exception-list contract.
              </p>
            )
          ) : (
            <pre>{JSON.stringify(result, null, 2)}</pre>
          )}
        </section>
      ) : null}
    </section>
  );
}
