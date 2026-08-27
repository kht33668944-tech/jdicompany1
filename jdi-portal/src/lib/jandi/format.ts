/**
 * 보고 데이터를 잔디 페이로드로 조립한다.
 *
 * activity 도메인의 format.ts 와 같은 발상: 조회는 사실만 가져오고, 한국어 문장은
 * 전부 여기서 만든다. 그래서 문구를 바꿀 때 DB 도 쿼리도 건드릴 필요가 없다.
 *
 * 이 파일은 순수 함수만 둔다 — 네트워크도 DB 도 Date.now() 도 쓰지 않는다.
 * 시각이 필요하면 인자로 받는다. 그래야 전부 테스트로 고정할 수 있다.
 */

import type {
  JandiConnectInfo,
  JandiPayload,
  ReportData,
  ReportSlot,
  ReportTask,
} from "./types";

const MAX_ITEMS = 5;
const MAX_TITLE = 40;
const COLOR_DEFAULT = "#1F8CE6";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 이 시각(KST) 이전이면 점심 보고로 본다. */
const NOON_SLOT_UNTIL_HOUR = 15;

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function toKst(iso: string | Date): Date {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(date.getTime() + KST_OFFSET_MS);
}

export function resolveSlot(now: Date): ReportSlot {
  return toKst(now).getUTCHours() < NOON_SLOT_UNTIL_HOUR ? "noon" : "evening";
}

function truncate(title: string): string {
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE)}…` : title;
}

function assigneeLabel(names: string[]): string {
  if (names.length === 0) return "담당자 미지정";
  if (names.length === 1) return names[0];
  return `${names[0]} 외 ${names.length - 1}명`;
}

/** 목록을 최대 5줄로 자르고 초과분은 "· 외 N건" 한 줄로 요약한다. */
function bulletList(lines: string[]): string {
  const shown = lines.slice(0, MAX_ITEMS).map((line) => `· ${line}`);
  if (lines.length > MAX_ITEMS) {
    shown.push(`· 외 ${lines.length - MAX_ITEMS}건`);
  }
  return shown.join("\n");
}

/** YYYY-MM-DD 두 개의 날짜 차이(일). a - b */
function dayDiff(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

function isCompletedToday(task: ReportTask, today: string): boolean {
  if (!task.completedAt) return false;
  return toKst(task.completedAt).toISOString().slice(0, 10) === today;
}

function formatTime(iso: string, isAllDay: boolean): string {
  if (isAllDay) return "종일";
  const kst = toKst(iso);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatHeader(data: ReportData, slot: ReportSlot): string {
  const kst = toKst(data.now);
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const weekday = WEEKDAY_KO[kst.getUTCDay()];
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  const label = slot === "noon" ? "점심 현황" : "하루 마감";
  return `📋 JDI ${label} · ${month}월 ${day}일(${weekday}) ${hh}:${mm}`;
}

function buildBlocks(data: ReportData, slot: ReportSlot): JandiConnectInfo[] {
  const blocks: JandiConnectInfo[] = [];

  // 1) 오늘 일정 — noon 은 지금 이후 일정만
  //
  // 설계 §4 표에는 일정의 담당자를 "참석자"로 적었으나, schedules 테이블에는 참석자
  // 목록이 없고 created_by(등록자)만 있다. 등록자는 참석자가 아니므로 이름을 붙이면
  // 오히려 틀린 정보가 된다. 그래서 일정 블록은 시각 + 제목만 쓴다.
  const nowMs = Date.parse(data.now);
  const schedules =
    slot === "noon"
      ? data.schedules.filter((s) => s.isAllDay || Date.parse(s.startTime) >= nowMs)
      : data.schedules;
  if (schedules.length > 0) {
    blocks.push({
      title: `🗓 ${slot === "noon" ? "남은 일정" : "오늘 일정"} ${schedules.length}건`,
      description: bulletList(
        schedules.map((s) => `${formatTime(s.startTime, s.isAllDay)} ${truncate(s.title)}`),
      ),
    });
  }

  // 2) 오늘 완료 — evening 만
  const doneToday = data.tasks.filter((t) => isCompletedToday(t, data.today));
  if (slot === "evening" && doneToday.length > 0) {
    blocks.push({
      title: `✅ 오늘 완료 ${doneToday.length}건`,
      description: bulletList(
        doneToday.map((t) => `${truncate(t.title)} — ${assigneeLabel(t.assigneeNames)}`),
      ),
    });
  }

  // 3) 진행 중 — 사람별 건수만 (목록은 길어져서 싣지 않는다)
  const inProgress = data.tasks.filter((t) => t.status === "진행중");
  if (inProgress.length > 0) {
    const counts = new Map<string, number>();
    for (const t of inProgress) {
      const key = assigneeLabel(t.assigneeNames);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const breakdown = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name} ${count}`)
      .join(" · ");
    blocks.push({
      title: `🔄 진행 중 ${inProgress.length}건`,
      description: breakdown,
    });
  }

  // 기한 지남 블록은 두지 않는다(2026-08-27 사용자 요청).
  // 기한이 지난 업무도 '진행 중' 이면 위 블록의 건수에는 그대로 포함된다.

  // 4) 오늘 올라온 업무보고 — evening 만
  if (slot === "evening" && data.entries.length > 0) {
    blocks.push({
      title: `📝 오늘 올라온 업무보고 ${data.entries.length}건`,
      description: bulletList(
        data.entries.map((e) => `${e.authorName ?? "작성자 미상"} — ${truncate(e.title)}`),
      ),
    });
  }

  // 5) 검토 대기
  if (data.reviews.length > 0) {
    blocks.push({
      title: `👀 검토 대기 ${data.reviews.length}건`,
      description: bulletList(
        data.reviews.map((r) => {
          const days = dayDiff(data.today, toKst(r.createdAt).toISOString().slice(0, 10));
          const age = days <= 0 ? "오늘" : `${days + 1}일째`;
          return `${r.authorName ?? "작성자 미상"} → ${r.reviewerName ?? "검토자 미상"} : ${truncate(
            r.entryTitle,
          )} (${age})`;
        }),
      ),
    });
  }

  return blocks;
}

export function buildReport(data: ReportData, slot: ReportSlot): JandiPayload {
  const connectInfo = buildBlocks(data, slot);
  const header = formatHeader(data, slot);

  // 침묵하지 않는다 — 안 오는 것과 고장 난 것을 구분할 수 없기 때문이다.
  const body =
    connectInfo.length === 0 ? `${header}\n\n오늘은 기록된 활동이 없습니다.` : header;

  // 색은 항상 같다. 기한 지남 블록을 없앴으므로(사용자 요청) 빨간색을 쓸 근거가
  // 화면에 남지 않는다 — 이유를 볼 수 없는 경고색은 혼란만 준다.
  return {
    body,
    connectColor: COLOR_DEFAULT,
    connectInfo,
  };
}
