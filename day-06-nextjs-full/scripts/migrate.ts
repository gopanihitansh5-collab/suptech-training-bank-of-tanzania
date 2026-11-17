import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { closePool, getPool } from '../src/lib/db';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

const migration = {
  version: '001_initial',
  file: fileURLToPath(new URL('../src/db/migrations/001_initial.sql', import.meta.url)),
};

async function main(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rowCount } = await pool.query(
    'SELECT version FROM schema_migrations WHERE version = $1',
    [migration.version],
  );
  if (rowCount) {
    console.info(`Migration ${migration.version} is already applied.`);
    return;
  }

  const sql = await readFile(migration.file, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [
      migration.version,
    ]);
    await client.query('COMMIT');
    console.info(`Applied migration ${migration.version}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      'Database migration failed:',
      error instanceof Error ? error.message : 'Unexpected error',
    );
    process.exitCode = 1;
  })
  .finally(closePool);
