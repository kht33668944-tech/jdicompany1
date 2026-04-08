"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Users } from "phosphor-react";
import { createClient } from "@/lib/supabase/client";
import { calcAttendanceStats, EMPTY_STATS } from "@/lib/attendance/stats";
import type { AttendanceRecord, Profile, WorkSchedule } from "@/lib/attendance/types";
import type { AttendanceStats } from "@/lib/attendance/stats";
import { getWorkSchedulesForUser } from "@/lib/attendance/queries";
import { getMonthRange } from "@/lib/utils/date";
import RecordsFilter from "./RecordsFilter";
import EmployeeCard, { getAvatarColor } from "./EmployeeCard";
import RecordsSummaryCards from "./RecordsSummaryCards";
import RecordsDetailTable from "./RecordsDetailTable";
import AttendanceCharts from "./AttendanceCharts";

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
  const [prevStats, setPrevStats] = useState<AttendanceStats | null>(null);
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

    const targetProfiles = isAdmin ? allProfiles : [profile];
    const ids = targetProfiles.map((p) => p.id);

    const { data, error } = await supabase
      .from("attendance_records")
      .select("*")
      .in("user_id", ids)
      .gte("work_date", startDate)
      .lte("work_date", endDate)
      .order("work_date", { ascending: false });

    if (!error && data) {
      for (const p of targetProfiles) {
        const records = data.filter((r) => r.user_id === p.id);
        newRecords.set(p.id, records);
        newStats.set(p.id, calcAttendanceStats(records, p.id === profile.id ? workSchedules : []));
      }
    }

    setEmployeeRecords(newRecords);
    setEmployeeStats(newStats);
    setLoading(false);
  }, [startDate, endDate, allProfiles, profile, isAdmin]);

  const fetchPrevStats = useCallback(async (userId?: string) => {
    const targetUserId = userId ?? selectedUserId;
    const supabase = createClient();
    const startParts = startDate.split("-");
    let prevYear = Number(startParts[0]);
    let prevMonth = Number(startParts[1]) - 1;
    if (prevMonth === 0) { prevMonth = 12; prevYear -= 1; }
    const prevRange = getMonthRange(prevYear, prevMonth);

    const targetProfile = allProfiles.find((p) => p.id === targetUserId) ?? profile;

    const { data } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("user_id", targetUserId)
      .gte("work_date", prevRange.start)
      .lte("work_date", prevRange.end);

    if (data) {
      const schedulesForTarget = targetProfile.id === profile.id ? workSchedules : employeeSchedules;
      setPrevStats(calcAttendanceStats(data, schedulesForTarget));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, allProfiles, profile, workSchedules, employeeSchedules]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAllRecords(); fetchPrevStats(); }, []);

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

  const handleEmployeeSelect = (userId: string) => {
    setSelectedUserId(userId);
    fetchPrevStats(userId);
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
        onApply={() => { fetchAllRecords(); fetchPrevStats(); }}
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
                userId={selectedProfile.id}
                isOwnRecord={selectedProfile.id === profile.id || isAdmin}
              />
              <AttendanceCharts records={selectedRecords} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
