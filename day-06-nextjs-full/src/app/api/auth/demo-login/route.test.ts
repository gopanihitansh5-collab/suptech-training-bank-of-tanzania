import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { query } from '../../../../lib/db';
import { POST } from './route';

vi.mock('../../../../lib/db', () => ({ query: vi.fn() }));

function request(origin = 'https://preview.example.com') {
  return new Request('https://preview.example.com/api/auth/demo-login', {
    method: 'POST',
    headers: { origin },
  });
}

describe('one-click demo login route', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEMO_USERNAME', 'demo.supervisor');
    vi.stubEnv('DEMO_PASSWORD', 'a-long-test-password');
    vi.stubEnv('DEMO_ROLE', 'supervisor');
    vi.stubEnv('AUTH_SECRET', 'a'.repeat(32));
    vi.mocked(query).mockResolvedValue({ rows: [] } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('creates a secure session using the configured role in Preview', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ userId: 'demo.supervisor', role: 'supervisor' });
    expect(response.headers.get('set-cookie')).toContain('suptech_demo_session=');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('Secure');
    expect(vi.mocked(query)).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_events'),
      expect.arrayContaining(['demo.supervisor', 'demo_login']),
    );
    expect(vi.mocked(query)).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        JSON.stringify({ role: 'supervisor', method: 'one_click_demo' }),
      ]),
    );
  });

  it('creates a supervisor session in Production regardless of the configured demo role', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('DEMO_ROLE', 'admin');

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ userId: 'demo.supervisor', role: 'supervisor' });
    expect(response.headers.get('set-cookie')).toContain('suptech_demo_session=');
    expect(vi.mocked(query)).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        JSON.stringify({ role: 'supervisor', method: 'one_click_demo' }),
      ]),
    );
  });

  it('is unavailable outside Preview and Production', async () => {
    vi.stubEnv('VERCEL_ENV', 'development');

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(vi.mocked(query)).not.toHaveBeenCalled();
  });

  it('rejects cross-origin requests', async () => {
    const response = await POST(request('https://attacker.example'));

    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(vi.mocked(query)).not.toHaveBeenCalled();
  });

  it('returns a configuration error without issuing a session', async () => {
    vi.stubEnv('AUTH_SECRET', 'too-short');

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ error: expect.any(String) });
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
