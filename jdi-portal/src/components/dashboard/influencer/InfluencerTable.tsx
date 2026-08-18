"use client";

import { getErrorMessage } from "@/lib/utils/errors";
import { useState, useTransition, useRef, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import DotsThreeVertical from "phosphor-react/dist/icons/DotsThreeVertical.esm.js";
import ArrowsClockwise from "phosphor-react/dist/icons/ArrowsClockwise.esm.js";
import Archive from "phosphor-react/dist/icons/Archive.esm.js";
import Trash from "phosphor-react/dist/icons/Trash.esm.js";
import Eye from "phosphor-react/dist/icons/Eye.esm.js";
import Plus from "phosphor-react/dist/icons/Plus.esm.js";
import MagnifyingGlass from "phosphor-react/dist/icons/MagnifyingGlass.esm.js";
import X from "phosphor-react/dist/icons/X.esm.js";
import GradeBadge from "./GradeBadge";
import ContractLink from "./ContractLink";
import { resyncInfluencer, resyncAllInfluencers, archiveInfluencer, deleteInfluencer } from "@/lib/influencer/actions";
import ContractStatusDropdown from "./contracts/ContractStatusDropdown";
import ContractStatusBadge from "./contracts/ContractStatusBadge";
import { updateContractStatus } from "@/lib/influencer/contracts/actions";
import { campaignToContractStatus } from "@/lib/influencer/contracts/statusMap";
import { CONTRACT_STATUS_LABEL, CONTRACT_STATUS_OPTIONS } from "@/lib/influencer/contracts/labels";
import type { ContractListSummary } from "@/lib/influencer/contracts/types";
import type { ContractStatus } from "@/lib/influencer/contracts/types";
import Image from "next/image";
import { resolveMediaUrl, shouldSkipOptimize } from "@/lib/influencer/proxy";
import { formatKRW } from "@/lib/influencer/format";
import { APIFY_COST_PER_INFLUENCER_KRW } from "@/lib/influencer/constants";
import { getTier, calcErVsTierAverage } from "@/lib/influencer/metrics";
import type { InfluencerTier } from "@/lib/influencer/metrics";
import type { InfluencerListItem, InfluencerCampaign, CampaignBasic } from "@/lib/influencer/types";
import type { FilterState } from "./InfluencerFilters";

function formatFollowers(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatEngagementRate(n: number | null): string {
  if (n === null) return "-";
  return `${n.toFixed(1)}%`;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const updateIsMobile = () => setIsMobile(mediaQuery.matches);

    updateIsMobile();
    mediaQuery.addEventListener("change", updateIsMobile);
    return () => mediaQuery.removeEventListener("change", updateIsMobile);
  }, []);

  return isMobile;
}


function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded-full text-[11px] text-slate-600">
      {label}
      <button type="button" onClick={onRemove} className="text-slate-400 hover:text-rose-500" aria-label="제거">×</button>
    </span>
  );
}

const GRADE_OPTS = [
  { key: "S", label: "S" },
  { key: "A", label: "A" },
  { key: "B", label: "B" },
  { key: "C", label: "C" },
  { key: "UNRATED", label: "미분류" },
] as const;

const TIER_OPTS: { key: InfluencerTier; label: string }[] = [
  { key: "nano", label: "나노 (~1만)" },
  { key: "micro", label: "마이크로 (1만~5만)" },
  { key: "mid", label: "미드 (5만~50만)" },
  { key: "macro", label: "매크로 (50만~100만)" },
  { key: "mega", label: "메가 (100만+)" },
];

interface HeaderFilterPopoverProps<T extends string> {
  open: boolean;
  anchorRect: DOMRect | null;
  options: { key: T; label: string }[];
  selected: T[];
  onChange: (next: T[]) => void;
  onClose: () => void;
}

function HeaderFilterPopover<T extends string>({
  open,
  anchorRect,
  options,
  selected,
  onChange,
  onClose,
}: HeaderFilterPopoverProps<T>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
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
  }, [open, onClose]);

  if (!open || !anchorRect || typeof document === "undefined") return null;

  function toggle(key: T) {
    const next = selected.includes(key)
      ? selected.filter((x) => x !== key)
      : [...selected, key];
    onChange(next);
  }

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: anchorRect.bottom + 4,
        left: anchorRect.left,
        width: 180,
        zIndex: 9999,
      }}
      className="bg-white rounded-xl shadow-lg border border-slate-200 p-2"
    >
      {options.map((opt) => (
        <label
          key={opt.key}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer text-sm"
        >
          <input
            type="checkbox"
            checked={selected.includes(opt.key)}
            onChange={() => toggle(opt.key)}
            className="w-3.5 h-3.5"
          />
          <span>{opt.label}</span>
        </label>
      ))}
      <hr className="my-1.5 border-slate-100" />
      <button
        type="button"
        onClick={() => onChange([])}
        className="w-full text-left px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-md"
      >
        초기화
      </button>
    </div>,
    document.body
  );
}

function ErTierEvaluation({ er, follower }: { er: number | null; follower: number | null }) {
  const delta = calcErVsTierAverage(er, follower);
  if (delta === null) return null;
  const isUp = delta >= 0;
  const sign = isUp ? "▲" : "▼";
  const cls = isUp ? "text-emerald-600" : "text-rose-500";
  return (
    <span className={`text-[10px] ${cls} font-medium tabular-nums`}>
      {sign} 평균 {isUp ? "+" : ""}{Math.round(delta)}%
    </span>
  );
}

interface RowMenuProps {
  influencerId: string;
  username: string;
  displayName: string | null;
  /** 이미 계약이 있으면 "만들기" 대신 "열기"를 보여준다(중복 계약 방지) */
  contract: ContractListSummary | undefined;
  onViewDetail: () => void;
  onRefresh: () => void;
}

function RowMenu({ influencerId, username, displayName, contract, onViewDetail, onRefresh }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  /**
   * TMA 계약 탭으로 이동한다.
   * 계약이 이미 있으면 그 계약을 열고, 없을 때만 정보가 미리 채워진 새 폼을 연다.
   * (예전에는 계약이 있어도 "만들기"만 보여줘서 같은 사람 계약이 둘 생길 수 있었다)
   */
  function handleCreateContract() {
    setOpen(false);
    if (contract) {
      router.push(`/dashboard/influencer/contracts?openId=${contract.contract_id}`);
      return;
    }
    const params = new URLSearchParams({
      prefillId: influencerId,
      prefillName: displayName?.trim() || username,
      prefillHandle: username,
    });
    router.push(`/dashboard/influencer/contracts?${params.toString()}`);
  }

  const MENU_WIDTH = 160;
  const MENU_HEIGHT = 180;

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const showAbove = spaceBelow < MENU_HEIGHT + 16;
      setPos({
        top: showAbove ? rect.top - MENU_HEIGHT - 4 : rect.bottom + 4,
        left: Math.max(8, rect.right - MENU_WIDTH),
      });
    }
    setOpen((v) => !v);
  }

  function handleResync() {
    setOpen(false);
    startTransition(async () => {
      const id = toast.loading("재동기화 중...");
      try {
        await resyncInfluencer(influencerId);
        toast.success("재동기화 완료", { id });
        onRefresh();
      } catch (err) {
        toast.error(getErrorMessage(err, "재동기화 실패"), { id });
      }
    });
  }

  function handleArchive() {
    setOpen(false);
    startTransition(async () => {
      const id = toast.loading("보관 처리 중...");
      try {
        await archiveInfluencer(influencerId);
        toast.success("보관되었습니다", { id });
        onRefresh();
      } catch (err) {
        toast.error(getErrorMessage(err, "보관 실패"), { id });
      }
    });
  }

  function handleDelete() {
    setOpen(false);
    if (!confirm("정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
    startTransition(async () => {
      const id = toast.loading("삭제 중...");
      try {
        await deleteInfluencer(influencerId);
        toast.success("삭제되었습니다", { id });
        onRefresh();
      } catch (err) {
        toast.error(getErrorMessage(err, "삭제 실패"), { id });
      }
    });
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
      >
        <DotsThreeVertical size={16} />
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="z-50 bg-white rounded-xl shadow-lg border border-slate-100 py-1 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onViewDetail(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Eye size={14} /> 상세보기
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleResync(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ArrowsClockwise size={14} /> 재동기화
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleCreateContract(); }}
              className="w-full flex items-center gap-2 px-3 py-2 font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
            >
              {contract ? "📄 TMA 계약 열기" : "🎄 TMA 계약 만들기"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleArchive(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Archive size={14} /> 보관
            </button>
            <hr className="my-1 border-slate-100" />
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <Trash size={14} /> 삭제
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

interface StatusCellProps {
  campaign: InfluencerCampaign | undefined;
  /** TMA 계약이 있으면 계약 상태(10단계)가 이 사람의 진짜 상태다 */
  contract: ContractListSummary | undefined;
  influencerId: string;
  influencerUsername: string;
  onRefresh: () => void;
  /** 「시딩 시작」 — 계약과 시딩건을 함께 만들고 곧바로 계약 폼을 연다 */
  onStartSeeding: (influencerId: string) => void;
  seedingBusy: boolean;
}

/**
 * 진행 상태 칸. **보여주는 상태는 언제나 계약 10단계 하나뿐**이다.
 *
 * 예전에는 계약이 있으면 10단계, 없으면 캠페인 6단계를 보여줘서 같은 사람이
 * 화면마다 다른 이름의 상태로 보였고(리스트 '후보' ↔ 스케줄 '협의중'),
 * 필터에는 '후보'라는 선택지조차 없었다.
 */
function StatusCell({
  campaign,
  contract,
  influencerId,
  influencerUsername,
  onRefresh,
  onStartSeeding,
  seedingBusy,
}: StatusCellProps) {
  const [, startTransition] = useTransition();

  if (contract) {
    const contractId = contract.contract_id;
    const handleContractStatusChange = (next: ContractStatus) => {
      startTransition(async () => {
        try {
          const { expenseAmount } = await updateContractStatus(contractId, next);
          if (expenseAmount > 0) {
            toast.success(`정산 완료 — 지출관리에 ${formatKRW(expenseAmount)} 기록했습니다.`);
          }
          onRefresh();
        } catch (err) {
          toast.error(getErrorMessage(err, "계약 상태 변경 실패"));
        }
      });
    };
    return (
      <div className="inline-flex" onClick={(e) => e.stopPropagation()}>
        <ContractStatusDropdown status={contract.contract_status} onChange={handleContractStatusChange} />
      </div>
    );
  }

  // 계약과 연결되지 않은 옛 시딩건 — 상태는 10단계로 환산해 보여주고,
  // 누르면 계약을 만들어 붙인다(새 시딩건을 또 만들지 않고 이 건을 흡수한다).
  if (campaign) {
    return (
      <button
        type="button"
        disabled={seedingBusy}
        title="계약과 연결되지 않은 시딩입니다. 눌러서 TMA 계약을 만들어 주세요."
        onClick={(e) => {
          e.stopPropagation();
          onStartSeeding(influencerId);
        }}
        className="inline-flex items-center gap-1 rounded-md transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        <ContractStatusBadge status={campaignToContractStatus(campaign.status)} />
        <span className="text-[10px] font-bold text-amber-500" aria-hidden>!</span>
      </button>
    );
  }

  return (
    <button
      disabled={seedingBusy}
      onClick={(e) => {
        e.stopPropagation();
        onStartSeeding(influencerId);
      }}
      aria-label={`@${influencerUsername} 시딩 시작`}
      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
    >
      <Plus size={11} weight="bold" />
      {seedingBusy ? "여는 중..." : "시딩 시작"}
    </button>
  );
}

interface Props {
  influencers: InfluencerListItem[];
  activeCampaigns: InfluencerCampaign[];
  allCampaigns: CampaignBasic[];
  /** influencer_id → TMA 계약 요약 (있으면 상태·배지가 계약 기준으로 바뀐다) */
  contractByInfluencer: Map<string, ContractListSummary>;
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
  onSelectInfluencer: (id: string) => void;
  onRefresh: () => void;
  /** 「시딩 시작」 — 계약과 시딩건을 함께 만들고 계약 폼을 연다(부모가 처리) */
  onStartSeeding: (influencerId: string) => void;
  seedingBusy: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

export default function InfluencerTable({ influencers, activeCampaigns, allCampaigns, contractByInfluencer, filters, onFiltersChange, onSelectInfluencer, onRefresh, onStartSeeding, seedingBusy, hasMore, loadingMore, onLoadMore }: Props) {
  const [resyncingAll, startResyncAll] = useTransition();
  const isMobile = useIsMobile();

  type OpenFilter = "grade" | "tier" | "status" | null;
  const [openFilter, setOpenFilter] = useState<OpenFilter>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const gradeBtnRef = useRef<HTMLButtonElement>(null);
  const tierBtnRef = useRef<HTMLButtonElement>(null);
  const statusBtnRef = useRef<HTMLButtonElement>(null);

  function openPop(which: OpenFilter, ref: React.RefObject<HTMLButtonElement | null>) {
    if (openFilter === which) {
      setOpenFilter(null);
      return;
    }
    setAnchorRect(ref.current?.getBoundingClientRect() ?? null);
    setOpenFilter(which);
  }

  // influencer_id → {totalCost, count}
  const seedingByInfluencer = useMemo(() => {
    const map = new Map<string, { totalCost: number; count: number }>();
    for (const c of allCampaigns) {
      const cur = map.get(c.influencer_id) ?? { totalCost: 0, count: 0 };
      cur.totalCost += c.cost ?? 0;
      cur.count += 1;
      map.set(c.influencer_id, cur);
    }
    return map;
  }, [allCampaigns]);

  function handleResyncAll() {
    const activeCount = influencers.filter((i) => i.status === "active").length;
    if (activeCount === 0) {
      toast.info("재동기화할 활성 인플루언서가 없습니다.");
      return;
    }
    const estimatedCost = activeCount * APIFY_COST_PER_INFLUENCER_KRW;
    if (
      !confirm(
        `활성 인플루언서 ${activeCount}명을 모두 다시 긁어옵니다.\n\n` +
          `· 예상 시간: 약 ${activeCount * 5}초\n` +
          `· 예상 비용: 약 ${formatKRW(estimatedCost)} (Apify 크레딧 차감)\n\n` +
          `진행할까요?`,
      )
    ) {
      return;
    }
    startResyncAll(async () => {
      const id = toast.loading(`전체 재동기화 중... (0/${activeCount})`);
      try {
        const result = await resyncAllInfluencers();
        if (result.failed === 0) {
          toast.success(`전체 재동기화 완료 (${result.success}/${result.total})`, { id });
        } else {
          toast.warning(`일부 실패: 성공 ${result.success}, 실패 ${result.failed}`, { id });
        }
        onRefresh();
      } catch (err) {
        toast.error(getErrorMessage(err, "전체 재동기화 실패"), { id });
      }
    });
  }

  // 캠페인 맵: influencer_id → 최신 active 캠페인
  const campaignMap = useMemo(() => {
    const map = new Map<string, InfluencerCampaign>();
    for (const c of activeCampaigns) {
      if (!map.has(c.influencer_id)) map.set(c.influencer_id, c);
    }
    return map;
  }, [activeCampaigns]);

  // 날짜 마일스톤 인덱스: influencer_id → Set<date string>
  const milestoneByInfluencer = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of allCampaigns) {
      const set = map.get(c.influencer_id) ?? new Set<string>();
      if (c.contact_date) set.add(c.contact_date);
      if (c.contract_date) set.add(c.contract_date);
      if (c.ship_date) set.add(c.ship_date);
      if (c.content_deadline) set.add(c.content_deadline);
      if (c.expected_post_date) set.add(c.expected_post_date);
      map.set(c.influencer_id, set);
    }
    return map;
  }, [allCampaigns]);

  // 클라이언트 필터링 + 정렬
  const sorted = useMemo(() => {
    const filtered = influencers.filter((inf) => {
      if (filters.search) {
        const q = filters.search.toLowerCase().trim();
        if (q.length > 0) {
          // 검색 대상: 아이디(username), 이름(display_name), 카테고리, 바이오, 태그, 메모
          const haystack = [
            inf.username,
            inf.display_name ?? "",
            inf.category ?? "",
            ...(inf.tags ?? []),
          ].join(" ").toLowerCase();
          if (!haystack.includes(q)) return false;
        }
      }
      if (filters.grades.length > 0 && !filters.grades.includes(inf.grade)) return false;
      if (filters.categories.length > 0 && !filters.categories.includes(inf.category ?? "")) return false;
      if (filters.status !== "all" && inf.status !== filters.status) return false;
      if (filters.tags.length > 0) {
        const infTags = inf.tags ?? [];
        if (!filters.tags.every((t) => infTags.includes(t))) return false;
      }
      // 팔로워 tier 필터
      if (filters.followerTiers.length > 0) {
        const tier = getTier(inf.follower_count);
        if (!tier || !filters.followerTiers.includes(tier.key)) return false;
      }
      // 아직 시딩을 시작하지 않은 사람만 (계약만 있고 시딩건이 아직 안 붙은 경우도 제외)
      if (filters.noCampaign && (campaignMap.has(inf.id) || contractByInfluencer.has(inf.id)))
        return false;
      // 진행 상태 필터 — 화면 배지와 같은 계약 10단계로 비교한다.
      // (계약이 없는 옛 시딩건은 캠페인 6단계를 10단계 대표값으로 환산해서 맞춘다)
      if (filters.contractStatuses.length > 0) {
        const linked = contractByInfluencer.get(inf.id);
        const c = campaignMap.get(inf.id);
        const status = linked
          ? linked.contract_status
          : c
            ? campaignToContractStatus(c.status)
            : null;
        if (!status || !filters.contractStatuses.includes(status)) return false;
      }
      // 날짜 마일스톤 필터
      if (filters.dateMilestone) {
        const set = milestoneByInfluencer.get(inf.id);
        if (!set || !set.has(filters.dateMilestone)) return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => (b.engagement_rate ?? -1) - (a.engagement_rate ?? -1));
  }, [influencers, filters, campaignMap, contractByInfluencer, milestoneByInfluencer]);

  // 스크롤 컨테이너 안에서 전체 표시 — 페이지 자체는 늘어나지 않음.
  const displayed = sorted;

  // 등록된 인플루언서가 아예 없는 경우와, 검색·필터 때문에 0건인 경우를 구분해서 안내.
  const emptyMessage =
    influencers.length === 0
      ? "인플루언서가 없습니다. URL을 입력해 첫 번째 인플루언서를 추가해 보세요."
      : filters.search.trim().length > 0
        ? `'${filters.search.trim()}' 검색 결과가 없습니다.`
        : "조건에 맞는 인플루언서가 없습니다. 필터를 확인해 주세요.";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* 헤더 — 모바일: 제목+재동기화 1행 / 검색 별도 행. 데스크탑: 한 줄 */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-800 shrink-0">
          인플루언서 리스트 관리
          <span className="ml-2 text-xs font-normal text-slate-400">{sorted.length}명</span>
        </h2>
        <button
          type="button"
          onClick={handleResyncAll}
          disabled={resyncingAll}
          className="ml-auto sm:ml-0 sm:order-3 shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="활성 인플루언서 전체를 Apify로 다시 긁어옵니다"
        >
          <ArrowsClockwise size={12} weight="bold" className={resyncingAll ? "animate-spin" : ""} />
          <span className="hidden sm:inline">{resyncingAll ? "동기화 중..." : "전체 재동기화"}</span>
          <span className="sm:hidden">재동기화</span>
        </button>
        {/* 검색창: 아이디·이름·카테고리·바이오·태그 통합 검색 */}
        <div className="relative w-full sm:w-auto sm:flex-1 sm:max-w-xs sm:order-2">
          <MagnifyingGlass
            size={14}
            weight="bold"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            placeholder="아이디·이름·카테고리·태그 검색"
            className="w-full pl-7 pr-7 py-1.5 text-xs rounded-md border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 transition-colors placeholder:text-slate-400"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, search: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="검색어 지우기"
            >
              <X size={12} weight="bold" />
            </button>
          )}
        </div>
      </div>

      {/* 활성 필터 칩 */}
      {(filters.grades.length > 0 || filters.followerTiers.length > 0 || filters.contractStatuses.length > 0 || filters.dateMilestone || filters.noCampaign) && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 sm:px-6 py-2 border-b border-slate-50 bg-slate-50/40">
          <span className="text-[11px] text-slate-400">필터:</span>
          {filters.grades.map((g) => (
            <Chip
              key={`g-${g}`}
              label={`등급 ${g === "UNRATED" ? "미분류" : g}`}
              onRemove={() => onFiltersChange({ ...filters, grades: filters.grades.filter((x) => x !== g) })}
            />
          ))}
          {filters.followerTiers.map((t) => (
            <Chip
              key={`t-${t}`}
              label={`팔로워 ${TIER_OPTS.find((o) => o.key === t)?.label ?? t}`}
              onRemove={() => onFiltersChange({ ...filters, followerTiers: filters.followerTiers.filter((x) => x !== t) })}
            />
          ))}
          {filters.contractStatuses.map((s) => (
            <Chip
              key={`s-${s}`}
              label={`상태: ${CONTRACT_STATUS_LABEL[s] ?? s}`}
              onRemove={() => onFiltersChange({ ...filters, contractStatuses: filters.contractStatuses.filter((x) => x !== s) })}
            />
          ))}
          {filters.dateMilestone && (
            <Chip
              label={`날짜 ${filters.dateMilestone}`}
              onRemove={() => onFiltersChange({ ...filters, dateMilestone: null })}
            />
          )}
          {filters.noCampaign && (
            <Chip
              label="캠페인 없음"
              onRemove={() => onFiltersChange({ ...filters, noCampaign: false })}
            />
          )}
          <button
            type="button"
            onClick={() => onFiltersChange({ ...filters, grades: [], followerTiers: [], contractStatuses: [], dateMilestone: null, noCampaign: false })}
            className="ml-auto text-[11px] text-slate-500 hover:text-slate-700"
          >전체 해제</button>
        </div>
      )}

      {/* 모바일 카드 리스트 (sm 미만) */}
      {isMobile && (<>
      <div className="sm:hidden">
        {displayed.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-slate-400">
            {emptyMessage}
          </div>
        ) : (
          displayed.map((inf) => {
            const seeding = seedingByInfluencer.get(inf.id);
            const tier = getTier(inf.follower_count);
            return (
              <div
                key={inf.id}
                onClick={() => onSelectInfluencer(inf.id)}
                className="px-4 py-3 hover:bg-slate-50/60 cursor-pointer transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* 아바타 */}
                  <div className="w-11 h-11 rounded-full bg-slate-200 overflow-hidden shrink-0 ring-1 ring-slate-100 relative">
                    {(() => {
                      const src = resolveMediaUrl(inf.profile_image_url, inf.profile_image_path);
                      return src ? (
                        <Image
                          src={src}
                          alt={inf.username}
                          width={44}
                          height={44}
                          sizes="44px"
                          className="w-full h-full object-cover"
                          unoptimized={shouldSkipOptimize(src)}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-400">
                          {inf.username.charAt(0).toUpperCase()}
                        </div>
                      );
                    })()}
                  </div>

                  {/* 컨텐츠 */}
                  <div className="flex-1 min-w-0">
                    {/* 1행: 아이디 + 등급 + 메뉴 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="font-medium text-slate-800 truncate text-sm">@{inf.username}</p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = filters.grades.includes(inf.grade)
                              ? filters.grades.filter((g) => g !== inf.grade)
                              : [...filters.grades, inf.grade];
                            onFiltersChange({ ...filters, grades: next });
                          }}
                          title="이 등급으로 필터"
                          className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <GradeBadge grade={inf.grade} size="sm" />
                        </button>
                      </div>
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <RowMenu
                          influencerId={inf.id}
                          username={inf.username}
                          displayName={inf.display_name}
                          contract={contractByInfluencer.get(inf.id)}
                          onViewDetail={() => onSelectInfluencer(inf.id)}
                          onRefresh={onRefresh}
                        />
                      </div>
                    </div>
                    {/* 2행: 이름 + 카테고리 */}
                    {(inf.display_name || inf.category) && (
                      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                        {inf.display_name && (
                          <p className="text-xs text-slate-500 truncate">{inf.display_name}</p>
                        )}
                        {inf.category && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium leading-none shrink-0">
                            {inf.category}
                          </span>
                        )}
                      </div>
                    )}
                    {/* 3행: 지표 */}
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px]">
                      <span className="tabular-nums">
                        <span className="text-slate-400">ER </span>
                        <span className="font-medium text-slate-700">{formatEngagementRate(inf.engagement_rate)}</span>
                      </span>
                      <span className="tabular-nums">
                        <span className="text-slate-400">팔 </span>
                        <span className="font-medium text-slate-700">{formatFollowers(inf.follower_count)}</span>
                        {tier && <span className="text-[10px] text-slate-400 ml-0.5">{tier.shortLabel}</span>}
                      </span>
                      {seeding && seeding.count > 0 && (
                        <span className="tabular-nums">
                          <span className="text-slate-400">시딩 </span>
                          <span className="font-medium text-slate-700">{formatKRW(seeding.totalCost, { dashOnZero: true })}</span>
                          <span className="text-[10px] text-slate-400 ml-0.5">({seeding.count}건)</span>
                        </span>
                      )}
                    </div>
                    {/* 4행: 상태 — 진행 중 캠페인이나 계약이 있을 때만 표시(시딩 시작 버튼은 목록에서 숨김, 상세에서 진행) */}
                    {(campaignMap.get(inf.id) || contractByInfluencer.get(inf.id)) && (
                      <div className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <StatusCell
                          campaign={campaignMap.get(inf.id)}
                          contract={contractByInfluencer.get(inf.id)}
                          influencerId={inf.id}
                          influencerUsername={inf.username}
                          onRefresh={onRefresh}
                          onStartSeeding={onStartSeeding}
                          seedingBusy={seedingBusy}
                        />
                        <ContractLink contract={contractByInfluencer.get(inf.id)} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 데스크탑 테이블 (sm 이상) — 컨테이너 안에서 스크롤 (sticky 헤더, 스크롤바 숨김) */}
      </>)}

      {!isMobile && (
      <div className="block overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)] min-h-[320px] no-scrollbar">
        <table className="w-full text-sm">
          <thead className="hidden sm:table-header-group sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm">
            <tr className="border-b border-slate-100">
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">인플루언서</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">ER</th>
              <th className="text-right px-4 py-3 whitespace-nowrap">
                <button
                  ref={tierBtnRef}
                  type="button"
                  onClick={() => openPop("tier", tierBtnRef)}
                  className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide hover:text-slate-700 transition-colors ${
                    filters.followerTiers.length > 0 ? "text-blue-600 font-semibold" : "text-slate-500"
                  }`}
                >
                  팔로워 <span className="text-[10px]">▾</span>
                </button>
                <HeaderFilterPopover
                  open={openFilter === "tier"}
                  anchorRect={anchorRect}
                  options={TIER_OPTS}
                  selected={filters.followerTiers}
                  onChange={(next) => onFiltersChange({ ...filters, followerTiers: next })}
                  onClose={() => setOpenFilter(null)}
                />
              </th>
              <th className="text-center px-4 py-3 whitespace-nowrap">
                <button
                  ref={gradeBtnRef}
                  type="button"
                  onClick={() => openPop("grade", gradeBtnRef)}
                  className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide hover:text-slate-700 transition-colors ${
                    filters.grades.length > 0 ? "text-blue-600 font-semibold" : "text-slate-500"
                  }`}
                >
                  AI 등급 <span className="text-[10px]">▾</span>
                </button>
                <HeaderFilterPopover
                  open={openFilter === "grade"}
                  anchorRect={anchorRect}
                  options={GRADE_OPTS as unknown as { key: string; label: string }[]}
                  selected={filters.grades}
                  onChange={(next) => onFiltersChange({ ...filters, grades: next as FilterState["grades"] })}
                  onClose={() => setOpenFilter(null)}
                />
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">시딩 금액</th>
              <th className="text-left px-4 py-3 whitespace-nowrap">
                <button
                  ref={statusBtnRef}
                  type="button"
                  onClick={() => openPop("status", statusBtnRef)}
                  className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide hover:text-slate-700 transition-colors ${
                    filters.contractStatuses.length > 0 ? "text-blue-600 font-semibold" : "text-slate-500"
                  }`}
                >
                  상태 <span className="text-[10px]">▾</span>
                </button>
                <HeaderFilterPopover
                  open={openFilter === "status"}
                  anchorRect={anchorRect}
                  options={CONTRACT_STATUS_OPTIONS.map((o) => ({ key: o.value, label: o.label }))}
                  selected={filters.contractStatuses}
                  onChange={(next) => onFiltersChange({ ...filters, contractStatuses: next as FilterState["contractStatuses"] })}
                  onClose={() => setOpenFilter(null)}
                />
              </th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="block sm:table-row-group divide-y divide-slate-50">
            {displayed.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              displayed.map((inf) => {
                const seeding = seedingByInfluencer.get(inf.id);
                return (
                  <tr
                    key={inf.id}
                    onClick={() => onSelectInfluencer(inf.id)}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3 hover:bg-slate-50/60 cursor-pointer transition-colors group sm:table-row sm:px-0 sm:py-0"
                  >
                    {/* 인플루언서 */}
                    <td className="px-0 py-0 sm:px-6 sm:py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-200 overflow-hidden shrink-0 ring-1 ring-slate-100 relative">
                          {(() => {
                            const src = resolveMediaUrl(inf.profile_image_url, inf.profile_image_path);
                            return src ? (
                              <Image
                                src={src}
                                alt={inf.username}
                                width={36}
                                height={36}
                                sizes="36px"
                                className="w-full h-full object-cover"
                                unoptimized={shouldSkipOptimize(src)}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-400">
                                {inf.username.charAt(0).toUpperCase()}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate">@{inf.username}</p>
                          {inf.display_name && (
                            <p className="text-xs text-slate-500 truncate leading-tight">{inf.display_name}</p>
                          )}
                          {inf.category && (
                            <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium leading-none">
                              {inf.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* ER */}
                    <td className="hidden sm:table-cell px-4 py-3 text-right tabular-nums">
                      <div className="font-medium text-slate-700">{formatEngagementRate(inf.engagement_rate)}</div>
                      <ErTierEvaluation er={inf.engagement_rate} follower={inf.follower_count} />
                    </td>

                    {/* 팔로워 */}
                    <td className="hidden sm:table-cell px-4 py-3 text-right tabular-nums">
                      <div className="text-slate-600">{formatFollowers(inf.follower_count)}</div>
                      {(() => {
                        const tier = getTier(inf.follower_count);
                        return tier ? (
                          <span className="text-[10px] text-slate-400 font-medium">{tier.shortLabel}</span>
                        ) : null;
                      })()}
                    </td>

                    {/* AI 등급 */}
                    <td className="hidden sm:table-cell px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = filters.grades.includes(inf.grade)
                            ? filters.grades.filter((g) => g !== inf.grade)
                            : [...filters.grades, inf.grade];
                          onFiltersChange({ ...filters, grades: next });
                        }}
                        title="이 등급으로 필터"
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <GradeBadge grade={inf.grade} />
                      </button>
                    </td>

                    {/* 시딩 금액 */}
                    <td className="col-start-1 px-0 py-0 text-left tabular-nums sm:table-cell sm:px-4 sm:py-3 sm:text-right">
                      <div className="font-medium text-slate-700">
                        {seeding ? formatKRW(seeding.totalCost, { dashOnZero: true }) : "—"}
                      </div>
                      {seeding && seeding.count > 0 && (
                        <div className="text-[10px] text-slate-400">{seeding.count}건</div>
                      )}
                    </td>

                    {/* 상태 */}
                    <td className="col-start-1 px-0 py-0 sm:table-cell sm:px-4 sm:py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusCell
                          campaign={campaignMap.get(inf.id)}
                          contract={contractByInfluencer.get(inf.id)}
                          influencerId={inf.id}
                          influencerUsername={inf.username}
                          onRefresh={onRefresh}
                          onStartSeeding={onStartSeeding}
                          seedingBusy={seedingBusy}
                        />
                        <ContractLink contract={contractByInfluencer.get(inf.id)} />
                      </div>
                    </td>

                    {/* 메뉴 */}
                    <td className="col-start-2 row-start-1 px-0 py-0 sm:table-cell sm:px-4 sm:py-3">
                      <RowMenu
                        influencerId={inf.id}
                        username={inf.username}
                        displayName={inf.display_name}
                        contract={contractByInfluencer.get(inf.id)}
                        onViewDetail={() => onSelectInfluencer(inf.id)}
                        onRefresh={onRefresh}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      )}

      {hasMore && (
        <div className="px-4 sm:px-6 py-3 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingMore ? "불러오는 중..." : "더 불러오기"}
          </button>
        </div>
      )}

      {sorted.length > 50 && (
        <div className="px-4 sm:px-6 py-3 border-t border-slate-100 text-center text-xs text-slate-400">
          상위 50명만 표시됩니다
        </div>
      )}
    </div>
  );
}
