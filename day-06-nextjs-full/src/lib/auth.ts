import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export type DemoRole = 'viewer' | 'supervisor' | 'admin';

export interface DemoSession {
  userId: string;
  role: DemoRole;
  expiresAt: number;
}

export class AuthError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigurationError';
  }
}

const SESSION_COOKIE = 'suptech_demo_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const ROLES = new Set<DemoRole>(['viewer', 'supervisor', 'admin']);

export interface DemoAuthConfig {
  username: string;
  password: string;
  secret: string;
  role: DemoRole;
}

export function getDemoAuthConfig(): DemoAuthConfig {
  const username = process.env.DEMO_USERNAME?.trim();
  const password = process.env.DEMO_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  const role = process.env.DEMO_ROLE?.trim() || 'supervisor';

  if (!username || !password || !secret || secret.length < 32) {
    throw new AuthConfigurationError(
      'Local demo sign-in is not configured. Set DEMO_USERNAME, DEMO_PASSWORD and a 32+ character AUTH_SECRET.',
    );
  }
  if (!ROLES.has(role as DemoRole)) {
    throw new AuthConfigurationError('DEMO_ROLE must be viewer, supervisor or admin.');
  }
  if (password === 'replace-before-use' || secret.includes('replace-with')) {
    throw new AuthConfigurationError('Replace the example demo password and session secret before sign-in.');
  }

  return { username, password, secret, role: role as DemoRole };
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionToken(
  userId: string,
  role: DemoRole,
  secret: string,
  now = Date.now(),
): string {
  if (secret.length < 32) {
    throw new AuthConfigurationError('AUTH_SECRET must contain at least 32 characters.');
  }
  const payload = Buffer.from(
    JSON.stringify({ userId, role, expiresAt: now + SESSION_TTL_SECONDS * 1000 }),
  ).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

export function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
  now = Date.now(),
): DemoSession | null {
  if (!token || !secret || secret.length < 32) return null;
  const [payload, receivedSignature, ...extra] = token.split('.');
  if (!payload || !receivedSignature || extra.length > 0) return null;

  const expected = Buffer.from(signature(payload, secret));
  const received = Buffer.from(receivedSignature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }

  try {
    const data: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || typeof data !== 'object') return null;
    const session = data as Partial<DemoSession>;
    if (
      typeof session.userId !== 'string' ||
      typeof session.expiresAt !== 'number' ||
      session.expiresAt <= now ||
      !ROLES.has(session.role as DemoRole)
    ) {
      return null;
    }
    return {
      userId: session.userId,
      role: session.role as DemoRole,
      expiresAt: session.expiresAt,
    };
  } catch {
    return null;
  }
}

export function verifyDemoCredentials(username: string, password: string): DemoAuthConfig {
  const config = getDemoAuthConfig();
  const submittedUsername = Buffer.from(username);
  const expectedUsername = Buffer.from(config.username);
  const submittedPassword = createHmac('sha256', config.secret).update(password).digest();
  const expectedPassword = createHmac('sha256', config.secret).update(config.password).digest();
  const usernameMatches =
    submittedUsername.length === expectedUsername.length &&
    timingSafeEqual(submittedUsername, expectedUsername);
  const passwordMatches = timingSafeEqual(submittedPassword, expectedPassword);

  if (!usernameMatches || !passwordMatches) {
    throw new AuthError(401, 'Username or password is incorrect.');
  }
  return config;
}

export async function getDemoSession(): Promise<DemoSession | null> {
  const cookieStore = await cookies();
  return verifySessionToken(
    cookieStore.get(SESSION_COOKIE)?.value,
    process.env.AUTH_SECRET,
  );
}

export async function requireDemoSession(
  allowedRoles?: DemoRole[],
): Promise<DemoSession> {
  const session = await getDemoSession();
  if (!session) throw new AuthError(401, 'Sign in to continue.');
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    throw new AuthError(403, 'Your local demo role cannot perform this action.');
  }
  return session;
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE;
}

export function getSessionTtlSeconds(): number {
  return SESSION_TTL_SECONDS;
}
