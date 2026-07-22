"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { createExpense } from "@/lib/expenses/actions";
import { parseKrwInput, parseForeignInput } from "@/lib/expenses/format";
import { toDateString } from "@/lib/utils/date";
import type { ExpenseCategory, ExpenseCurrency, PaymentMethod } from "@/lib/expenses/types";
import PaymentMethodField from "./PaymentMethodField";
import CategoryField from "./CategoryField";
import Select from "@/components/shared/Select";
import Plus from "phosphor-react/dist/icons/Plus.esm.js";

const CURRENCY_OPTIONS = [
  { value: "KRW", label: "원화" },
  { value: "USD", label: "달러" },
];

interface ExpenseQuickInputProps {
  categories: ExpenseCategory[];
  paymentMethods: PaymentMethod[];
  onMethodsChanged: () => void;
  onCategoriesChanged: () => void;
  onCreated: () => void;
}

export default function ExpenseQuickInput({ categories, paymentMethods, onMethodsChanged, onCategoriesChanged, onCreated }: ExpenseQuickInputProps) {
  const [date, setDate] = useState(toDateString());
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<ExpenseCurrency>("KRW");
  const [foreignAmount, setForeignAmount] = useState("");
  const [method, setMethod] = useState(paymentMethods[0]?.name ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // 배경에서 눌러 시작한 클릭만 시트를 닫는다 (입력칸 드래그 중 닫힘 방지)
  const overlayMouseDown = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await createExpense({
        expense_date: date,
        vendor: vendor.trim() || null,
        description: description.trim(),
        amount_krw: parseKrwInput(amount),
        currency,
        amount_foreign: currency === "USD" ? parseForeignInput(foreignAmount) : null,
        payment_method: method.trim(),
        category_id: categoryId,
      });
      toast.success("지출이 저장되었습니다.");
      setVendor("");
      setDescription("");
      setAmount("");
      setForeignAmount("");
      setSheetOpen(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const labelCls = "text-sm font-bold text-slate-700 ml-1 block";

  // stacked=true → 모바일 하단 시트용(세로 스택 + 라벨), false → PC 인라인 한 줄
  const renderFields = (stacked: boolean) => {
    const w = (inlineW: string) => (stacked ? "w-full" : inlineW);
    const wrap = (label: string, control: React.ReactNode) =>
      stacked ? (
        <div className="space-y-1.5">
          <label className={labelCls}>{label}</label>
          {control}
        </div>
      ) : (
        control
      );
    return (
      <>
        {wrap(
          "날짜",
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} ${w("")}`} required />
        )}
        {wrap(
          "거래처(선택)",
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="거래처(선택)" className={`${inputCls} ${w("w-32")}`} />
        )}
        {wrap(
          "내용",
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="내용" className={`${inputCls} ${w("flex-1 min-w-[140px]")}`} required />
        )}
        {wrap(
          "통화",
          <Select
            options={CURRENCY_OPTIONS}
            value={currency}
            onChange={(v) => setCurrency(v as ExpenseCurrency)}
            ariaLabel="통화"
            className={`${inputCls} ${w("w-24")}`}
          />
        )}
        {currency === "USD" &&
          wrap(
            "달러 금액",
            <input value={foreignAmount} onChange={(e) => setForeignAmount(e.target.value)} placeholder="달러 금액" inputMode="decimal" className={`${inputCls} ${w("w-28")}`} required />
          )}
        {wrap(
          currency === "USD" ? "원화 환산액" : "금액(원)",
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={currency === "USD" ? "원화 환산액" : "금액(원)"} inputMode="numeric" className={`${inputCls} ${w("w-32")}`} required />
        )}
        {wrap(
          "결제수단",
          <PaymentMethodField
            methods={paymentMethods}
            value={method}
            onChange={setMethod}
            onMethodsChanged={onMethodsChanged}
            className={`${inputCls} ${w("w-44")}`}
            required
          />
        )}
        {wrap(
          "분류",
          <CategoryField
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
            onCategoriesChanged={onCategoriesChanged}
            className={`${inputCls} ${w("w-40")}`}
            required
          />
        )}
      </>
    );
  };

  return (
    <>
      {/* PC: 인라인 한 줄 폼 (기존 유지) */}
      <form
        onSubmit={handleSubmit}
        className="hidden md:flex rounded-2xl bg-white/65 backdrop-blur-sm border border-white/80 shadow-sm p-4 flex-wrap gap-2 items-center"
      >
        {renderFields(false)}
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-[#2563eb] text-white text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </form>

      {/* 모바일: 떠있는 "＋ 지출 추가" 버튼 */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="md:hidden w-full flex items-center justify-center gap-1.5 px-6 py-3.5 rounded-2xl bg-[#2563eb] text-white text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
      >
        <Plus size={18} weight="bold" /> 지출 추가
      </button>

      {/* 모바일: 하단 시트 */}
      {sheetOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex items-end bg-slate-900/20 backdrop-blur-sm"
          onMouseDown={(e) => {
            overlayMouseDown.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && overlayMouseDown.current) setSheetOpen(false);
            overlayMouseDown.current = false;
          }}
        >
          <div className="w-full max-h-[88vh] overflow-y-auto rounded-t-[32px] shadow-2xl bg-white/85 backdrop-blur-[40px] border-t border-white/60 p-5 pb-8 animate-sheet-up">
            <div className="h-1.5 w-10 rounded-full bg-slate-300 mx-auto mb-4" />
            <h2 className="text-lg font-extrabold text-slate-900 ml-1 mb-3">지출 추가</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              {renderFields(true)}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  disabled={saving}
                  className="flex-1 px-6 py-3 rounded-xl text-slate-600 font-bold bg-slate-100 hover:bg-slate-200/70 transition-all disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-[2] px-6 py-3 rounded-xl bg-[#2563eb] text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50"
                >
                  {saving ? "저장 중…" : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
