import type { DirectiveKind } from "./types";

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
