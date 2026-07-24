"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowSquareOut,
  CaretDown,
  CaretUp,
  ChatCircleText,
  CheckCircle,
  Prohibit,
  XCircle,
} from "phosphor-react";
import { toast } from "sonner";
import UserAvatar from "@/components/shared/UserAvatar";
import {
  approveReview,
  cancelReview,
  rejectReview,
  requestReview,
} from "@/lib/work-timeline/reviewActions";
import { REVIEW_COMMENT_MAX_LENGTH, REVIEW_STATE_LABELS } from "@/lib/work-timeline/constants";
import type { ReviewEventKind, WorkTimelineReviewWithEvents } from "@/lib/work-timeline/types";
import { TASK_STATUS_CONFIG } from "@/lib/tasks/constants";
import type { TaskStatus } from "@/lib/tasks/types";

interface WorkTimelineReviewSectionProps {
  entryId: string;
  entryOwnerId: string;
  currentUserId: string;
  currentUserRole: string;
  initialReview: WorkTimelineReviewWithEvents | null;
}

const STATE_BADGE_TONE_CLASSES: Record<string, string> = {
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  slate: "border-slate-200 bg-slate-100 text-slate-600",
};

function formatEventAt(timestamp: string): string {
  return new Date(timestamp).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function eventLabel(kind: ReviewEventKind): string {
  switch (kind) {
    case "requested":
      return "검토를 요청했습니다";
    case "submitted":
      return "보완 할일을 완료했습니다";
    case "approved":
      return "승인했습니다 — 검토 완료";
    case "rejected":
      return "반려했습니다 — 재보완 필요";
    case "cancelled":
      return "검토 요청을 취소했습니다";
    default:
      return "";
  }
}

export default function WorkTimelineReviewSection({
  entryId,
  entryOwnerId,
  currentUserId,
  currentUserRole,
  initialReview,
}: WorkTimelineReviewSectionProps) {
  const review = initialReview;
  const canRequest = currentUserRole === "admin" || entryOwnerId === currentUserId;
  const isReviewer = review !== null
    && (review.reviewer_id === currentUserId || currentUserRole === "admin");
  const isActive = review !== null && (review.state === "open" || review.state === "submitted");
  const isTerminal = review !== null && (review.state === "approved" || review.state === "cancelled");
  const showRequestForm = canRequest && !isActive;

  // 검토가 없고 요청 권한도 없으면(=이 화면에 볼 것이 없으면) 섹션 자체를 표시하지 않는다.
  if (!review && !canRequest) return null;

  const reopenedAfterRejection = review !== null
    && review.state === "open"
    && review.events[review.events.length - 1]?.kind === "rejected";

  return (
    <section className="mt-5 overflow-hidden rounded-lg border-t-2 border-t-indigo-500 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-7">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="h-4 w-1.5 rounded-sm bg-indigo-500" aria-hidden="true" />
          검토
        </h2>
        {review && <StateBadge state={review.state} reopenedAfterRejection={reopenedAfterRejection} />}
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-7">
        {review && (
          <ReviewCard review={review} isReviewer={isReviewer} collapsedTimeline={isTerminal} />
        )}

        {showRequestForm && (
          <ReviewRequestForm entryId={entryId} hasPriorReview={review !== null} />
        )}
      </div>
    </section>
  );
}

function StateBadge({
  state,
  reopenedAfterRejection,
}: {
  state: WorkTimelineReviewWithEvents["state"];
  reopenedAfterRejection: boolean;
}) {
  const config = REVIEW_STATE_LABELS[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${STATE_BADGE_TONE_CLASSES[config.tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {config.label}
      {reopenedAfterRejection && " (반려됨)"}
    </span>
  );
}

function ReviewCard({
  review,
  isReviewer,
  collapsedTimeline,
}: {
  review: WorkTimelineReviewWithEvents;
  isReviewer: boolean;
  collapsedTimeline: boolean;
}) {
  const router = useRouter();
  const [timelineOpen, setTimelineOpen] = useState(!collapsedTimeline);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [approving, setApproving] = useState(false);
  const [submittingReject, setSubmittingReject] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleApprove = async () => {
    setApproving(true);
    try {
      await approveReview(review.id);
      toast.success("검토를 승인했습니다.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "승인하지 못했습니다.");
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectNote.trim()) {
      toast.error("반려 사유를 입력해 주세요.");
      return;
    }
    setSubmittingReject(true);
    try {
      await rejectReview(review.id, rejectNote);
      toast.success("반려하고 재보완을 요청했습니다.");
      setRejecting(false);
      setRejectNote("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "반려하지 못했습니다.");
    } finally {
      setSubmittingReject(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelReview(review.id);
      toast.success("검토 요청을 취소했습니다.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "취소하지 못했습니다.");
    } finally {
      setCancelling(false);
    }
  };

  const taskStatusConfig = review.task_status
    ? TASK_STATUS_CONFIG[review.task_status as TaskStatus]
    : null;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3.5">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500">
          <UserAvatar name={review.reviewer_name ?? "알 수 없음"} size="xs" />
          {review.reviewer_name ?? "알 수 없음"} 검토 의견 · {formatEventAt(review.created_at)}
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
          {review.comment}
        </p>
      </div>

      {review.task_id && (
        <Link
          href={`/dashboard/tasks/${review.task_id}`}
          className="flex items-center gap-3 rounded-md border border-indigo-200 bg-indigo-50 px-4 py-3 hover:bg-indigo-100"
        >
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-white shadow-sm">
            <CheckCircle size={18} weight="bold" className="text-indigo-600" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold text-indigo-600">보완 할일</span>
            <span className="block truncate text-sm font-bold text-slate-800">보완 할일 열기</span>
          </span>
          {taskStatusConfig && (
            <span
              className={`flex-none rounded-md px-2 py-0.5 text-xs font-bold ${taskStatusConfig.bg} ${taskStatusConfig.text}`}
            >
              {review.task_status}
            </span>
          )}
          <ArrowSquareOut size={16} className="flex-none text-indigo-500" aria-hidden="true" />
        </Link>
      )}

      {review.events.length > 0 && (
        <div>
          {collapsedTimeline && (
            <button
              type="button"
              onClick={() => setTimelineOpen((value) => !value)}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700"
            >
              {timelineOpen ? <CaretUp size={13} aria-hidden="true" /> : <CaretDown size={13} aria-hidden="true" />}
              처리 이력 {review.events.length}건
            </button>
          )}
          {timelineOpen && <ReviewTimeline events={review.events} />}
        </div>
      )}

      {isReviewer && review.state === "submitted" && (
        rejecting ? (
          <div className="space-y-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3.5">
            <label className="block text-xs font-bold text-rose-700">반려 사유</label>
            <textarea
              value={rejectNote}
              onChange={(event) => setRejectNote(event.target.value)}
              maxLength={REVIEW_COMMENT_MAX_LENGTH}
              rows={3}
              placeholder="다시 보완이 필요한 이유를 입력해 주세요."
              className="w-full resize-y rounded-md border border-rose-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRejecting(false);
                  setRejectNote("");
                }}
                disabled={submittingReject}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={submittingReject}
                className="rounded-md bg-rose-600 px-3 py-2 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {submittingReject ? "반려하는 중..." : "반려하기"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3.5 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50"
            >
              <XCircle size={16} aria-hidden="true" />
              반려
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              <CheckCircle size={16} weight="bold" aria-hidden="true" />
              {approving ? "승인하는 중..." : "승인 (검토 완료)"}
            </button>
          </div>
        )
      )}

      {isReviewer && review.state === "open" && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Prohibit size={16} aria-hidden="true" />
            {cancelling ? "취소하는 중..." : "요청 취소"}
          </button>
        </div>
      )}
    </div>
  );
}

function ReviewTimeline({ events }: { events: WorkTimelineReviewWithEvents["events"] }) {
  return (
    <ol className="mt-3 space-y-0">
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        const dotClass = event.kind === "rejected"
          ? "bg-rose-500"
          : event.kind === "approved" || event.kind === "submitted"
            ? "bg-emerald-500"
            : "bg-indigo-500";
        return (
          <li key={event.id} className="relative pb-4 pl-5 last:pb-0">
            {!isLast && (
              <span className="absolute left-[3px] top-3 h-full w-px bg-slate-200" aria-hidden="true" />
            )}
            <span className={`absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
            <p className="text-[11px] font-semibold text-slate-400">{formatEventAt(event.created_at)}</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-700">
              <span className="font-bold">{event.actor_name ?? "알 수 없음"}</span>
              님이 {eventLabel(event.kind)}
            </p>
            {event.note && event.kind !== "requested" && (
              <p className="mt-1.5 rounded-r border-l-2 border-rose-300 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                {event.note}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ReviewRequestForm({
  entryId,
  hasPriorReview,
}: {
  entryId: string;
  hasPriorReview: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasPriorReview);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!comment.trim()) {
      toast.error("검토 의견을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      await requestReview(entryId, comment);
      toast.success("검토 요청을 보냈습니다.");
      setComment("");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "검토 요청을 보내지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (hasPriorReview && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
      >
        <ChatCircleText size={16} aria-hidden="true" />
        새 검토 요청 보내기
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-slate-500">검토 의견 (보완 요청 내용)</label>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={REVIEW_COMMENT_MAX_LENGTH}
        rows={4}
        placeholder="예) 세금계산서 처리 일정과 담당자를 표기해 주세요."
        className="w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
      <div className="flex justify-end gap-2">
        {hasPriorReview && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setComment("");
            }}
            disabled={submitting}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            취소
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {submitting ? "보내는 중..." : "검토 요청 보내기"}
        </button>
      </div>
    </div>
  );
}
