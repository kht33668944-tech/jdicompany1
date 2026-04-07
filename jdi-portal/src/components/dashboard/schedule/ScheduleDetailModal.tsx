"use client";

import { useState } from "react";
import { X, PencilSimple, Trash, MapPin, Monitor, Clock, CalendarBlank, User, Lock, Buildings, Users, XCircle } from "phosphor-react";
import ModalContainer from "@/components/shared/ModalContainer";
import { updateScheduleWithParticipants, deleteSchedule } from "@/lib/schedule/actions";
import { SCHEDULE_CATEGORIES, SCHEDULE_CATEGORY_CONFIG, getCategoryStyle } from "@/lib/schedule/constants";
import { formatTime } from "@/lib/utils/date";
import type { ScheduleVisibility, ScheduleWithProfile } from "@/lib/schedule/types";
import type { Profile } from "@/lib/attendance/types";

interface ScheduleDetailModalProps {
  schedule: ScheduleWithProfile;
  profiles: Profile[];
  userId: string;
  userRole: string;
  onClose: () => void;
  onUpdated: () => void;
}

function toLocalDatetime(isoString: string) {
  const date = new Date(isoString);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

export default function ScheduleDetailModal({
  schedule,
  profiles,
  userId,
  userRole,
  onClose,
  onUpdated,
}: ScheduleDetailModalProps) {
  const canEdit = schedule.created_by === userId || userRole === "admin";
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const startParts = toLocalDatetime(schedule.start_time);
  const endParts = toLocalDatetime(schedule.end_time);

  const [title, setTitle] = useState(schedule.title);
  const [description, setDescription] = useState(schedule.description ?? "");
  const [category, setCategory] = useState(schedule.category);
  const [customCategory, setCustomCategory] = useState(
    SCHEDULE_CATEGORIES.includes(schedule.category as never) ? "" : schedule.category
  );
  const isCustomCategory = !SCHEDULE_CATEGORIES.includes(category as never) || category === "__CUSTOM__";
  const [isAllDay, setIsAllDay] = useState(schedule.is_all_day);
  const [startDate, setStartDate] = useState(startParts.date);
  const [startTime, setStartTime] = useState(startParts.time);
  const [endDate, setEndDate] = useState(endParts.date);
  const [endTime, setEndTime] = useState(endParts.time);
  const [location, setLocation] = useState(schedule.location ?? "");
  const [visibility, setVisibility] = useState<ScheduleVisibility>(schedule.visibility ?? "company");
  const [participantIds, setParticipantIds] = useState<string[]>(
    schedule.schedule_participants?.map((p) => p.user_id) ?? []
  );

  const config = getCategoryStyle(schedule.category);

  const handleUpdate = async (event: React.FormEvent) => {
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

    setSaving(true);
    setFeedback(null);
    try {
      const finalCategory = category === "__CUSTOM__" ? customCategory.trim() : category;
      if (!finalCategory) {
        setFeedback("카테고리를 입력해주세요.");
        setSaving(false);
        return;
      }

      // 본문 + 참가자 동시 업데이트 (RPC 한 트랜잭션)
      await updateScheduleWithParticipants(
        schedule.id,
        {
          title: title.trim(),
          description: description.trim() || null,
          category: finalCategory,
          visibility,
          startTime: startISO,
          endTime: endISO,
          isAllDay,
          location: location.trim() || null,
        },
        participantIds
      );
      onUpdated();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "일정 수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteSchedule(schedule.id);
      onUpdated();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "일정 삭제에 실패했습니다.");
      setDeleting(false);
    }
  };

  return (
    <ModalContainer onClose={onClose} className="bg-white max-h-[90vh] overflow-y-auto shadow-xl border border-slate-200">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">
            {isEditing ? "일정 수정" : "일정 상세"}
          </h3>
          <div className="flex items-center gap-1">
            {canEdit && !isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-brand-600 transition-colors"
                  title="수정"
                >
                  <PencilSimple size={18} />
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                  title="삭제"
                >
                  <Trash size={18} />
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
              <X size={20} />
            </button>
          </div>
        </div>

        {feedback && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {feedback}
          </div>
        )}

        {/* 삭제 확인 */}
        {showDeleteConfirm && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-700 mb-3">이 일정을 삭제하시겠습니까?</p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-40"
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {/* 보기 모드 */}
        {!isEditing && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${config.badge}`}>
                {config.label}
              </span>
              <span className="text-xs text-slate-400">{config.labelKo}</span>
              {schedule.visibility === "private" && (
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                  <Lock size={10} />
                  개인
                </span>
              )}
            </div>

            <h4 className="text-base font-bold text-slate-800">{schedule.title}</h4>

            {schedule.description && (
              <p className="text-sm text-slate-600 leading-relaxed">{schedule.description}</p>
            )}

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Clock size={16} className="text-slate-400" />
                {schedule.is_all_day
                  ? "종일"
                  : `${formatTime(schedule.start_time)} - ${formatTime(schedule.end_time)}`}
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <CalendarBlank size={16} className="text-slate-400" />
                {startParts.date === endParts.date
                  ? startParts.date
                  : `${startParts.date} ~ ${endParts.date}`}
              </div>
              {schedule.location && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  {schedule.location.includes("온라인") || schedule.location.includes("Zoom") ? (
                    <Monitor size={16} className="text-slate-400" />
                  ) : (
                    <MapPin size={16} className="text-slate-400" />
                  )}
                  {schedule.location}
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <User size={16} className="text-slate-400" />
                {schedule.creator_profile.full_name}
              </div>
              {schedule.schedule_participants && schedule.schedule_participants.length > 0 && (
                <div className="flex items-start gap-2 text-sm text-slate-600">
                  <Users size={16} className="text-slate-400 mt-0.5" />
                  <div className="flex flex-wrap gap-1">
                    {schedule.schedule_participants.map((p) => (
                      <span
                        key={p.id}
                        className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200"
                      >
                        {p.profiles.full_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 편집 모드 */}
        {isEditing && (
          <form onSubmit={handleUpdate} className="space-y-4">
            {/* 회사/개인 토글 */}
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
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">제목</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">설명</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none h-20"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">카테고리</label>
                <select
                  value={isCustomCategory ? "__CUSTOM__" : category}
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
                {isCustomCategory && (
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

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving || !title.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 shadow-lg shadow-brand-500/20 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? "수정 중..." : "저장"}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-6 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                취소
              </button>
            </div>
          </form>
        )}
    </ModalContainer>
  );
}
