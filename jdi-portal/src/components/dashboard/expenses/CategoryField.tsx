"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createExpenseCategory, deleteExpenseCategory } from "@/lib/expenses/actions";
import { CATEGORY_STYLE } from "@/lib/expenses/constants";
import type { ExpenseCategory } from "@/lib/expenses/types";
import Select, { type SelectOption } from "@/components/shared/Select";
import X from "phosphor-react/dist/icons/X.esm.js";

interface CategoryFieldProps {
  categories: ExpenseCategory[];
  value: string; // category_id
  onChange: (categoryId: string) => void;
  onCategoriesChanged: () => void;
  className?: string;
  required?: boolean;
  placeholder?: string;
}

export default function CategoryField({
  categories,
  value,
  onChange,
  onCategoriesChanged,
  className,
  required,
  placeholder = "분류 선택",
}: CategoryFieldProps) {
  const [managing, setManaging] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const options: SelectOption[] = categories.map((c) => ({
    value: c.id,
    label: c.name,
    dotClass: CATEGORY_STYLE[c.name]?.dot,
  }));

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createExpenseCategory(name);
      toast.success("분류가 추가되었습니다.");
      setNewName("");
      onCategoriesChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "추가에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (cat: ExpenseCategory) => {
    if (busy) return;
    if (!window.confirm(`'${cat.name}' 분류를 목록에서 숨길까요?\n(기존 지출 기록은 그대로 유지됩니다.)`)) return;
    setBusy(true);
    try {
      await deleteExpenseCategory(cat.id);
      toast.success("삭제되었습니다.");
      if (value === cat.id) onChange("");
      onCategoriesChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Select
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={className}
        required={required}
        ariaLabel="분류 선택"
        footerAction={{ label: "분류 추가/관리", onClick: () => setManaging(true) }}
      />

      {managing && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center px-4 bg-slate-900/20 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setManaging(false);
          }}
        >
          <div className="w-full max-w-sm rounded-[28px] shadow-2xl bg-white/80 backdrop-blur-[40px] border border-white/50 p-5 space-y-4">
            <div>
              <p className="text-base font-bold text-slate-800">분류 관리</p>
              <p className="text-xs text-slate-400 mt-0.5">자주 쓰는 지출 분류를 추가하거나 정리하세요.</p>
            </div>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder="새 분류 이름"
                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={busy || !newName.trim()}
                className="px-4 py-2.5 rounded-xl bg-[#2563eb] text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                추가
              </button>
            </div>
            <ul className="space-y-1 max-h-60 overflow-y-auto">
              {categories.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-100/70"
                >
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    <span className={`inline-block w-2 h-2 rounded-full ${CATEGORY_STYLE[c.name]?.dot ?? "bg-slate-300"}`} />
                    {c.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(c)}
                    disabled={busy}
                    className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    aria-label={`${c.name} 삭제`}
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
              {categories.length === 0 && (
                <li className="text-sm text-slate-400 px-3 py-2">등록된 분류가 없습니다.</li>
              )}
            </ul>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setManaging(false)}
                className="px-5 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-200/50 transition-all text-sm"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
