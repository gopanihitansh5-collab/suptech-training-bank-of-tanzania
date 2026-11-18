import { describe, expect, it } from 'vitest';
import {
  clearLoginFailures,
  createSessionToken,
  isLoginBlocked,
  loginRetryAfterSeconds,
  registerLoginFailure,
  verifySessionToken,
} from './auth';

const secret = 'unit-test-session-secret-with-more-than-32-bytes';

describe('demo session tokens', () => {
  it('accepts a valid signed session', () => {
    const token = createSessionToken('training-supervisor', 'supervisor', secret, 1_000);

    expect(verifySessionToken(token, secret, 1_001)).toEqual({
      userId: 'training-supervisor',
      role: 'supervisor',
      expiresAt: 28_801_000,
    });
  });

  it('rejects tampered, expired, and unverifiable tokens', () => {
    const token = createSessionToken('training-supervisor', 'supervisor', secret, 1_000);
    const [payload, signature] = token.split('.');
    const tampered = `${payload}.${signature.slice(0, -1)}x`;

    expect(verifySessionToken(tampered, secret, 1_001)).toBeNull();
    expect(verifySessionToken(token, secret, 28_801_000)).toBeNull();
    expect(verifySessionToken(token, undefined)).toBeNull();
  });
});

describe('login rate limiter', () => {
  it('blocks after five failures inside the window', () => {
    clearLoginFailures('user-a');
    for (let i = 0; i < 5; i += 1) {
      registerLoginFailure('user-a', 1000);
    }

    expect(isLoginBlocked('user-a', 2000)).toBe(true);
    expect(loginRetryAfterSeconds('user-a', 2000)).toBeGreaterThan(0);
  });

  it('tracks failure counts per key independently', () => {
    clearLoginFailures('user-a');
    clearLoginFailures('user-b');
    for (let i = 0; i < 5; i += 1) {
      registerLoginFailure('user-a', 1000);
    }

    expect(isLoginBlocked('user-a', 2000)).toBe(true);
    expect(isLoginBlocked('user-b', 2000)).toBe(false);
  });

  it('unblocks once the fixed window expires', () => {
    clearLoginFailures('user-a');
    for (let i = 0; i < 5; i += 1) {
      registerLoginFailure('user-a', 1000);
    }

    expect(isLoginBlocked('user-a', 1000 + 5 * 60 * 1000 + 1)).toBe(false);
  });

  it('resets the count after a successful clear', () => {
    clearLoginFailures('user-a');
    for (let i = 0; i < 5; i += 1) {
      registerLoginFailure('user-a', 1000);
    }
    clearLoginFailures('user-a');

    expect(isLoginBlocked('user-a', 2000)).toBe(false);
  });
});
