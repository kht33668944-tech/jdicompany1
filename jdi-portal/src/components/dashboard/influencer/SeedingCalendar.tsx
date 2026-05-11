"use client";

import { useState, useMemo } from "react";
import CaretLeft from "phosphor-react/dist/icons/CaretLeft.esm.js";
import CaretRight from "phosphor-react/dist/icons/CaretRight.esm.js";
import {
  kstTodayStr,
  getMilestonesByDate,
  getMilestoneStyle,
  type CampaignMilestone,
} from "@/lib/influencer/calendar";
import { getHolidayName, isRedDay } from "@/lib/schedule/holidays";
import type { InfluencerCampaignWithInfluencer } from "@/lib/influencer/types";

interface Props {
  campaigns: InfluencerCampaignWithInfluencer[];
  onDateSelect: (date: string | null) => void;
  selectedDate: string | null;
  onCampaignClick?: (influencerId: string) => void;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_VISIBLE_CHIPS = 3;

/** display_name에서 ` | ` 앞부분만 깔끔하게 추출. 없으면 @username */
function cleanDisplayName(displayName: string | null | undefined, username: string): string {
  if (!displayName) return `@${username}`;
  const beforePipe = displayName.split("|")[0].trim();
  return beforePipe || displayName;
}

export default function SeedingCalendar({ campaigns, onDateSelect, selectedDate, onCampaignClick }: Props) {
  const today = kstTodayStr();
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)));

  const milestonesByDate = useMemo(
    () => getMilestonesByDate(campaigns, year, month),
    [campaigns, year, month],
  );

  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function dateStr(day: number): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function prevMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      {/* 월 네비 */}
      <div className="flex items-center justify-center gap-4 mb-5">
        <button
          type="button"
          onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="이전 달"
        >
          <CaretLeft size={20} weight="bold" />
        </button>
        <h3 className="text-lg font-bold text-slate-800">
          {year}년 {month}월
        </h3>
        <button
          type="button"
          onClick={nextMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="다음 달"
        >
          <CaretRight size={20} weight="bold" />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-2">
        {DAY_LABELS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-xs font-semibold py-2 ${
              i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-400"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 셀 — 7열 그리드 */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="min-h-[120px]" />;
          }
          const ds = dateStr(day);
          const milestones = milestonesByDate.get(ds) ?? [];
          const isToday = ds === today;
          const isSelected = ds === selectedDate;
          const dow = (firstDow + day - 1) % 7;
          const isRed = isRedDay(ds, dow);
          const isSat = dow === 6;
          const holidayName = getHolidayName(ds);

          const dayBgStyle = isSelected
            ? undefined
            : isRed
              ? { backgroundColor: "var(--cal-sunday-bg)" }
              : isSat
                ? { backgroundColor: "var(--cal-saturday-bg)" }
                : undefined;

          const dayNumColor = isToday
            ? ""
            : isRed
              ? "text-red-400"
              : isSat
                ? "text-blue-400"
                : "text-slate-700";

          const visibleChips = milestones.slice(0, MAX_VISIBLE_CHIPS);
          const hiddenCount = milestones.length - visibleChips.length;

          return (
            <div
              key={ds}
              onClick={() => onDateSelect(isSelected ? null : ds)}
              style={dayBgStyle}
              className={`min-h-[120px] p-2 rounded-xl text-left transition-all duration-150 hover:bg-slate-50 cursor-pointer ${
                isSelected ? "ring-2 ring-brand-400 bg-brand-50/30" : ""
              }`}
            >
              {/* 날짜 숫자 + 공휴일명 */}
              <div className="flex items-center justify-between gap-1 mb-1.5 min-h-[28px]">
                <span
                  className={`inline-flex items-center justify-center text-sm font-bold ${
                    isToday ? "bg-brand-500 text-white rounded-full w-7 h-7" : dayNumColor
                  }`}
                >
                  {day}
                </span>
                {holidayName && (
                  <span
                    className="text-[10px] font-semibold truncate leading-tight"
                    style={{ color: "var(--cal-holiday-label)" }}
                    title={holidayName}
                  >
                    {holidayName}
                  </span>
                )}
              </div>

              {/* 마일스톤 칩 */}
              <div className="space-y-0.5">
                {visibleChips.map((m: CampaignMilestone) => {
                  const style = getMilestoneStyle(m.kind);
                  const username = m.campaign.influencer?.username ?? "?";
                  const displayName = cleanDisplayName(m.campaign.influencer?.display_name, username);
                  const campaignName = m.campaign.campaign_name ?? "";
                  const isAutoName = campaignName === `@${username} 시딩`;
                  const tooltipText = isAutoName
                    ? `${style.label} · @${username}`
                    : `${style.label} · @${username} · ${campaignName}`;
                  return (
                    <button
                      type="button"
                      key={`${m.campaign.id}-${m.kind}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onCampaignClick) onCampaignClick(m.campaign.influencer_id);
                      }}
                      className={`w-full flex items-center gap-1 text-left text-[11px] font-medium px-1.5 py-0.5 rounded border ${style.bg} ${style.text} ${style.border} hover:brightness-95 transition-all truncate`}
                      title={tooltipText}
                    >
                      <span className="shrink-0">{style.icon}</span>
                      <span className="truncate">{displayName}</span>
                    </button>
                  );
                })}
                {hiddenCount > 0 && (
                  <div className="text-[10px] text-slate-400 px-1 mt-0.5 font-medium">
                    +{hiddenCount}개
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 범례 — 3개 액션 */}
      <div className="mt-4 flex flex-wrap gap-3 pt-3 border-t border-slate-100">
        {(["dm", "ship", "post"] as const).map((k) => {
          const s = getMilestoneStyle(k);
          return (
            <div key={k} className="flex items-center gap-1.5">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded border ${s.bg} ${s.border} text-[10px]`}>
                {s.icon}
              </span>
              <span className="text-[10px] text-slate-500">{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
