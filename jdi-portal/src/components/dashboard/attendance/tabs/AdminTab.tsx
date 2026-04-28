"use client";

import { useEffect, useState } from "react";
import AdminAttendanceTable from "../AdminAttendanceTable";
import AdminVacationRequests from "../AdminVacationRequests";
import AdminWorkScheduleRequests from "../AdminWorkScheduleRequests";
import AdminHireDateRequests from "../AdminHireDateRequests";
import AdminIpChangeRequests from "../AdminIpChangeRequests";
import { getAdminAttendanceData, type AdminAttendanceData } from "@/lib/attendance/admin-actions";

export default function AdminTab() {
  const [data, setData] = useState<AdminAttendanceData | null>(null);

  // 관리 탭 클릭 시점에만 8개 admin 쿼리 일괄 실행 — 페이지 진입 비용 ↓
  useEffect(() => {
    let cancelled = false;
    getAdminAttendanceData().then((result) => {
      if (cancelled) return;
      setData(result);
    });
    return () => { cancelled = true; };
  }, []);

  if (!data) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center text-sm text-slate-400">
        관리 데이터를 불러오는 중...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <AdminAttendanceTable
        todayAttendance={data.allTodayAttendance}
        allProfiles={data.allProfiles}
      />
      <div className="space-y-6">
        <AdminVacationRequests
          vacationRequests={data.pendingVacationRequests}
          cancelRequests={data.cancelVacationRequests}
          correctionRequests={data.pendingCorrectionRequests}
        />
        <AdminWorkScheduleRequests requests={data.pendingWorkScheduleChangeRequests} />
        <AdminHireDateRequests requests={data.pendingHireDateChangeRequests} />
        <AdminIpChangeRequests requests={data.pendingIpChangeRequests} />
      </div>
    </div>
  );
}
