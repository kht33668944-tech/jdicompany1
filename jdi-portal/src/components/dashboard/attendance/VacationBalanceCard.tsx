"use client";

import { Airplane } from "phosphor-react";
import type { VacationBalance } from "@/lib/attendance/types";

interface VacationBalanceCardProps {
  balance: VacationBalance | null;
}

export default function VacationBalanceCard({ balance }: VacationBalanceCardProps) {
  const total = balance?.total_days ?? 0;
  const used = balance?.used_days ?? 0;
  const remaining = balance?.remaining_days ?? 0;
  const percentage = total > 0 ? (used / total) * 100 : 0;

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Airplane size={20} className="text-slate-400" />
        <h3 className="text-base font-bold text-slate-800">연차 현황</h3>
        <span className="text-xs text-slate-400 ml-auto">{new Date().getFullYear()}년</span>
      </div>

      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-3xl font-bold text-brand-600">{remaining}</p>
          <p className="text-xs text-slate-400 mt-0.5">잔여 일수</p>
        </div>
        <div className="text-right text-sm text-slate-500">
          <p>총 {total}일 / 사용 {used}일</p>
        </div>
      </div>

      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-brand-500 to-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
