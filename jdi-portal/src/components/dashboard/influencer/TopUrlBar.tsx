"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "phosphor-react/dist/icons/Link.esm.js";
import FunnelSimple from "phosphor-react/dist/icons/FunnelSimple.esm.js";
import CalendarBlank from "phosphor-react/dist/icons/CalendarBlank.esm.js";
import Plus from "phosphor-react/dist/icons/Plus.esm.js";
import Rows from "phosphor-react/dist/icons/Rows.esm.js";
import CaretLeft from "phosphor-react/dist/icons/CaretLeft.esm.js";
import CaretRight from "phosphor-react/dist/icons/CaretRight.esm.js";
import X from "phosphor-react/dist/icons/X.esm.js";
import { addInfluencer } from "@/lib/influencer/actions";
import BulkUploadModal from "./BulkUploadModal";

interface Props {
  onFilterClick: () => void;
  dateMilestone: string | null;
  onDateMilestoneChange: (date: string | null) => void;
}

const todayStr = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

function CalendarPopover({
  anchorRef,
  selected,
  onSelect,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  selected: string | null;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useState<{ y: number; m: number }>(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1 };
  });
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const width = 280;
    setPos({
      top: rect.bottom + window.scrollY + 4,
      left: rect.right + window.scrollX - width,
    });
  }, [anchorRef]);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, onClose]);

  const daysInMonth = new Date(month.y, month.m, 0).getDate();
  const firstDayOfWeek = new Date(month.y, month.m - 1, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function toDateStr(day: number) {
    return `${month.y}-${String(month.m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function prevMonth() {
    setMonth(({ y, m }) => m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 });
  }
  function nextMonth() {
    setMonth(({ y, m }) => m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 });
  }

  return createPortal(
    <div
      ref={popRef}
      style={{ position: "absolute", top: pos.top, left: pos.left, width: 280, zIndex: 9999 }}
      className="bg-white rounded-xl shadow-lg border border-slate-200 p-3"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="p-1 rounded hover:bg-slate-100 text-slate-500">
          <CaretLeft size={14} />
        </button>
        <span className="text-sm font-medium text-slate-700">
          {month.y}년 {month.m}월
        </span>
        <button onClick={nextMonth} className="p-1 rounded hover:bg-slate-100 text-slate-500">
          <CaretRight size={14} />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-1">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <div key={d} className="text-center text-xs text-slate-400 py-1">{d}</div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />;
          const ds = toDateStr(day);
          const isSelected = ds === selected;
          const isToday = ds === todayStr;
          return (
            <button
              key={ds}
              onClick={() => { onSelect(ds); onClose(); }}
              className={[
                "flex items-center justify-center w-8 h-8 rounded-lg text-xs mx-auto transition-colors",
                isSelected
                  ? "bg-blue-500 text-white"
                  : isToday
                  ? "ring-1 ring-blue-400 text-slate-700 hover:bg-slate-100"
                  : "text-slate-700 hover:bg-slate-100",
              ].join(" ")}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

export default function TopUrlBar({ onFilterClick, dateMilestone, onDateMilestoneChange }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dateButtonRef = useRef<HTMLButtonElement>(null);

  function isValidInstagramUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      return (
        (parsed.hostname === "www.instagram.com" || parsed.hostname === "instagram.com") &&
        parsed.pathname.length > 1
      );
    } catch {
      return false;
    }
  }

  function handleAdd() {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("인스타그램 URL을 입력해 주세요.");
      inputRef.current?.focus();
      return;
    }
    if (!isValidInstagramUrl(trimmed)) {
      toast.error("올바른 인스타그램 프로필 URL을 입력해 주세요.");
      inputRef.current?.focus();
      return;
    }

    startTransition(async () => {
      const toastId = toast.loading("인플루언서 분석 중... (10~30초 소요)");
      try {
        await addInfluencer(trimmed);
        toast.success("인플루언서 등록 완료", { id: toastId });
        setUrl("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "추가에 실패했습니다.", { id: toastId });
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleAdd();
  }

  // 날짜 표시 포맷: "11/25"
  const dateLabel = dateMilestone
    ? `${parseInt(dateMilestone.slice(5, 7), 10)}/${parseInt(dateMilestone.slice(8, 10), 10)}`
    : null;

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-3 flex items-center gap-3 flex-wrap">
        {/* URL 입력 */}
        <div className="flex-1 min-w-0 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          <Link size={16} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://www.instagram.com/username"
            className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none min-w-0"
            disabled={isPending}
          />
        </div>

        {/* 분석 및 추가 버튼 */}
        <button
          onClick={handleAdd}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 active:bg-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <Plus size={14} weight="bold" />
          분석 및 추가
        </button>

        {/* 일괄 추가 버튼 */}
        <button
          onClick={() => setBulkOpen(true)}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <Rows size={14} />
          일괄 추가
        </button>

        {/* 필터 버튼 */}
        <button
          onClick={onFilterClick}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors shrink-0"
        >
          <FunnelSimple size={14} />
          필터
        </button>

        {/* 날짜 버튼 */}
        <button
          ref={dateButtonRef}
          onClick={() => setCalOpen((v) => !v)}
          className={[
            "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors shrink-0",
            dateMilestone
              ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
              : "border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300",
          ].join(" ")}
        >
          <CalendarBlank size={14} />
          {dateLabel ? `📅 ${dateLabel}` : "날짜"}
          {dateMilestone && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onDateMilestoneChange(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onDateMilestoneChange(null); } }}
              className="ml-0.5 rounded hover:bg-blue-200 p-0.5 cursor-pointer"
            >
              <X size={10} weight="bold" />
            </span>
          )}
        </button>
      </div>

      {calOpen && (
        <CalendarPopover
          anchorRef={dateButtonRef}
          selected={dateMilestone}
          onSelect={onDateMilestoneChange}
          onClose={() => setCalOpen(false)}
        />
      )}

      <BulkUploadModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onDone={() => {
          router.refresh();
          setBulkOpen(false);
        }}
      />
    </>
  );
}
