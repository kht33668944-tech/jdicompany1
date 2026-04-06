"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, FloppyDisk } from "phosphor-react";
import { updateWorkSchedule } from "@/lib/attendance/actions";
import { getErrorMessage } from "@/lib/utils/errors";

interface WorkScheduleCardProps {
  userId: string;
  workStartTime: string | null;
  workEndTime: string | null;
}

function timeToInput(time: string | null, fallback: string): string {
  if (!time) return fallback;
  return time.slice(0, 5);
}

export default function WorkScheduleCard({ userId, workStartTime, workEndTime }: WorkScheduleCardProps) {
  const router = useRouter();
  const [startTime, setStartTime] = useState(timeToInput(workStartTime, "09:00"));
  const [endTime, setEndTime] = useState(timeToInput(workEndTime, "18:00"));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const hasChanges =
    startTime !== timeToInput(workStartTime, "09:00") ||
    endTime !== timeToInput(workEndTime, "18:00");

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await updateWorkSchedule(userId, `${startTime}:00`, `${endTime}:00`);
      setFeedback({ type: "success", message: "근무시간이 저장되었습니다." });
      router.refresh();
    } catch (error) {
      setFeedback({ type: "error", message: getErrorMessage(error, "저장에 실패했습니다.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={20} className="text-slate-400" />
        <h3 className="text-base font-bold text-slate-800">내 근무시간</h3>
        {!workStartTime && (
          <span className="text-xs text-slate-400">(기본값)</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-500 mb-1">출근 시간</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-500 mb-1">퇴근 시간</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
          />
        </div>
        <div className="pt-5">
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FloppyDisk size={16} />
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {feedback.message}
        </div>
      )}
    </div>
  );
}
