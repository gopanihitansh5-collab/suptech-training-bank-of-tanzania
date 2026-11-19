import { createRequire } from 'node:module';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getMigrationDatabaseUrl } from '../src/lib/db-config';
import { closePool, getPool } from '../src/lib/db';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());

const migrationsDirectory = new URL('../src/db/migrations/', import.meta.url);

async function main(): Promise<void> {
  process.env.DATABASE_URL = getMigrationDatabaseUrl(
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_UNPOOLED,
  );

  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((filename) => /^\d+_[a-z0-9_-]+\.sql$/.test(filename))
    .sort();
  for (const filename of migrationFiles) {
    const version = filename.slice(0, -4);
    const { rowCount } = await pool.query(
      'SELECT version FROM schema_migrations WHERE version = $1',
      [version],
    );
    if (rowCount) {
      console.info(`Migration ${version} is already applied.`);
      continue;
    }

    const sql = await readFile(fileURLToPath(new URL(filename, migrationsDirectory)), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [
        version,
      ]);
      await client.query('COMMIT');
      console.info(`Applied migration ${version}.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
