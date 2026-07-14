import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";

const appRoot = path.resolve(import.meta.dirname, "..");
const summarySourcePath = path.join(appRoot, "src", "lib", "dashboard", "dashboard-task-summary.ts");
const dashboardPagePath = path.join(appRoot, "src", "app", "dashboard", "page.tsx");
const dashboardClientPath = path.join(appRoot, "src", "components", "dashboard", "DashboardClient.tsx");
const widgetPath = path.join(appRoot, "src", "components", "dashboard", "widgets", "TodayWorkBoardWidget.tsx");
const detailClientPath = path.join(appRoot, "src", "components", "dashboard", "tasks", "detail", "TaskDetailClient.tsx");
const detailPanelPath = path.join(appRoot, "src", "components", "dashboard", "tasks", "TaskDetailPanel.tsx");

function loadSummaryModule() {
  const require = createRequire(import.meta.url);
  const typescript = require(path.join(appRoot, "node_modules", "typescript"));
  const source = readFileSync(summarySourcePath, "utf8").replace(
    'import { addDays, toDateString, toDateStringFromTimestamp } from "@/lib/utils/date";',
    `function addDays(dateString, days) {
       const [year, month, day] = dateString.split("-").map(Number);
       return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
     }
     function toDateString(now = new Date()) {
       const parts = new Intl.DateTimeFormat("en-CA", {
         timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
       }).formatToParts(now);
       const part = (type) => parts.find((item) => item.type === type).value;
       return part("year") + "-" + part("month") + "-" + part("day");
     }
     function toDateStringFromTimestamp(timestamp) { return toDateString(new Date(timestamp)); }`,
  );
  const compiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("exports", "module", compiled)(compiledModule.exports, compiledModule);
  return compiledModule.exports;
}

const window = {
  today: "2026-07-13",
  dayStart: "2026-07-13T00:00:00+09:00",
  nextDayStart: "2026-07-14T00:00:00+09:00",
};
const profiles = [{
  id: "member-1",
  full_name: "Member",
  avatar_url: null,
  role: "employee",
}];

function undatedTask(index) {
  return {
    id: `task-${String(index).padStart(3, "0")}`,
    title: `업무 ${index}`,
    status: "대기",
    priority: "보통",
    due_date: null,
    start_date: null,
    position: 0,
    parent_id: null,
    created_by: "member-1",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    completed_at: null,
    assignees: [],
  };
}

test("normalizer keeps 100 rows complete and uses only row 101 as the truncation witness", () => {
  const { normalizeDashboardTaskSummaryResult } = loadSummaryModule();
  const hundred = Array.from({ length: 100 }, (_, index) => undatedTask(index));
  const hundredOne = [...hundred, undatedTask(100)];

  const exactLimit = normalizeDashboardTaskSummaryResult(hundred, profiles, window);
  const overflow = normalizeDashboardTaskSummaryResult(hundredOne, profiles, window);

  assert.equal(exactLimit.tasks.length, 100);
  assert.equal(exactLimit.truncated, false);
  assert.equal(overflow.tasks.length, 100);
  assert.equal(overflow.truncated, true);
  assert.equal(overflow.tasks.at(-1)?.id, "task-099");
});

test("role defaults make only admins start at all scope while developer and employee use self", () => {
  const pageSource = readFileSync(dashboardPagePath, "utf8");
  const clientSource = readFileSync(dashboardClientPath, "utf8");
  const widgetSource = readFileSync(widgetPath, "utf8");

  assert.match(pageSource, /auth\.profile\.role === "admin" \? "all" : auth\.user\.id/);
  assert.match(pageSource, /const canViewCompanyWork = auth\.profile\.role !== "employee"/);
  assert.match(clientSource, /defaultAssigneeFilter=\{defaultTaskAssigneeFilter\}/);
  assert.match(clientSource, /profiles=\{data\.taskSummary\.profiles\}/);
  assert.match(widgetSource, /useState\(defaultAssigneeFilter\)/);
  assert.doesNotMatch(widgetSource, /canViewCompanyWork/);
});

test("employee and status selectors are local, reset stale named selections, and keep canonical counts", () => {
  const widgetSource = readFileSync(widgetPath, "utf8");

  assert.match(widgetSource, /onChange=\{\(event\) => setAssigneeFilter\(event\.target\.value\)\}/);
  assert.match(widgetSource, /onClick=\{\(\) => setStatusFilter\(filter\.value\)\}/);
  assert.doesNotMatch(widgetSource, /onChange=\{[^}]*router\.refresh/);
  assert.doesNotMatch(widgetSource, /onClick=\{[^}]*setStatusFilter[^}]*router\.refresh/);
  assert.match(widgetSource, /current === "all" \|\| profiles\.some\(\(profile\) => profile\.id === current\)/);
  assert.match(widgetSource, /setLocalTasks\(taskSummary\.tasks\)/);
  assert.match(widgetSource, /const counts = \{[\s\S]*all: assigneeTasks\.length/);
  assert.match(widgetSource, /const unassignedTasks = filteredTasks\.filter\(\(task\) => task\.assignees\.length === 0\)/);
  assert.match(widgetSource, /if \(assigneeFilter !== "all"\) \{[\s\S]*tasks: filteredTasks/);
  assert.match(widgetSource, /taskGroups\.map/);
});

test("task detail stays task-id driven and foreign task controls stay read-only", () => {
  const widgetSource = readFileSync(widgetPath, "utf8");
  const detailClientSource = readFileSync(detailClientPath, "utf8");
  const detailPanelSource = readFileSync(detailPanelPath, "utf8");

  assert.match(widgetSource, /export function canUpdateDashboardTask\([\s\S]*userRole === "admin"[\s\S]*task\.created_by === userId[\s\S]*task\.assignees\.some/);
  assert.match(widgetSource, /export function canDeleteDashboardTask\([\s\S]*return userRole === "admin" \|\| task\.created_by === userId/);
  assert.match(widgetSource, /initialTask=\{null\}/);
  assert.doesNotMatch(widgetSource, /TaskWithDetails|initialTask=\{detailTask\}/);
  assert.match(detailClientSource, /const canManageAssignees = isCreator \|\| isAdmin/);
  assert.match(detailClientSource, /\{canManageAssignees && \(/);
  assert.equal([...detailClientSource.matchAll(/\{canManageAssignees && \(/g)].length, 4);
  assert.match(detailPanelSource, /activeTaskIdRef\.current !== refreshTaskId/);
  assert.match(detailPanelSource, /role="dialog"[\s\S]*aria-label="할일 상세"[\s\S]*tabIndex=\{-1\}/);
  assert.match(detailPanelSource, /FOCUSABLE_SELECTOR/);
  assert.match(detailPanelSource, /opener\?\.isConnected/);
  assert.match(widgetSource, /setLocalTasks\(\(current\) => current\.map\(\(item\) => item\.id === task\.id \? task : item\)\)/);
  assert.match(widgetSource, /compareDashboardTaskSummaries\(left, right, dashboardTaskWindow\)/);
  assert.match(widgetSource, /aria-pressed=\{active\}/);
});

test("dashboard drag is disabled for bounded grouped summaries while scroll and truncation affordances remain", () => {
  const widgetSource = readFileSync(widgetPath, "utf8");

  assert.match(widgetSource, /export function isDashboardTaskDragDisabled\(\): true \{\s*return true;/);
  assert.doesNotMatch(widgetSource, /@hello-pangea\/dnd|DragDropContext|Droppable|Draggable|moveTask/);
  assert.match(widgetSource, /max-h-\[36rem\].*overflow-y-auto/);
  assert.match(widgetSource, /taskSummary\.truncated/);
  assert.match(widgetSource, /href="\/dashboard\/tasks"/);
  assert.match(widgetSource, /일부 업무만 표시/);
});
