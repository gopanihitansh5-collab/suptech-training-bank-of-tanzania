import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AuthError,
  clearLoginFailures,
  createSessionToken,
  getSessionCookieName,
  getSessionTtlSeconds,
  isLoginBlocked,
  loginRetryAfterSeconds,
  registerLoginFailure,
  verifyDemoCredentials,
} from '@/lib/auth';
import { errorResponse, RequestValidationError } from '@/lib/api-errors';
import { query } from '@/lib/db';

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
}).strict();

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new RequestValidationError('Request body must be valid JSON.');
    }

    const credentials = credentialsSchema.safeParse(body);
    if (!credentials.success) {
      throw new RequestValidationError('Provide a username and password within the allowed length.');
    }

    if (isLoginBlocked(credentials.data.username)) {
      return NextResponse.json(
        { error: 'Too many failed sign-in attempts. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(loginRetryAfterSeconds(credentials.data.username)) } },
      );
    }

    let config: Awaited<ReturnType<typeof verifyDemoCredentials>>;
    try {
      config = verifyDemoCredentials(credentials.data.username, credentials.data.password);
    } catch (error) {
      if (error instanceof AuthError) {
        registerLoginFailure(credentials.data.username);
      }
      throw error;
    }

    clearLoginFailures(credentials.data.username);
    try {
      await query(
        `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [config.username, 'demo_login', 'session', config.username, JSON.stringify({ role: config.role })],
      );
    } catch {
    }

    const response = NextResponse.json({ userId: config.username, role: config.role });
    response.cookies.set(
      getSessionCookieName(),
      createSessionToken(config.username, config.role, config.secret),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: getSessionTtlSeconds(),
      },
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
