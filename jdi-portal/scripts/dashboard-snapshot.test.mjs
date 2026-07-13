import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { execFileSync } from "node:child_process";

const appRoot = path.resolve(import.meta.dirname, "..");
const mapperSource = path.join(appRoot, "src", "lib", "dashboard", "dashboard-snapshot.ts");
const fastQueriesSource = path.join(appRoot, "src", "lib", "dashboard", "fast-queries.ts");

function loadSnapshotMapper() {
  assert.ok(existsSync(mapperSource), "dashboard snapshot mapper must exist");

  const outputDir = mkdtempSync(path.join(tmpdir(), "jdi-dashboard-snapshot-"));
  try {
    execFileSync(
      process.execPath,
      [
        path.join(appRoot, "node_modules", "typescript", "bin", "tsc"),
        "--module", "commonjs",
        "--moduleResolution", "node",
        "--target", "es2022",
        "--esModuleInterop",
        "true",
        "--skipLibCheck",
        "true",
        "--outDir",
        outputDir,
        mapperSource,
      ],
      { cwd: appRoot, stdio: "pipe" },
    );
    return {
      mapper: createRequire(import.meta.url)(path.join(outputDir, "dashboard", "dashboard-snapshot.js")),
      outputDir,
    };
  } catch (error) {
    rmSync(outputDir, { recursive: true, force: true });
    throw error;
  }
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

function task(id, status, dueDate, assigneeIds) {
  return {
    id,
    title: id,
    description: null,
    status,
    priority: "normal",
    category: null,
    due_date: dueDate,
    start_date: null,
    position: 1,
    parent_id: null,
    created_by: "creator-1",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    completed_at: status === "completed" ? "2026-07-01T00:00:00.000Z" : null,
    creator_profile: { full_name: "Creator", avatar_url: null },
    assignees: assigneeIds.map((user_id) => ({ user_id, full_name: user_id, avatar_url: null })),
    checklist_total: 0,
    checklist_completed: 0,
    subtask_count: 0,
    comment_count: 0,
    attachment_count: 0,
  };
}

const memberProfile = {
  id: "member-1",
  full_name: "Member",
  email: "member@example.test",
  role: "employee",
  department: "Ops",
  hire_date: "2026-01-01",
  avatar_url: null,
  phone: null,
  bio: null,
  is_approved: true,
  hire_date_locked: false,
  work_start_time: "09:00:00",
  work_end_time: "18:00:00",
  allowed_ip: null,
  allowed_ip_locked: false,
};

test("maps a single-query dashboard snapshot to the existing DashboardData shape", () => {
  const { mapper, outputDir } = loadSnapshotMapper();
  try {
    const todayRecord = attendance("attendance-today", "2026-07-13", 480);
    const mineLater = task("mine-later", "queued", "2026-07-15", ["member-1"]);
    const mineEarlier = task("mine-earlier", "queued", "2026-07-14", ["member-1"]);
    const completedMine = task("mine-completed", "completed", "2026-07-12", ["member-1"]);
    const otherTask = task("other-task", "queued", "2026-07-10", ["member-2"]);
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
        tasks: [mineLater, otherTask, completedMine, mineEarlier],
        profiles: [memberProfile],
        todayAttendanceRecords: [todayRecord],
        schedules: [schedule],
      },
      {
        userId: "member-1",
        userName: "Member",
        canViewCompanyWork: true,
        weekStart: "2026-07-13",
        now: new Date("2026-07-13T01:00:00.000Z"),
        completedTaskStatus: "completed",
      },
    );

    assert.deepEqual(result, {
      todayRecord,
      weeklyMinutes: 840,
      weekdayWorked: [true, false, true, false, false],
      myTasks: [mineEarlier, mineLater],
      allTasksForUser: [mineLater, completedMine, mineEarlier],
      allTasks: [mineLater, otherTask, completedMine, mineEarlier],
      allProfiles: [memberProfile],
      todayAttendanceRecords: [todayRecord],
      todaySchedules: [schedule],
      recentActivities: [],
      nextScheduleMinutes: 30,
      userName: "Member",
      canViewCompanyWork: true,
    });
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test("preserves empty employee dashboard data without inventing company records", () => {
  const { mapper, outputDir } = loadSnapshotMapper();
  try {
    const result = mapper.buildDashboardDataFromSnapshot(
      {
        todayRecord: null,
        weekRecords: [],
        tasks: [],
        profiles: [memberProfile],
        todayAttendanceRecords: [],
        schedules: [],
      },
      {
        userId: "member-1",
        userName: "Member",
        canViewCompanyWork: false,
        weekStart: "2026-07-13",
        now: new Date("2026-07-13T01:00:00.000Z"),
        completedTaskStatus: "completed",
      },
    );

    assert.deepEqual(result, {
      todayRecord: null,
      weeklyMinutes: 0,
      weekdayWorked: [false, false, false, false, false],
      myTasks: [],
      allTasksForUser: [],
      allTasks: [],
      allProfiles: [memberProfile],
      todayAttendanceRecords: [],
      todaySchedules: [],
      recentActivities: [],
      nextScheduleMinutes: null,
      userName: "Member",
      canViewCompanyWork: false,
    });
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

test("uses one parameterized dashboard snapshot query and preserves the caller profile for employees", () => {
  const source = readFileSync(fastQueriesSource, "utf8");

  assert.match(source, /with parameters as/i);
  assert.match(source, /jsonb_agg/i);
  assert.equal((source.match(/pool\.query/g) ?? []).length, 1);
  assert.doesNotMatch(source, /Promise\.all/);
  assert.match(source, /\$8::jsonb as current_profile/);
  assert.match(source, /else jsonb_build_array\(prm\.current_profile\)/);
  assert.match(source, /JSON\.stringify\(currentProfile\)/);
  assert.match(source, /today_record as \(/);
  assert.match(source, /from today_record/);
});
