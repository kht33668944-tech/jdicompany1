/**
 * 최근 활동 로그 (마이그레이션 117).
 *
 * DB(activity_log)에는 "사실"만 담고, 화면에 보여줄 한국어 문장은
 * format.ts 에서 조립한다. 문구를 바꿀 때 마이그레이션이 필요 없도록 한 구조다.
 */

export type ActivityEntityType = "task" | "schedule" | "project";

export type ActivityAction = "create" | "update" | "delete";

export type ActivityField =
  | "status"
  | "due_date"
  | "assignee"
  | "priority"
  | "title"
  | "time"
  | "archive";

export interface ActivityLogEntry {
  id: string;
  actor_id: string | null;
  /** 기록 시점의 이름 스냅샷 (조회할 때 profiles 조인을 없애기 위함) */
  actor_name: string;
  entity_type: ActivityEntityType;
  /** 원본이 삭제돼도 기록이 남도록 FK 를 걸지 않는다 */
  entity_id: string;
  /** 기록 시점의 제목 스냅샷 */
  entity_title: string;
  action: ActivityAction;
  field: ActivityField | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}
