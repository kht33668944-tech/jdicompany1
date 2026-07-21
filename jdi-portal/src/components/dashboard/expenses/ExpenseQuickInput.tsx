"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createExpense } from "@/lib/expenses/actions";
import { PAYMENT_METHOD_SUGGESTIONS } from "@/lib/expenses/constants";
import { toDateString } from "@/lib/utils/date";
import type { ExpenseCategory, ExpenseCurrency } from "@/lib/expenses/types";

interface ExpenseQuickInputProps {
  categories: ExpenseCategory[];
  onCreated: () => void;
}

export default function ExpenseQuickInput({ categories, onCreated }: ExpenseQuickInputProps) {
  const [date, setDate] = useState(toDateString());
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<ExpenseCurrency>("KRW");
  const [foreignAmount, setForeignAmount] = useState("");
  const [method, setMethod] = useState(PAYMENT_METHOD_SUGGESTIONS[0]);
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await createExpense({
        expense_date: date,
        vendor: vendor.trim() || null,
        description: description.trim(),
        amount_krw: Math.round(Number(amount.replaceAll(",", ""))),
        currency,
        amount_foreign: currency === "USD" ? Number(foreignAmount) : null,
        payment_method: method.trim(),
        category_id: categoryId,
      });
      toast.success("지출이 저장되었습니다.");
      setVendor("");
      setDescription("");
      setAmount("");
      setForeignAmount("");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl bg-white/65 backdrop-blur-sm border border-white/80 p-4 flex flex-wrap gap-2 items-center"
    >
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} required />
      <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="거래처(선택)" className={`${inputCls} w-32`} />
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="내용" className={`${inputCls} flex-1 min-w-[140px]`} required />
      <select value={currency} onChange={(e) => setCurrency(e.target.value as ExpenseCurrency)} className={inputCls}>
        <option value="KRW">원화</option>
        <option value="USD">달러</option>
      </select>
      {currency === "USD" && (
        <input value={foreignAmount} onChange={(e) => setForeignAmount(e.target.value)} placeholder="달러 금액" inputMode="decimal" className={`${inputCls} w-28`} required />
      )}
      <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={currency === "USD" ? "원화 환산액" : "금액(원)"} inputMode="numeric" className={`${inputCls} w-32`} required />
      <input list="expense-payment-methods" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="결제수단" className={`${inputCls} w-44`} required />
      <datalist id="expense-payment-methods">
        {PAYMENT_METHOD_SUGGESTIONS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls} required>
        <option value="">분류 선택</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={saving}
        className="px-6 py-2.5 rounded-xl bg-[#2563eb] text-white text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50"
      >
        {saving ? "저장 중…" : "저장"}
      </button>
    </form>
  );
}
