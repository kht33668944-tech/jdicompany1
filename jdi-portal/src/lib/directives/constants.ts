import type { DirectiveKind, SentDirective } from "./types";

export const DIRECTIVE_TITLE_MAX_LENGTH = 200;
export const DIRECTIVE_BODY_MAX_LENGTH = 4000;
export const DIRECTIVE_REASON_MAX_LENGTH = 500;

/** 한 번에 보낼 수 있는 인원 상한 (실수로 전체 발송하는 것을 막는 안전장치) */
export const DIRECTIVE_MAX_RECIPIENTS = 20;

export const DIRECTIVE_KIND_CONFIG: Record<
  DirectiveKind,
  { label: string; badge: string; accent: string; canDecline: boolean }
> = {
  지시: {
    label: "대표님 지시",
    badge: "bg-rose-50 text-rose-700 border-rose-200",
    accent: "border-l-rose-500",
    canDecline: false,
  },
  요청: {
    label: "업무 요청",
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
    accent: "border-l-indigo-300",
    canDecline: true,
  },
};

/**
 * 보낸 지시 한 건을 화면에 뭐라고 표시할지.
 * 수락된 건은 별도 상태를 저장하지 않고 연결된 할일의 상태를 그대로 보여준다.
 */
export function getSentDirectiveStatus(item: SentDirective): { label: string; badge: string } {
  const label = item.state === "수락" ? (item.task_status ?? "수락") : item.state;
  return { label, badge: SENT_DIRECTIVE_BADGE[label] ?? "bg-slate-100 text-slate-500" };
}

const SENT_DIRECTIVE_BADGE: Record<string, string> = {
  미확인: "bg-amber-50 text-amber-700",
  거절: "bg-slate-100 text-slate-500",
  대기: "bg-slate-100 text-slate-600",
  진행중: "bg-amber-50 text-amber-700",
  완료: "bg-emerald-50 text-emerald-700",
};
