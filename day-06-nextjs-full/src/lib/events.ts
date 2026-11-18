import type { QueryResultRow } from 'pg';
import { query } from './db';

export interface SystemEvent {
  eventId: number;
  eventType: string;
  payload: unknown;
  createdAt: string;
}

interface SystemEventRow extends QueryResultRow {
  event_id: string | number;
  event_type: string;
  payload: unknown;
  created_at: string | Date;
}

const MAX_PAYLOAD_BYTES = 4096;

function serializePayload(payload: unknown): string {
  let json: string;
  try {
    const serialized = JSON.stringify(payload ?? {});
    json = serialized === undefined ? 'null' : serialized;
  } catch {
    json = '{"error":"payload_not_serializable"}';
  }
  if (Buffer.byteLength(json, 'utf8') <= MAX_PAYLOAD_BYTES) return json;

  let preview = json.slice(0, MAX_PAYLOAD_BYTES - 64);
  while (preview.length > 0 && Buffer.byteLength(preview, 'utf8') > MAX_PAYLOAD_BYTES - 64) {
    preview = preview.slice(0, -1);
  }
  return JSON.stringify({ truncated: true, preview });
}

export async function recordEvent(
  eventType: string,
  payload: unknown,
): Promise<boolean> {
  try {
    await query(
      `INSERT INTO system_events (event_type, payload)
       VALUES ($1, $2::jsonb)`,
      [eventType, serializePayload(payload)],
    );
    return true;
  } catch {
    return false;
  }
}

export function clampEventLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(200, Math.max(1, Math.trunc(limit)));
}

export async function listEventsAfter(
  lastEventId: number,
  limit = 50,
): Promise<SystemEvent[]> {
  const boundedLimit = clampEventLimit(limit);
  const after = Number.isSafeInteger(lastEventId) && lastEventId > 0 ? lastEventId : 0;
  const result = await query<SystemEventRow>(
    `SELECT event_id, event_type, payload, created_at
     FROM system_events
     WHERE event_id > $1
     ORDER BY event_id ASC
     LIMIT $2`,
    [after, boundedLimit],
  );
  return result.rows.map((row) => ({
    eventId: Number(row.event_id),
    eventType: row.event_type,
    payload: row.payload,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export function toSseChunk(event: SystemEvent): string {
  let data: string;
  try {
    const serialized = JSON.stringify(event);
    data = serialized === undefined ? 'null' : serialized;
  } catch {
    data = JSON.stringify({
      eventId: event.eventId,
      eventType: event.eventType,
      payload: { error: 'payload_not_serializable' },
      createdAt: event.createdAt,
    });
  }
  return `id: ${event.eventId}\ndata: ${data}\n\n`;
}
