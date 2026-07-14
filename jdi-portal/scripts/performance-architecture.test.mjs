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

test("dashboard streams timeline after the snapshot critical path", () => {
  const page = source("src/app/dashboard/page.tsx");
  const dashboard = source("src/components/dashboard/DashboardClient.tsx");
  const timeline = source("src/components/dashboard/DashboardTimelineClient.tsx");

  const dashboardStart = page.indexOf("const dashboardDataPromise = getDashboardDataFast");
  const timelineStart = page.indexOf("const timelineDataPromise = getInitialWorkTimelineData");
  const dashboardAwait = page.indexOf("const initialData = await dashboardDataPromise");
  assert.ok(dashboardStart >= 0 && timelineStart > dashboardStart && dashboardAwait > timelineStart);
  assert.match(page, /<Suspense fallback=\{<DashboardTimelineSkeleton \/>\}>/);
  assert.match(page, /timelineData=\{timelineDataPromise\}/);
  assert.doesNotMatch(dashboard, /getWorkTimeline|WorkTimelineSection|initialTimelineEntries|timelineProfiles/);
  assert.match(timeline, /dynamic\(/);
  assert.match(timeline, /ssr: false/);
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
  assert.doesNotMatch(instrumentation, /setInterval|setTimeout|fetch\(/);
  assert.match(postgres, /min: 1/);
  assert.match(postgres, /idleTimeoutMillis: 10 \* 60_000/);
  assert.match(postgres, /keepAlive: true/);
  assert.equal(existsSync(path.join(appRoot, "src/app/api/keep-warm/route.ts")), false);
});
