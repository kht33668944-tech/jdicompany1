import type { ProjectRef } from "@/lib/projects/types";
import type { TaskStatus } from "@/lib/tasks/types";

export type DirectiveKind = "지시" | "요청";
export type DirectiveState = "미확인" | "수락" | "거절";

/** 받는 쪽 카드에 뿌리는 한 건 */
export interface PendingDirective {
  recipient_id: string;
  directive_id: string;
  kind: DirectiveKind;
  title: string;
  body: string;
  priority: string | null;
  due_date: string | null;
  project: ProjectRef | null;
  sender_name: string;
  created_at: string;
}

/** 팝업 아래쪽 "이 사람에게 보낸 지시" 한 건 */
export interface SentDirective {
  recipient_id: string;
  directive_id: string;
  kind: DirectiveKind;
  title: string;
  state: DirectiveState;
  /** state 가 '수락' 일 때만 채워진다. 지시의 진행 상태는 이 값으로 보여준다. */
  task_status: TaskStatus | null;
  decline_reason: string | null;
  created_at: string;
}

/** 표의 이름 옆 배지용 */
export interface DirectivePendingCount {
  user_id: string;
  count: number;
}

export interface CreateDirectiveInput {
  title: string;
  body: string;
  recipientIds: string[];
  priority?: string | null;
  dueDate?: string | null;
  projectId?: string | null;
}
