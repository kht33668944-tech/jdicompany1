"use client";

import { useState } from "react";
import CaretLeft from "phosphor-react/dist/icons/CaretLeft.esm.js";
import CaretRight from "phosphor-react/dist/icons/CaretRight.esm.js";
import type { InfluencerCampaign } from "@/lib/influencer/types";

interface Props {
  campaigns: InfluencerCampaign[];
  onDateSelect: (date: string | null) => void;
  selectedDate: string | null;
}

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

// 캠페인에서 날짜 목록 추출 (contact_date, ship_date, expected_post_date)
function getCampaignDates(campaigns: InfluencerCampaign[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (date: string | null, color: string) => {
    if (!date) return;
    const existing = map.get(date) ?? [];
    map.set(date, [...existing, color]);
  };
  for (const c of campaigns) {
    if (c.status === "done") continue;
    add(c.contact_date, "bg-blue-400");
    add(c.ship_date, "bg-cyan-400");
    add(c.expected_post_date, "bg-violet-400");
  }
  return map;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export default function SeedingCalendar({ campaigns, onDateSelect, selectedDate }: Props) {
  const today = kstToday();
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)));

  const campaignDates = getCampaignDates(campaigns);

  // 해당 월의 첫 날 요일 (0=일)
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  function dateStr(day: number): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // 달력 셀 배열 (빈 셀 + 날짜 셀)
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="이전 달"
        >
          <CaretLeft size={16} weight="bold" />
        </button>
        <h3 className="text-sm font-semibold text-slate-800">
          {year}년 {month}월
        </h3>
        <button
          onClick={nextMonth}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="다음 달"
        >
          <CaretRight size={16} weight="bold" />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-[10px] font-medium pb-1.5 ${
              i === 0 ? "text-rose-400" : i === 6 ? "text-blue-400" : "text-slate-400"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 셀 */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} />;
          }
          const ds = dateStr(day);
          const dots = campaignDates.get(ds) ?? [];
          const isToday = ds === today;
          const isSelected = ds === selectedDate;
          const dow = (firstDow + day - 1) % 7;

          return (
            <button
              key={ds}
              onClick={() => onDateSelect(isSelected ? null : ds)}
              className={`relative flex flex-col items-center py-1 rounded-lg transition-all duration-150 ${
                isSelected
                  ? "bg-brand-600 text-white"
                  : isToday
                  ? "bg-brand-50 text-brand-600 font-semibold"
                  : "hover:bg-slate-50"
              }`}
            >
              <span
                className={`text-xs leading-none ${
                  isSelected
                    ? "text-white"
                    : dow === 0
                    ? "text-rose-400"
                    : dow === 6
                    ? "text-blue-400"
                    : "text-slate-700"
                }`}
              >
                {day}
              </span>
              {dots.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {dots.slice(0, 3).map((color, i) => (
                    <span
                      key={i}
                      className={`w-1 h-1 rounded-full ${isSelected ? "bg-white/70" : color}`}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 범례 */}
      <div className="mt-4 flex flex-wrap gap-3 pt-3 border-t border-slate-100">
        {[
          { color: "bg-blue-400", label: "DM 발송" },
          { color: "bg-cyan-400", label: "제품 발송" },
          { color: "bg-violet-400", label: "포스팅 예정" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            <span className="text-[10px] text-slate-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
