import { NextResponse } from 'next/server';
import { AuthConfigurationError, AuthError } from './auth';

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof AuthConfigurationError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof RequestValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  const errorCode =
    error && typeof error === 'object' && 'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : 'internal_error';
  console.error('Day 6 API request failed', { errorCode });
  return NextResponse.json(
    { error: 'The request could not be completed. Check the local service status and retry.' },
    { status: 500 },
  );
}
