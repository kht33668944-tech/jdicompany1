"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "phosphor-react";
import { submitCorrectionRequest } from "@/lib/attendance/actions";
import { formatDate, formatTime } from "@/lib/utils/date";
import { getErrorMessage } from "@/lib/utils/errors";
import type { AttendanceRecord, CorrectionRequest } from "@/lib/attendance/types";
import ModalContainer from "@/components/shared/ModalContainer";

interface CorrectionRequestModalProps {
  userId: string;
  record?: AttendanceRecord | null;
  targetDate?: string;
  onClose: () => void;
}

type RequestType = CorrectionRequest["request_type"];

export default function CorrectionRequestModal({ userId, record, targetDate: initialDate, onClose }: CorrectionRequestModalProps) {
  const router = useRouter();
  const isMissingMode = !record;
  const [requestType, setRequestType] = useState<RequestType>(isMissingMode ? "기록누락" : "출근시간수정");
  const [selectedDate, setSelectedDate] = useState(initialDate ?? "");
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const workDate = record?.work_date ?? selectedDate;

  const isTimeValid =
    requestType === "출근시간수정" ? !!checkInTime :
    requestType === "퇴근시간수정" ? !!checkOutTime :
    !!checkInTime; // 기록누락: 최소 출근시간 필수

  const isFormValid = !!reason && isTimeValid && !!workDate;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isFormValid) return;
    setLoading(true);
    setFeedback(null);

    try {
      await submitCorrectionRequest({
        userId,
        attendanceRecordId: record?.id ?? null,
        targetDate: workDate,
        requestType,
        requestedCheckIn: checkInTime ? `${workDate}T${checkInTime}:00+09:00` : null,
        requestedCheckOut: checkOutTime ? `${workDate}T${checkOutTime}:00+09:00` : null,
        reason,
      });
      router.refresh();
      onClose();
    } catch (error) {
      setFeedback(getErrorMessage(error, "정정 요청을 저장하지 못했습니다."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer onClose={onClose} maxWidth="max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">
            {isMissingMode ? "기록 누락 신청" : "출퇴근 정정 요청"}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={20} />
          </button>
        </div>

        {record ? (
          <>
            <p className="text-sm text-slate-500 mb-4">{formatDate(record.work_date)}</p>
            <div className="mb-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-800 mb-2">현재 기록</p>
              <div className="flex items-center justify-between">
                <span>출근</span>
                <span>{formatTime(record.check_in)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span>퇴근</span>
                <span>{formatTime(record.check_out)}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="mb-4">
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              날짜 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              required
            />
          </div>
        )}

        {feedback && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {feedback}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isMissingMode ? (
            <input type="hidden" value="기록누락" />
          ) : (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">요청 유형</label>
              <select
                value={requestType}
                onChange={(event) => setRequestType(event.target.value as RequestType)}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              >
                <option value="출근시간수정">출근시간 수정</option>
                <option value="퇴근시간수정">퇴근시간 수정</option>
                <option value="기록누락">기록 누락</option>
              </select>
            </div>
          )}

          {(requestType === "출근시간수정" || requestType === "기록누락") && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                출근 시간 <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={checkInTime}
                onChange={(event) => setCheckInTime(event.target.value)}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                required
              />
            </div>
          )}

          {(requestType === "퇴근시간수정" || requestType === "기록누락") && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                퇴근 시간 {requestType === "퇴근시간수정" && <span className="text-red-500">*</span>}
              </label>
              <input
                type="time"
                value={checkOutTime}
                onChange={(event) => setCheckOutTime(event.target.value)}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                required={requestType === "퇴근시간수정"}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">사유</label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none h-20"
              placeholder="왜 정정이 필요한지, 실제 출근/퇴근 상황이 어땠는지 적어주세요."
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !isFormValid}
            className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-lg shadow-brand-500/20 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "요청 중..." : "정정 요청하기"}
          </button>
        </form>
    </ModalContainer>
  );
}
