"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  DIRECTIVE_BODY_MAX_LENGTH,
  DIRECTIVE_MAX_RECIPIENTS,
  DIRECTIVE_REASON_MAX_LENGTH,
  DIRECTIVE_TITLE_MAX_LENGTH,
} from "./constants";
import type { CreateDirectiveInput, SentDirective } from "./types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function getAuthenticatedContext(): Promise<{ supabase: ServerClient; userId: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("로그인이 필요합니다.");
  return { supabase, userId: data.user.id };
}

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} 값이 올바르지 않습니다.`);
}

export async function createDirective(input: CreateDirectiveInput): Promise<void> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("제목을 입력해 주세요.");
  if (title.length > DIRECTIVE_TITLE_MAX_LENGTH) {
    throw new Error(`제목은 ${DIRECTIVE_TITLE_MAX_LENGTH}자 이하로 입력해 주세요.`);
  }
  if (!body) throw new Error("내용을 입력해 주세요.");
  if (body.length > DIRECTIVE_BODY_MAX_LENGTH) {
    throw new Error(`내용은 ${DIRECTIVE_BODY_MAX_LENGTH}자 이하로 입력해 주세요.`);
  }

  const recipientIds = Array.from(new Set(input.recipientIds));
  if (recipientIds.length === 0) throw new Error("받는 사람을 한 명 이상 선택해 주세요.");
  if (recipientIds.length > DIRECTIVE_MAX_RECIPIENTS) {
    throw new Error(`한 번에 ${DIRECTIVE_MAX_RECIPIENTS}명까지 보낼 수 있습니다.`);
  }
  recipientIds.forEach((id) => assertUuid(id, "받는 사람"));
  if (input.projectId) assertUuid(input.projectId, "프로젝트");

  const { supabase, userId } = await getAuthenticatedContext();

  // kind 는 DB 트리거가 보낸 사람 권한으로 덮어쓴다. 여기서는 자리만 채운다.
  const inserted = await supabase
    .from("work_directives")
    .insert({
      title,
      body,
      kind: "요청",
      priority: input.priority || null,
      due_date: input.dueDate || null,
      project_id: input.projectId || null,
      created_by: userId,
    })
    .select("id, title, kind")
    .single();
  if (inserted.error) throw inserted.error;

  const directive = inserted.data;

  const recipients = await supabase
    .from("work_directive_recipients")
    .insert(recipientIds.map((id) => ({ directive_id: directive.id, user_id: id })));
  if (recipients.error) throw recipients.error;

  // 알림 생성 실패가 지시 등록 자체를 되돌리지 않는다 (업무 도메인 규칙).
  const label = directive.kind === "지시" ? "새 업무지시" : "새 업무 요청";
  const targets = recipientIds.filter((id) => id !== userId);
  if (targets.length > 0) {
    const notified = await supabase.from("notifications").insert(
      targets.map((id) => ({
        user_id: id,
        type: "work_directive",
        title: label,
        body: directive.title,
        link: "/dashboard",
      }))
    );
    if (notified.error) {
      console.error("업무지시 알림 생성 실패", notified.error);
    }
  }

  revalidatePath("/dashboard");
}

export async function acceptDirective(recipientId: string): Promise<void> {
  assertUuid(recipientId, "업무지시");
  const { supabase } = await getAuthenticatedContext();
  const { error } = await supabase.rpc("accept_work_directive", {
    p_recipient_id: recipientId,
  });
  if (error) throw error;
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
}

export async function declineDirective(recipientId: string, reason: string): Promise<void> {
  assertUuid(recipientId, "업무지시");
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("거절 사유를 입력해 주세요.");
  if (trimmed.length > DIRECTIVE_REASON_MAX_LENGTH) {
    throw new Error(`거절 사유는 ${DIRECTIVE_REASON_MAX_LENGTH}자 이하로 입력해 주세요.`);
  }
  const { supabase } = await getAuthenticatedContext();
  const { error } = await supabase.rpc("decline_work_directive", {
    p_recipient_id: recipientId,
    p_reason: trimmed,
  });
  if (error) throw error;
  revalidatePath("/dashboard");
}

interface SentDirectiveRow {
  id: string;
  directive_id: string;
  state: SentDirective["state"];
  decline_reason: string | null;
  created_at: string;
  work_directives: { title: string; kind: SentDirective["kind"] } | null;
  tasks: { status: SentDirective["task_status"] } | null;
}

/**
 * 팝업에서 여는 "이 사람에게 보낸 지시" 목록.
 * 대시보드 첫 화면 예산을 늘리지 않기 위해 초기 로드에 넣지 않고, 팝업을 열 때만 부른다.
 * 클라이언트 컴포넌트가 부르므로 서버 액션이어야 한다.
 *
 * RLS 덕분에 자기가 보낸 지시와 자기가 받은 지시만 돌아온다 (관리자는 전부).
 */
export async function getSentDirectivesFor(targetUserId: string): Promise<SentDirective[]> {
  assertUuid(targetUserId, "직원");
  const { supabase } = await getAuthenticatedContext();
  const { data, error } = await supabase
    .from("work_directive_recipients")
    .select(
      "id, directive_id, state, decline_reason, created_at, work_directives(title, kind), tasks(status)"
    )
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  const rows = (data ?? []) as unknown as SentDirectiveRow[];
  return rows
    .filter((row) => row.work_directives !== null)
    .map((row) => ({
      recipient_id: row.id,
      directive_id: row.directive_id,
      kind: row.work_directives!.kind,
      title: row.work_directives!.title,
      state: row.state,
      task_status: row.state === "수락" ? (row.tasks?.status ?? null) : null,
      decline_reason: row.decline_reason,
      created_at: row.created_at,
    }));
}
