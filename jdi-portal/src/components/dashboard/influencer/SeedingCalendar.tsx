"use client";

import { useState, useMemo } from "react";
import CaretLeft from "phosphor-react/dist/icons/CaretLeft.esm.js";
import CaretRight from "phosphor-react/dist/icons/CaretRight.esm.js";
import {
  kstTodayStr,
  buildSeedingWeeks,
  getCampaignBarColor,
  getCampaignDateRange,
} from "@/lib/influencer/calendar";
import { getHolidayName, isRedDay } from "@/lib/schedule/holidays";
import type { InfluencerCampaignWithInfluencer, CampaignStatus } from "@/lib/influencer/types";

interface Props {
  campaigns: InfluencerCampaignWithInfluencer[];
  onDateSelect: (date: string | null) => void;
  selectedDate: string | null;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_VISIBLE_LANES = 3;
const LANE_H = 22;
const DATE_H = 30;

const LEGEND_STATUSES: CampaignStatus[] = [
  "planned",
  "dm_sent",
  "replied",
  "shipped",
  "posted",
  "done",
];

export default function SeedingCalendar({ campaigns, onDateSelect, selectedDate }: Props) {
  const today = kstTodayStr();
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)));

  const weeks = useMemo(() => buildSeedingWeeks(campaigns, year, month), [campaigns, year, month]);

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

      {/* 주별 행 */}
      {weeks.map((week, wi) => {
        const visibleLanes = Math.min(week.laneCount, MAX_VISIBLE_LANES);
        const barArea = visibleLanes * LANE_H;

        return (
          <div key={wi} className="relative grid grid-cols-7">
            {/* 날짜 셀 */}
            {week.cells.map((cell, col) => {
              if (!cell) return <div key={col} className="min-h-[120px]" />;

              const isToday = cell.dateStr === today;
              const isSelected = cell.dateStr === selectedDate;
              const isRed = isRedDay(cell.dateStr, cell.dow);
              const isSat = cell.dow === 6;
              const holidayName = getHolidayName(cell.dateStr);
              const hiddenCount = week.hiddenBarCounts[col];

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

              return (
                <div
                  key={col}
                  onClick={() => onDateSelect(isSelected ? null : cell.dateStr)}
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
                      {cell.day}
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

                  {/* 막대 영역 자리 확보 */}
                  {barArea > 0 && <div style={{ height: barArea }} />}

                  {/* +N개 */}
                  {hiddenCount > 0 && (
                    <div className="text-[10px] text-slate-400 px-1 mt-1 font-medium">
                      +{hiddenCount}개
                    </div>
                  )}
                </div>
              );
            })}

            {/* 간트 막대 overlay */}
            {week.bars
              .filter((b) => b.lane < MAX_VISIBLE_LANES)
              .map((bar) => {
                const span = bar.endCol - bar.startCol + 1;
                const colors = getCampaignBarColor(bar.campaign.status);
                const username = bar.campaign.influencer?.username ?? "?";
                return (
                  <button
                    type="button"
                    key={`${bar.campaign.id}-w${wi}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const range = getCampaignDateRange(bar.campaign);
                      if (range.start) onDateSelect(range.start);
                    }}
                    className={`absolute z-10 truncate text-left text-[11px] font-medium px-2 py-0.5 rounded ${colors.barClass} ${colors.textClass} hover:shadow-md hover:brightness-95 transition-all`}
                    style={{
                      top: DATE_H + bar.lane * LANE_H,
                      left: `calc(${bar.startCol} * 100% / 7 + 4px)`,
                      width: `calc(${span} * 100% / 7 - 8px)`,
                      height: 20,
                    }}
                    title={`@${username} · ${bar.campaign.campaign_name} (${colors.label})`}
                  >
                    @{username} · {bar.campaign.campaign_name}
                  </button>
                );
              })}
          </div>
        );
      })}

      {/* 범례 */}
      <div className="mt-4 flex flex-wrap gap-3 pt-3 border-t border-slate-100">
        {LEGEND_STATUSES.map((s) => {
          const c = getCampaignBarColor(s);
          return (
            <div key={s} className="flex items-center gap-1.5">
              <span className={`w-3 h-2 rounded ${c.barClass}`} />
              <span className="text-[10px] text-slate-500">{c.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
