"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "phosphor-react";
import { toast } from "sonner";
import type { ReportWithProfile, ReportType, ReportStatus } from "@/lib/reports/types";
import { REPORT_TYPE_CONFIG, REPORT_STATUS_CONFIG, REPORT_TYPES, REPORT_STATUSES } from "@/lib/reports/constants";
import { updateReportStatus } from "@/lib/reports/actions";
import ReportCard from "./ReportCard";
import ReportCreateModal from "./ReportCreateModal";
import ReportDetailModal from "./ReportDetailModal";

interface ReportsPageClientProps {
  initialReports: ReportWithProfile[];
  userId: string;
  userRole: string;
}

const VISIBLE_INCREMENT = 10;

export default function ReportsPageClient({
  initialReports,
  userId,
  userRole,
}: ReportsPageClientProps) {
  const router = useRouter();
  const [reports, setReports] = useState<ReportWithProfile[]>(initialReports);

  useEffect(() => {
    setReports(initialReports);
  }, [initialReports]);
  const [typeFilter, setTypeFilter] = useState<"all" | ReportType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ReportStatus>("all");
  const [onlyMine, setOnlyMine] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportWithProfile | null>(null);
  const [visibleCount, setVisibleCount] = useState(VISIBLE_INCREMENT);

  const filtered = reports.filter((r) => {
    if (typeFilter !== "all" && r.type !== typeFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (onlyMine && r.user_id !== userId) return false;
    return true;
  });
  const visible = filtered.slice(0, visibleCount);

  const handleCreated = () => {
    setShowCreateModal(false);
    router.refresh();
  };

  const handleUpdated = () => {
    setSelectedReport(null);
    router.refresh();
  };

  const handleDeleted = (reportId: string) => {
    setReports((prev) => prev.filter((r) => r.id !== reportId));
    setSelectedReport(null);
    router.refresh();
  };

  const handleStatusChange = async (reportId: string, status: ReportStatus) => {
    try {
      await updateReportStatus(reportId, status);
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status } : r))
      );
      toast.success("상태가 변경되었습니다");
    } catch {
      toast.error("상태 변경에 실패했습니다");
    }
  };

  return (
    <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">오류 접수</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
            시스템 이용 중 발생하는 문제나 불편사항을 알려주세요.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-[#2563eb] hover:bg-blue-700 text-white px-4 py-2.5 sm:px-6 sm:py-3 rounded-2xl font-bold flex items-center gap-1.5 sm:gap-2 shadow-lg shadow-blue-500/20 transition-all active:scale-95 flex-shrink-0 whitespace-nowrap text-sm sm:text-base"
        >
          <Plus size={16} weight="bold" />
          새 접수
        </button>
      </div>

      {/* Filters */}
      <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        {/* Type pills */}
        <div className="flex items-center gap-1 sm:gap-2 bg-white/60 p-1 sm:p-1.5 rounded-2xl shadow-sm border border-white/50 overflow-x-auto">
          <button
            onClick={() => setTypeFilter("all")}
            className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl text-sm sm:text-base font-medium transition-all whitespace-nowrap ${
              typeFilter === "all"
                ? "bg-[#2563eb] text-white font-bold shadow-sm"
                : "text-slate-600 hover:bg-white/80"
            }`}
          >
            전체
          </button>
          {REPORT_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl text-sm sm:text-base font-medium transition-all whitespace-nowrap ${
                typeFilter === type
                  ? "bg-[#2563eb] text-white font-bold shadow-sm"
                  : "text-slate-600 hover:bg-white/80"
              }`}
            >
              {REPORT_TYPE_CONFIG[type].label}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Only mine toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">내 접수만 보기</span>
            <button
              role="switch"
              aria-checked={onlyMine}
              onClick={() => setOnlyMine((v) => !v)}
              className={`w-11 h-6 rounded-full relative transition-colors duration-200 focus:outline-none ${
                onlyMine ? "bg-blue-600" : "bg-slate-200"
              }`}
            >
              <span
                className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                  onlyMine ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>

          {/* Status select */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | ReportStatus)}
              className="appearance-none bg-white/60 border border-white/50 rounded-2xl px-5 py-2.5 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer"
            >
              <option value="all">상태: 전체</option>
              {REPORT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {REPORT_STATUS_CONFIG[status].label}
                </option>
              ))}
            </select>
            <svg
              className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 gap-4">
        {visible.length === 0 ? (
          <div className="text-center py-16 text-slate-400 font-medium">
            접수된 내역이 없습니다.
          </div>
        ) : (
          visible.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onClick={() => setSelectedReport(report)}
              onStatusChange={handleStatusChange}
              isAdmin={userRole === "admin" || userRole === "developer"}
            />
          ))
        )}
      </div>

      {/* Load more */}
      {filtered.length > visibleCount && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => setVisibleCount((v) => v + VISIBLE_INCREMENT)}
            className="bg-white/60 hover:bg-white/80 text-slate-600 px-8 py-3 rounded-2xl font-bold border border-white/50 shadow-sm transition-all flex items-center gap-2"
          >
            더 보기
          </button>
        </div>
      )}

      {/* Modals */}
      <ReportCreateModal
        open={showCreateModal}
        userId={userId}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
      />
      <ReportDetailModal
        report={selectedReport}
        open={selectedReport !== null}
        userId={userId}
        userRole={userRole}
        onClose={() => setSelectedReport(null)}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
