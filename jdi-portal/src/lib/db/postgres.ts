import { Pool } from "pg";

type PgGlobal = typeof globalThis & {
  __jdiPgPool?: Pool;
};

function getConnectionString() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  return connectionString;
}

export function getPool() {
  const g = globalThis as PgGlobal;
  if (!g.__jdiPgPool) {
    g.__jdiPgPool = new Pool({
      connectionString: getConnectionString(),
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: { rejectUnauthorized: false },
    });
  }
  return g.__jdiPgPool;
}
