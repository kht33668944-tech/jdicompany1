"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CaretDown,
  CaretUp,
  CheckCircle,
  ClipboardText,
  SpinnerGap,
  X,
  PencilSimple,
} from "phosphor-react";
import { toast } from "sonner";
import type { PendingReviewItem } from "@/lib/work-timeline/types";
import { approveReview, rejectReview } from "@/lib/work-timeline/reviewActions";
import { getErrorMessage } from "@/lib/utils/errors";
import { formatTimeAgo } from "@/lib/utils/date";

interface Props {
  toFix: PendingReviewItem[];
  toConfirm: PendingReviewItem[];
}

/**
 * 대시보드 검토함.
 * 놓치면 안 되는 인박스라 **출근 여부와 상관없이 항상 펼쳐서** 보여 준다(원하면 접을 수 있다).
 * 목록이 길어져도 대시보드가 늘어나지 않도록 3건 남짓 높이에서 칸 안쪽만 스크롤한다.
 */
export default function ReviewInboxWidget({ toFix, toConfirm }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const total = toFix.length + toConfirm.length;
  if (total === 0) return null;

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

  return (
    <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm ring-1 ring-indigo-100">
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        className="flex w-full flex-wrap items-center justify-between gap-2 bg-indigo-50/70 px-5 py-4 text-left hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500"
      >
        <h2 className="flex items-center gap-2 text-base font-bold text-indigo-900">
          <ClipboardText size={20} weight="fill" className="text-indigo-600" aria-hidden="true" />
          검토할 업무
          <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">
            {total}
          </span>
        </h2>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
          {collapsed ? "눌러서 펼치기" : "눌러서 접기"}
          {collapsed
            ? <CaretDown size={14} weight="bold" aria-hidden="true" />
            : <CaretUp size={14} weight="bold" aria-hidden="true" />}
        </span>
      </button>

      {!collapsed && (
        // 3건 남짓만 보이고 나머지는 이 칸 안에서만 스크롤한다 (대시보드 길이 고정).
        // 확인할 검토는 승인/반려 버튼이 붙어 한 건이 더 높으므로 그 높이에 맞춰 잡았다.
        <div className="max-h-[29rem] overflow-y-auto overscroll-contain">
          {toFix.length > 0 && (
            <div>
              <p className="sticky top-0 z-10 border-t border-t-slate-100 bg-amber-50 px-5 py-2 text-xs font-bold text-amber-700">
                보완할 검토 {toFix.length}건
              </p>
              <ul>
                {toFix.map((item) => (
                  <li
                    key={item.reviewId}
                    className="border-t border-t-slate-100 border-l-[3px] border-l-amber-400"
                  >
                    <ReviewItemLink
                      item={item}
                      badge={
                        <span className="self-start inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                          <PencilSimple size={12} aria-hidden="true" />
                          보완 필요
                        </span>
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {toConfirm.length > 0 && (
            <div>
              <p className="sticky top-0 z-10 border-t border-t-slate-100 bg-indigo-50 px-5 py-2 text-xs font-bold text-indigo-700">
                확인할 검토 {toConfirm.length}건
              </p>
              <ul>
                {toConfirm.map((item) => {
                  const busy = busyId === item.reviewId && pending;
                  return (
                    <li
                      key={item.reviewId}
                      className="border-t border-t-slate-100 border-l-[3px] border-l-indigo-400"
                    >
                      {/* 내용은 상세로 가는 링크, 처리 버튼은 그 밖에 둔다 (버튼 눌렀는데 페이지가 넘어가면 안 됨) */}
                      <ReviewItemLink
                        item={item}
                        badge={
                          // 작성자가 직접 보낸 확인 요청과, 지시에 대한 보완 응답을 구분한다 (마이그레이션 118)
                          <span className="self-start rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                            {item.direction === "requested" ? "검토 요청" : "보완 완료됨"}
                          </span>
                        }
                      />

                      <div className="flex flex-col gap-2 px-5 pb-4">
                        {rejectFor === item.reviewId && (
                          <div className="flex flex-col gap-2 sm:flex-row">
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
                              <X size={14} aria-hidden="true" />
                            </button>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleApprove(item.reviewId)}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50 sm:flex-none"
                          >
                            {busy
                              ? <SpinnerGap size={14} className="animate-spin" aria-hidden="true" />
                              : <CheckCircle size={14} aria-hidden="true" />}
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
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** 항목 내용 전체가 업무보고 상세로 가는 링크다 (본문·첨부까지 보고 판단하도록). */
function ReviewItemLink({
  item,
  badge,
}: {
  item: PendingReviewItem;
  badge: React.ReactNode;
}) {
  return (
    <Link
      href={`/dashboard/work-timeline/${item.entryId}`}
      className="flex min-w-0 flex-col gap-1.5 px-5 py-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500"
    >
      {badge}
      <p className="text-sm font-semibold text-slate-800">{item.entryTitle}</p>
      <p className="line-clamp-2 whitespace-pre-line text-xs leading-relaxed text-slate-500">
        {item.comment}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
        {item.counterpartName && <span>{item.counterpartName}</span>}
        <span>{formatTimeAgo(item.createdAt)}</span>
      </div>
    </Link>
  );
}
