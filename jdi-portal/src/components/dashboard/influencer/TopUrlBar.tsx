"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "phosphor-react/dist/icons/Link.esm.js";
import FunnelSimple from "phosphor-react/dist/icons/FunnelSimple.esm.js";
import CalendarBlank from "phosphor-react/dist/icons/CalendarBlank.esm.js";
import Plus from "phosphor-react/dist/icons/Plus.esm.js";
import { addInfluencer } from "@/lib/influencer/actions";

interface Props {
  onFilterClick: () => void;
}

export default function TopUrlBar({ onFilterClick }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

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
      const toastId = toast.loading("프로필 추출 중...");
      try {
        toast.loading("AI 분석 중...", { id: toastId });
        await addInfluencer(trimmed);
        toast.success("인플루언서가 추가되었습니다!", { id: toastId });
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

  return (
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

      {/* 필터 버튼 */}
      <button
        onClick={onFilterClick}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors shrink-0"
      >
        <FunnelSimple size={14} />
        필터
      </button>

      {/* 날짜 버튼 (1차 placeholder) */}
      <button
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors shrink-0"
        title="비교 기간 선택 (추후 구현)"
      >
        <CalendarBlank size={14} />
        지난주
      </button>
    </div>
  );
}
