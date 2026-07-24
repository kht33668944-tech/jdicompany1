"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  CaretDown,
  CaretUp,
  ChatCircleText,
  CheckCircle,
  FileArrowUp,
  Paperclip,
  Prohibit,
  X,
  XCircle,
} from "phosphor-react";
import { toast } from "sonner";
import UserAvatar from "@/components/shared/UserAvatar";
import { triggerDownload } from "@/lib/utils/download";
import {
  approveReview,
  cancelReview,
  rejectReview,
  requestReview,
  submitRemediation,
} from "@/lib/work-timeline/reviewActions";
import { cleanupReviewUploads, uploadReviewFilesDirect } from "@/lib/work-timeline/clientUploads";
import {
  REVIEW_COMMENT_MAX_LENGTH,
  REVIEW_MAX_ATTACHMENTS,
  REVIEW_REMEDIATION_MAX_LENGTH,
  REVIEW_STATE_LABELS,
} from "@/lib/work-timeline/constants";
import { isWorkTimelineImage, validateWorkTimelineFile } from "@/lib/work-timeline/utils";
import type {
  ReviewEventKind,
  WorkTimelineReviewAttachment,
  WorkTimelineReviewWithEvents,
} from "@/lib/work-timeline/types";

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
      return "보완을 제출했습니다";
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

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
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
  const isAuthor = review !== null && review.author_id === currentUserId;
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
          <ReviewCard
            review={review}
            entryId={entryId}
            isReviewer={isReviewer}
            isAuthor={isAuthor}
            currentUserId={currentUserId}
            collapsedTimeline={isTerminal}
          />
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
  entryId,
  isReviewer,
  isAuthor,
  currentUserId,
  collapsedTimeline,
}: {
  review: WorkTimelineReviewWithEvents;
  entryId: string;
  isReviewer: boolean;
  isAuthor: boolean;
  currentUserId: string;
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

  const showRemediationForm = isAuthor && review.state === "open";

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

      {showRemediationForm && (
        <RemediationForm
          entryId={entryId}
          reviewId={review.id}
          currentUserId={currentUserId}
          onDone={() => router.refresh()}
        />
      )}

      {isAuthor && !isReviewer && review.state === "submitted" && (
        <p className="rounded-md border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs font-semibold text-indigo-700">
          보완을 제출했습니다. 검토자의 확인을 기다리고 있어요.
        </p>
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

function RemediationForm({
  entryId,
  reviewId,
  currentUserId,
  onDone,
}: {
  entryId: string;
  reviewId: string;
  currentUserId: string;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const availableSlots = REVIEW_MAX_ATTACHMENTS - files.length;
    if (availableSlots <= 0) {
      toast.error(`파일은 최대 ${REVIEW_MAX_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
      return;
    }
    const incoming = Array.from(list).slice(0, availableSlots);
    if (list.length > availableSlots) {
      toast.error(`파일은 최대 ${REVIEW_MAX_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
    }
    const accepted: File[] = [];
    for (const file of incoming) {
      try {
        validateWorkTimelineFile(file);
        accepted.push(file);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "첨부할 수 없는 파일입니다.");
      }
    }
    if (accepted.length > 0) setFiles((current) => [...current, ...accepted]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((current) => current.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!note.trim() && files.length === 0) {
      toast.error("보완 내용이나 파일을 올려 주세요.");
      return;
    }
    setSubmitting(true);
    let uploadedPaths: string[] = [];
    try {
      const attachments = files.length > 0
        ? await uploadReviewFilesDirect({ entryId, userId: currentUserId, files })
        : [];
      uploadedPaths = attachments.map((attachment) => attachment.file_path);
      try {
        await submitRemediation(entryId, reviewId, note, attachments);
      } catch (submitError) {
        // 상태 전이가 실패하면 방금 올린 파일을 정리한다.
        if (uploadedPaths.length > 0) await cleanupReviewUploads(uploadedPaths);
        throw submitError;
      }
      toast.success("보완을 제출했습니다.");
      setNote("");
      setFiles([]);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "보완을 제출하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-indigo-200 bg-indigo-50/50 px-4 py-4">
      <div>
        <label className="mb-1.5 block text-xs font-bold text-indigo-700">보완 내용</label>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={REVIEW_REMEDIATION_MAX_LENGTH}
          rows={4}
          placeholder="어떻게 보완했는지 적어 주세요. 파일만 올려도 됩니다."
          className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <Paperclip size={15} className="flex-none text-slate-400" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{file.name}</span>
              <span className="flex-none text-xs text-slate-400">{formatFileSize(file.size)}</span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                disabled={submitting}
                aria-label={`${file.name} 첨부 제거`}
                className="flex-none rounded p-0.5 text-slate-400 hover:text-rose-500 disabled:opacity-50"
              >
                <X size={15} weight="bold" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => handleSelectFiles(event.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={submitting || files.length >= REVIEW_MAX_ATTACHMENTS}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileArrowUp size={16} aria-hidden="true" />
            파일 첨부
          </button>
          <span className="text-xs font-semibold text-slate-400">
            {files.length}/{REVIEW_MAX_ATTACHMENTS}
          </span>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          <CheckCircle size={16} weight="bold" aria-hidden="true" />
          {submitting ? "제출하는 중..." : "보완 완료"}
        </button>
      </div>
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
            {event.attachments.length > 0 && (
              <ReviewAttachmentList attachments={event.attachments} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function ReviewAttachmentList({ attachments }: { attachments: WorkTimelineReviewAttachment[] }) {
  return (
    <div className="mt-2 space-y-2">
      {attachments.map((attachment) => {
        const isImage = isWorkTimelineImage(attachment.mime_type);
        if (isImage && attachment.url) {
          return (
            <button
              key={attachment.id}
              type="button"
              onClick={() => triggerDownload(attachment.url!, attachment.file_name)}
              className="block overflow-hidden rounded-md border border-slate-200 bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label={`${attachment.file_name} 저장`}
              title={attachment.file_name}
            >
              <Image
                src={attachment.url}
                alt={attachment.file_name}
                width={480}
                height={320}
                unoptimized
                className="max-h-56 w-auto max-w-full object-contain"
              />
            </button>
          );
        }
        return (
          <a
            key={attachment.id}
            href={attachment.url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={attachment.url ? undefined : true}
            className={`flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ${
              attachment.url ? "hover:bg-slate-50" : "cursor-not-allowed opacity-60"
            }`}
          >
            <Paperclip size={15} className="flex-none text-slate-400" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
              {attachment.file_name}
            </span>
            <span className="flex-none text-xs text-slate-400">{formatFileSize(attachment.file_size)}</span>
          </a>
        );
      })}
    </div>
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
