const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const REQUIRED_LOCAL_PORT = '5433';
const REQUIRED_REMOTE_SSLMODES = new Set(['require', 'verify-ca', 'verify-full']);

export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
}

export function assertSafeDatabaseUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. Configure the isolated Day 6 database on 127.0.0.1:5433 or a managed PostgreSQL URL with sslmode=require.');
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
  if (!parsed.pathname || parsed.pathname === '/') {
    throw new Error('DATABASE_URL must name the Day 6 database.');
  }

  if (LOCAL_HOSTS.has(parsed.hostname)) {
    if (parsed.port !== REQUIRED_LOCAL_PORT) {
      throw new Error('Local Day 6 connections must target the isolated PostgreSQL on loopback port 5433; the existing port-5432 cluster is intentionally excluded.');
    }
    return databaseUrl;
  }
  const sslmode = parsed.searchParams.get('sslmode');
  if (!sslmode || !REQUIRED_REMOTE_SSLMODES.has(sslmode)) {
    throw new Error('Remote Day 6 connections are only allowed to managed PostgreSQL providers that explicitly require TLS; append ?sslmode=require to the DATABASE_URL.');
  }
  if (!parsed.password && !parsed.username) {
    throw new Error('Remote DATABASE_URL must include credentials for the managed PostgreSQL provider.');
  }

  return databaseUrl;
}

export function getMigrationDatabaseUrl(
  databaseUrl: string | undefined,
  unpooledDatabaseUrl: string | undefined,
): string {
  const migrationUrl = unpooledDatabaseUrl?.trim() || databaseUrl;
  const safeMigrationUrl = assertSafeDatabaseUrl(migrationUrl);
  if (
    !isLocalDatabaseUrl(safeMigrationUrl) &&
    new URL(safeMigrationUrl).hostname
      .split('.')
      .some((label) => label.toLowerCase().endsWith('-pooler'))
  ) {
    throw new Error(
      'Remote database migrations require a direct, non-pooler PostgreSQL endpoint; set DATABASE_URL_UNPOOLED.',
    );
  }
  return safeMigrationUrl;
}
