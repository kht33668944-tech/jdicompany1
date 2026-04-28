import { Pool } from "pg";

type PgGlobal = typeof globalThis & {
  __jdiPgPool?: Pool;
  __jdiPgUnavailableUntil?: number;
};

const POSTGRES_RETRY_AFTER_MS = 60_000;

function getConnectionString() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  return connectionString;
}

export function hasPostgresUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export function isPostgresUsable() {
  const g = globalThis as PgGlobal;
  return hasPostgresUrl() && Date.now() >= (g.__jdiPgUnavailableUntil ?? 0);
}

export function markPostgresUnavailable() {
  const g = globalThis as PgGlobal;
  g.__jdiPgUnavailableUntil = Date.now() + POSTGRES_RETRY_AFTER_MS;
}

export function getPool() {
  const g = globalThis as PgGlobal;
  if (!g.__jdiPgPool) {
    g.__jdiPgPool = new Pool({
      connectionString: getConnectionString(),
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_500,
      ssl: { rejectUnauthorized: false },
    });
  }
  return g.__jdiPgPool;
}
