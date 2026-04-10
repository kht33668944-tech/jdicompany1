"use client";

import VacationBalanceCard from "../VacationBalanceCard";
import VacationHistoryList from "../VacationHistoryList";
import VacationRequestForm from "../VacationRequestForm";
import type { VacationBalance, VacationRequest } from "@/lib/attendance/types";

interface VacationTabProps {
  vacationBalance: VacationBalance | null;
  vacationRequests: VacationRequest[];
}

export default function VacationTab({ vacationBalance, vacationRequests }: VacationTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <VacationBalanceCard balance={vacationBalance} />
        <VacationRequestForm balance={vacationBalance} />
      </div>
      <VacationHistoryList requests={vacationRequests} />
    </div>
  );
}
