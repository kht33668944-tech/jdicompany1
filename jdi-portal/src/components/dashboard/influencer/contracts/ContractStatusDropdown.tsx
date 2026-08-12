"use client";

// 표 안에서 배지를 눌러 계약 상태를 바로 바꾸는 드롭다운 (CampaignStatusDropdown 패턴)

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import ContractStatusBadge from "./ContractStatusBadge";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/influencer/contracts/labels";
import type { ContractStatus } from "@/lib/influencer/contracts/types";

interface Props {
  status: ContractStatus;
  onChange: (next: ContractStatus) => void;
}

const MENU_WIDTH = 148;
const MENU_HEIGHT = CONTRACT_STATUS_OPTIONS.length * 36 + 8;

export default function ContractStatusDropdown({ status, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const showAbove = spaceBelow < MENU_HEIGHT + 16;
      setPos({
        top: showAbove ? Math.max(8, rect.top - MENU_HEIGHT - 4) : rect.bottom + 4,
        left: Math.max(8, Math.min(window.innerWidth - MENU_WIDTH - 8, rect.right - MENU_WIDTH)),
      });
    }
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  function select(next: ContractStatus) {
    setOpen(false);
    if (next !== status) onChange(next);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-0.5 rounded-md hover:opacity-80 transition-opacity"
        aria-label="계약 상태 변경"
        aria-expanded={open}
      >
        <ContractStatusBadge status={status} />
        <span className="text-[10px] text-slate-400 leading-none" aria-hidden>▾</span>
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="z-50 bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl shadow-slate-900/10 border border-slate-100 p-1.5 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {CONTRACT_STATUS_OPTIONS.map((opt) => {
              const isActive = opt.value === status;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => select(opt.value)}
                  className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
                    isActive ? "bg-blue-50" : "hover:bg-slate-100"
                  }`}
                >
                  <ContractStatusBadge status={opt.value} />
                  {isActive && <span className="text-blue-500 text-xs font-bold">✓</span>}
                </button>
              );
            })}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
