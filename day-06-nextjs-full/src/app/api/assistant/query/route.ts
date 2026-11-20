import { NextResponse } from 'next/server';
import { AuthError, requireDemoSession } from '@/lib/auth';
import { errorResponse, readJsonBody, RequestValidationError } from '@/lib/api-errors';
import { executeQuerySpec, inferQuerySpec, validateQuerySpec } from '@/lib/query-engine';
import { searchGroundedEvidence } from '@/lib/grounded-retrieval';
import {
  buildEvidencePacket,
  composeValidatedSummary,
} from '@/lib/evidence-composer';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  try {
    await requireDemoSession();
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) {
      throw new AuthError(403, 'Invalid request origin.');
    }

    const body = await readJsonBody(request, 12_000);
    if (!isRecord(body)) throw new RequestValidationError('The request body must be an object.');
    if (Object.keys(body).some((key) => !['question', 'spec', 'includeKnowledge'].includes(key))) {
      throw new RequestValidationError('The request contains unsupported fields.');
    }
    if (
      typeof body.question !== 'string' ||
      body.question.trim().length < 2 ||
      body.question.length > 500
    ) {
      throw new RequestValidationError('Question must contain 2-500 characters.');
    }
    if (body.includeKnowledge !== undefined && typeof body.includeKnowledge !== 'boolean') {
      throw new RequestValidationError('includeKnowledge must be a boolean.');
    }

    const spec = body.spec === undefined
      ? inferQuerySpec(body.question)
      : validateQuerySpec(body.spec);
    const result = await executeQuerySpec(spec);

    const knowledge = body.includeKnowledge
      ? await searchGroundedEvidence(body.question, { limit: 6 })
      : undefined;
    const citations = knowledge?.hits.map((hit) =>
      `${hit.kind}:${hit.id}`,
    ) ?? [];
    const filters = Object.fromEntries(
      (spec.filters ?? []).map((filter) => [filter.field, filter.value]),
    );
    const packet = buildEvidencePacket(body.question, result.rows, filters, citations);
    const narrative = composeValidatedSummary(packet);

    return NextResponse.json({
      result: {
        spec: result.spec,
        rows: result.rows,
        chartRecommendation: result.chartRecommendation,
        audit: result.audit,
        narrative: narrative.text,
        narrativeValidated: narrative.validated,
        evidence: packet,
        knowledge: knowledge?.hits ?? [],
        retrievalMode: knowledge?.mode,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
