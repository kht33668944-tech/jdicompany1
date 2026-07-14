import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";

const appRoot = path.resolve(import.meta.dirname, "..");
const mapperSource = path.join(appRoot, "src", "lib", "dashboard", "dashboard-snapshot.ts");
const fastQueriesSource = path.join(appRoot, "src", "lib", "dashboard", "fast-queries.ts");
const dashboardQueriesSource = path.join(appRoot, "src", "lib", "dashboard", "queries.ts");
const statusMigrationSource = path.join(appRoot, "supabase", "migrations", "086_today_attendance_statuses_rpc.sql");
const dashboardPageSource = path.join(appRoot, "src", "app", "dashboard", "page.tsx");
const dashboardClientSource = path.join(appRoot, "src", "components", "dashboard", "DashboardClient.tsx");
const todayWorkBoardSource = path.join(appRoot, "src", "components", "dashboard", "widgets", "TodayWorkBoardWidget.tsx");

function loadSnapshotMapper() {
  const require = createRequire(import.meta.url);
  const typescript = require(path.join(appRoot, "node_modules", "typescript"));
  const compiled = typescript.transpileModule(readFileSync(mapperSource, "utf8"), {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("exports", "module", compiled)(compiledModule.exports, compiledModule);
  return compiledModule.exports;
}

function attendance(id, workDate, totalMinutes) {
  return {
    id,
    user_id: "member-1",
    work_date: workDate,
    check_in: `${workDate}T09:00:00+09:00`,
    check_out: null,
    total_minutes: totalMinutes,
    status: "working",
    note: null,
  };
}

const taskSummary = {
  tasks: [{
    id: "task-1",
    title: "오늘 업무",
    status: "대기",
    priority: "보통",
    due_date: "2026-07-13",
    start_date: null,
    position: 1,
    parent_id: null,
    created_by: "creator-1",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    completed_at: null,
    assignees: [{ user_id: "member-1", full_name: "Member", avatar_url: null }],
  }],
  truncated: false,
  profiles: [{ id: "member-1", full_name: "Member", avatar_url: null, role: "employee" }],
  today: "2026-07-13",
};

test("maps a single-query dashboard snapshot to the bounded task-summary DashboardData shape", () => {
  const mapper = loadSnapshotMapper();
  const todayRecord = attendance("attendance-today", "2026-07-13", 480);
  const schedule = {
    id: "schedule-1",
    title: "Planning",
    description: null,
    category: "INTERNAL",
    start_time: "2026-07-13T01:30:00.000Z",
    end_time: "2026-07-13T02:30:00.000Z",
    is_all_day: false,
    location: null,
    visibility: "company",
    created_by: "creator-1",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    creator_profile: { full_name: "Creator" },
    schedule_participants: [{ id: "participant-1", user_id: "member-1", profiles: { full_name: "Member" } }],
  };

  const result = mapper.buildDashboardDataFromSnapshot(
    {
      todayRecord,
      weekRecords: [attendance("attendance-mon", "2026-07-13", 480), attendance("attendance-wed", "2026-07-15", 360)],
      taskSummary,
      todayAttendanceStatuses: [{ user_id: "member-1", status: "working" }],
      schedules: [schedule],
    },
    {
      userName: "Member",
      canViewCompanyWork: true,
      weekStart: "2026-07-13",
      now: new Date("2026-07-13T01:00:00.000Z"),
    },
  );

  assert.deepEqual(result, {
    todayRecord,
    weeklyMinutes: 840,
    weekdayWorked: [true, false, true, false, false],
    taskSummary,
    todayAttendanceStatuses: [{ user_id: "member-1", status: "working" }],
    todaySchedules: [schedule],
    recentActivities: [],
    nextScheduleMinutes: 30,
    userName: "Member",
    canViewCompanyWork: true,
  });
});

test("preserves empty employee dashboard data without inventing company task records", () => {
  const mapper = loadSnapshotMapper();
  const emptyTaskSummary = {
    tasks: [],
    truncated: false,
    profiles: taskSummary.profiles,
    today: "2026-07-13",
  };
  const result = mapper.buildDashboardDataFromSnapshot(
    {
      todayRecord: null,
      weekRecords: [],
      taskSummary: emptyTaskSummary,
      todayAttendanceStatuses: [],
      schedules: [],
    },
    {
      userName: "Member",
      canViewCompanyWork: false,
      weekStart: "2026-07-13",
      now: new Date("2026-07-13T01:00:00.000Z"),
    },
  );

  assert.deepEqual(result, {
    todayRecord: null,
    weeklyMinutes: 0,
    weekdayWorked: [false, false, false, false, false],
    taskSummary: emptyTaskSummary,
    todayAttendanceStatuses: [],
    todaySchedules: [],
    recentActivities: [],
    nextScheduleMinutes: null,
    userName: "Member",
    canViewCompanyWork: false,
  });
});

test("loads approved profiles and minimal attendance statuses for every dashboard role", () => {
  const source = readFileSync(fastQueriesSource, "utf8");

  assert.match(source, /with parameters as/i);
  assert.match(source, /approved_requester as/i);
  assert.equal((source.match(/pool\.query/g) ?? []).length, 1);
  assert.doesNotMatch(source, /current_profile/);
  assert.match(source, /where p\.is_approved = true/i);
  assert.match(source, /'todayAttendanceStatuses'/);
  assert.match(source, /jsonb_build_object\('user_id', ar\.user_id, 'status', ar\.status\)/);
  assert.match(source, /task_summary_rows as/i);
  assert.match(source, /limit 101/i);
  assert.doesNotMatch(source, /TaskWithDetails/);
});

test("uses an approved-user RPC for fallback attendance status visibility", () => {
  const querySource = readFileSync(dashboardQueriesSource, "utf8");
  const migrationSource = readFileSync(statusMigrationSource, "utf8");

  assert.match(querySource, /getTodayAttendanceStatuses\(supabase\)/);
  assert.doesNotMatch(querySource, /canViewCompanyWork\s*\?\s*await/);
  assert.match(migrationSource, /RETURNS TABLE \(user_id UUID, status TEXT\)/);
  assert.match(migrationSource, /public\.is_approved_user\(\)/);
  assert.match(migrationSource, /AT TIME ZONE 'Asia\/Seoul'/);
  assert.doesNotMatch(migrationSource, /check_in|check_out|total_minutes|note/);
});

test("separates role default task scope from schedule visibility and preserves bounded board rendering", () => {
  const pageSource = readFileSync(dashboardPageSource, "utf8");
  const clientSource = readFileSync(dashboardClientSource, "utf8");
  const widgetSource = readFileSync(todayWorkBoardSource, "utf8");

  assert.match(pageSource, /auth\.profile\.role === "admin" \? "all" : auth\.user\.id/);
  assert.match(pageSource, /const canViewCompanyWork = auth\.profile\.role !== "employee"/);
  assert.match(clientSource, /defaultAssigneeFilter=\{defaultTaskAssigneeFilter\}/);
  assert.match(clientSource, /taskSummary=\{data\.taskSummary\}/);
  assert.match(widgetSource, /useState\(defaultAssigneeFilter\)/);
  assert.match(widgetSource, /<option value="all">전체 직원<\/option>/);
  assert.match(widgetSource, /taskBelongsToProfile\(task, assigneeFilter\)/);
  assert.match(widgetSource, /max-h-\[36rem\].*overflow-y-auto/);
  assert.match(widgetSource, /initialTask=\{null\}/);
  assert.doesNotMatch(widgetSource, /TaskWithDetails|canViewCompanyWork|DragDropContext|moveTask/);
});
