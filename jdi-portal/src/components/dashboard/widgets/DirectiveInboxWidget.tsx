"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, SpinnerGap, X } from "phosphor-react";
import { toast } from "sonner";
import type { TodayAttendanceStatus } from "@/lib/attendance/types";
import type { PendingDirective } from "@/lib/directives/types";
import { DIRECTIVE_KIND_CONFIG } from "@/lib/directives/constants";
import { acceptDirective, declineDirective } from "@/lib/directives/actions";
import { getErrorMessage } from "@/lib/utils/errors";
import { formatDueDate } from "@/lib/tasks/utils";

interface Props {
  userId: string;
  directives: PendingDirective[];
  attendanceStatuses: TodayAttendanceStatus[];
}

function hasCheckedIn(statuses: TodayAttendanceStatus[], userId: string): boolean {
  const mine = statuses.find((status) => status.user_id === userId);
  return mine !== undefined && mine.status !== "미출근";
}

export default function DirectiveInboxWidget({ userId, directives, attendanceStatuses }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [expanded, setExpanded] = useState(false);

  if (directives.length === 0) return null;

  const checkedIn = hasCheckedIn(attendanceStatuses, userId);
  const open = checkedIn || expanded;

  const handleAccept = (recipientId: string) => {
    setBusyId(recipientId);
    startTransition(async () => {
      try {
        await acceptDirective(recipientId);
        toast.success("수락했습니다. 오늘 할 일에 추가되었어요.");
        router.refresh();
      } catch (error) {
        toast.error(getErrorMessage(error, "수락하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      } finally {
        setBusyId(null);
      }
    });
  };

  const handleDecline = (recipientId: string) => {
    setBusyId(recipientId);
    startTransition(async () => {
      try {
        await declineDirective(recipientId, reason);
        toast.success("거절했습니다.");
        setDeclineFor(null);
        setReason("");
        router.refresh();
      } catch (error) {
        toast.error(getErrorMessage(error, "거절하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      } finally {
        setBusyId(null);
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-left hover:border-indigo-300 focus-visible:outline-2 focus-visible:outline-indigo-500"
      >
        <span className="text-sm font-semibold text-slate-700">
          확인할 업무지시 {directives.length}건
        </span>
        <span className="text-xs text-slate-400">출근 후 확인해 주세요 · 눌러서 펼치기</span>
      </button>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-800">
          업무지시
          <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">
            {directives.length}
          </span>
        </h2>
        <p className="text-xs text-slate-400">수락하면 오늘 할 일에 추가됩니다</p>
      </header>

      <ul>
        {directives.map((directive) => {
          const config = DIRECTIVE_KIND_CONFIG[directive.kind];
          const busy = busyId === directive.recipient_id && pending;
          return (
            <li
              key={directive.recipient_id}
              className={`flex flex-col gap-3 border-t border-t-slate-100 border-l-[3px] px-5 py-4 first:border-t-0 sm:flex-row sm:items-start sm:gap-4 ${config.accent}`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span
                  className={`self-start rounded-full border px-2 py-0.5 text-[11px] font-bold ${config.badge}`}
                >
                  {config.label}
                </span>
                <p className="text-sm font-semibold text-slate-800">{directive.title}</p>
                <p className="whitespace-pre-line text-xs leading-relaxed text-slate-500">
                  {directive.body}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                  <span>{directive.sender_name}</span>
                  {directive.due_date && (
                    <span
                      className={`rounded-full bg-slate-100 px-1.5 py-0.5 ${formatDueDate(directive.due_date, "대기").className}`}
                    >
                      {formatDueDate(directive.due_date, "대기").text}
                    </span>
                  )}
                  {directive.priority && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-500">
                      중요도 {directive.priority}
                    </span>
                  )}
                  {directive.project && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-white"
                      style={{ backgroundColor: directive.project.color }}
                    >
                      {directive.project.name}
                    </span>
                  )}
                </div>

                {declineFor === directive.recipient_id && (
                  <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="거절 사유를 입력해 주세요"
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-2 focus:outline-indigo-500"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDecline(directive.recipient_id)}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      거절 보내기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeclineFor(null);
                        setReason("");
                      }}
                      className="rounded-lg px-2 py-1.5 text-xs text-slate-400"
                      aria-label="거절 취소"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-2 sm:w-auto sm:flex-col">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleAccept(directive.recipient_id)}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50 sm:flex-none"
                >
                  {busy ? <SpinnerGap size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  수락
                </button>
                {config.canDecline && declineFor !== directive.recipient_id && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDeclineFor(directive.recipient_id)}
                    className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 disabled:opacity-50 sm:flex-none"
                  >
                    거절
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
