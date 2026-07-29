import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "..");
const source = (relativePath) => readFileSync(path.join(appRoot, relativePath), "utf8");

test("schedule cache is user-scoped and month navigation fetches only on the client", () => {
  const cache = source("src/lib/schedule/scheduleCache.ts");
  const page = source("src/components/dashboard/schedule/SchedulePageClient.tsx");

  assert.match(cache, /function monthKey\(userId: string, year: number, month: number\)/);
  assert.match(cache, /monthKey\(userId, year, month\)/);
  assert.match(page, /getCachedMonth\(userId, year, month\)/);
  assert.match(page, /cacheMonth\(userId, year, month, fresh\)/);
  assert.match(page, /invalidateMonthCache\(userId, currentYear, currentMonth\)/);
  assert.match(page, /window\.history\.replaceState\(/);
  assert.doesNotMatch(page, /useRouter|router\.replace\(/);
});

test("approved login avoids a client profile query and rejected users are signed out", () => {
  const login = source("src/components/LoginCard.tsx");
  const layout = source("src/app/dashboard/layout.tsx");
  const rejected = source("src/app/auth/not-approved/route.ts");

  assert.doesNotMatch(login, /\.from\(["']profiles["']\)|select\(["']is_approved["']\)/);
  assert.match(layout, /redirect\(["']\/auth\/not-approved["']\)/);
  assert.match(rejected, /await supabase\.auth\.signOut\(\)/);
  assert.match(rejected, /redirect\(["']\/login\?error=not_approved["']\)/);
});

test("dashboard renders a user-scoped cached timeline before a lightweight refresh", () => {
  const page = source("src/app/dashboard/page.tsx");
  const dashboard = source("src/components/dashboard/DashboardClient.tsx");
  const timeline = source("src/components/dashboard/DashboardTimelineClient.tsx");
  const queries = source("src/lib/work-timeline/queries.ts");
  const cache = source("src/lib/work-timeline/timelineCache.ts");

  assert.doesNotMatch(page, /getInitialWorkTimelineData|timelineDataPromise|<Suspense/);
  assert.match(page, /<DashboardTimelineClient/);
  assert.doesNotMatch(dashboard, /getWorkTimeline|WorkTimelineSection|initialTimelineEntries|timelineProfiles/);

  // 대시보드 미리보기는 오늘(KST)만 조회·캐시한다.
  assert.match(timeline, /getCachedWorkTimeline\(currentUserId, today\)/);
  assert.match(timeline, /getWorkTimelineEntries\(supabase,[\s\S]*date: today,[\s\S]*includeAttachments: false/);
  assert.match(timeline, /cacheWorkTimeline\(currentUserId, entries, profiles, today\)/);
  // fresh fetch를 캐시 읽기보다 먼저 시작해 두 I/O가 겹치게 한다
  assert.ok(
    timeline.indexOf("const freshPromise = Promise.all") <
      timeline.indexOf("cached = await getCachedWorkTimeline"),
  );
  // 캐시 표시는 fresh 결과 소비보다 먼저다
  assert.ok(
    timeline.indexOf("if (cached) setData(cached)") <
      timeline.indexOf("const [entries, profiles] = await freshPromise"),
  );

  assert.match(queries, /if \(filters\.includeAttachments === false\) return attachFiles\(rows, \[\]\)/);
  // 본문 표시 후 썸네일 첨부 하이드레이션은 부모(DashboardTimelineClient)가 담당한다
  assert.match(timeline, /getWorkTimelineAttachments\(/);
  assert.match(cache, /function timelineKey\(userId: string\)/);
  assert.match(cache, /attachments: \[\]/);
  assert.match(cache, /24 \* 60 \* 60/);
});

test("Railway healthcheck bypasses auth while startup warms one persistent DB connection", () => {
  const railway = readFileSync(path.join(repoRoot, "railway.toml"), "utf8");
  const middleware = source("src/lib/supabase/middleware.ts");
  const health = source("src/app/api/health/route.ts");
  const instrumentation = source("src/instrumentation.ts");
  const postgres = source("src/lib/db/postgres.ts");

  assert.match(railway, /healthcheckPath = "\/api\/health"/);
  assert.match(railway, /healthcheckTimeout = 30/);
  assert.ok(middleware.indexOf('pathname === "/api/health"') < middleware.indexOf("createServerClient("));
  assert.doesNotMatch(health, /supabase|createClient|DATABASE_URL/);
  assert.match(health, /NextResponse\.json\(\{ ok: true \}\)/);
  assert.match(instrumentation, /await getPool\(\)\.query\("select 1"\)/);
  // 콜드 스타트(유휴 후 첫 요청 지연) 방지용 in-process keepalive는 의도된 구성이다:
  // pg 연결은 setInterval 로, Supabase HTTPS 경로는 fetch 로 주기적으로 데워둔다.
  assert.match(instrumentation, /setInterval\(/);
  assert.match(instrumentation, /fetch\(/);
  assert.match(postgres, /min: 1/);
  assert.match(postgres, /idleTimeoutMillis: 10 \* 60_000/);
  assert.match(postgres, /keepAlive: true/);
  assert.equal(existsSync(path.join(appRoot, "src/app/api/keep-warm/route.ts")), false);
});

test("middleware caches auth verification so every request skips the auth server round trip", () => {
  // 사이트 전역 지연의 최대 원인이었던 "매 요청마다 getUser() 네트워크 왕복"을 제거한
  // 5분 TTL 인증 검증 캐시. 이 로직이 사라지면 페이지 이동/prefetch 때마다 서울 인증
  // 서버 왕복(평시 300~500ms, 폭주 시 2~4초)이 되살아나므로 반드시 유지한다.
  const middleware = source("src/lib/supabase/middleware.ts");

  assert.match(middleware, /AUTH_CACHE_TTL_MS\s*=\s*5\s*\*\s*60_000/);
  assert.match(middleware, /TOKEN_EXP_MARGIN_MS\s*=\s*2\s*\*\s*60_000/);
  assert.match(middleware, /function getAuthVerifyCache\(\)/);

  // 캐시 확인이 네트워크 getUser() 호출보다 먼저 일어나야 왕복을 생략할 수 있다.
  assert.ok(
    middleware.indexOf("cache.get(cookieKey)") <
      middleware.indexOf("supabase.auth.getUser()"),
  );

  // 캐시 히트 조건: 최근 5분 내 검증 + 토큰 만료 임박(2분) 전. 만료 임박이면 캐시를
  // 무시하고 네트워크 경로로 보내 세션 갱신을 유지한다.
  assert.match(middleware, /nowMs - cached\.verifiedAtMs < AUTH_CACHE_TTL_MS/);
  assert.match(middleware, /nowMs < cached\.expiresAtMs - TOKEN_EXP_MARGIN_MS/);

  // 실제 검증에 성공한 쿠키만 캐시에 기록한다(위조 토큰은 캐시 미스 → 네트워크 검증 → 거부).
  assert.match(middleware, /if \(user && cookieKey\)/);
  assert.match(middleware, /cache\.set\(cookieKey,/);
});

test("sidebar prefetches routes on hover intent without global auto-prefetch", () => {
  // 탭 이동 실측(2026-07): prefetch 없음 + 라우터 캐시 만료 조합이면 매 탭 클릭이
  // 서버 왕복(0.6~1.4초)을 생으로 기다린다. hover 시점 prefetch 는 곧 클릭할 라우트
  // 1개만 미리 받아 이 왕복을 클릭 전에 숨긴다. 반대로 전체 메뉴 자동 prefetch
  // (prefetch={true})는 초기 로딩과 경쟁해 첫 화면을 수 초 늦춘 전력이 있어 금지.
  const sidebar = source("src/components/dashboard/Sidebar.tsx");

  // hover/포커스 intent prefetch 는 유지한다.
  assert.match(sidebar, /const prefetchOnIntent = useCallback/);
  assert.match(sidebar, /router\.prefetch\(href\)/);
  assert.match(sidebar, /onMouseEnter=\{\(\) => prefetchOnIntent\(item\.href\)\}/);
  assert.match(sidebar, /onFocus=\{\(\) => prefetchOnIntent\(item\.href\)\}/);

  // 전체 메뉴 자동 prefetch 재도입 금지 + 링크별 prefetch={false} 유지.
  assert.doesNotMatch(sidebar, /prefetch=\{true\}/);
  assert.match(sidebar, /prefetch=\{false\}/);

  // 연속 hover 로 같은 라우트를 반복 요청하지 않도록 시간 제한을 둔다.
  assert.match(sidebar, /prefetchAtRef/);
});

test("client router cache keeps visited dashboard tabs for at least five minutes", () => {
  // 탭 이동 실측: 라우터 캐시 히트 10~40ms vs 미스 600~1400ms. dynamic staleTime 을
  // 5분 미만으로 줄이면 대부분의 탭 이동이 다시 서버 왕복이 된다.
  const config = source("next.config.ts");
  const dynamicStale = config.match(/dynamic:\s*(\d+)/);

  assert.ok(dynamicStale, "next.config.ts must configure staleTimes.dynamic");
  assert.ok(
    Number(dynamicStale[1]) >= 300,
    `staleTimes.dynamic must stay >= 300s (got ${dynamicStale[1]})`,
  );
});

test("reports list resolves attachment counts in the same round trip", () => {
  // 오류 접수 탭 RSC 가 1초를 넘던 원인 중 하나: 목록 조회 후 첨부 개수를 별도
  // 왕복으로 다시 조회(서울↔싱가포르 순차 2회). PostgREST 내장 집계로 1회에 합친다.
  const queries = source("src/lib/reports/queries.ts");

  assert.match(queries, /attachment_rows:report_attachments\(count\)/);
  assert.doesNotMatch(queries, /fetchAttachmentCounts/);
  assert.doesNotMatch(queries, /\.in\(["']report_id["']/);
});
