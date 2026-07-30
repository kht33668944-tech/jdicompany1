import { getPool, hasPostgresUrl, markPostgresUnavailable } from "@/lib/db/postgres";
import { warmUpstreams } from "@/lib/warmup";

type InstrumentationGlobal = typeof globalThis & {
  __jdiPgWarmStarted?: boolean;
  __jdiKeepAlive?: ReturnType<typeof setInterval>;
};

/**
 * pooler/NAT 가 유휴 연결을 끊는 시간보다 짧게 keepalive 한다.
 * 오래 쉰 뒤 첫 요청이 "죽은 소켓 재사용 → 수초 멈춤(콜드 스타트)"을 겪지 않도록,
 * 백그라운드에서 미리 연결을 살려두고 끊긴 연결은 풀이 재생성하게 한다.
 * (계측 결과 pg 보다 Supabase HTTPS 경로가 더 빨리 식어서 1분 주기로 맞췄다.)
 */
const KEEPALIVE_INTERVAL_MS = 60_000;

/**
 * 프로세스 시작 시 직접 PostgreSQL 연결을 준비하고(첫 사용자가 연결 생성 비용을
 * 부담하지 않게), 이후 주기적으로 상류를 데워 유휴 연결이 끊기지 않게 한다.
 *
 * 아래 타이머는 **CPU 가 상시 할당되는 실행 환경**(로컬 등)에서 유효하다.
 * 운영(Cloud Run)은 요청을 처리할 때만 CPU 를 주므로 타이머가 fetch 를 시작만 하고
 * 끝내지 못한다 — 그래서 Cloud Scheduler 작업 `jdi-portal-keepalive` 가 1분마다
 * `/api/keepalive` 를 불러 같은 데우기를 요청 안에서 await 로 완료시킨다.
 * 두 경로가 겹쳐도 `warmUpstreams` 안의 간격 제한이 중복 실행을 막는다.
 * (docs/operations/cloud-run-seoul.md)
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as InstrumentationGlobal;

  // 시작 시 pg 연결 준비. 여기서만 실패를 폴백 신호로 승격시킨다
  // (주기적 ping 은 실패해도 풀이 알아서 새 연결을 만든다).
  if (hasPostgresUrl() && !g.__jdiPgWarmStarted) {
    g.__jdiPgWarmStarted = true;
    try {
      await getPool().query("select 1");
    } catch (error) {
      markPostgresUnavailable();
      console.error("[startup] postgres warm-up failed; fallback enabled:", error);
    }
  }

  if (!g.__jdiKeepAlive) {
    void warmUpstreams();
    const timer = setInterval(() => void warmUpstreams(), KEEPALIVE_INTERVAL_MS);
    // keepalive 타이머가 프로세스 종료를 막지 않도록 한다.
    timer.unref?.();
    g.__jdiKeepAlive = timer;
  }
}
