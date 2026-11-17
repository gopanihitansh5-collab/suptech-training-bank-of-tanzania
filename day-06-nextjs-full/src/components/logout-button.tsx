'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState('');

  async function logout() {
    setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        setError('Sign-out failed. Retry.');
        return;
      }
      router.replace('/login');
      router.refresh();
    } catch {
      setError('Could not reach the local sign-out service.');
    }
  }

  return (
    <>
      <button className="logout-button" onClick={logout} type="button">Sign out</button>
      {error && <span className="logout-error" role="alert">{error}</span>}
    </>
  );
}
