"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ExpenseWithMeta } from "@/lib/expenses/types";
import DownloadSimple from "phosphor-react/dist/icons/DownloadSimple.esm.js";

interface ExcelDownloadButtonProps {
  expenses: ExpenseWithMeta[];
  year: number;
  month: number;
}

export default function ExcelDownloadButton({ expenses, year, month }: ExcelDownloadButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const sorted = [...expenses].sort((a, b) => a.expense_date.localeCompare(b.expense_date));
      const data: Array<Record<string, string | number>> = sorted.map((e) => ({
        날짜: e.expense_date,
        거래처: e.vendor ?? "",
        내용: e.description,
        분류: e.category?.name ?? "",
        "금액(원)": Number(e.amount_krw),
        통화: e.currency,
        외화금액: e.amount_foreign != null ? Number(e.amount_foreign) : "",
        결제수단: e.payment_method,
        증빙: e.receipt_path ? "O" : "",
        입력자: e.author_profile?.full_name ?? "",
      }));
      const total = sorted.reduce((s, e) => s + Number(e.amount_krw), 0);
      data.push({
        날짜: "합계",
        거래처: "",
        내용: "",
        분류: "",
        "금액(원)": total,
        통화: "",
        외화금액: "",
        결제수단: "",
        증빙: "",
        입력자: "",
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${month}월 지출`);
      XLSX.writeFile(wb, `JDI_지출내역_${year}년${String(month).padStart(2, "0")}월.xlsx`);
    } catch {
      toast.error("엑셀 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={busy || expenses.length === 0}
      className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50"
    >
      <DownloadSimple size={16} /> 엑셀
    </button>
  );
}
