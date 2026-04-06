"use client";

import { useMemo } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ChartBar, TrendUp } from "phosphor-react";
import type { AttendanceRecord } from "@/lib/attendance/types";
import { calcWeekdayAvgCheckIn, calcWeeklyWorkHours, minutesToTimeLabel } from "@/lib/attendance/stats";

interface AttendanceChartsProps {
  records: AttendanceRecord[];
}

export default function AttendanceCharts({ records }: AttendanceChartsProps) {
  const weekdayData = useMemo(() => calcWeekdayAvgCheckIn(records), [records]);
  const weeklyData = useMemo(() => calcWeeklyWorkHours(records), [records]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <ChartBar size={18} className="text-slate-400" />
          <h4 className="text-sm font-bold text-slate-800">요일별 평균 출근 시간</h4>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekdayData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#94a3b8" }} />
              <YAxis
                domain={[480, 600]}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickFormatter={(v: number) => minutesToTimeLabel(v)}
              />
              <Tooltip
                formatter={(value) => [minutesToTimeLabel(Number(value)), "평균 출근"]}
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
              />
              <Bar dataKey="avgMinutes" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendUp size={18} className="text-slate-400" />
          <h4 className="text-sm font-bold text-slate-800">주간 근무시간 추이</h4>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 12, fill: "#94a3b8" }} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} unit="h" />
              <Tooltip
                formatter={(value) => [`${value}h`, "근무시간"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="hours"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={{ fill: "#6366f1", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
