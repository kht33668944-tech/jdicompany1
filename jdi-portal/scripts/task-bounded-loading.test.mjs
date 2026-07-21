import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFileSync(path.join(appRoot, relativePath), "utf8");

test("task queries cap dashboard data and use thirty-item cursor history pages", () => {
  const source = readSource("src/lib/tasks/queries.ts");

  assert.match(source, /INITIAL_TASK_LIMIT\s*=\s*50/);
  assert.match(source, /TASK_HISTORY_PAGE_SIZE\s*=\s*30/);
  assert.match(source, /export async function getInitialTasksWithDetails/);
  assert.match(source, /\.in\("status", \[[^\]]+\]\)/);
  assert.match(source, /\.limit\(INITIAL_TASK_LIMIT\)/);
  assert.match(source, /remaining.*INITIAL_TASK_LIMIT/);
  assert.match(source, /\.eq\("status", [^)]+\)/);
  assert.match(source, /interface TaskHistoryCursor/);
  assert.match(source, /export async function getTaskHistoryWithDetails/);
  assert.match(source, /\.order\("updated_at",\s*\{ ascending: false \}\)\s*\.order\("id",\s*\{ ascending: false \}\)\s*\.limit\(TASK_HISTORY_PAGE_SIZE \+ 1\)/s);
  assert.match(source, /updated_at\.lt\.\$\{cursor\.updated_at\}/);
  assert.match(source, /id\.lt\.\$\{cursor\.id\}/);
});

test("history filters are applied to the Supabase query", () => {
  const source = readSource("src/lib/tasks/queries.ts");

  assert.match(source, /title\.ilike\.\$\{pattern\},description\.ilike\.\$\{pattern\},category\.ilike\.\$\{pattern\}/);
  assert.match(source, /task_assignees!inner/);
  assert.match(source, /history_assignee\.user_id/);
  assert.match(source, /\.eq\("status", filters\.status\)/);
  assert.match(source, /completed_at\.gte/);
  assert.match(source, /due_date\.eq/);
});

test("tasks page loads bounded initial data, not a history page", () => {
  const page = readSource("src/app/dashboard/tasks/page.tsx");
  const fast = readSource("src/lib/tasks/fast-queries.ts");

  // 페이지는 단일 pg 왕복(빠른 경로)으로 초기 데이터를 가져오고, 히스토리 페이지는 로드하지 않는다.
  assert.match(page, /getTasksPagePayloadFast\(auth\.supabase, auth\.user\.id\)/);
  assert.doesNotMatch(page, /getTaskHistoryWithDetails\(/);

  // 빠른 경로도 초기 로드를 INITIAL_TASK_LIMIT 로 제한하고, 실패 시 bounded 폴백(getInitialTasksWithDetails)을 쓴다.
  assert.match(fast, /INITIAL_TASK_LIMIT/);
  assert.match(fast, /getInitialTasksWithDetails/);
});

test("task history reloads filtered pages and ignores stale client responses", () => {
  const source = readSource("src/components/dashboard/tasks/TasksPageClient.tsx");

  assert.match(source, /getInitialTasksWithDetails/);
  assert.match(source, /getTaskHistoryWithDetails\(supabase, filters, cursor\)/);
  assert.match(source, /useState<TaskWithDetails\[\]>\(\[\]\)/);
  assert.match(source, /historyGenerationRef/);
  assert.match(source, /generation !== historyGenerationRef\.current/);
  assert.match(source, /if \(refreshInFlightRef\.current\) return refreshInFlightRef\.current/);
  assert.match(source, /onTaskMutated=\{refreshTasks\}/);
  assert.match(source, /\uB354 \uBD88\uB7EC\uC624\uAE30/);
});

test("task detail mutations trigger the bounded refresh callback", () => {
  const source = readSource("src/components/dashboard/tasks/TaskDetailPanel.tsx");

  assert.match(source, /onTaskMutated\?: \(\) => void/);
  assert.match(source, /onTaskMutated\?\.\(\)/);
});
