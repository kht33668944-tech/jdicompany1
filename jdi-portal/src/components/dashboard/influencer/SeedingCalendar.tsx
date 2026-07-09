"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import CaretLeft from "phosphor-react/dist/icons/CaretLeft.esm.js";
import CaretRight from "phosphor-react/dist/icons/CaretRight.esm.js";
import {
  kstTodayStr,
  getMilestonesByDate,
  getMilestoneStyle,
  type CampaignMilestone,
  type MilestoneKind,
} from "@/lib/influencer/calendar";
import { updateCampaignMilestoneDate } from "@/lib/influencer/actions";
import { getHolidayName, isRedDay } from "@/lib/schedule/holidays";
import type { InfluencerCampaignWithInfluencer } from "@/lib/influencer/types";

interface Props {
  campaigns: InfluencerCampaignWithInfluencer[];
  onDateSelect: (date: string | null) => void;
  selectedDate: string | null;
  onCampaignClick?: (influencerId: string) => void;
  onRefresh?: () => void;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_VISIBLE_CHIPS = 3;
const MOBILE_MAX_DOTS = 6;
const EMPTY_OVERRIDES = new Map<string, string>();

const MILESTONE_DOT_BG: Record<MilestoneKind, string> = {
  dm: "bg-blue-400",
  contract: "bg-rose-400",
  ship: "bg-amber-400",
  deadline: "bg-orange-400",
  post: "bg-violet-400",
};

/** display_name에서 ` | ` 앞부분만 깔끔하게 추출. 없으면 @username */
function cleanDisplayName(displayName: string | null | undefined, username: string): string {
  if (!displayName) return `@${username}`;
  const beforePipe = displayName.split("|")[0].trim();
  return beforePipe || displayName;
}

export default function SeedingCalendar({ campaigns, onDateSelect, selectedDate, onCampaignClick, onRefresh }: Props) {
  const today = kstTodayStr();
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)));
  const campaignsKey = useMemo(
    () =>
      campaigns
        .map((c) =>
          [
            c.id,
            c.contact_date,
            c.contract_date,
            c.ship_date,
            c.content_deadline,
            c.expected_post_date,
          ].join(":"),
        )
        .join("|"),
    [campaigns],
  );

  // 드래그 진행 중 optimistic 오버라이드: `${campaignId}|${kind}` → 새 날짜
  const [overrideState, setOverrideState] = useState<{ key: string; values: Map<string, string> }>(
    () => ({ key: "", values: new Map() }),
  );
  const overrides = overrideState.key === campaignsKey ? overrideState.values : EMPTY_OVERRIDES;
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // 서버에서 campaigns prop이 새로 내려오면 오버라이드는 모두 확정/무의미하므로 초기화
  // Overrides are ignored automatically when campaignsKey changes.
    // Overrides are ignored automatically when campaignsKey changes.
  // Campaign updates naturally invalidate overrideState via campaignsKey.

  // 오버라이드 적용된 campaigns
  const effectiveCampaigns = useMemo(() => {
    if (overrides.size === 0) return campaigns;
    return campaigns.map((c) => {
      const dm = overrides.get(`${c.id}|dm`);
      const contract = overrides.get(`${c.id}|contract`);
      const ship = overrides.get(`${c.id}|ship`);
      const deadline = overrides.get(`${c.id}|deadline`);
      const post = overrides.get(`${c.id}|post`);
      if (
        dm === undefined &&
        contract === undefined &&
        ship === undefined &&
        deadline === undefined &&
        post === undefined
      ) {
        return c;
      }
      return {
        ...c,
        ...(dm !== undefined && { contact_date: dm }),
        ...(contract !== undefined && { contract_date: contract }),
        ...(ship !== undefined && { ship_date: ship }),
        ...(deadline !== undefined && { content_deadline: deadline }),
        ...(post !== undefined && { expected_post_date: post }),
      };
    });
  }, [campaigns, overrides]);

  const milestonesByDate = useMemo(
    () => getMilestonesByDate(effectiveCampaigns, year, month),
    [effectiveCampaigns, year, month],
  );

  async function handleDrop(campaignId: string, kind: MilestoneKind, fromDate: string, toDate: string) {
    if (fromDate === toDate) return;
    const key = `${campaignId}|${kind}`;
    setOverrideState((prev) => {
      const next = new Map(prev.key === campaignsKey ? prev.values : EMPTY_OVERRIDES);
      next.set(key, toDate);
      return { key: campaignsKey, values: next };
    });
    try {
      await updateCampaignMilestoneDate(campaignId, kind, toDate);
      toast.success("일정 날짜가 변경되었습니다.");
      onRefresh?.();
    } catch {
      setOverrideState((prev) => {
        const next = new Map(prev.key === campaignsKey ? prev.values : EMPTY_OVERRIDES);
        next.delete(key);
        return { key: campaignsKey, values: next };
      });
      toast.error("날짜 변경에 실패했습니다.");
    }
  }

  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function dateStr(day: number): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function prevMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 sm:p-5">
      {/* 월 네비 */}
      <div className="flex items-center justify-center gap-4 mb-3 sm:mb-5">
        <button
          type="button"
          onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="이전 달"
        >
          <CaretLeft size={20} weight="bold" />
        </button>
        <h3 className="text-lg font-bold text-slate-800">
          {year}년 {month}월
        </h3>
        <button
          type="button"
          onClick={nextMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="다음 달"
        >
          <CaretRight size={20} weight="bold" />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-2">
        {DAY_LABELS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-xs font-semibold py-2 ${
              i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-400"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 셀 — 7열 그리드 */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="min-h-[68px] sm:min-h-[120px]" />;
          }
          const ds = dateStr(day);
          const milestones = milestonesByDate.get(ds) ?? [];
          const isToday = ds === today;
          const isSelected = ds === selectedDate;
          const dow = (firstDow + day - 1) % 7;
          const isRed = isRedDay(ds, dow);
          const isSat = dow === 6;
          const holidayName = getHolidayName(ds);

          const dayBgStyle = isSelected
            ? undefined
            : isRed
              ? { backgroundColor: "var(--cal-sunday-bg)" }
              : isSat
                ? { backgroundColor: "var(--cal-saturday-bg)" }
                : undefined;

          const dayNumColor = isToday
            ? ""
            : isRed
              ? "text-red-400"
              : isSat
                ? "text-blue-400"
                : "text-slate-700";

          const visibleChips = milestones.slice(0, MAX_VISIBLE_CHIPS);
          const hiddenCount = milestones.length - visibleChips.length;

          const isDropTarget = dragOverDate === ds && draggingKey !== null;

          return (
            <div
              key={ds}
              onClick={() => onDateSelect(isSelected ? null : ds)}
              onDragOver={(e) => {
                if (!draggingKey) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverDate !== ds) setDragOverDate(ds);
              }}
              onDragLeave={() => {
                if (dragOverDate === ds) setDragOverDate(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const data = e.dataTransfer.getData("text/plain");
                setDragOverDate(null);
                setDraggingKey(null);
                if (!data) return;
                const [campaignId, kind, fromDate] = data.split("|");
                if (!campaignId || !kind || !fromDate) return;
                void handleDrop(campaignId, kind as MilestoneKind, fromDate, ds);
              }}
              style={dayBgStyle}
              className={`min-h-[68px] sm:min-h-[120px] p-1 sm:p-2 rounded-lg sm:rounded-xl text-left transition-all duration-150 hover:bg-slate-50 cursor-pointer ${
                isSelected ? "ring-2 ring-brand-400 bg-brand-50/30" : ""
              } ${isDropTarget ? "ring-2 ring-brand-500 bg-brand-50/60" : ""}`}
            >
              {/* 날짜 숫자 + 공휴일명 */}
              <div className="flex items-center justify-between gap-1 mb-1 sm:mb-1.5 min-h-[22px] sm:min-h-[28px]">
                <span
                  className={`inline-flex items-center justify-center text-xs sm:text-sm font-bold ${
                    isToday ? "bg-brand-500 text-white rounded-full w-6 h-6 sm:w-7 sm:h-7" : dayNumColor
                  }`}
                >
                  {day}
                </span>
                {holidayName && (
                  <span
                    className="hidden sm:inline text-[10px] font-semibold truncate leading-tight"
                    style={{ color: "var(--cal-holiday-label)" }}
                    title={holidayName}
                  >
                    {holidayName}
                  </span>
                )}
              </div>

              {/* 모바일: 점 도트만 표시 */}
              <div className="sm:hidden flex flex-wrap items-center gap-0.5 mt-0.5">
                {milestones.slice(0, MOBILE_MAX_DOTS).map((m: CampaignMilestone) => (
                  <span
                    key={`m-${m.campaign.id}-${m.kind}`}
                    className={`w-1.5 h-1.5 rounded-full ${MILESTONE_DOT_BG[m.kind]}`}
                    title={getMilestoneStyle(m.kind).label}
                  />
                ))}
                {milestones.length > MOBILE_MAX_DOTS && (
                  <span className="text-[9px] text-slate-400 leading-none ml-0.5">
                    +{milestones.length - MOBILE_MAX_DOTS}
                  </span>
                )}
              </div>

              {/* 데스크탑: 마일스톤 칩 */}
              <div className="hidden sm:block space-y-0.5">
                {visibleChips.map((m: CampaignMilestone) => {
                  const style = getMilestoneStyle(m.kind);
                  const username = m.campaign.influencer?.username ?? "?";
                  const displayName = cleanDisplayName(m.campaign.influencer?.display_name, username);
                  const hasName = displayName && displayName !== `@${username}`;
                  const campaignName = m.campaign.campaign_name ?? "";
                  const isAutoName = campaignName === `@${username} 시딩`;
                  const tooltipText = isAutoName
                    ? `${style.label} · @${username}${hasName ? ` (${displayName})` : ""}`
                    : `${style.label} · @${username} · ${campaignName}`;
                  const chipKey = `${m.campaign.id}|${m.kind}`;
                  const isDragging = draggingKey === chipKey;
                  return (
                    <button
                      type="button"
                      key={`${m.campaign.id}-${m.kind}`}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData(
                          "text/plain",
                          `${m.campaign.id}|${m.kind}|${m.dateStr}`,
                        );
                        setDraggingKey(chipKey);
                      }}
                      onDragEnd={() => {
                        setDraggingKey(null);
                        setDragOverDate(null);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onCampaignClick) onCampaignClick(m.campaign.influencer_id);
                      }}
                      className={`w-full flex items-center gap-1 text-left text-[11px] font-medium px-1.5 py-0.5 rounded border ${style.bg} ${style.text} ${style.border} hover:brightness-95 transition-all truncate cursor-grab active:cursor-grabbing ${
                        isDragging ? "opacity-40" : ""
                      }`}
                      title={tooltipText}
                    >
                      <span className="shrink-0">{style.icon}</span>
                      <span className="truncate">
                        @{username}
                        {hasName && <span className="ml-1 opacity-70">{displayName}</span>}
                      </span>
                    </button>
                  );
                })}
                {hiddenCount > 0 && (
                  <div className="text-[10px] text-slate-400 px-1 mt-0.5 font-medium">
                    +{hiddenCount}개
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 범례 — 3개 액션 */}
      <div className="mt-4 flex flex-wrap gap-3 pt-3 border-t border-slate-100">
        {(["dm", "ship", "post"] as const).map((k) => {
          const s = getMilestoneStyle(k);
          return (
            <div key={k} className="flex items-center gap-1.5">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded border ${s.bg} ${s.border} text-[10px]`}>
                {s.icon}
              </span>
              <span className="text-[10px] text-slate-500">{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
