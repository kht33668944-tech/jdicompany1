"use client";

import { Users } from "phosphor-react";
import { formatTime } from "@/lib/utils/date";
import { ATTENDANCE_STATUS_CONFIG } from "@/lib/attendance/constants";
import type { AttendanceWithProfile, Profile } from "@/lib/attendance/types";

interface AdminAttendanceTableProps {
  todayAttendance: AttendanceWithProfile[];
  allProfiles: Profile[];
}

export default function AdminAttendanceTable({ todayAttendance, allProfiles }: AdminAttendanceTableProps) {
  const attendanceMap = new Map(todayAttendance.map((a) => [a.user_id, a]));


  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users size={20} className="text-slate-400" />
        <h3 className="text-base font-bold text-slate-800">오늘 근무 현황</h3>
        <span className="text-xs text-slate-400 ml-auto">{allProfiles.length}명</span>
      </div>

      <div className="space-y-2">
        {allProfiles.map((profile) => {
          const record = attendanceMap.get(profile.id);
          const status = record?.status ?? "미출근";
          const sc = ATTENDANCE_STATUS_CONFIG[status];
          const colors = `${sc.bg} ${sc.text}`;

          return (
            <div key={profile.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-slate-50/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-brand-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {profile.full_name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">{profile.full_name}</p>
                  <p className="text-xs text-slate-400">{profile.department}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right text-xs text-slate-400 tabular-nums">
                  <span>{formatTime(record?.check_in ?? null)}</span>
                  <span className="mx-1">~</span>
                  <span>{formatTime(record?.check_out ?? null)}</span>
                </div>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colors}`}>
                  {status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
