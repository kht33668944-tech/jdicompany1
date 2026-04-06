"use client";

import { Browser, Calendar, CaretDown } from "phosphor-react";
import type { ReportWithProfile, ReportStatus } from "@/lib/reports/types";
import { REPORT_TYPE_CONFIG, REPORT_STATUS_CONFIG, REPORT_PAGE_CONFIG, REPORT_STATUSES } from "@/lib/reports/constants";
import UserAvatar from "@/components/shared/UserAvatar";

interface ReportCardProps {
  report: ReportWithProfile;
  onClick: () => void;
  onStatusChange: (reportId: string, status: ReportStatus) => void;
  isAdmin: boolean;
}

function formatDate(dateString: string): string {
  const d = new Date(dateString);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

export default function ReportCard({ report, onClick, onStatusChange, isAdmin }: ReportCardProps) {
  const typeConfig = REPORT_TYPE_CONFIG[report.type];
  const statusConfig = REPORT_STATUS_CONFIG[report.status];
  const pageConfig = REPORT_PAGE_CONFIG[report.page];
  const authorName = report.author_profile.full_name;

  return (
    <div
      onClick={onClick}
      className="glass-card p-5 rounded-2xl flex items-center gap-4 sm:gap-6 hover:bg-white/80 transition-all cursor-pointer group shadow-xl shadow-blue-900/5"
    >
      {/* Type badge */}
      <div className="flex-shrink-0 w-16 sm:w-20 flex flex-col items-center">
        <span
          className={`px-2 sm:px-3 py-1 ${typeConfig.bg} ${typeConfig.text} text-[11px] font-bold rounded-lg border ${typeConfig.border} whitespace-nowrap`}
        >
          {typeConfig.label}
        </span>
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-slate-900 group-hover:text-brand-600 transition-colors truncate">
          {report.title}
        </h3>
        <div className="flex items-center gap-2 sm:gap-3 mt-1 text-xs text-slate-500 flex-wrap">
          <span className="flex items-center gap-1">
            <Browser size={12} />
            {pageConfig.label}
          </span>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <span className="flex items-center gap-1">
            <Calendar size={12} />
            {formatDate(report.created_at)}
          </span>
        </div>
      </div>

      {/* Author */}
      <div className="hidden sm:flex items-center gap-2 w-36 flex-shrink-0">
        <UserAvatar name={authorName} avatarUrl={report.author_profile.avatar_url} size="md" />
        <span className="text-sm font-medium text-slate-700 truncate">{authorName}</span>
      </div>

      {/* Status */}
      <div className="flex-shrink-0 w-20 sm:w-28" onClick={(e) => e.stopPropagation()}>
        {isAdmin ? (
          <div className="relative">
            <select
              value={report.status}
              onChange={(e) => onStatusChange(report.id, e.target.value as ReportStatus)}
              className={`appearance-none w-full px-2 sm:px-3 py-1.5 ${statusConfig.bg} ${statusConfig.text} text-xs font-bold rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 pr-6 sm:pr-7`}
            >
              {REPORT_STATUSES.map((s) => (
                <option key={s} value={s}>{REPORT_STATUS_CONFIG[s].label}</option>
              ))}
            </select>
            <CaretDown size={10} className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${statusConfig.text}`} />
          </div>
        ) : (
          <span className={`inline-block px-2 sm:px-3 py-1.5 ${statusConfig.bg} ${statusConfig.text} text-xs font-bold rounded-full`}>
            {statusConfig.label}
          </span>
        )}
      </div>
    </div>
  );
}
