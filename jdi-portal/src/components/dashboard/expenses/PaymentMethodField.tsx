"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createPaymentMethod, deletePaymentMethod } from "@/lib/expenses/actions";
import type { PaymentMethod } from "@/lib/expenses/types";
import X from "phosphor-react/dist/icons/X.esm.js";

interface PaymentMethodFieldProps {
  methods: PaymentMethod[];
  value: string;
  onChange: (value: string) => void;
  onMethodsChanged: () => void;
  className?: string;
  required?: boolean;
}

const MANAGE_VALUE = "__manage__";

export default function PaymentMethodField({
  methods,
  value,
  onChange,
  onMethodsChanged,
  className,
  required,
}: PaymentMethodFieldProps) {
  const [managing, setManaging] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createPaymentMethod(name);
      toast.success("결제수단이 추가되었습니다.");
      setNewName("");
      onMethodsChanged();
      onChange(name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "추가에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (method: PaymentMethod) => {
    if (busy) return;
    if (!window.confirm(`'${method.name}' 결제수단을 목록에서 삭제할까요?`)) return;
    setBusy(true);
    try {
      await deletePaymentMethod(method.id);
      toast.success("삭제되었습니다.");
      onMethodsChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const valueInList = methods.some((m) => m.name === value);

  return (
    <>
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === MANAGE_VALUE) {
            setManaging(true);
            return;
          }
          onChange(e.target.value);
        }}
        className={className}
        required={required}
      >
        {value === "" && (
          <option value="" disabled>
            결제수단 선택
          </option>
        )}
        {methods.map((m) => (
          <option key={m.id} value={m.name}>
            {m.name}
          </option>
        ))}
        {value && !valueInList && <option value={value}>{value}</option>}
        <option value={MANAGE_VALUE}>＋ 결제수단 추가/관리</option>
      </select>

      {managing && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-slate-900/20 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setManaging(false);
          }}
        >
          <div className="w-full max-w-sm rounded-[28px] shadow-2xl bg-white/80 backdrop-blur-[40px] border border-white/50 p-5 space-y-4">
            <p className="text-base font-bold text-slate-800">결제수단 관리</p>
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
                placeholder="새 결제수단 이름"
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
              {methods.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-100/70"
                >
                  <span className="text-sm text-slate-700">{m.name}</span>
                  <button
                    type="button"
                    onClick={() => handleDelete(m)}
                    disabled={busy}
                    className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    aria-label={`${m.name} 삭제`}
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
              {methods.length === 0 && (
                <li className="text-sm text-slate-400 px-3 py-2">등록된 결제수단이 없습니다.</li>
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
