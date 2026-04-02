"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HourglassHigh } from "phosphor-react";
import {
  approveCorrectionRequest,
  approveVacationRequest,
  cancelApprovedVacation,
  rejectCorrectionRequest,
  rejectVacationRequest,
} from "@/lib/attendance/actions";
import { formatTime } from "@/lib/utils/date";
import { getVacationTypeLabel } from "@/lib/utils/vacation";
import type { CorrectionRequest, VacationRequest } from "@/lib/attendance/types";

interface AdminVacationRequestsProps {
  adminId: string;
  vacationRequests: VacationRequest[];
  cancelRequests: VacationRequest[];
  correctionRequests: CorrectionRequest[];
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export default function AdminVacationRequests({
  adminId,
  vacationRequests,
  cancelRequests,
  correctionRequests,
}: AdminVacationRequestsProps) {
  const router = useRouter();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleApproveVacation = async (id: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      await approveVacationRequest(id, adminId);
      router.refresh();
    } catch (error) {
      setFeedback(getErrorMessage(error, "휴가 요청 승인에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const handleRejectVacation = async (id: string) => {
    if (!rejectReason) return;
    setLoading(true);
    setFeedback(null);
    try {
      await rejectVacationRequest(id, adminId, rejectReason);
      setRejectingId(null);
      setRejectReason("");
      router.refresh();
    } catch (error) {
      setFeedback(getErrorMessage(error, "휴가 요청 반려에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelVacation = async (id: string) => {
    if (!confirm("이 휴가를 취소하시겠습니까? 연차가 복원되고 스케줄에서 삭제됩니다.")) return;
    setLoading(true);
    setFeedback(null);
    try {
      await cancelApprovedVacation(id, adminId);
      router.refresh();
    } catch (error) {
      setFeedback(getErrorMessage(error, "휴가 취소에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const handleRejectCancelRequest = async (id: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      await rejectVacationRequest(id, adminId, "취소 요청 거부");
      router.refresh();
    } catch (error) {
      setFeedback(getErrorMessage(error, "처리에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const handleApproveCorrection = async (id: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      await approveCorrectionRequest(id, adminId);
      router.refresh();
    } catch (error) {
      setFeedback(getErrorMessage(error, "정정 요청 승인에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const handleRejectCorrection = async (id: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      await rejectCorrectionRequest(id, adminId);
      router.refresh();
    } catch (error) {
      setFeedback(getErrorMessage(error, "정정 요청 반려에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const totalPending = vacationRequests.length + cancelRequests.length + correctionRequests.length;

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <HourglassHigh size={20} className="text-slate-400" />
        <h3 className="text-base font-bold text-slate-800">대기 중 요청</h3>
        {totalPending > 0 && (
          <span className="bg-red-50 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
            {totalPending}
          </span>
        )}
      </div>

      {feedback && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {feedback}
        </div>
      )}

      {totalPending === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">대기 중인 요청이 없습니다.</p>
      ) : (
        <div className="space-y-5">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-700">휴가 요청</h4>
              <span className="text-xs text-slate-400">{vacationRequests.length}건</span>
            </div>
            {vacationRequests.length === 0 ? (
              <p className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-400">
                처리할 휴가 요청이 없습니다.
              </p>
            ) : (
              <ul className="space-y-3">
                {vacationRequests.map((req) => (
                  <li key={req.id} className="p-3 rounded-xl bg-slate-50/50 border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm font-medium text-slate-700">{req.profiles?.full_name}</span>
                        <span className="text-xs text-slate-400 ml-2">{getVacationTypeLabel(req.vacation_type)}</span>
                      </div>
                      <span className="text-xs text-slate-400">{req.days_count}일</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">
                      {req.start_date} ~ {req.end_date}
                    </p>
                    {req.reason && <p className="text-xs text-slate-500 mb-3">사유: {req.reason}</p>}

                    {rejectingId === req.id ? (
                      <div className="flex gap-2">
                        <input
                          value={rejectReason}
                          onChange={(event) => setRejectReason(event.target.value)}
                          placeholder="반려 사유"
                          className="glass-input flex-1 px-3 py-1.5 rounded-lg text-xs outline-none"
                        />
                        <button onClick={() => handleRejectVacation(req.id)} disabled={loading || !rejectReason} className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg disabled:opacity-40">확인</button>
                        <button onClick={() => { setRejectingId(null); setRejectReason(""); }} className="px-3 py-1.5 bg-slate-200 text-slate-600 text-xs font-medium rounded-lg">취소</button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => handleApproveVacation(req.id)} disabled={loading} className="flex-1 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-40">승인</button>
                        <button onClick={() => setRejectingId(req.id)} disabled={loading} className="flex-1 py-1.5 bg-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-40">반려</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 휴가 취소 요청 */}
          {cancelRequests.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-orange-600">휴가 취소 요청</h4>
                <span className="text-xs text-slate-400">{cancelRequests.length}건</span>
              </div>
              <ul className="space-y-3">
                {cancelRequests.map((req) => (
                  <li key={req.id} className="p-3 rounded-xl bg-orange-50/50 border border-orange-100">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm font-medium text-slate-700">{req.profiles?.full_name}</span>
                        <span className="text-xs text-slate-400 ml-2">{getVacationTypeLabel(req.vacation_type)}</span>
                      </div>
                      <span className="text-xs text-slate-400">{req.days_count}일</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">
                      {req.start_date} ~ {req.end_date}
                    </p>
                    {req.reason && <p className="text-xs text-slate-500 mb-3">사유: {req.reason}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCancelVacation(req.id)}
                        disabled={loading}
                        className="flex-1 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-40"
                      >
                        취소 승인
                      </button>
                      <button
                        onClick={() => handleRejectCancelRequest(req.id)}
                        disabled={loading}
                        className="flex-1 py-1.5 bg-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-40"
                      >
                        거부
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-700">정정 요청</h4>
              <span className="text-xs text-slate-400">{correctionRequests.length}건</span>
            </div>
            {correctionRequests.length === 0 ? (
              <p className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-400">
                처리할 정정 요청이 없습니다.
              </p>
            ) : (
              <ul className="space-y-3">
                {correctionRequests.map((req) => (
                  <li key={req.id} className="p-3 rounded-xl bg-slate-50/50 border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm font-medium text-slate-700">{req.profiles?.full_name}</span>
                        <span className="text-xs text-amber-600 ml-2">{req.request_type}</span>
                      </div>
                      <span className="text-xs text-slate-400">{req.target_date}</span>
                    </div>
                    <div className="mb-3 rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-500">
                      <div className="flex items-center justify-between">
                        <span>요청 출근</span>
                        <span>{formatTime(req.requested_check_in)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span>요청 퇴근</span>
                        <span>{formatTime(req.requested_check_out)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">사유: {req.reason}</p>
                    <div className="flex gap-2">
                      <button onClick={() => handleApproveCorrection(req.id)} disabled={loading} className="flex-1 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-40">승인</button>
                      <button onClick={() => handleRejectCorrection(req.id)} disabled={loading} className="flex-1 py-1.5 bg-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors disabled:opacity-40">반려</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
