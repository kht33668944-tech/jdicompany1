"use client";

import VacationBalanceCard from "../VacationBalanceCard";
import VacationHistoryList from "../VacationHistoryList";
import VacationRequestForm from "../VacationRequestForm";
import type { VacationBalance, VacationRequest } from "@/lib/attendance/types";

interface VacationTabProps {
  userId: string;
  vacationBalance: VacationBalance | null;
  vacationRequests: VacationRequest[];
}

export default function VacationTab({ userId, vacationBalance, vacationRequests }: VacationTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <VacationBalanceCard balance={vacationBalance} />
        <VacationRequestForm userId={userId} balance={vacationBalance} />
      </div>
      <VacationHistoryList requests={vacationRequests} />
    </div>
  );
}
