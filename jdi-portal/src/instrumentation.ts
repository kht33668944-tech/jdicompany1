import { getPool, hasPostgresUrl, markPostgresUnavailable } from "@/lib/db/postgres";

type InstrumentationGlobal = typeof globalThis & {
  __jdiPgWarmStarted?: boolean;
};

/**
 * Railway 프로세스 시작 시 직접 PostgreSQL 연결을 한 번 준비한다.
 * 주기적인 self-ping 없이 첫 사용자가 연결 생성 비용을 부담하지 않게 한다.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !hasPostgresUrl()) return;

  const g = globalThis as InstrumentationGlobal;
  if (g.__jdiPgWarmStarted) return;
  g.__jdiPgWarmStarted = true;

  try {
    await getPool().query("select 1");
  } catch (error) {
    markPostgresUnavailable();
    console.error("[startup] postgres warm-up failed; fallback enabled:", error);
  }
}
