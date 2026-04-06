"use client";

import { useState } from "react";
import { CalendarBlank, MagnifyingGlass, Funnel } from "phosphor-react";
import { getMonthRange } from "@/lib/utils/date";

interface RecordsFilterProps {
  startDate: string;
  endDate: string;
  departments: string[];
  selectedDepartment: string;
  searchQuery: string;
  onDateChange: (start: string, end: string) => void;
  onDepartmentChange: (dept: string) => void;
  onSearchChange: (query: string) => void;
  onApply: () => void;
  isAdmin: boolean;
}

export default function RecordsFilter({
  startDate,
  endDate,
  departments,
  selectedDepartment,
  searchQuery,
  onDateChange,
  onDepartmentChange,
  onSearchChange,
  onApply,
  isAdmin,
}: RecordsFilterProps) {
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);

  const handleQuickRange = (type: "thisMonth" | "lastMonth") => {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    if (type === "lastMonth") {
      month -= 1;
      if (month === 0) { month = 12; year -= 1; }
    }
    const range = getMonthRange(year, month);
    setLocalStart(range.start);
    setLocalEnd(range.end);
    onDateChange(range.start, range.end);
  };

  const handleApply = () => {
    onDateChange(localStart, localEnd);
    onApply();
  };

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        {/* 조회 기간 */}
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-500 mb-1.5">조회 기간</label>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[140px]">
              <CalendarBlank size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={localStart}
                onChange={(e) => setLocalStart(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
              />
            </div>
            <span className="text-slate-400 text-sm">~</span>
            <input
              type="date"
              value={localEnd}
              onChange={(e) => setLocalEnd(e.target.value)}
              className="flex-1 min-w-[140px] px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
            />
            <button
              onClick={() => handleQuickRange("thisMonth")}
              className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-brand-600 text-white hover:bg-brand-500 transition-colors whitespace-nowrap"
            >
              이번달
            </button>
            <button
              onClick={() => handleQuickRange("lastMonth")}
              className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              지난달
            </button>
          </div>
        </div>

        {/* 부서 필터 (관리자만) */}
        {isAdmin && (
          <div className="w-full lg:w-40">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">부서</label>
            <div className="relative">
              <Funnel size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={selectedDepartment}
                onChange={(e) => onDepartmentChange(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 appearance-none"
              >
                <option value="">전체 부서</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* 직원 검색 (관리자만) */}
        {isAdmin && (
          <div className="w-full lg:w-48">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">직원 검색</label>
            <div className="relative">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="이름 또는 직책 검색"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
              />
            </div>
          </div>
        )}

        {/* 조회하기 버튼 */}
        <button
          onClick={handleApply}
          className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-brand-600 hover:bg-brand-500 shadow-lg shadow-brand-500/20 transition-all whitespace-nowrap"
        >
          조회하기
        </button>
      </div>
    </div>
  );
}
