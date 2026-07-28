import type { ActivityLogEntry } from "./types";

/**
 * 활동 기록(사실) → 화면 문장.
 *
 * 이 파일은 순수 함수만 둔다(React·아이콘 라이브러리 의존 없음).
 * 아이콘은 iconKey 문자열로만 알려주고, 실제 아이콘/색 매핑은 카드 컴포넌트가 한다.
 */

export type ActivityIconKey =
  | "create"
  | "delete"
  | "done"
  | "status"
  | "due"
  | "assignee"
  | "priority"
  | "edit"
  | "schedule"
  | "project"
  | "archive";

export interface ActivityDescription {
  iconKey: ActivityIconKey;
  text: string;
}

/** '2026-03-05' → '3/5'. 활동 줄은 짧아야 해서 date.ts 의 긴 형식 대신 쓴다. */
function shortDate(value: string | null): string {
  if (!value) return "없음";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${Number(match[2])}/${Number(match[3])}`;
}

function quote(value: string): string {
  return `'${value}'`;
}

export function describeActivity(entry: ActivityLogEntry): ActivityDescription {
  const { entity_type, entity_title, action, field, old_value, new_value } = entry;
  const title = quote(entity_title);

  if (entity_type === "project") {
    if (action === "create") return { iconKey: "project", text: `프로젝트 ${title} 등록` };
    if (action === "delete") return { iconKey: "delete", text: `프로젝트 ${title} 삭제` };
    if (field === "title") {
      return { iconKey: "edit", text: `프로젝트 이름 ${quote(old_value ?? "")} → ${quote(new_value ?? "")}` };
    }
    if (field === "archive") {
      return new_value === "true"
        ? { iconKey: "archive", text: `프로젝트 ${title} 보관` }
        : { iconKey: "archive", text: `프로젝트 ${title} 보관 해제` };
    }
    return { iconKey: "edit", text: `프로젝트 ${title} 수정` };
  }

  if (entity_type === "schedule") {
    if (action === "create") return { iconKey: "schedule", text: `일정 ${title} 등록` };
    if (action === "delete") return { iconKey: "delete", text: `일정 ${title} 삭제` };
    if (field === "title") {
      return { iconKey: "edit", text: `일정 이름 ${quote(old_value ?? "")} → ${quote(new_value ?? "")}` };
    }
    if (field === "time") {
      return { iconKey: "due", text: `일정 ${title} 시간 ${old_value ?? "없음"} → ${new_value ?? "없음"}` };
    }
    return { iconKey: "edit", text: `일정 ${title} 수정` };
  }

  // task
  if (action === "create") return { iconKey: "create", text: `${title} 등록` };
  if (action === "delete") return { iconKey: "delete", text: `할일 ${title} 삭제` };

  if (field === "status") {
    if (new_value === "완료") return { iconKey: "done", text: `${title} 완료` };
    return { iconKey: "status", text: `${title} ${old_value ?? "없음"} → ${new_value ?? "없음"}` };
  }
  if (field === "due_date") {
    return { iconKey: "due", text: `${title} 마감 ${shortDate(old_value)} → ${shortDate(new_value)}` };
  }
  if (field === "priority") {
    return { iconKey: "priority", text: `${title} 우선순위 ${old_value ?? "없음"} → ${new_value ?? "없음"}` };
  }
  if (field === "assignee") {
    return new_value
      ? { iconKey: "assignee", text: `${title} 담당자 ${new_value} 지정` }
      : { iconKey: "assignee", text: `${title} 담당자 ${old_value ?? ""} 해제` };
  }
  if (field === "title") {
    return { iconKey: "edit", text: `할일 이름 ${quote(old_value ?? "")} → ${quote(new_value ?? "")}` };
  }
  return { iconKey: "edit", text: `${title} 수정` };
}

/** 눌렀을 때 갈 곳. 삭제된 항목은 갈 곳이 없다. */
export function activityHref(entry: ActivityLogEntry): string | null {
  if (entry.action === "delete") return null;
  if (entry.entity_type === "task") return `/dashboard/tasks/${entry.entity_id}`;
  if (entry.entity_type === "schedule") return "/dashboard/schedule";
  return `/dashboard/tasks?project=${entry.entity_id}`;
}

export interface ActivityGroup {
  key: string;
  /** 대표 줄 (묶음에서 가장 최근 기록) */
  head: ActivityLogEntry;
  /** head 를 포함한 묶음 전체 */
  entries: ActivityLogEntry[];
}

const GROUP_WINDOW_MS = 5 * 60_000;

/**
 * 같은 사람이 같은 대상을 5분 안에 연달아 건드린 기록을 한 줄로 묶는다.
 * (마감일과 담당자를 한 번에 바꾸면 트리거가 2줄을 남기기 때문)
 *
 * entries 는 최신순으로 정렬되어 있다고 가정한다.
 */
export function groupActivities(entries: ActivityLogEntry[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];

  for (const entry of entries) {
    const last = groups[groups.length - 1];
    const sameTarget =
      last !== undefined &&
      last.head.actor_id === entry.actor_id &&
      last.head.entity_id === entry.entity_id &&
      last.head.entity_type === entry.entity_type;
    const withinWindow =
      last !== undefined &&
      new Date(last.entries[last.entries.length - 1].created_at).getTime() -
        new Date(entry.created_at).getTime() <=
        GROUP_WINDOW_MS;

    if (last && sameTarget && withinWindow) {
      last.entries.push(entry);
      continue;
    }

    groups.push({ key: entry.id, head: entry, entries: [entry] });
  }

  return groups;
}
