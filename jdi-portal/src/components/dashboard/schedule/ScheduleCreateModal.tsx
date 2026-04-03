"use client";

import { useState } from "react";
import { X, Buildings, Lock, XCircle } from "phosphor-react";
import ModalContainer from "@/components/shared/ModalContainer";
import type { ScheduleVisibility } from "@/lib/schedule/types";
import type { Profile } from "@/lib/attendance/types";
import { createSchedule } from "@/lib/schedule/actions";
import { SCHEDULE_CATEGORIES, SCHEDULE_CATEGORY_CONFIG } from "@/lib/schedule/constants";

interface ScheduleCreateModalProps {
  userId: string;
  profiles: Profile[];
  defaultDate?: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function ScheduleCreateModal({
  userId,
  profiles,
  defaultDate,
  onClose,
  onCreated,
}: ScheduleCreateModalProps) {
  const [visibility, setVisibility] = useState<ScheduleVisibility>("company");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("INTERNAL");
  const [customCategory, setCustomCategory] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState(defaultDate ?? "");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(defaultDate ?? "");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !startDate || !endDate) return;

    const startISO = isAllDay
      ? `${startDate}T00:00:00+09:00`
      : `${startDate}T${startTime}:00+09:00`;
    const endISO = isAllDay
      ? `${endDate}T23:59:59+09:00`
      : `${endDate}T${endTime}:00+09:00`;

    if (endISO <= startISO) {
      setFeedback("종료 시간이 시작 시간보다 이후여야 합니다.");
      return;
    }

    const finalCategory = category === "__CUSTOM__" ? customCategory.trim() : category;
    if (!finalCategory) {
      setFeedback("카테고리를 입력해주세요.");
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      await createSchedule({
        title: title.trim(),
        description: description.trim() || undefined,
        category: finalCategory,
        startTime: startISO,
        endTime: endISO,
        isAllDay,
        location: location.trim() || undefined,
        visibility,
        createdBy: userId,
        participantIds: participantIds.length > 0 ? participantIds : undefined,
      });
      onCreated();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "일정 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer onClose={onClose} className="bg-white max-h-[90vh] overflow-y-auto shadow-xl border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">새 일정 추가</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <X size={20} />
          </button>
        </div>

        {feedback && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {feedback}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 회사/개인 일정 토글 */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">일정 유형</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVisibility("company")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  visibility === "company"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Buildings size={16} />
                회사 일정
              </button>
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  visibility === "private"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Lock size={16} />
                개인 일정
              </button>
            </div>
            {visibility === "private" && (
              <p className="mt-1.5 text-xs text-amber-600 flex items-center gap-1">
                <Lock size={12} />
                본인만 볼 수 있는 일정입니다
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              placeholder="예: 프로젝트 킥오프 미팅"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">설명</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none h-20"
              placeholder="일정에 대한 상세 내용을 적어주세요."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">카테고리</label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  if (e.target.value !== "__CUSTOM__") setCustomCategory("");
                }}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              >
                {SCHEDULE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {SCHEDULE_CATEGORY_CONFIG[cat].labelKo}
                  </option>
                ))}
                <option value="__CUSTOM__">기타 (직접 입력)</option>
              </select>
              {category === "__CUSTOM__" && (
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none mt-2"
                  placeholder="카테고리명 입력"
                />
              )}
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAllDay}
                  onChange={(e) => setIsAllDay(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-slate-600">종일</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">시작 날짜</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value > endDate) setEndDate(e.target.value);
                }}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                required
              />
            </div>
            {!isAllDay && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">시작 시간</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  required
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">종료 날짜</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                required
              />
            </div>
            {!isAllDay && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">종료 시간</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  required
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              장소 <span className="text-slate-400 font-normal">(선택)</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              placeholder="예: 대회의실 A, Zoom 온라인 회의"
            />
          </div>

          {/* 참여자 */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              참여자 <span className="text-slate-400 font-normal">(선택)</span>
            </label>
            <select
              onChange={(e) => {
                const id = e.target.value;
                if (id && !participantIds.includes(id)) {
                  setParticipantIds([...participantIds, id]);
                }
                e.target.value = "";
              }}
              className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
            >
              <option value="">직원 선택...</option>
              {profiles
                .filter((p) => p.id !== userId && !participantIds.includes(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.department})
                  </option>
                ))}
            </select>
            {participantIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {participantIds.map((id) => {
                  const p = profiles.find((pr) => pr.id === id);
                  return (
                    <span
                      key={id}
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200"
                    >
                      {p?.full_name ?? "알 수 없음"}
                      <button
                        type="button"
                        onClick={() => setParticipantIds(participantIds.filter((pid) => pid !== id))}
                        className="hover:text-red-500 transition-colors"
                      >
                        <XCircle size={14} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !title.trim() || !startDate || !endDate}
            className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-lg shadow-brand-500/20 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "추가 중..." : "일정 추가"}
          </button>
        </form>
    </ModalContainer>
  );
}
