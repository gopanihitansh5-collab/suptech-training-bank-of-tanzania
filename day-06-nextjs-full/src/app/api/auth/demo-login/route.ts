import { metric } from '@vercel/functions';
import { NextResponse } from 'next/server';
import {
  createSessionToken,
  getDemoAuthConfig,
  getSessionCookieName,
  getSessionTtlSeconds,
} from '../../../../lib/auth';
import { errorResponse } from '../../../../lib/api-errors';
import { query } from '../../../../lib/db';

type LoginOutcome = 'success' | 'error' | 'denied';

export async function POST(request: Request) {
  const startedAt = performance.now();
  let outcome: LoginOutcome = 'error';

  try {
    if (process.env.VERCEL_ENV !== 'preview') {
      outcome = 'denied';
      return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    }

    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) {
      outcome = 'denied';
      return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    }

    const config = getDemoAuthConfig();
    await query(
      `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        config.username,
        'demo_login',
        'session',
        config.username,
        JSON.stringify({ role: config.role, method: 'preview_one_click' }),
      ],
    );

    const response = NextResponse.json({
      userId: config.username,
      role: config.role,
    });
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
    outcome = 'success';
    return response;
  } catch (error) {
    return errorResponse(error);
  } finally {
    metric('auth.demo_login.completed', 1, { outcome });
    metric('auth.demo_login.duration_ms', performance.now() - startedAt);
  }
}
