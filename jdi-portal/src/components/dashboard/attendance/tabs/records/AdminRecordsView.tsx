"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Users } from "phosphor-react";
import { createClient } from "@/lib/supabase/client";
import { calcAttendanceStats, EMPTY_STATS, expandVacationsByDate } from "@/lib/attendance/stats";
import type { AttendanceRecord, Profile, WorkSchedule, VacationRequest } from "@/lib/attendance/types";
import type { AttendanceStats, VacationByDate } from "@/lib/attendance/stats";
import { getWorkSchedulesForUser, getApprovedVacationsByRange } from "@/lib/attendance/queries";
import { getMonthRange } from "@/lib/utils/date";
import dynamic from "next/dynamic";
import RecordsFilter from "./RecordsFilter";
import EmployeeCard, { getAvatarColor } from "./EmployeeCard";
import RecordsSummaryCards from "./RecordsSummaryCards";
import RecordsDetailTable from "./RecordsDetailTable";

const AttendanceCharts = dynamic(() => import("./AttendanceCharts"), {
  loading: () => <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><div className="glass-card rounded-2xl h-64 animate-pulse" /><div className="glass-card rounded-2xl h-64 animate-pulse" /></div>,
  ssr: false,
});

interface AdminRecordsViewProps {
  profile: Profile;
  allProfiles: Profile[];
  workSchedules: WorkSchedule[];
}

export default function AdminRecordsView({ profile, allProfiles, workSchedules }: AdminRecordsViewProps) {
  const isAdmin = profile.role === "admin";
  const now = new Date();
  const currentRange = getMonthRange(now.getFullYear(), now.getMonth() + 1);

  const [startDate, setStartDate] = useState(currentRange.start);
  const [endDate, setEndDate] = useState(currentRange.end);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const profiles = useMemo(() => isAdmin ? allProfiles : [profile], [isAdmin, allProfiles, profile]);
  const [selectedUserId, setSelectedUserId] = useState(profile.id);
  const [employeeRecords, setEmployeeRecords] = useState<Map<string, AttendanceRecord[]>>(new Map());
  const [employeeStats, setEmployeeStats] = useState<Map<string, AttendanceStats>>(new Map());
  const [employeePrevStats, setEmployeePrevStats] = useState<Map<string, AttendanceStats>>(new Map());
  const [employeeVacations, setEmployeeVacations] = useState<Map<string, VacationByDate>>(new Map());
  const [loading, setLoading] = useState(true);
  const [employeeSchedules, setEmployeeSchedules] = useState<WorkSchedule[]>([]);

  const detailRef = useRef<HTMLDivElement>(null);

  const departments = useMemo(
    () => [...new Set(allProfiles.map((p) => p.department).filter(Boolean))],
    [allProfiles]
  );

  const filteredProfiles = useMemo(
    () => profiles.filter((p) => {
      if (selectedDepartment && p.department !== selectedDepartment) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!p.full_name.toLowerCase().includes(q) && !p.department.toLowerCase().includes(q)) return false;
      }
      return true;
    }),
    [profiles, selectedDepartment, searchQuery]
  );

  const fetchAllRecords = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const newRecords = new Map<string, AttendanceRecord[]>();
    const newStats = new Map<string, AttendanceStats>();
    const newPrevStats = new Map<string, AttendanceStats>();
    const newVacations = new Map<string, VacationByDate>();

    const targetProfiles = isAdmin ? allProfiles : [profile];
    const ids = targetProfiles.map((p) => p.id);
    if (ids.length === 0) {
      setEmployeeRecords(newRecords);
      setEmployeeStats(newStats);
      setEmployeePrevStats(newPrevStats);
      setEmployeeVacations(newVacations);
      setLoading(false);
      return;
    }

    // 전월 통계 비교를 위해 prev month까지 한 번에 fetch — 라운드트립 4 → 2
    const startParts = startDate.split("-");
    let prevYear = Number(startParts[0]);
    let prevMonth = Number(startParts[1]) - 1;
    if (prevMonth === 0) { prevMonth = 12; prevYear -= 1; }
    const prevRange = getMonthRange(prevYear, prevMonth);

    const [recordsResult, vacations] = await Promise.all([
      supabase
        .from("attendance_records")
        .select("*")
        .in("user_id", ids)
        .gte("work_date", prevRange.start)
        .lte("work_date", endDate)
        .order("work_date", { ascending: false }),
      getApprovedVacationsByRange(supabase, ids, prevRange.start, endDate),
    ]);

    const vacationsByUser = new Map<string, VacationRequest[]>();
    for (const v of vacations) {
      const arr = vacationsByUser.get(v.user_id) ?? [];
      arr.push(v);
      vacationsByUser.set(v.user_id, arr);
    }

    const { data, error } = recordsResult;
    if (!error && data) {
      const byUser = new Map<string, typeof data>();
      for (const r of data) {
        const arr = byUser.get(r.user_id) ?? [];
        arr.push(r);
        byUser.set(r.user_id, arr);
      }
      for (const p of targetProfiles) {
        const allRecords = byUser.get(p.id) ?? [];
        // 정렬 유지하면서 현재/전월로 분리
        const currentRecords = allRecords.filter(
          (r) => r.work_date >= startDate && r.work_date <= endDate
        );
        const prevRecords = allRecords.filter(
          (r) => r.work_date >= prevRange.start && r.work_date <= prevRange.end
        );
        // vacation은 한 번 expand해서 두 통계 모두 사용 (날짜 기반 lookup이라 안전)
        const vacMap = expandVacationsByDate(vacationsByUser.get(p.id) ?? []);
        const schedules = p.id === profile.id ? workSchedules : [];

        newRecords.set(p.id, currentRecords);
        newVacations.set(p.id, vacMap);
        newStats.set(p.id, calcAttendanceStats(currentRecords, schedules, vacMap));
        newPrevStats.set(p.id, calcAttendanceStats(prevRecords, schedules, vacMap));
      }
    }

    setEmployeeRecords(newRecords);
    setEmployeeStats(newStats);
    setEmployeePrevStats(newPrevStats);
    setEmployeeVacations(newVacations);
    setLoading(false);
  }, [startDate, endDate, allProfiles, profile, isAdmin, workSchedules]);

  useEffect(() => { fetchAllRecords(); }, [fetchAllRecords]);

  useEffect(() => {
    if (selectedUserId === profile.id) {
      setEmployeeSchedules([]);
      return;
    }
    let cancelled = false;
    getWorkSchedulesForUser(createClient(), selectedUserId).then((data) => {
      if (!cancelled) setEmployeeSchedules(data);
    });
    return () => { cancelled = true; };
  }, [selectedUserId, profile.id]);

  const selectedProfile = allProfiles.find((p) => p.id === selectedUserId) ?? profile;
  const selectedRecords = employeeRecords.get(selectedUserId) ?? [];
  const selectedStats = employeeStats.get(selectedUserId) ?? EMPTY_STATS;
  const prevStats = employeePrevStats.get(selectedUserId) ?? null;

  const handleEmployeeSelect = (userId: string) => {
    setSelectedUserId(userId);
    if (window.innerWidth < 1024 && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const periodLabel = `${startDate.replace(/-/g, ".")} ~ ${endDate.replace(/-/g, ".")}`;

  return (
    <div className="space-y-6">
      <RecordsFilter
        startDate={startDate}
        endDate={endDate}
        departments={departments}
        selectedDepartment={selectedDepartment}
        searchQuery={searchQuery}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
        onDepartmentChange={setSelectedDepartment}
        onSearchChange={setSearchQuery}
        onApply={() => { fetchAllRecords(); }}
        isAdmin={isAdmin}
      />

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-[380px] shrink-0">
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-slate-400" />
                <h4 className="text-sm font-bold text-slate-800">직원 요약</h4>
                <span className="text-xs font-semibold text-brand-600">{filteredProfiles.length}명</span>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse rounded-2xl bg-slate-100 h-24" />
                ))}
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {filteredProfiles.map((p, index) => (
                  <EmployeeCard
                    key={p.id}
                    name={p.full_name}
                    department={p.department}
                    stats={employeeStats.get(p.id) ?? EMPTY_STATS}
                    selected={p.id === selectedUserId}
                    onClick={() => handleEmployeeSelect(p.id)}
                    avatarColor={getAvatarColor(index)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div ref={detailRef} className="flex-1 space-y-6 min-w-0">
          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse glass-card rounded-2xl h-28" />
                ))}
              </div>
              <div className="animate-pulse glass-card rounded-2xl h-64" />
            </div>
          ) : (
            <>
              <RecordsSummaryCards stats={selectedStats} prevStats={prevStats} />
              <RecordsDetailTable
                records={selectedRecords}
                employeeName={selectedProfile.full_name}
                periodLabel={periodLabel}
                workSchedules={selectedUserId === profile.id ? workSchedules : employeeSchedules}
                isOwnRecord={selectedProfile.id === profile.id || isAdmin}
                vacationsByDate={employeeVacations.get(selectedUserId) ?? {}}
                rangeStart={startDate}
                rangeEnd={endDate}
              />
              <AttendanceCharts records={selectedRecords} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
