import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const appRoot = path.resolve(import.meta.dirname, "..");
const summarySourcePath = path.join(appRoot, "src", "lib", "dashboard", "dashboard-task-summary.ts");
const fastQueriesSourcePath = path.join(appRoot, "src", "lib", "dashboard", "fast-queries.ts");
const dashboardQueriesSourcePath = path.join(appRoot, "src", "lib", "dashboard", "queries.ts");
const rpcMigrationSourcePath = path.join(appRoot, "supabase", "migrations", "089_dashboard_task_summary_future_due.sql");
const tasksPageSourcePath = path.join(appRoot, "src", "components", "dashboard", "tasks", "TasksPageClient.tsx");
const taskPageDetailSourcePath = path.join(appRoot, "src", "app", "dashboard", "tasks", "[id]", "page.tsx");


const window = {
  today: "2026-07-13",
  dayStart: "2026-07-12T15:00:00Z",
  nextDayStart: "2026-07-13T15:00:00Z",
};

const profiles = [
  { id: "user-a", full_name: "Alpha", avatar_url: null, role: "employee" },
  { id: "user-b", full_name: "Bravo", avatar_url: "https://example.test/bravo.png", role: "developer" },
];

function readSource(sourcePath) {
  assert.ok(existsSync(sourcePath), `${sourcePath} must exist`);
  return readFileSync(sourcePath, "utf8");
}

function removeImports(source) {
  return source.replace(/^import(?:\s+type)?[\s\S]*?from\s+["'][^"']+["'];\r?\n/gm, "");
}

function addDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

function evaluateTypeScript(sourcePath, prelude = "") {
  const source = `${prelude}\n${removeImports(readSource(sourcePath))}`;
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      target: typescript.ScriptTarget.ES2022,
      module: typescript.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("exports", "module", output)(compiledModule.exports, compiledModule);
  return compiledModule.exports;
}

function loadSummaryModule() {
  return evaluateTypeScript(
    summarySourcePath,
    `const addDays = ${addDays.toString()};\nconst toDateString = () => "2026-07-13";`
  );
}

function task(id, overrides = {}) {
  return {
    id,
    title: id,
    status: "대기",
    priority: "보통",
    due_date: null,
    start_date: null,
    position: 1,
    parent_id: null,
    created_by: "creator-1",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    completed_at: null,
    assignees: [],
    ...overrides,
  };
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function assertClassifierAndProjectionSource(source, variableName, nextDayDateExpression) {
  const sql = normalizeSql(source);
  assert.match(sql, new RegExp(
    `CASE WHEN t\\.status IN \\('대기', '진행중'\\) AND t\\.due_date IS NOT NULL AND t\\.due_date < ${variableName} THEN 0 WHEN t\\.status IN \\('대기', '진행중'\\) AND t\\.due_date = ${variableName} THEN 1 WHEN t\\.status IN \\('대기', '진행중'\\) AND t\\.due_date IS NOT NULL AND t\\.due_date > ${variableName} THEN 2 WHEN t\\.status IN \\('대기', '진행중'\\) AND t\\.start_date IS NOT NULL AND t\\.start_date < ${nextDayDateExpression} THEN 3 WHEN t\\.status IN \\('대기', '진행중'\\) AND t\\.due_date IS NULL AND t\\.start_date IS NULL THEN 4 WHEN t\\.status = '완료' AND t\\.completed_at >= [^ ]+ AND t\\.completed_at < [^ ]+ THEN 5 ELSE NULL END(?: AS| as) class_rank`,
    "i"
  ));
  assert.match(sql, /CASE WHEN t\.status = '진행중' THEN 0 WHEN t\.status = '대기' THEN 1 ELSE 2 END AS status_rank/i);
  assert.match(sql, /ORDER BY t\.class_rank ASC, CASE WHEN t\.class_rank = 5 THEN t\.relevant_at END DESC NULLS LAST, CASE WHEN t\.class_rank <> 5 THEN t\.relevant_at END ASC NULLS LAST, t\.status_rank ASC, t\.position ASC NULLS LAST, t\.created_at ASC, t\.id ASC/i);
  assert.match(sql, /JOIN public\.profiles assignee ON assignee\.id = ta\.user_id AND assignee\.is_approved = true/i);
  assert.match(sql, /ORDER BY ta\.user_id ASC/i);
  for (const field of ["id", "title", "status", "priority", "due_date", "start_date", "position", "parent_id", "created_by", "created_at", "updated_at", "completed_at"]) {
    assert.match(sql, new RegExp(`t\\.${field}`));
  }
}

test("fast SQL and the atomic fallback RPC mirror the pinned classifier, comparator, approved assignees, projection, and 101 cap", () => {
  const fastSource = readSource(fastQueriesSourcePath);
  const rpcSource = readSource(rpcMigrationSourcePath);
  const fallbackSource = readSource(dashboardQueriesSourcePath);
  const summarySource = readSource(summarySourcePath);

  assertClassifierAndProjectionSource(
    fastSource,
    "prm\\.today",
    "\\(prm\\.next_day_start at time zone 'Asia/Seoul'\\)::date"
  );
  assertClassifierAndProjectionSource(rpcSource, "v_today", "v_next_day");
  assert.match(normalizeSql(fastSource), /LIMIT 101/i);
  assert.match(normalizeSql(rpcSource), /v_limit := LEAST\(GREATEST\(COALESCE\(p_limit, 101\), 1\), 101\)/i);
  assert.match(normalizeSql(rpcSource), /LIMIT v_limit/i);
  assert.match(normalizeSql(fastSource), /FROM approved_requester/i);
  assert.match(rpcSource, /RETURNS jsonb/i);
  assert.match(rpcSource, /SECURITY DEFINER[\s\S]*auth\.uid\(\)[\s\S]*is_approved_user\(\)/i);
  assert.match(rpcSource, /jsonb_build_object\(\s*'tasks', \(SELECT value FROM dashboard_tasks\),\s*'profiles', \(SELECT value FROM dashboard_profiles\)/i);
  assert.match(rpcSource, /FROM public\.profiles p\s+WHERE p\.is_approved = true/i);
  assert.match(rpcSource, /'id', p\.id,\s*'full_name', p\.full_name,\s*'avatar_url', p\.avatar_url,\s*'role', p\.role/i);
  assert.match(fastSource, /new AggregateError\([\s\S]*Dashboard task summary fallback failed/);
  assert.doesNotMatch(rpcSource, /\b(?:INSERT|UPDATE|DELETE|MERGE)\b/i);
  assert.equal((fallbackSource.match(/\.rpc\(/g) ?? []).length, 1);
  assert.match(fallbackSource, /p_limit:\s*101/);
  assert.doesNotMatch(fallbackSource, /getDashboardTaskPeople|mapDashboardTaskPeople|\.from\("profiles"\)/);
  assert.match(fallbackSource, /return normalizeDashboardTaskSummarySnapshot\(snapshot, window\)/);
  assert.match(summarySource, /DASHBOARD_TASK_SUMMARY_LIMIT = 100/);
  assert.match(summarySource, /DASHBOARD_TASK_SUMMARY_FETCH_LIMIT = 101/);
  assert.match(summarySource, /function timestampToEpochMicroseconds\([\s\S]*BigInt/);
  assert.match(summarySource, /function compareCanonicalTimestamps/);
  assert.match(summarySource, /const createdAtDifference = compareCanonicalTimestamps\(left\.created_at, right\.created_at\)/);
  assert.match(summarySource, /const relevantAtDifference = compareCanonicalTimestamps\(leftRelevantAt, rightRelevantAt\)/);
  assert.doesNotMatch(summarySource, /new Date\(left\.created_at\)\.getTime\(\)/);
  assert.doesNotMatch(summarySource, /new Date\(task\.completed_at\)\.getTime\(\)/);
  assert.match(fastSource, /return normalizeDashboardTaskSummaryResult\(rows, profiles, window\)/);
});

test("one normalizer gives fast and RPC rows identical shape, order, and 100-plus-overflow behavior", () => {
  const summary = loadSummaryModule();
  globalThis.__dashboardSummary = summary;
  try {
    const fast = evaluateTypeScript(
      fastQueriesSourcePath,
      `const normalizeDashboardTaskSummaryResult = globalThis.__dashboardSummary.normalizeDashboardTaskSummaryResult;`
    );
    const rpc = evaluateTypeScript(
      dashboardQueriesSourcePath,
      `const normalizeDashboardTaskSummarySnapshot = globalThis.__dashboardSummary.normalizeDashboardTaskSummarySnapshot;`
    );
    const rows = Array.from({ length: 101 }, (_, index) => task(`parity-${String(index).padStart(3, "0")}`, {
      position: index,
    }));
    const fastResult = fast.mapFastDashboardTaskSummaryRows(rows, profiles, window);
    const rpcResult = rpc.mapRpcDashboardTaskSummarySnapshot({ tasks: rows, profiles }, window);
    const exactLimitResult = summary.normalizeDashboardTaskSummaryResult(rows.slice(0, 100), profiles, window);

    assert.deepEqual(fastResult, rpcResult);
    assert.equal(fastResult.tasks.length, 100);
    assert.equal(fastResult.truncated, true);
    assert.equal(exactLimitResult.tasks.length, 100);
    assert.equal(exactLimitResult.truncated, false);
    assert.deepEqual(fastResult.profiles, profiles);
    assert.deepEqual(fastResult.tasks.map((row) => row.id), rows.slice(0, 100).map((row) => row.id));
    assert.throws(
      () => rpc.mapRpcDashboardTaskSummarySnapshot(rows, window),
      /snapshot must be an object/
    );
  } finally {
    delete globalThis.__dashboardSummary;
  }
});

test("the normalizer validates class precedence, exact microsecond order, row shape, and approved assignee order", () => {
  const summary = loadSummaryModule();
  const orderedRows = [
    task("overdue", { due_date: "2026-07-12", start_date: "2026-07-01" }),
    task("due-today", { due_date: "2026-07-13", start_date: "2026-07-01" }),
    task("future-due", { due_date: "2026-07-20" }),
    task("started", { start_date: "2026-07-13" }),
    task("undated", { created_at: "2026-07-02T00:00:00Z", position: null }),
    task("completed", {
      status: "완료",
      completed_at: "2026-07-13T01:00:00Z",
      created_at: "2026-07-03T00:00:00Z",
    }),
  ];

  assert.deepEqual(
    orderedRows.map((row) => summary.getDashboardTaskSummaryClass(row, window)),
    [0, 1, 2, 3, 4, 5]
  );
  assert.deepEqual(
    summary.normalizeDashboardTaskSummaryResult(orderedRows, profiles, window).tasks.map((row) => row.id),
    orderedRows.map((row) => row.id)
  );
  const createdAtMicrosecondRows = [
    task("created-at-older-id-later", {
      created_at: "2026-07-01T09:00:00.000001+09:00",
      position: 7,
    }),
    task("created-at-newer-id-earlier", {
      created_at: "2026-07-01T00:00:00.000002Z",
      position: 7,
    }),
  ];
  assert.deepEqual(
    summary.normalizeDashboardTaskSummaryResult(createdAtMicrosecondRows, profiles, window)
      .tasks.map((row) => row.id),
    createdAtMicrosecondRows.map((row) => row.id)
  );
  assert.throws(
    () => summary.normalizeDashboardTaskSummaryResult(
      [...createdAtMicrosecondRows].reverse(),
      profiles,
      window
    ),
    /canonical order/
  );

  const completedAtMicrosecondRows = [
    task("completed-at-newer-id-later", {
      status: "완료",
      completed_at: "2026-07-13T12:00:00.000002Z",
      position: 7,
    }),
    task("completed-at-older-id-earlier", {
      status: "완료",
      completed_at: "2026-07-13T21:00:00.000001+09:00",
      position: 7,
    }),
  ];
  assert.deepEqual(
    summary.normalizeDashboardTaskSummaryResult(completedAtMicrosecondRows, profiles, window)
      .tasks.map((row) => row.id),
    completedAtMicrosecondRows.map((row) => row.id)
  );
  assert.throws(
    () => summary.normalizeDashboardTaskSummaryResult(
      [...completedAtMicrosecondRows].reverse(),
      profiles,
      window
    ),
    /canonical order/
  );
  assert.throws(
    () => summary.normalizeDashboardTaskSummaryResult([orderedRows[1], orderedRows[0]], profiles, window),
    /canonical order/
  );
  assert.throws(
    () => summary.normalizeDashboardTaskSummaryResult([{ ...orderedRows[0], title: "" }], profiles, window),
    /title must be a non-empty string/
  );
  assert.throws(
    () => summary.normalizeDashboardTaskSummaryResult([
      task("bad-assignee-order", {
        assignees: [
          { user_id: "user-b", full_name: "Bravo", avatar_url: "https://example.test/bravo.png" },
          { user_id: "user-a", full_name: "Alpha", avatar_url: null },
        ],
      }),
    ], profiles, window),
    /assignees must be sorted by user_id/
  );
});

test("the pool fallback classifier allows exactly 17 transient predicates and fails closed otherwise", () => {
  const summary = loadSummaryModule();
  globalThis.__dashboardSummary = summary;
  let fast;
  try {
    fast = evaluateTypeScript(
      fastQueriesSourcePath,
      `const normalizeDashboardTaskSummaryResult = globalThis.__dashboardSummary.normalizeDashboardTaskSummaryResult;`
    );
  } finally {
    delete globalThis.__dashboardSummary;
  }

  const allowedCodes = [
    "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH",
    "08000", "08001", "08003", "08004", "08006", "08007", "08P01", "57P01", "57P02", "57P03",
  ];
  const allowedMessages = [
    "Connection terminated due to connection timeout",
    "timeout exceeded when trying to connect to 127.0.0.1:5432",
  ];

  assert.equal(allowedCodes.length + allowedMessages.length, 17);
  for (const code of allowedCodes) {
    assert.equal(fast.isTransientDashboardPoolError({ code }), true, `${code} is transient`);
  }
  for (const message of allowedMessages) {
    assert.equal(fast.isTransientDashboardPoolError({ message }), true, `${message} is transient`);
  }
  for (const error of [
    undefined,
    { code: "42501" },
    { code: "42601" },
    { code: "XX000" },
    { message: "timeout exceeded while running query" },
    { message: "Connection terminated due to connection timeout later" },
    new summary.DashboardTaskSummaryContractError("bad normalizer output"),
  ]) {
    assert.equal(fast.isTransientDashboardPoolError(error), false, `${String(error)} fails closed`);
  }
});

test("task callers map full profiles through the minimal dashboard person boundary without casts", () => {
  const tasksPageSource = readSource(tasksPageSourcePath);
  const taskPageDetailSource = readSource(taskPageDetailSourcePath);

  assert.match(tasksPageSource, /profiles\.map\(toDashboardTaskPerson\)/);
  assert.match(tasksPageSource, /profiles=\{dashboardTaskProfiles\}/);
  assert.match(taskPageDetailSource, /profiles=\{profiles\.map\(toDashboardTaskPerson\)\}/);
  assert.doesNotMatch(`${tasksPageSource}\n${taskPageDetailSource}`, /as\s+DashboardTaskPerson/);
});
