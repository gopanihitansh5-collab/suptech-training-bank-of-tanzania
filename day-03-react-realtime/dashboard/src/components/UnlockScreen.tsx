import { useState } from 'react';

export interface UnlockScreenProps {
  onUnlock: (token: string) => void;
}

/**
 * The unlock screen.
 *
 * The token is typed here and kept in memory. It is never written to
 * storage, never put in a URL and never sent anywhere except the API
 * header. That is deliberate: a token in local storage survives a closed
 * tab and a token in a URL ends up in the logs.
 *
 * This is a training scheme. A production deployment would replace it with
 * a real identity provider, which is out of scope for this prototype.
 */
export function UnlockScreen({ onUnlock }: UnlockScreenProps) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="unlock">
      <form
        className="unlock__card"
        onSubmit={(event) => {
          event.preventDefault();
          if (token.trim().length === 0) {
            setError('The API token cannot be empty.');
            return;
          }
          onUnlock(token.trim());
        }}
      >
        <h1>NavsaTech</h1>
        <p className="unlock__subtitle">
          Supervisory monitoring dashboard. Training prototype for the Bank
          of Tanzania SupTech programme.
        </p>
        <label className="unlock__field">
          <span>API token</span>
          <input
            type="password"
            value={token}
            autoFocus
            placeholder="The token the API was started with"
            onChange={(event) => {
              setToken(event.target.value);
              setError(null);
            }}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" className="button button--primary">
          Open the dashboard
        </button>
        <p className="unlock__note">
          The token stays in this tab. It is never stored in the browser and
          never appears in a URL.
        </p>
      </form>
    </main>
  );
}
