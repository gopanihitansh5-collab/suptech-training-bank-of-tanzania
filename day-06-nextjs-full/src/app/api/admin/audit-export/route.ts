import type { QueryResultRow } from 'pg';
import { errorResponse } from '@/lib/api-errors';
import { requireDemoSession } from '@/lib/auth';
import { toCsv } from '@/lib/csv';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface AuditExportRow extends QueryResultRow {
  audit_event_id: string | number;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  happened_at: string | Date;
  details: unknown;
}

export async function GET() {
  try {
    const session = await requireDemoSession(['admin']);

    const result = await query<AuditExportRow>(
      `SELECT audit_event_id, actor_id, action, entity_type, entity_id,
         happened_at, details
       FROM audit_events
       ORDER BY happened_at DESC, audit_event_id DESC
       LIMIT 500`,
    );

    const rows = result.rows.map((row) => ({
      audit_event_id: String(row.audit_event_id),
      actor_id: row.actor_id,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id ?? '',
      happened_at: new Date(row.happened_at).toISOString(),
      details: JSON.stringify(row.details ?? {}),
    }));

    const csv = toCsv(rows, [
      'audit_event_id',
      'actor_id',
      'action',
      'entity_type',
      'entity_id',
      'happened_at',
      'details',
    ]);

    try {
      await query(
        `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, details)
         VALUES ($1, 'audit_exported', 'audit_event', $2, $3::jsonb)`,
        [session.userId, 'audit_events', JSON.stringify({ rowCount: rows.length })],
      );
    } catch {
    }

    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="audit-events.csv"',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
