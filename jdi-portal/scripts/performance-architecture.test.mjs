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
  assert.ok(middleware.indexOf('"/api/health"') < middleware.indexOf("createServerClient("));
  assert.doesNotMatch(health, /supabase|createClient|DATABASE_URL/);
  assert.match(health, /NextResponse\.json\(\{ ok: true \}\)/);
  assert.match(instrumentation, /await getPool\(\)\.query\("select 1"\)/);
  // 콜드 스타트(유휴 후 첫 요청 지연) 방지용 in-process keepalive는 의도된 구성이다.
  // 어느 헬퍼를 쓰는지는 자유롭게 리팩터링하되, "타이머가 상류를 데운다"는 유지한다.
  assert.match(instrumentation, /setInterval\(/);
  assert.match(instrumentation, /warmUpstreams\(\)|pingSupabase\(\)|pingPostgres\(\)/);
  assert.match(postgres, /min: 1/);
  assert.match(postgres, /idleTimeoutMillis: 10 \* 60_000/);
  assert.match(postgres, /keepAlive: true/);
});

test("외부 스케줄러용 데우기 경로: 요청 안에서 await 로 완료 + 인증 우회 + 연타 방지", () => {
  // 운영(Cloud Run)은 요청을 처리할 때만 CPU 를 준다. 그래서 instrumentation.ts 의
  // setInterval 은 fetch 를 시작만 하고 끝내지 못한다 — 실측(2026-07-30)에서 11분
  // 유휴 뒤 첫 요청의 middleware.getUser 가 720ms 로 부풀었다. Cloud Scheduler 가
  // 1분마다 이 경로를 불러 같은 데우기를 요청 안에서 완료시킨다.
  const warmup = source("src/lib/warmup.ts");
  const route = source("src/app/api/keepalive/route.ts");
  const middleware = source("src/lib/supabase/middleware.ts");
  const health = source("src/app/api/health/route.ts");

  // 실제로 상류를 두드려야 의미가 있다(인증 서버 + PostgREST + pg).
  assert.match(warmup, /auth\/v1\/health/);
  assert.match(warmup, /rest\/v1\/profiles/);
  assert.match(warmup, /getPool\(\)\.query\("select 1"\)/);

  // 시작만 하고 끝내지 않으면 이 경로의 존재 이유가 없어진다.
  assert.match(route, /await warmUpstreams\(\)/);
  assert.doesNotMatch(route, /void warmUpstreams\(/);

  // 1분마다 불리므로 인증 왕복을 태우면 안 된다.
  assert.ok(
    middleware.indexOf('"/api/keepalive"') < middleware.indexOf("createServerClient("),
  );

  // 인증 없이 열려 있고, 타이머와 스케줄러가 겹쳐 돌 수 있다.
  // 방금 데웠으면 건너뛰는 간격 제한이 어딘가에 있어야 한다(route 든 warmup 이든).
  assert.match(route + warmup, /MIN_WARM_INTERVAL_MS|MIN_INTERVAL_MS/);

  // health 는 순수한 생존 확인으로 남긴다(외부 헬스체크가 DB 상태에 끌려가면 안 된다).
  assert.doesNotMatch(health, /warmUpstreams|supabase|createClient|DATABASE_URL/);

  // 예전에 쓰다 버린 경로가 되살아나 두 벌이 되는 것을 막는다.
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

  // hover/포커스 intent prefetch 는 유지한다. FULL 이어야 본문 데이터까지 미리 받는다
  // (기본 AUTO 는 껍데기만 받아 클릭 후 본문 RSC 왕복 0.6~0.9초가 그대로 남는다).
  assert.match(sidebar, /const prefetchOnIntent = useCallback/);
  assert.match(sidebar, /router\.prefetch\(href, \{ kind: PrefetchKind\.FULL \}\)/);
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

test("auth redirects stay host-agnostic (프록시/컨테이너 뒤에서도 올바른 주소로)", () => {
  // 실측(2026-07): `new URL(request.url).origin` 은 서비스 도메인이 아니라 서버가
  // listen 하는 내부 주소로 잡힌다 — Railway 에서 `https://localhost:8080`,
  // 컨테이너에서 `https://0.0.0.0:8080`. 그 주소로 리다이렉트되면 비밀번호 재설정
  // 메일 링크가 열리지 않는다. Location 을 상대 경로로 내보내야 브라우저가 자기가
  // 접속한 도메인 기준으로 해석한다.
  const callback = source("src/app/auth/callback/route.ts");

  assert.doesNotMatch(callback, /NextResponse\.redirect\(/);
  assert.doesNotMatch(callback, /\$\{origin\}/);
  assert.match(callback, /redirect\(safeNext\)/);
  assert.match(callback, /from "next\/navigation"/);
  // 열린 리다이렉트 방지(외부 주소로 튕기지 않게)는 그대로 유지한다.
  assert.match(callback, /next\.startsWith\("\/"\) && !next\.startsWith\("\/\/"\)/);
});

test("reports list resolves attachment counts in the same round trip", () => {
  // 오류 접수 탭 RSC 가 1초를 넘던 원인 중 하나: 목록 조회 후 첨부 개수를 별도
  // 왕복으로 다시 조회(서울↔싱가포르 순차 2회). PostgREST 내장 집계로 1회에 합친다.
  const queries = source("src/lib/reports/queries.ts");

  assert.match(queries, /attachment_rows:report_attachments\(count\)/);
  assert.doesNotMatch(queries, /fetchAttachmentCounts/);
  assert.doesNotMatch(queries, /\.in\(["']report_id["']/);
});
