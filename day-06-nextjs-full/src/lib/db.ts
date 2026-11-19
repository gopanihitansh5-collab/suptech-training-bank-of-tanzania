import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import dns from 'node:dns';
import net from 'node:net';
import { assertSafeDatabaseUrl, isLocalDatabaseUrl } from './db-config';

declare global {
  var __suptechDay6Pool: Pool | undefined;
}

export function getPool(): Pool {
  if (!globalThis.__suptechDay6Pool) {
    const connectionString = assertSafeDatabaseUrl(process.env.DATABASE_URL);
    const isLocal = isLocalDatabaseUrl(connectionString);
    dns.setDefaultResultOrder('ipv4first');
    net.setDefaultAutoSelectFamily(false);
    const pool = new Pool({
      connectionString,
      application_name: 'suptech-monitor-day-06',
      max: 10,
      connectionTimeoutMillis: isLocal ? 2500 : 10000,
      idleTimeoutMillis: 30000,
      query_timeout: 10000,
    });
    if (process.env.VERCEL === '1') attachDatabasePool(pool);
    globalThis.__suptechDay6Pool = pool;
  }
  return globalThis.__suptechDay6Pool;
}

export async function query<Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  return getPool().query<Row>(text, [...values]);
}

export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabase(): Promise<void> {
  await query('SELECT 1');
}

export async function closePool(): Promise<void> {
  if (globalThis.__suptechDay6Pool) {
    await globalThis.__suptechDay6Pool.end();
    globalThis.__suptechDay6Pool = undefined;
  }
}
