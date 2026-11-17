const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const REQUIRED_LOCAL_PORT = '5433';

export function assertSafeDatabaseUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. Configure the isolated Day 6 database on 127.0.0.1:5433.');
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }
  if (!LOCAL_HOSTS.has(parsed.hostname) || parsed.port !== REQUIRED_LOCAL_PORT) {
    throw new Error('Day 6 only connects to PostgreSQL on loopback port 5433; the existing port-5432 cluster is intentionally excluded.');
  }
  if (!parsed.pathname || parsed.pathname === '/') {
    throw new Error('DATABASE_URL must name the Day 6 database.');
  }

  return databaseUrl;
}
