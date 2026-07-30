import { getPool, hasPostgresUrl } from "@/lib/db/postgres";

/**
 * 상류(Supabase HTTPS / Postgres) 연결을 미리 데워두는 공용 로직.
 *
 * 두 곳에서 부른다.
 *  1. `src/instrumentation.ts` — 프로세스 안 타이머 (CPU 가 상시 할당되는 환경용).
 *  2. `src/app/api/keepalive/route.ts` — 외부 스케줄러가 부르는 경로. Cloud Run 은
 *     요청을 처리할 때만 CPU 를 주므로, 1번 타이머가 fetch 를 **시작만 하고 끝내지
 *     못한다**. 그래서 요청 안에서 `await` 로 끝까지 완료시킨다.
 *
 * 실측(2026-07-30): 1번만 있고 CPU 가 요청기반이면 11분 유휴 뒤 첫 요청의
 * `middleware.getUser` 가 720ms 로 부풀었다(pg 는 OS 레벨 TCP keepalive 덕에 멀쩡).
 */

/**
 * 두 경로가 겹쳐 도는 것을 막는 간격.
 *
 * Cloud Run 에서는 스케줄러 요청이 CPU 를 깨우는 순간, 밀려 있던 1번 타이머도 같이
 * 실행된다. 막지 않으면 매 분 같은 상류를 두 번씩 두드린다(월 8만여 회 낭비).
 * 방금 데웠으면 건너뛴다 — 어느 쪽이 먼저 불렀든 상관없다.
 */
const MIN_WARM_INTERVAL_MS = 20_000;

let lastWarmedAt = 0;

/** Supabase 인증 서버(GoTrue) + PostgREST 의 HTTPS 연결을 데운다. */
export async function pingSupabase(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  await Promise.allSettled([
    // 인증 서버(GoTrue) — 미들웨어의 auth.getUser 가 매 요청 거치는 경로
    fetch(`${url}/auth/v1/health`, { headers, cache: "no-store" }),
    // PostgREST — supabase-js 쿼리(프로필/할일 등)가 쓰는 경로 (RLS 로 행은 반환되지 않음)
    fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
      method: "HEAD",
      headers,
      cache: "no-store",
    }),
  ]);
}

/** 직접 pg 풀의 연결을 살려둔다. 끊긴 소켓이면 이 ping 이 실패를 대신 흡수한다. */
export async function pingPostgres(): Promise<void> {
  if (!hasPostgresUrl()) return;
  try {
    await getPool().query("select 1");
  } catch (error) {
    console.warn("[keepalive] postgres ping failed (pool will recycle):", error);
  }
}

/**
 * 두 경로를 한 번에 데운다. 어느 한쪽이 실패해도 다른 쪽은 진행한다.
 * 방금 데웠으면 아무것도 하지 않고 `false` 를 돌려준다.
 */
export async function warmUpstreams(): Promise<boolean> {
  const now = Date.now();
  if (now - lastWarmedAt < MIN_WARM_INTERVAL_MS) return false;
  lastWarmedAt = now;
  await Promise.allSettled([pingSupabase(), pingPostgres()]);
  return true;
}
