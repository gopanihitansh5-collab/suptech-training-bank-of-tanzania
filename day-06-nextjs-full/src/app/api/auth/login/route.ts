import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createSessionToken,
  getSessionCookieName,
  getSessionTtlSeconds,
  verifyDemoCredentials,
} from '@/lib/auth';
import { errorResponse, RequestValidationError } from '@/lib/api-errors';

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

    const config = verifyDemoCredentials(credentials.data.username, credentials.data.password);
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
