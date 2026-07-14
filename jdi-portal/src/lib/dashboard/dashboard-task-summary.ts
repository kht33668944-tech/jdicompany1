import type { Profile } from "../attendance/types";
import type { TaskPriority, TaskStatus } from "../tasks/types";
import { addDays, toDateString, toDateStringFromTimestamp } from "@/lib/utils/date";

export const DASHBOARD_TASK_SUMMARY_LIMIT = 100;
export const DASHBOARD_TASK_SUMMARY_FETCH_LIMIT = 101;

export interface DashboardTaskPerson {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  role: "employee" | "developer" | "admin";
}

export interface DashboardTaskAssigneeSummary {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

export interface DashboardTaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  start_date: string | null;
  position: number | null;
  parent_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  assignees: DashboardTaskAssigneeSummary[];
}

export interface DashboardTaskSummaryResult {
  tasks: DashboardTaskSummary[];
  truncated: boolean;
  profiles: DashboardTaskPerson[];
  today: string;
}

export interface DashboardTaskSummaryWindow {
  today: string;
  dayStart: string;
  nextDayStart: string;
}

export class DashboardTaskSummaryContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardTaskSummaryContractError";
  }
}

const TASK_STATUSES = new Set<TaskStatus>(["대기", "진행중", "완료"]);
const TASK_PRIORITIES = new Set<TaskPriority>(["긴급", "높음", "보통", "낮음"]);
const TASK_PERSON_ROLES = new Set<DashboardTaskPerson["role"]>([
  "employee",
  "developer",
  "admin",
]);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const MICROSECONDS_PER_SECOND = BigInt(1_000_000);
const SECONDS_PER_DAY = BigInt(86_400);

function contractFailure(message: string): never {
  throw new DashboardTaskSummaryContractError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    return contractFailure(`${field} must be a non-empty string`);
  }
  return value;
}

function readNullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return readString(value, field);
}

function isCanonicalDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function readNullableDate(value: unknown, field: string): string | null {
  if (value === null) return null;
  const date = readString(value, field);
  if (!isCanonicalDate(date)) contractFailure(`${field} must be a canonical date`);
  return date;
}

function isCanonicalTimestamp(value: string): boolean {
  const parts = value.match(ISO_TIMESTAMP_PATTERN);
  if (!parts) return false;
  if (!isCanonicalDate(`${parts[1]}-${parts[2]}-${parts[3]}`)) return false;

  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6]);
  if (hour > 23 || minute > 59 || second > 59) return false;

  const offset = parts[8];
  if (offset !== "Z") {
    const offsetHour = Number(offset.slice(1, 3));
    const offsetMinute = Number(offset.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }

  return true;
}

function daysFromCivilDate(year: bigint, month: bigint, day: bigint): bigint {
  const adjustedYear = year - (month <= BigInt(2) ? BigInt(1) : BigInt(0));
  const era = adjustedYear >= BigInt(0)
    ? adjustedYear / BigInt(400)
    : (adjustedYear - BigInt(399)) / BigInt(400);
  const yearOfEra = adjustedYear - era * BigInt(400);
  const adjustedMonth = month + (month > BigInt(2) ? BigInt(-3) : BigInt(9));
  const dayOfYear = (BigInt(153) * adjustedMonth + BigInt(2)) / BigInt(5) + day - BigInt(1);
  const dayOfEra = yearOfEra * BigInt(365)
    + yearOfEra / BigInt(4)
    - yearOfEra / BigInt(100)
    + dayOfYear;
  return era * BigInt(146097) + dayOfEra - BigInt(719468);
}

function timestampToEpochMicroseconds(timestamp: string): bigint {
  const parts = timestamp.match(ISO_TIMESTAMP_PATTERN);
  if (!parts || !isCanonicalTimestamp(timestamp)) {
    return contractFailure("timestamp must be canonical");
  }

  const [, year, month, day, hour, minute, second, fraction = "", offset] = parts;
  const localSeconds = daysFromCivilDate(
    BigInt(year),
    BigInt(month),
    BigInt(day)
  ) * SECONDS_PER_DAY
    + BigInt(hour) * BigInt(3_600)
    + BigInt(minute) * BigInt(60)
    + BigInt(second);
  const offsetSeconds = offset === "Z"
    ? BigInt(0)
    : (offset[0] === "-" ? BigInt(-1) : BigInt(1))
      * (BigInt(offset.slice(1, 3)) * BigInt(3_600)
        + BigInt(offset.slice(4, 6)) * BigInt(60));
  const microseconds = BigInt(fraction.padEnd(6, "0") || "0");

  return (localSeconds - offsetSeconds) * MICROSECONDS_PER_SECOND + microseconds;
}

function compareCanonicalTimestamps(left: string, right: string): number {
  const leftMicroseconds = timestampToEpochMicroseconds(left);
  const rightMicroseconds = timestampToEpochMicroseconds(right);
  if (leftMicroseconds === rightMicroseconds) return 0;
  return leftMicroseconds < rightMicroseconds ? -1 : 1;
}

function readNullableTimestamp(value: unknown, field: string): string | null {
  if (value === null) return null;
  const timestamp = readString(value, field);
  if (!isCanonicalTimestamp(timestamp)) {
    contractFailure(`${field} must be a canonical timestamp`);
  }
  return timestamp;
}

function readTimestamp(value: unknown, field: string): string {
  const timestamp = readNullableTimestamp(value, field);
  if (timestamp === null) contractFailure(`${field} must be a timestamp`);
  return timestamp;
}

function readNullableAvatar(
  value: unknown,
  field: string,
  allowUndefined: boolean = false
): string | null {
  if (value === null || (allowUndefined && value === undefined)) return null;
  return readString(value, field);
}

function parseDashboardTaskPerson(value: unknown, field: string): DashboardTaskPerson {
  if (!isRecord(value)) contractFailure(`${field} must be an object`);
  const role = readString(value.role, `${field}.role`);
  if (!TASK_PERSON_ROLES.has(role as DashboardTaskPerson["role"])) {
    contractFailure(`${field}.role is invalid`);
  }

  return {
    id: readString(value.id, `${field}.id`),
    full_name: readString(value.full_name, `${field}.full_name`),
    avatar_url: readNullableAvatar(value.avatar_url, `${field}.avatar_url`, true),
    role: role as DashboardTaskPerson["role"],
  };
}

export function toDashboardTaskPerson(profile: Profile): DashboardTaskPerson {
  return {
    id: profile.id,
    full_name: profile.full_name,
    avatar_url: profile.avatar_url ?? null,
    role: profile.role,
  };
}

export function mapDashboardTaskPeople(rows: unknown): DashboardTaskPerson[] {
  if (!Array.isArray(rows)) contractFailure("profiles must be an array");

  const profiles = rows.map((profile, index) =>
    parseDashboardTaskPerson(profile, `profiles[${index}]`)
  );
  for (let index = 1; index < profiles.length; index += 1) {
    if (profiles[index - 1].id >= profiles[index].id) {
      contractFailure("profiles must be sorted by id without duplicates");
    }
  }
  return profiles;
}

function parseAssignees(value: unknown, field: string): DashboardTaskAssigneeSummary[] {
  if (!Array.isArray(value)) contractFailure(`${field} must be an array`);

  return value.map((assignee, index) => {
    if (!isRecord(assignee)) contractFailure(`${field}[${index}] must be an object`);
    return {
      user_id: readString(assignee.user_id, `${field}[${index}].user_id`),
      full_name: readString(assignee.full_name, `${field}[${index}].full_name`),
      avatar_url: readNullableAvatar(assignee.avatar_url, `${field}[${index}].avatar_url`),
    };
  });
}

function parseDashboardTaskSummary(value: unknown, index: number): DashboardTaskSummary {
  const field = `tasks[${index}]`;
  if (!isRecord(value)) contractFailure(`${field} must be an object`);

  const status = readString(value.status, `${field}.status`);
  if (!TASK_STATUSES.has(status as TaskStatus)) contractFailure(`${field}.status is invalid`);
  const priority = readString(value.priority, `${field}.priority`);
  if (!TASK_PRIORITIES.has(priority as TaskPriority)) {
    contractFailure(`${field}.priority is invalid`);
  }

  let position: number | null;
  if (value.position === null) {
    position = null;
  } else if (typeof value.position === "number"
    && Number.isInteger(value.position)
    && Number.isFinite(value.position)) {
    position = value.position;
  } else {
    contractFailure(`${field}.position must be an integer or null`);
  }

  return {
    id: readString(value.id, `${field}.id`),
    title: readString(value.title, `${field}.title`),
    status: status as TaskStatus,
    priority: priority as TaskPriority,
    due_date: readNullableDate(value.due_date, `${field}.due_date`),
    start_date: readNullableDate(value.start_date, `${field}.start_date`),
    position,
    parent_id: readNullableString(value.parent_id, `${field}.parent_id`),
    created_by: readString(value.created_by, `${field}.created_by`),
    created_at: readTimestamp(value.created_at, `${field}.created_at`),
    updated_at: readTimestamp(value.updated_at, `${field}.updated_at`),
    completed_at: readNullableTimestamp(value.completed_at, `${field}.completed_at`),
    assignees: parseAssignees(value.assignees, `${field}.assignees`),
  };
}

function validateWindow(window: DashboardTaskSummaryWindow): void {
  if (!isCanonicalDate(window.today)) contractFailure("today must be a canonical date");
  if (!isCanonicalTimestamp(window.dayStart) || !isCanonicalTimestamp(window.nextDayStart)) {
    contractFailure("dashboard task window must use canonical timestamps");
  }

  const expectedDayStart = timestampToEpochMicroseconds(`${window.today}T00:00:00+09:00`);
  const expectedNextDayStart = timestampToEpochMicroseconds(
    `${addDays(window.today, 1)}T00:00:00+09:00`
  );
  if (timestampToEpochMicroseconds(window.dayStart) !== expectedDayStart
    || timestampToEpochMicroseconds(window.nextDayStart) !== expectedNextDayStart) {
    contractFailure("dashboard task window must span one KST day");
  }
}

export function getDashboardTaskSummaryWindow(now: Date = new Date()): DashboardTaskSummaryWindow {
  const today = toDateString(now);
  return {
    today,
    dayStart: `${today}T00:00:00+09:00`,
    nextDayStart: `${addDays(today, 1)}T00:00:00+09:00`,
  };
}
export function getDashboardTaskSummaryKstDate(timestamp: string): string {
  return toDateStringFromTimestamp(timestamp);
}


export function getDashboardTaskSummaryClass(
  task: DashboardTaskSummary,
  window: DashboardTaskSummaryWindow
): number | null {
  if ((task.status === "대기" || task.status === "진행중")
    && task.due_date !== null
    && task.due_date < window.today) {
    return 0;
  }
  if ((task.status === "대기" || task.status === "진행중")
    && task.due_date === window.today) {
    return 1;
  }
  if ((task.status === "대기" || task.status === "진행중")
    && task.start_date !== null
    && task.start_date < addDays(window.today, 1)) {
    return 2;
  }
  if ((task.status === "대기" || task.status === "진행중")
    && task.due_date === null
    && task.start_date === null) {
    return 3;
  }
  if (task.status === "완료"
    && task.completed_at !== null
    && compareCanonicalTimestamps(task.completed_at, window.dayStart) >= 0
    && compareCanonicalTimestamps(task.completed_at, window.nextDayStart) < 0) {
    return 4;
  }
  return null;
}

function getRelevantAt(task: DashboardTaskSummary, classRank: number): string {
  switch (classRank) {
    case 0:
    case 1:
      return `${task.due_date}T00:00:00+09:00`;
    case 2:
      return `${task.start_date}T00:00:00+09:00`;
    case 3:
      return task.created_at;
    case 4:
      if (task.completed_at === null) {
        return contractFailure("completed dashboard task is missing completed_at");
      }
      return task.completed_at;
    default:
      return contractFailure("dashboard task class is invalid");
  }
}

function compareNullablePosition(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function compareStrings(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function compareDashboardTaskSummaries(
  left: DashboardTaskSummary,
  right: DashboardTaskSummary,
  window: DashboardTaskSummaryWindow
): number {
  const leftClass = getDashboardTaskSummaryClass(left, window);
  const rightClass = getDashboardTaskSummaryClass(right, window);
  if (leftClass === null || rightClass === null) {
    return contractFailure("dashboard task is outside the summary window");
  }
  if (leftClass !== rightClass) return leftClass - rightClass;

  const leftRelevantAt = getRelevantAt(left, leftClass);
  const rightRelevantAt = getRelevantAt(right, rightClass);
  const relevantAtDifference = compareCanonicalTimestamps(leftRelevantAt, rightRelevantAt);
  if (relevantAtDifference !== 0) {
    return leftClass === 4 ? -relevantAtDifference : relevantAtDifference;
  }

  const statusRank = (status: TaskStatus) => {
    if (status === "진행중") return 0;
    if (status === "대기") return 1;
    return 2;
  };
  const statusDifference = statusRank(left.status) - statusRank(right.status);
  if (statusDifference !== 0) return statusDifference;

  const positionDifference = compareNullablePosition(left.position, right.position);
  if (positionDifference !== 0) return positionDifference;

  const createdAtDifference = compareCanonicalTimestamps(left.created_at, right.created_at);
  if (createdAtDifference !== 0) return createdAtDifference;

  return compareStrings(left.id, right.id);
}

function validateAssignees(
  task: DashboardTaskSummary,
  approvedProfiles: Map<string, DashboardTaskPerson>
): void {
  for (let index = 0; index < task.assignees.length; index += 1) {
    const assignee = task.assignees[index];
    const profile = approvedProfiles.get(assignee.user_id);
    if (!profile) {
      contractFailure(`tasks assignee ${assignee.user_id} is not an approved profile`);
    }
    if (profile.full_name !== assignee.full_name || (profile.avatar_url ?? null) !== assignee.avatar_url) {
      contractFailure(`tasks assignee ${assignee.user_id} does not match its approved profile`);
    }
    if (index > 0 && task.assignees[index - 1].user_id >= assignee.user_id) {
      contractFailure("task assignees must be sorted by user_id without duplicates");
    }
  }
}

export function normalizeDashboardTaskSummaryResult(
  rawRows: unknown,
  rawProfiles: unknown,
  window: DashboardTaskSummaryWindow
): DashboardTaskSummaryResult {
  validateWindow(window);
  if (!Array.isArray(rawRows)) contractFailure("tasks must be an array");
  if (rawRows.length > DASHBOARD_TASK_SUMMARY_FETCH_LIMIT) {
    contractFailure("dashboard task summary exceeds the fetch limit");
  }

  const profiles = mapDashboardTaskPeople(rawProfiles);
  const approvedProfiles = new Map(profiles.map((profile) => [profile.id, profile]));
  const rows = rawRows.map((row, index) => parseDashboardTaskSummary(row, index));

  for (let index = 0; index < rows.length; index += 1) {
    const task = rows[index];
    validateAssignees(task, approvedProfiles);
    if (getDashboardTaskSummaryClass(task, window) === null) {
      contractFailure(`tasks[${index}] is outside the dashboard summary window`);
    }
    if (index > 0 && compareDashboardTaskSummaries(rows[index - 1], task, window) > 0) {
      contractFailure("dashboard task summary rows are not in canonical order");
    }
  }

  return {
    tasks: rows.slice(0, DASHBOARD_TASK_SUMMARY_LIMIT),
    truncated: rows.length === DASHBOARD_TASK_SUMMARY_FETCH_LIMIT,
    profiles,
    today: window.today,
  };
}
export function normalizeDashboardTaskSummarySnapshot(
  rawSnapshot: unknown,
  window: DashboardTaskSummaryWindow
): DashboardTaskSummaryResult {
  if (!isRecord(rawSnapshot)) {
    return contractFailure("dashboard task summary snapshot must be an object");
  }

  return normalizeDashboardTaskSummaryResult(
    rawSnapshot.tasks,
    rawSnapshot.profiles,
    window
  );
}
