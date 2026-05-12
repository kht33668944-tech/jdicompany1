"use client";

import { useState } from "react";
import X from "phosphor-react/dist/icons/X.esm.js";
import type { CampaignStatus, InfluencerGrade, InfluencerStatus } from "@/lib/influencer/types";
import type { InfluencerTier } from "@/lib/influencer/metrics";

export interface FilterState {
  search: string;
  grades: InfluencerGrade[];
  categories: string[];
  status: InfluencerStatus | "all";
  tags: string[];
  campaignStatuses: CampaignStatus[];
  dateMilestone: string | null;
  followerTiers: InfluencerTier[];
  noCampaign: boolean;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  search: "",
  grades: [],
  categories: [],
  status: "all",
  tags: [],
  campaignStatuses: [],
  dateMilestone: null,
  followerTiers: [],
  noCampaign: false,
};

interface Props {
  open: boolean;
  onClose: () => void;
  categories: string[];
  value: FilterState;
  onChange: (next: FilterState) => void;
}

interface InnerProps {
  onClose: () => void;
  categories: string[];
  initialValue: FilterState;
  onChange: (next: FilterState) => void;
}

const GRADES: InfluencerGrade[] = ["S", "A", "B", "C", "UNRATED"];
const GRADE_LABELS: Record<InfluencerGrade, string> = {
  S: "S",
  A: "A",
  B: "B",
  C: "C",
  UNRATED: "미분류",
};

// 내부 컴포넌트 — open 시마다 remount → useState(initialValue)가 항상 최신 값으로 초기화
function FiltersInner({ onClose, categories, initialValue, onChange }: InnerProps) {
  const [draft, setDraft] = useState<FilterState>(initialValue);
  const [tagInput, setTagInput] = useState("");

  function toggleGrade(g: InfluencerGrade) {
    setDraft((prev) => ({
      ...prev,
      grades: prev.grades.includes(g) ? prev.grades.filter((x) => x !== g) : [...prev.grades, g],
    }));
  }

  function toggleCategory(c: string) {
    setDraft((prev) => ({
      ...prev,
      categories: prev.categories.includes(c)
        ? prev.categories.filter((x) => x !== c)
        : [...prev.categories, c],
    }));
  }

  function addTag(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && tagInput.trim()) {
      const t = tagInput.trim();
      if (!draft.tags.includes(t)) {
        setDraft((prev) => ({ ...prev, tags: [...prev.tags, t] }));
      }
      setTagInput("");
    }
  }

  function removeTag(t: string) {
    setDraft((prev) => ({ ...prev, tags: prev.tags.filter((x) => x !== t) }));
  }

  function handleApply() {
    onChange(draft);
    onClose();
  }

  function handleReset() {
    setDraft(DEFAULT_FILTER_STATE);
  }

  return (
    <>
      {/* 백드롭 */}
      <div
        className="fixed inset-0 z-30 bg-black/20"
        onClick={onClose}
      />

      {/* 필터 패널 */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-6 flex flex-col gap-5">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">필터</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 검색어 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">검색어</label>
          <input
            type="text"
            value={draft.search}
            onChange={(e) => setDraft((p) => ({ ...p, search: e.target.value }))}
            placeholder="유저명 또는 표시명"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-slate-400 transition-colors"
          />
        </div>

        {/* 등급 */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">AI 등급</label>
          <div className="flex flex-wrap gap-2">
            {GRADES.map((g) => (
              <button
                key={g}
                onClick={() => toggleGrade(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  draft.grades.includes(g)
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                }`}
              >
                {GRADE_LABELS[g]}
              </button>
            ))}
          </div>
        </div>

        {/* 카테고리 */}
        {categories.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">카테고리</label>
            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => toggleCategory(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    draft.categories.includes(c)
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 상태 */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">상태</label>
          <div className="flex gap-2">
            {(["all", "active", "archived"] as const).map((s) => {
              const labels = { all: "전체", active: "활성", archived: "보관" };
              return (
                <button
                  key={s}
                  onClick={() => setDraft((p) => ({ ...p, status: s }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    draft.status === s
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  {labels[s]}
                </button>
              );
            })}
          </div>
        </div>

        {/* 태그 */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">태그</label>
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={addTag}
            placeholder="태그 입력 후 Enter"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 outline-none focus:border-slate-400 transition-colors"
          />
          {draft.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {draft.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs"
                >
                  {t}
                  <button onClick={() => removeTag(t)} className="hover:text-rose-500 transition-colors">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 버튼 */}
        <div className="flex justify-between gap-3 pt-1">
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            초기화
          </button>
          <button
            onClick={handleApply}
            className="flex-1 px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            적용
          </button>
        </div>
      </div>
    </>
  );
}

// 외부 컴포넌트 — open=false 면 아무것도 렌더하지 않아 FiltersInner 가 unmount → 다음 open 시 새 인스턴스
export default function InfluencerFilters({ open, onClose, categories, value, onChange }: Props) {
  if (!open) return null;
  return (
    <FiltersInner
      onClose={onClose}
      categories={categories}
      initialValue={value}
      onChange={onChange}
    />
  );
}
