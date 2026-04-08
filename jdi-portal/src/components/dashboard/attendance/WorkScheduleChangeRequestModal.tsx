"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "phosphor-react";
import { submitWorkScheduleChangeRequest } from "@/lib/attendance/actions";
import { getErrorMessage } from "@/lib/utils/errors";
import { toDateString } from "@/lib/utils/date";

interface Props {
  currentStart: string;
  currentEnd: string;
  onClose: () => void;
}

export default function WorkScheduleChangeRequestModal({
  currentStart,
  currentEnd,
  onClose,
}: Props) {
  const router = useRouter();
  const today = toDateString();
  const [start, setStart] = useState(currentStart.slice(0, 5));
  const [end, setEnd] = useState(currentEnd.slice(0, 5));
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (effectiveFrom < today) {
      setError("적용 시작일은 오늘 이후여야 합니다.");
      return;
    }
    setSubmitting(true);
    try {
      await submitWorkScheduleChangeRequest({
        startTime: `${start}:00`,
        endTime: `${end}:00`,
        effectiveFrom,
        reason,
      });
      router.refresh();
      onClose();
    } catch (e) {
      setError(getErrorMessage(e, "변경 요청 제출에 실패했습니다."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">근무시간 변경 요청</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          요청은 대표 승인 후 지정한 적용 시작일부터 반영됩니다.
        </p>

        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">출근</label>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">퇴근</label>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">적용 시작일</label>
            <input
              type="date"
              value={effectiveFrom}
              min={today}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">사유 (선택)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              placeholder="예: 5월부터 출근시간 조정"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-500 disabled:opacity-40"
          >
            {submitting ? "제출 중..." : "요청 제출"}
          </button>
        </div>
      </div>
    </div>
  );
}
