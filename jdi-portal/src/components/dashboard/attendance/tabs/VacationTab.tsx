"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import VacationBalanceCard from "../VacationBalanceCard";
import VacationHistoryList from "../VacationHistoryList";
import VacationRequestForm from "../VacationRequestForm";
import { getVacationBalance, getVacationRequests } from "@/lib/attendance/queries";
import type { VacationBalance, VacationRequest } from "@/lib/attendance/types";

interface VacationTabProps {
  userId: string;
}

export default function VacationTab({ userId }: VacationTabProps) {
  const [balance, setBalance] = useState<VacationBalance | null>(null);
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const year = new Date().getFullYear();

    Promise.all([
      getVacationBalance(supabase, userId, year).catch(() => null),
      getVacationRequests(supabase, userId).catch(() => []),
    ]).then(([b, r]) => {
      if (cancelled) return;
      setBalance(b);
      setRequests(r);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center text-sm text-slate-400">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <VacationBalanceCard balance={balance} />
        <VacationRequestForm balance={balance} />
      </div>
      <VacationHistoryList requests={requests} />
    </div>
  );
}
