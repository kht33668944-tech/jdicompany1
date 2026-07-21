"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createRecurringExpense, updateRecurringExpense, deleteRecurringExpense } from "@/lib/expenses/actions";
import { PAYMENT_METHOD_SUGGESTIONS } from "@/lib/expenses/constants";
import type { ExpenseCategory, ExpenseCurrency, RecurringExpenseWithMeta, RecurringInput } from "@/lib/expenses/types";

interface RecurringFormModalProps {
  initial: RecurringExpenseWithMeta | null;
  categories: ExpenseCategory[];
  profiles: { id: string; full_name: string }[];
  defaultOwnerId: string;
  onClose: () => void;
  onChanged: () => void;
}

export default function RecurringFormModal({
  initial,
  categories,
  profiles,
  defaultOwnerId,
  onClose,
  onChanged,
}: RecurringFormModalProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [vendor, setVendor] = useState(initial?.vendor ?? "");
  const [currency, setCurrency] = useState<ExpenseCurrency>(initial?.currency ?? "KRW");
  const [foreignAmount, setForeignAmount] = useState(initial?.amount_foreign != null ? String(initial.amount_foreign) : "");
  const [amount, setAmount] = useState(initial ? String(initial.amount_krw) : "");
  const [billingDay, setBillingDay] = useState(initial ? String(initial.billing_day) : "1");
  const [method, setMethod] = useState(initial?.payment_method ?? "");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [ownerId, setOwnerId] = useState(initial?.owner_id ?? defaultOwnerId);
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const input: RecurringInput = {
        name: name.trim(),
        vendor: vendor.trim() || null,
        amount_krw: Math.round(Number(amount.replaceAll(",", ""))),
        currency,
        amount_foreign: currency === "USD" ? Number(foreignAmount) : null,
        billing_day: Number(billingDay),
        payment_method: method.trim(),
        category_id: categoryId,
        owner_id: ownerId,
        note: note.trim() || null,
      };
      if (initial) {
        await updateRecurringExpense(initial.id, input);
        toast.success("수정되었습니다.");
      } else {
        await createRecurringExpense(input);
        toast.success("등록되었습니다.");
      }
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!initial || busy) return;
    if (!window.confirm("이 고정 지출을 삭제할까요?")) return;
    setBusy(true);
    try {
      await deleteRecurringExpense(initial.id);
      toast.success("삭제되었습니다.");
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const labelCls = "text-sm font-bold text-slate-700 ml-1 block";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/20 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-[32px] shadow-2xl bg-white/70 backdrop-blur-[40px] border border-white/50 p-6 space-y-3">
        <h2 className="text-lg font-extrabold text-slate-900 ml-1">{initial ? "고정 지출 수정" : "고정 지출 등록"}</h2>

        <div className="space-y-1.5">
          <label className={labelCls}>이름</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" className={inputCls} required />
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>거래처(선택)</label>
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="거래처(선택)" className={inputCls} />
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>통화</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as ExpenseCurrency)} className={inputCls}>
            <option value="KRW">원화</option>
            <option value="USD">달러</option>
          </select>
        </div>

        {currency === "USD" && (
          <div className="space-y-1.5">
            <label className={labelCls}>달러 금액</label>
            <input
              value={foreignAmount}
              onChange={(e) => setForeignAmount(e.target.value)}
              placeholder="달러 금액"
              inputMode="decimal"
              className={inputCls}
              required
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className={labelCls}>{currency === "USD" ? "원화 환산액" : "금액(원)"}</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={currency === "USD" ? "원화 환산액" : "금액(원)"}
            inputMode="numeric"
            className={inputCls}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>매달 결제일</label>
          <input
            type="number"
            min={1}
            max={31}
            value={billingDay}
            onChange={(e) => setBillingDay(e.target.value)}
            placeholder="매달 결제일"
            className={inputCls}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>결제수단</label>
          <input
            list="recurring-payment-methods"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="결제수단"
            className={inputCls}
            required
          />
          <datalist id="recurring-payment-methods">
            {PAYMENT_METHOD_SUGGESTIONS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>분류</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls} required>
            <option value="">분류 선택</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>담당자</label>
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputCls} required>
            <option value="">담당자 선택</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>메모(선택)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모(선택)" className={inputCls} />
        </div>

        <div className="flex items-center justify-between pt-2">
          {initial ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl text-red-600 font-bold hover:bg-red-50 transition-all disabled:opacity-50"
            >
              삭제
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-6 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-200/50 transition-all disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="px-6 py-2.5 rounded-xl bg-[#2563eb] text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
