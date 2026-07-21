"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { updateExpense, deleteExpense, setExpenseReceipt } from "@/lib/expenses/actions";
import { uploadExpenseReceipt, getExpenseReceiptUrl } from "@/lib/expenses/receipts";
import { PAYMENT_METHOD_SUGGESTIONS } from "@/lib/expenses/constants";
import type { ExpenseCategory, ExpenseCurrency, ExpenseWithMeta } from "@/lib/expenses/types";

interface ExpenseEditModalProps {
  expense: ExpenseWithMeta;
  categories: ExpenseCategory[];
  onClose: () => void;
  onChanged: () => void;
}

export default function ExpenseEditModal({ expense, categories, onClose, onChanged }: ExpenseEditModalProps) {
  const [date, setDate] = useState(expense.expense_date);
  const [vendor, setVendor] = useState(expense.vendor ?? "");
  const [description, setDescription] = useState(expense.description);
  const [amount, setAmount] = useState(String(expense.amount_krw));
  const [currency, setCurrency] = useState<ExpenseCurrency>(expense.currency);
  const [foreignAmount, setForeignAmount] = useState(expense.amount_foreign != null ? String(expense.amount_foreign) : "");
  const [method, setMethod] = useState(expense.payment_method);
  const [categoryId, setCategoryId] = useState(expense.category_id);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (expense.receipt_path) {
      getExpenseReceiptUrl(expense.receipt_path).then(setReceiptUrl).catch(() => {});
    }
  }, [expense.receipt_path]);

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await updateExpense(expense.id, {
        expense_date: date,
        vendor: vendor.trim() || null,
        description: description.trim(),
        amount_krw: Math.round(Number(amount.replaceAll(",", ""))),
        currency,
        amount_foreign: currency === "USD" ? Number(foreignAmount) : null,
        payment_method: method.trim(),
        category_id: categoryId,
      });
      toast.success("수정되었습니다.");
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "수정에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    if (!window.confirm("이 지출 기록을 삭제할까요?")) return;
    setBusy(true);
    try {
      await deleteExpense(expense.id);
      toast.success("삭제되었습니다.");
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleReceiptUpload = async (file: File) => {
    if (busy) return;
    setBusy(true);
    try {
      const path = await uploadExpenseReceipt(expense.id, file);
      await setExpenseReceipt(expense.id, path);
      toast.success("영수증이 첨부되었습니다.");
      onChanged();
      const url = await getExpenseReceiptUrl(path);
      setReceiptUrl(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "업로드에 실패했습니다.");
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
        <h2 className="text-lg font-extrabold text-slate-900 ml-1">지출 수정</h2>

        <div className="space-y-1.5">
          <label className={labelCls}>날짜</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} required />
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>거래처(선택)</label>
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="거래처(선택)" className={inputCls} />
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>내용</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="내용" className={inputCls} required />
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
          <label className={labelCls}>결제수단</label>
          <input
            list="expense-edit-payment-methods"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="결제수단"
            className={inputCls}
            required
          />
          <datalist id="expense-edit-payment-methods">
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
          <label className={labelCls}>영수증</label>
          {receiptUrl && (
            <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 font-bold underline ml-1">
              영수증 보기
            </a>
          )}
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => e.target.files?.[0] && handleReceiptUpload(e.target.files[0])}
            disabled={busy}
            className="w-full text-sm text-slate-500 ml-1"
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="px-4 py-2.5 rounded-xl text-red-600 font-bold hover:bg-red-50 transition-all disabled:opacity-50"
          >
            삭제
          </button>
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
