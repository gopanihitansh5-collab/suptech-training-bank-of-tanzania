'use client';

import { useState, type FormEvent } from 'react';

import { executeQueryPlan, planQuery, type QueryPlan } from '../queryPlanner';

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
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </section>
      ) : null}
    </section>
  );
}
