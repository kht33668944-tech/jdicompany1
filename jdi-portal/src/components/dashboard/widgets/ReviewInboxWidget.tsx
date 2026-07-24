"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle, SpinnerGap, X, ArrowSquareOut, PencilSimple } from "phosphor-react";
import { toast } from "sonner";
import type { TodayAttendanceStatus } from "@/lib/attendance/types";
import type { PendingReviewItem } from "@/lib/work-timeline/types";
import { approveReview, rejectReview } from "@/lib/work-timeline/reviewActions";
import { getErrorMessage } from "@/lib/utils/errors";
import { formatTimeAgo } from "@/lib/utils/date";

interface Props {
  toFix: PendingReviewItem[];
  toConfirm: PendingReviewItem[];
  attendanceStatuses: TodayAttendanceStatus[];
  currentUserId: string;
}

function hasCheckedIn(statuses: TodayAttendanceStatus[], userId: string): boolean {
  const mine = statuses.find((status) => status.user_id === userId);
  return mine !== undefined && mine.status !== "미출근";
}

export default function ReviewInboxWidget({
  toFix,
  toConfirm,
  attendanceStatuses,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [expanded, setExpanded] = useState(false);

  const total = toFix.length + toConfirm.length;
  if (total === 0) return null;

  const checkedIn = hasCheckedIn(attendanceStatuses, currentUserId);
  const open = checkedIn || expanded;

  /** 승인·반려가 공유하는 흐름: 잠금 → 서버 호출 → 알림 → 목록 갱신 */
  const respond = (
    reviewId: string,
    action: () => Promise<void>,
    successText: string,
    failureText: string,
  ) => {
    setBusyId(reviewId);
    startTransition(async () => {
      try {
        await action();
        toast.success(successText);
        setRejectFor(null);
        setReason("");
        router.refresh();
      } catch (error) {
        toast.error(getErrorMessage(error, failureText));
      } finally {
        setBusyId(null);
      }
    });
  };

  const handleApprove = (reviewId: string) =>
    respond(
      reviewId,
      () => approveReview(reviewId),
      "승인했습니다.",
      "승인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );

  const handleReject = (reviewId: string) =>
    respond(
      reviewId,
      () => rejectReview(reviewId, reason),
      "반려했습니다.",
      "반려하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-left hover:border-indigo-300 focus-visible:outline-2 focus-visible:outline-indigo-500"
      >
        <span className="text-sm font-semibold text-slate-700">검토할 업무 {total}건</span>
        <span className="text-xs text-slate-400">출근 후 확인해 주세요 · 눌러서 펼치기</span>
      </button>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-800">
          검토할 업무
          <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">
            {total}
          </span>
        </h2>
        <p className="text-xs text-slate-400">보완할 항목과 확인할 항목을 나눠 보여드려요</p>
      </header>

      {toFix.length > 0 && (
        <div>
          <p className="border-t border-t-slate-100 bg-amber-50/60 px-5 py-2 text-xs font-bold text-amber-700">
            보완할 검토 {toFix.length}건
          </p>
          <ul>
            {toFix.map((item) => (
              <li
                key={item.reviewId}
                className="flex flex-col gap-2 border-t border-t-slate-100 border-l-[3px] border-l-amber-400 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="self-start inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                    <PencilSimple size={12} />
                    보완 필요
                  </span>
                  <p className="text-sm font-semibold text-slate-800">{item.entryTitle}</p>
                  <p className="whitespace-pre-line text-xs leading-relaxed text-slate-500">
                    {item.comment}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                    {item.counterpartName && <span>{item.counterpartName}</span>}
                    <span>{formatTimeAgo(item.createdAt)}</span>
                  </div>
                </div>

                {item.taskId && (
                  <Link
                    href={`/dashboard/tasks/${item.taskId}`}
                    className="inline-flex flex-shrink-0 items-center justify-center gap-1 self-start rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                  >
                    보완 할일 열기
                    <ArrowSquareOut size={14} />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {toConfirm.length > 0 && (
        <div>
          <p className="border-t border-t-slate-100 bg-indigo-50/60 px-5 py-2 text-xs font-bold text-indigo-700">
            확인할 검토 {toConfirm.length}건
          </p>
          <ul>
            {toConfirm.map((item) => {
              const busy = busyId === item.reviewId && pending;
              return (
                <li
                  key={item.reviewId}
                  className="flex flex-col gap-3 border-t border-t-slate-100 border-l-[3px] border-l-indigo-400 px-5 py-4 sm:flex-row sm:items-start sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="self-start rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                      보완 완료됨
                    </span>
                    <p className="text-sm font-semibold text-slate-800">{item.entryTitle}</p>
                    <p className="whitespace-pre-line text-xs leading-relaxed text-slate-500">
                      {item.comment}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                      {item.counterpartName && <span>{item.counterpartName}</span>}
                      <span>{formatTimeAgo(item.createdAt)}</span>
                    </div>

                    {rejectFor === item.reviewId && (
                      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                        <input
                          type="text"
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder="반려 사유를 입력해 주세요"
                          className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:outline-2 focus:outline-indigo-500"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleReject(item.reviewId)}
                          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          반려 보내기
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectFor(null);
                            setReason("");
                          }}
                          className="rounded-lg px-2 py-1.5 text-xs text-slate-400"
                          aria-label="반려 취소"
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
                      onClick={() => handleApprove(item.reviewId)}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50 sm:flex-none"
                    >
                      {busy ? <SpinnerGap size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                      승인
                    </button>
                    {rejectFor !== item.reviewId && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setRejectFor(item.reviewId)}
                        className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 disabled:opacity-50 sm:flex-none"
                      >
                        반려
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
