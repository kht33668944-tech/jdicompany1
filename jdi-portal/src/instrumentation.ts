import { getPool, hasPostgresUrl, markPostgresUnavailable } from "@/lib/db/postgres";
import { pingPostgres, pingSupabase } from "@/lib/warmup";

type InstrumentationGlobal = typeof globalThis & {
  __jdiPgWarmStarted?: boolean;
  __jdiPgKeepAlive?: ReturnType<typeof setInterval>;
  __jdiSupabaseKeepAlive?: ReturnType<typeof setInterval>;
};

/**
 * pooler/NAT 가 유휴 연결을 끊는 시간보다 짧게 keepalive 한다.
 * 오래 쉰 뒤 첫 요청이 "죽은 소켓 재사용 → 수초 멈춤(콜드 스타트)"을 겪지 않도록,
 * 백그라운드에서 미리 연결을 살려두고 끊긴 연결은 풀이 재생성하게 한다.
 */
const PG_KEEPALIVE_INTERVAL_MS = 2 * 60_000;

/**
 * Supabase HTTPS 경로(인증 서버 + REST) keepalive.
 * 계측 결과([stage] 로그) 유휴 후 첫 요청의 지연은 pg 가 아니라 Supabase HTTPS
 * 호출(미들웨어 auth.getUser, PostgREST 쿼리)이 건당 400~700ms 로 부푸는 것이
 * 원인이었다. 1분마다 가볍게 두 경로를 두드려 Supabase 쪽 서비스와 연결 경로를
 * 데워둔다. (실사용자 요청과 동일한 도메인/경로를 사용)
 */
const SUPABASE_KEEPALIVE_INTERVAL_MS = 60_000;

/**
 * 프로세스 시작 시 직접 PostgreSQL 연결을 준비하고(첫 사용자가 연결 생성 비용을
 * 부담하지 않게), 이후 주기적으로 가볍게 ping 하여 유휴 연결이 끊기지 않게 한다.
 *
 * 아래 타이머는 **CPU 가 상시 할당되는 실행 환경**(Railway, 로컬)에서 유효하다.
 * 운영(Cloud Run)은 요청을 처리할 때만 CPU 를 주므로 타이머가 fetch 를 시작만 하고
 * 끝내지 못한다 — 그래서 Cloud Scheduler 작업 `jdi-portal-keepalive` 가 1분마다
 * `/api/keepalive` 를 불러 같은 데우기를 **요청 안에서 await** 로 완료시킨다.
 * (docs/operations/cloud-run-seoul.md)
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as InstrumentationGlobal;

  // Supabase HTTPS keepalive — pg(DATABASE_URL) 유무와 무관하게 항상 켠다.
  if (!g.__jdiSupabaseKeepAlive) {
    void pingSupabase();
    const supabaseTimer = setInterval(() => {
      void pingSupabase();
    }, SUPABASE_KEEPALIVE_INTERVAL_MS);
    supabaseTimer.unref?.();
    g.__jdiSupabaseKeepAlive = supabaseTimer;
  }

  if (!hasPostgresUrl()) return;
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
      void pingPostgres().finally(() => {
        inFlight = false;
      });
    }, PG_KEEPALIVE_INTERVAL_MS);
    // keepalive 타이머가 프로세스 종료를 막지 않도록 한다.
    timer.unref?.();
    g.__jdiPgKeepAlive = timer;
  }
}
