"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PaperPlaneTilt } from "phosphor-react";
import { submitVacationRequest } from "@/lib/attendance/actions";
import { getVacationDaysCount } from "@/lib/utils/vacation";
import type { VacationBalance, VacationType } from "@/lib/attendance/types";

interface VacationRequestFormProps {
  userId: string;
  balance: VacationBalance | null;
}

const vacationTypes: { value: VacationType; label: string }[] = [
  { value: "연차", label: "연차" },
  { value: "반차-오전", label: "반차 (오전)" },
  { value: "반차-오후", label: "반차 (오후)" },
  { value: "병가", label: "병가" },
  { value: "특별휴가", label: "특별휴가" },
];

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export default function VacationRequestForm({ userId, balance }: VacationRequestFormProps) {
  const router = useRouter();
  const [type, setType] = useState<VacationType>("연차");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const remainingDays = balance?.remaining_days ?? 0;
  const isHalfDay = type === "반차-오전" || type === "반차-오후";
  const effectiveEndDate = isHalfDay ? startDate : endDate;
  const daysCount = startDate && effectiveEndDate ? getVacationDaysCount(type, startDate, effectiveEndDate) : 0;
  const exceedsBalance = daysCount > remainingDays;
  const invalidRange = Boolean(startDate && effectiveEndDate && startDate > effectiveEndDate);

  const handleTypeChange = (newType: VacationType) => {
    setType(newType);
    setFeedback(null);
    if (newType === "반차-오전" || newType === "반차-오후") {
      if (startDate) setEndDate(startDate);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (invalidRange || exceedsBalance) return;

    setLoading(true);
    setFeedback(null);
    try {
      await submitVacationRequest({
        userId,
        vacationType: type,
        startDate,
        endDate: effectiveEndDate,
        daysCount,
        reason,
      });
      setFeedback({ type: "success", message: "휴가 신청이 접수되었습니다." });
      setType("연차");
      setStartDate("");
      setEndDate("");
      setReason("");
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: getErrorMessage(error, "휴가 신청에 실패했습니다.") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <PaperPlaneTilt size={20} className="text-slate-400" />
        <h3 className="text-base font-bold text-slate-800">휴가 신청</h3>
      </div>

      {feedback && (
        <div
          className={`mb-4 rounded-xl px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">휴가 유형</label>
          <select
            value={type}
            onChange={(event) => handleTypeChange(event.target.value as VacationType)}
            className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
          >
            {vacationTypes.map((vacationType) => (
              <option key={vacationType.value} value={vacationType.value}>
                {vacationType.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setFeedback(null);
                if (isHalfDay) setEndDate(event.target.value);
              }}
              className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">종료일</label>
            <input
              type="date"
              value={effectiveEndDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setFeedback(null);
              }}
              className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              disabled={isHalfDay}
              required
            />
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
          <div className="flex items-center justify-between">
            <span>신청 일수</span>
            <span className="font-semibold text-slate-800">{daysCount || 0}일</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span>남은 연차</span>
            <span className="font-semibold text-brand-600">{remainingDays}일</span>
          </div>
        </div>

        {invalidRange && (
          <p className="text-sm text-red-600">종료일은 시작일보다 빠를 수 없습니다.</p>
        )}
        {!invalidRange && exceedsBalance && (
          <p className="text-sm text-red-600">남은 연차보다 많은 일수를 신청할 수 없습니다.</p>
        )}

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">사유</label>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none h-20"
            placeholder="출장, 병원 방문, 개인 일정 등 필요한 경우 적어주세요."
          />
        </div>

        <button
          type="submit"
          disabled={loading || !startDate || !effectiveEndDate || invalidRange || exceedsBalance}
          className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-lg shadow-brand-500/20 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "신청 중..." : "휴가 신청하기"}
        </button>
      </form>
    </div>
  );
}
