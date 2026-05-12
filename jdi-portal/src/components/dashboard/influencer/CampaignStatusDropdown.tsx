"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import StatusBadge from "./StatusBadge";
import { CAMPAIGN_STATUS_OPTIONS } from "@/lib/influencer/labels";
import type { CampaignStatus } from "@/lib/influencer/types";

interface Props {
  status: CampaignStatus;
  onChange: (next: CampaignStatus) => void;
}

const MENU_WIDTH = 148;
const MENU_HEIGHT = CAMPAIGN_STATUS_OPTIONS.length * 36 + 8;

export default function CampaignStatusDropdown({ status, onChange }: Props) {
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
        top: showAbove ? rect.top - MENU_HEIGHT - 4 : rect.bottom + 4,
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

  function select(next: CampaignStatus) {
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
        aria-label="상태 변경"
        aria-expanded={open}
      >
        <StatusBadge status={status} type="campaign" />
        <span className="text-[10px] text-slate-400 leading-none" aria-hidden>▾</span>
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="z-50 bg-white rounded-xl shadow-lg border border-slate-100 py-1 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {CAMPAIGN_STATUS_OPTIONS.map((opt) => {
              const isActive = opt.value === status;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => select(opt.value)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${
                    isActive ? "bg-slate-50" : "hover:bg-slate-50"
                  }`}
                >
                  <StatusBadge status={opt.value} type="campaign" />
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
