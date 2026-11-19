import { metric } from '@vercel/functions';
import { NextResponse } from 'next/server';
import { AuthError, requireDemoSession } from '../../../lib/auth';
import {
  PayloadTooLargeError,
  RequestValidationError,
  errorResponse,
} from '../../../lib/api-errors';
import {
  MAX_REPORT_IMPORT_BYTES,
} from '../../../lib/report-import';
import {
  ingestReportCsv,
  listReportImportBatches,
  previewReportImport,
} from '../../../lib/report-import-store';

const MAX_MULTIPART_BYTES = MAX_REPORT_IMPORT_BYTES + 64_000;
type ImportOutcome = 'success' | 'rejected' | 'denied' | 'error';

function isSupervisor(session: Awaited<ReturnType<typeof requireDemoSession>>): void {
  if (session.role !== 'supervisor' && session.role !== 'admin') {
    throw new AuthError(403, 'Only supervisor or admin demo roles can import reports.');
  }
}

function parseMapping(value: FormDataEntryValue | null): unknown {
  if (value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new RequestValidationError('Column mapping must be a JSON object.');
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new RequestValidationError('Column mapping must be valid JSON.');
  }
}

export async function GET() {
  const startedAt = performance.now();
  let outcome: ImportOutcome = 'error';
  try {
    await requireDemoSession();
    const response = NextResponse.json({ batches: await listReportImportBatches() });
    outcome = 'success';
    return response;
  } catch (error) {
    const response = errorResponse(error);
    outcome = response.status === 401 || response.status === 403
      ? 'denied'
      : 'error';
    return response;
  } finally {
    metric('report_import_history.completed', 1, { outcome });
    metric('report_import_history.duration_ms', performance.now() - startedAt);
  }
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  let outcome: ImportOutcome = 'error';

  try {
    const session = await requireDemoSession();
    isSupervisor(session);

    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) {
      outcome = 'denied';
      return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    }

    const contentLength = request.headers.get('content-length');
    if (contentLength !== null) {
      const declaredLength = Number(contentLength);
      if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
        throw new RequestValidationError('The request content length is invalid.');
      }
      if (declaredLength > MAX_MULTIPART_BYTES) throw new PayloadTooLargeError();
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new RequestValidationError('Request body must be multipart form data.');
    }

    if (formData.get('syntheticOnlyConfirmed') !== 'true') {
      throw new RequestValidationError(
        'Confirm that the file contains synthetic training data only.',
      );
    }
    const mode = formData.get('mode');
    if (mode !== 'preview' && mode !== 'commit') {
      throw new RequestValidationError('Choose preview or import mode.');
    }
    const file = formData.get('file');
    if (!(file instanceof File)) {
      throw new RequestValidationError('Choose one .csv file to continue.');
    }
    if (!file.name.toLocaleLowerCase('en').endsWith('.csv')) {
      throw new RequestValidationError('Only CSV report files are supported.');
    }
    if (file.size === 0) throw new RequestValidationError('The CSV file is empty.');
    if (file.size > MAX_REPORT_IMPORT_BYTES) {
      throw new PayloadTooLargeError();
    }

    const mapping = parseMapping(formData.get('mapping'));
    const buffer = Buffer.from(await file.arrayBuffer());
    if (mode === 'preview') {
      const preview = await previewReportImport(buffer, mapping);
      outcome = 'success';
      return NextResponse.json({ preview });
    }

    const result = await ingestReportCsv({
      buffer,
      filename: file.name,
      mapping,
      uploadedBy: session.userId,
    });
    outcome = 'success';
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const response = errorResponse(error);
    outcome = response.status === 401 || response.status === 403
      ? 'denied'
      : response.status < 500
        ? 'rejected'
        : 'error';
    return response;
  } finally {
    metric('report_import.completed', 1, { outcome });
    metric('report_import.duration_ms', performance.now() - startedAt);
  }
}
