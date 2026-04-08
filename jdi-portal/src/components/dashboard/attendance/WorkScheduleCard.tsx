"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, FloppyDisk, HourglassMedium } from "phosphor-react";
import {
  setInitialWorkSchedule,
  cancelMyWorkScheduleChangeRequest,
  adminSetWorkSchedule,
} from "@/lib/attendance/actions";
import { getErrorMessage } from "@/lib/utils/errors";
import { toDateString } from "@/lib/utils/date";
import { getScheduleForDate } from "@/lib/attendance/stats";
import type {
  WorkSchedule,
  WorkScheduleChangeRequest,
} from "@/lib/attendance/types";
import WorkScheduleChangeRequestModal from "./WorkScheduleChangeRequestModal";

interface Props {
  userId: string;
  isAdmin: boolean;
  workSchedules: WorkSchedule[];
  myChangeRequests: WorkScheduleChangeRequest[];
}

function fmt(t: string) {
  return t.slice(0, 5);
}

export default function WorkScheduleCard({
  userId,
  isAdmin,
  workSchedules,
  myChangeRequests,
}: Props) {
  const router = useRouter();
  const today = toDateString();

  // 비-시드 이력이 0개면 첫 설정 모드
  const hasNonSeedHistory = workSchedules.some((s) => !s.is_initial_seed);

  // 현재 적용 중인 시간
  const current = getScheduleForDate(workSchedules, today);
  const currentStartLabel = fmt(current.workStart);
  const currentEndLabel = fmt(current.workEnd);

  // 미래 예약된 변경 (effective_from > today, 비-시드 행)
  const upcoming = workSchedules
    .filter((s) => !s.is_initial_seed && s.effective_from > today)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));

  const pendingRequest = myChangeRequests.find((r) => r.status === "대기중");

  // 폼 상태 (첫 설정 / 관리자 직접 저장 모드)
  const [start, setStart] = useState(
    hasNonSeedHistory ? currentStartLabel : "09:00"
  );
  const [end, setEnd] = useState(
    hasNonSeedHistory ? currentEndLabel : "18:00"
  );
  const [effectiveFromForAdmin, setEffectiveFromForAdmin] = useState(today);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);

  const handleInitialSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await setInitialWorkSchedule(`${start}:00`, `${end}:00`);
      setFeedback({ type: "success", message: "근무시간이 저장되었습니다." });
      router.refresh();
    } catch (e) {
      setFeedback({ type: "error", message: getErrorMessage(e, "저장에 실패했습니다.") });
    } finally {
      setSaving(false);
    }
  };

  const handleAdminSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await adminSetWorkSchedule({
        userId,
        startTime: `${start}:00`,
        endTime: `${end}:00`,
        effectiveFrom: effectiveFromForAdmin,
      });
      setFeedback({ type: "success", message: "근무시간이 저장되었습니다." });
      router.refresh();
    } catch (e) {
      setFeedback({ type: "error", message: getErrorMessage(e, "저장에 실패했습니다.") });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelRequest = async (id: string) => {
    if (!confirm("대기 중인 변경 요청을 취소하시겠습니까?")) return;
    try {
      await cancelMyWorkScheduleChangeRequest(id);
      router.refresh();
    } catch (e) {
      setFeedback({ type: "error", message: getErrorMessage(e, "취소에 실패했습니다.") });
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={20} className="text-slate-400" />
        <h3 className="text-base font-bold text-slate-800">내 근무시간</h3>
      </div>

      {/* 첫 설정 모드 (직원, 비-시드 이력 0개) */}
      {!hasNonSeedHistory && !isAdmin && (
        <>
          <p className="text-xs text-slate-500 mb-3">
            처음 한 번은 자유롭게 설정할 수 있어요. 이후 변경은 대표 승인이 필요합니다.
          </p>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">출근 시간</label>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">퇴근 시간</label>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </div>
            <div className="pt-5">
              <button onClick={handleInitialSave} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 disabled:opacity-40">
                <FloppyDisk size={16} />
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 일반 직원 — 변경 요청 모드 */}
      {hasNonSeedHistory && !isAdmin && (
        <>
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 mb-3">
            <div className="text-xs text-slate-500 mb-1">현재 적용 중</div>
            <div className="text-sm font-semibold text-slate-700">
              {currentStartLabel} ~ {currentEndLabel}
            </div>
          </div>

          {upcoming.length > 0 && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 mb-3 text-xs">
              <div className="font-semibold text-blue-700 mb-1">예정된 변경</div>
              {upcoming.map((u) => (
                <div key={u.id} className="text-blue-700">
                  {u.effective_from}부터 {fmt(u.work_start_time)} ~ {fmt(u.work_end_time)}
                </div>
              ))}
            </div>
          )}

          {pendingRequest ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <HourglassMedium size={16} className="text-amber-600" />
                <span className="text-xs font-semibold text-amber-700">승인 대기 중</span>
              </div>
              <div className="text-sm text-amber-800">
                {fmt(pendingRequest.requested_start_time)} ~ {fmt(pendingRequest.requested_end_time)}
                <span className="text-xs text-amber-600 ml-2">
                  (적용일: {pendingRequest.effective_from})
                </span>
              </div>
              {pendingRequest.reason && (
                <div className="text-xs text-amber-700 mt-1">사유: {pendingRequest.reason}</div>
              )}
              <button
                onClick={() => handleCancelRequest(pendingRequest.id)}
                className="mt-2 text-xs text-amber-700 underline"
              >
                요청 취소
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowRequestModal(true)}
              className="w-full py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-500"
            >
              변경 요청
            </button>
          )}
        </>
      )}

      {/* 관리자 — 즉시 저장 모드 */}
      {isAdmin && (
        <>
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 mb-3">
            <div className="text-xs text-slate-500 mb-1">현재 적용 중</div>
            <div className="text-sm font-semibold text-slate-700">
              {currentStartLabel} ~ {currentEndLabel}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">출근</label>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">퇴근</label>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">적용 시작일</label>
              <input type="date" value={effectiveFromForAdmin}
                onChange={(e) => setEffectiveFromForAdmin(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </div>
          </div>
          <button onClick={handleAdminSave} disabled={saving}
            className="mt-3 w-full py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-500 disabled:opacity-40">
            {saving ? "저장 중..." : "즉시 저장 (관리자)"}
          </button>
        </>
      )}

      {feedback && (
        <div className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${
          feedback.type === "success"
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {feedback.message}
        </div>
      )}

      {showRequestModal && (
        <WorkScheduleChangeRequestModal
          currentStart={current.workStart}
          currentEnd={current.workEnd}
          onClose={() => setShowRequestModal(false)}
        />
      )}
    </div>
  );
}
