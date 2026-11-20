'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm({ showOneClickLogin = false }: { showOneClickLogin?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function completeSignIn(response: Response) {
    const result: unknown = await response.json();
    if (!response.ok) {
      const message =
        result && typeof result === 'object' && 'error' in result &&
        typeof result.error === 'string'
          ? result.error
          : 'Sign-in failed. Check the account and service configuration.';
      setError(message);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.get('username'),
          password: formData.get('password'),
        }),
      });
      await completeSignIn(response);
    } catch {
      setError('Could not reach the sign-in service. Check that the application is available and retry.');
    } finally {
      setPending(false);
    }
  }

  async function oneClickLogin() {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/demo-login', { method: 'POST' });
      await completeSignIn(response);
    } catch {
      setError('Could not reach the sign-in service. Check that the application is available and retry.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      {showOneClickLogin && (
        <button
          className="button-primary"
          disabled={pending}
          onClick={oneClickLogin}
          type="button"
        >
          {pending ? 'Signing in…' : 'One-click admin sign-in'}
        </button>
      )}
      <label>
        Username
        <input autoComplete="username" name="username" required maxLength={100} />
      </label>
      <label>
        Password
        <input autoComplete="current-password" name="password" type="password" required maxLength={200} />
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="button-primary" disabled={pending} type="submit">
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
