import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFileSync(path.join(appRoot, relativePath), "utf8");

test("attendance check-in uses the dedicated multi-task entry modal", () => {
  const source = readSource("src/components/dashboard/attendance/CheckInOutCard.tsx");

  assert.match(source, /import AttendanceTaskCreateModal from "\.\/AttendanceTaskCreateModal"/);
  assert.match(source, /<AttendanceTaskCreateModal/);
  assert.match(source, /initialDueDate=\{today\}/);
  assert.match(source, /attendance-task-draft:\$\{userId\}:\$\{today\}/);
  assert.doesNotMatch(source, /<TaskCreateModal/);
});

test("attendance task modal supports multiple rows and per-task details", () => {
  const source = readSource("src/components/dashboard/attendance/AttendanceTaskCreateModal.tsx");

  assert.match(source, /const MAX_TASKS = 20/);
  assert.match(source, /업무 추가/);
  assert.match(source, /모든 업무에 적용/);
  assert.match(source, /마감 없음/);
  assert.match(source, /이번 주 금요일/);
  assert.match(source, /상세 설정/);
  assert.match(source, /createSelfTasks\(tasks\.map/);
  assert.match(source, /`\$\{tasks\.length\}개 업무 등록`/);
  assert.match(source, /window\.localStorage\.setItem\(draftKey/);
  assert.match(source, /window\.localStorage\.removeItem\(draftKey/);
  assert.doesNotMatch(source, /router\.refresh|onCreated/);
});

test("multi-task server action validates and bulk creates self-assigned tasks", () => {
  const source = readSource("src/lib/tasks/actions.ts");

  assert.match(source, /export async function createSelfTasks/);
  assert.match(source, /MAX_SELF_TASKS_PER_BATCH = 20/);
  assert.match(source, /같은 제목의 업무가 중복되어 있습니다/);
  assert.match(source, /\.from\("tasks"\)\s*\.insert\(taskRows\)\s*\.select\(\)/s);
  assert.match(source, /\.from\("task_assignees"\)\s*\.insert\(createdIds\.map/s);
  assert.match(source, /\.from\("tasks"\)\.delete\(\)\.in\("id", createdIds\)/);
  assert.match(source, /revalidateTaskViews\(\)/);
});
