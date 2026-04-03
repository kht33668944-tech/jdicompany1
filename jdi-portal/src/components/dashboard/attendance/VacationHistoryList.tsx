"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClockCounterClockwise } from "phosphor-react";
import { cancelVacationRequest, requestVacationCancel } from "@/lib/attendance/actions";
import { getVacationTypeLabel } from "@/lib/utils/vacation";
import { getErrorMessage } from "@/lib/utils/errors";
import type { RequestStatus, VacationRequest } from "@/lib/attendance/types";

interface VacationHistoryListProps {
  requests: VacationRequest[];
}

const statusConfig: Record<RequestStatus, { bg: string; text: string }> = {
  "대기중": { bg: "bg-amber-50", text: "text-amber-600" },
  "승인": { bg: "bg-emerald-50", text: "text-emerald-600" },
  "반려": { bg: "bg-red-50", text: "text-red-600" },
  "취소요청": { bg: "bg-orange-50", text: "text-orange-600" },
  "취소": { bg: "bg-slate-50", text: "text-slate-500" },
};

export default function VacationHistoryList({ requests }: VacationHistoryListProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleCancel = async (id: string) => {
    if (!confirm("휴가 신청을 취소하시겠습니까?")) return;
    setFeedback(null);
    try {
      await cancelVacationRequest(id);
      router.refresh();
    } catch (error) {
      setFeedback(getErrorMessage(error, "휴가 신청 취소에 실패했습니다."));
    }
  };

  const handleRequestCancel = async (id: string) => {
    if (!confirm("승인된 휴가의 취소를 요청하시겠습니까? 관리자 승인 후 취소됩니다.")) return;
    setFeedback(null);
    try {
      await requestVacationCancel(id);
      router.refresh();
    } catch (error) {
      setFeedback(getErrorMessage(error, "취소 요청에 실패했습니다."));
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <ClockCounterClockwise size={20} className="text-slate-400" />
        <h3 className="text-base font-bold text-slate-800">신청 이력</h3>
      </div>

      {feedback && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {feedback}
        </div>
      )}

      {requests.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">신청 이력이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {requests.slice(0, 10).map((req) => {
            const config = statusConfig[req.status] ?? statusConfig["대기중"];
            return (
              <li key={req.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">
                      {getVacationTypeLabel(req.vacation_type)}
                    </span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
                      {req.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {req.start_date} ~ {req.end_date} ({req.days_count}일)
                  </p>
                  {req.reject_reason && (
                    <p className="text-xs text-red-400 mt-0.5">사유: {req.reject_reason}</p>
                  )}
                </div>
                {req.status === "대기중" && (
                  <button
                    onClick={() => handleCancel(req.id)}
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors shrink-0 ml-2"
                  >
                    취소
                  </button>
                )}
                {req.status === "승인" && (
                  <button
                    onClick={() => handleRequestCancel(req.id)}
                    className="text-xs text-slate-400 hover:text-orange-500 transition-colors shrink-0 ml-2"
                  >
                    취소 요청
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
