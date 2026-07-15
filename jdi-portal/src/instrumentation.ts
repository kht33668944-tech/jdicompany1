import { getPool, hasPostgresUrl, markPostgresUnavailable } from "@/lib/db/postgres";

type InstrumentationGlobal = typeof globalThis & {
  __jdiPgWarmStarted?: boolean;
  __jdiPgKeepAlive?: ReturnType<typeof setInterval>;
};

/**
 * pooler/NAT 가 유휴 연결을 끊는 시간보다 짧게 keepalive 한다.
 * 오래 쉰 뒤 첫 요청이 "죽은 소켓 재사용 → 수초 멈춤(콜드 스타트)"을 겪지 않도록,
 * 백그라운드에서 미리 연결을 살려두고 끊긴 연결은 풀이 재생성하게 한다.
 */
const PG_KEEPALIVE_INTERVAL_MS = 2 * 60_000;

/**
 * Railway 프로세스 시작 시 직접 PostgreSQL 연결을 준비하고(첫 사용자가 연결 생성
 * 비용을 부담하지 않게), 이후 주기적으로 가볍게 ping 하여 유휴 연결이 끊기지 않게 한다.
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

  // 주기적 keepalive — 유휴로 끊길 연결을 백그라운드에서 미리 살려둔다.
  // 끊긴 소켓이면 이 ping 이 대신 실패를 흡수하고 풀이 새 연결을 만들어,
  // 실제 사용자 요청은 항상 살아있는 연결을 쓰게 된다.
  if (!g.__jdiPgKeepAlive) {
    let inFlight = false;
    const timer = setInterval(() => {
      if (inFlight || !hasPostgresUrl()) return;
      inFlight = true;
      getPool()
        .query("select 1")
        .catch((error) => {
          console.warn("[keepalive] postgres ping failed (pool will recycle):", error);
        })
        .finally(() => {
          inFlight = false;
        });
    }, PG_KEEPALIVE_INTERVAL_MS);
    // keepalive 타이머가 프로세스 종료를 막지 않도록 한다.
    timer.unref?.();
    g.__jdiPgKeepAlive = timer;
  }
}
