"use client";

// TMA 계약 관리 페이지 셸 — 탭 / 요약·상태 칩 / 검색·필터 / 테이블 / 상세 패널 / 폼 모달 조립.
// 100건 규모라 서버에서 전량을 받아 클라이언트에서 즉시 필터링한다.

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import MagnifyingGlass from "phosphor-react/dist/icons/MagnifyingGlass.esm.js";
import X from "phosphor-react/dist/icons/X.esm.js";
import Select from "@/components/shared/Select";
import InfluencerTabs from "../InfluencerTabs";
import ContractsTable from "./ContractsTable";
import ContractDetailPanel from "./ContractDetailPanel";
import { getErrorMessage } from "@/lib/utils/errors";
import { updateContractStatus } from "@/lib/influencer/contracts/actions";
import {
  COLLAB_TYPE_LABEL,
  COLLAB_TYPE_OPTIONS,
  CONTRACT_STATUS_DOT_CLASSES,
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_ORDER,
  CONTRACT_STATUS_OPTIONS,
  PRODUCT_LABEL,
  PRODUCT_OPTIONS,
  RAW_FOOTAGE_LABEL,
  SECONDARY_USAGE_LABEL,
  SECONDARY_USAGE_OPTIONS,
  SETTLEMENT_TYPE_LABEL,
} from "@/lib/influencer/contracts/labels";
import { formatPostMonth, getPostMonth, getRetentionEnd } from "@/lib/influencer/contracts/dates";
import { URGENT_SOON_DAYS } from "@/lib/influencer/contracts/constants";
import { useInfluencerSuggestions } from "@/lib/influencer/contracts/useInfluencerSuggestions";
import type { InfluencerListItem } from "@/lib/influencer/types";
import { formatKrw } from "@/lib/expenses/format";
import type {
  ContractSettlement,
  ContractStatus,
  InfluencerContract,
} from "@/lib/influencer/contracts/types";
import { kstNow, toDateString } from "@/lib/utils/date";

// 폼/내보내기 모달은 열 때만 로드(초기 JS 절약)
const ContractFormModal = dynamic(() => import("./ContractFormModal"), { ssr: false });
const SettlementFormModal = dynamic(() => import("./SettlementFormModal"), { ssr: false });
const SettlementExportModal = dynamic(() => import("./SettlementExportModal"), { ssr: false });

/** 새 계약 폼 미리 채움 — 리스트 탭 "TMA 계약 만들기" 또는 검색어로 만들기에서 사용 */
export interface ContractPrefill {
  influencerId?: string;
  name?: string;
  handle?: string;
}

interface Props {
  contracts: InfluencerContract[];
  settlementContractIds: string[];
  gateConfigured: boolean;
  initialUnlocked: boolean;
  prefill: ContractPrefill | null;
}

const filterSelectCls =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600";

export default function ContractsPageClient({
  contracts,
  settlementContractIds,
  gateConfigured,
  initialUnlocked,
  prefill,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [secondaryFilter, setSecondaryFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  // 폼 상태: null = 닫힘 / contract = 수정 / prefill = 미리 채움(리스트 원클릭·검색어로 만들기)
  const [formState, setFormState] = useState<{
    contract: InfluencerContract | null;
    prefill: ContractPrefill | null;
  } | null>(prefill ? { contract: null, prefill } : null);
  const [settlementTarget, setSettlementTarget] = useState<{
    contract: InfluencerContract;
    settlement: ContractSettlement | null;
  } | null>(null);
  const [unlocked, setUnlocked] = useState(initialUnlocked);
  // 정산 정보가 저장될 때마다 +1 → 상세 패널이 다시 불러온다
  const [settlementVersion, setSettlementVersion] = useState(0);

  const settlementIds = useMemo(() => new Set(settlementContractIds), [settlementContractIds]);
  const today = useMemo(() => toDateString(kstNow()), []);

  const handleRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  // 미리 채움 파라미터는 폼을 연 뒤 주소창에서 지운다(새로고침 시 재실행 방지)
  useEffect(() => {
    if (prefill) router.replace("/dashboard/influencer/contracts");
  }, [prefill, router]);

  // 게시월 옵션은 데이터에 실제로 있는 달만 보여준다
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    for (const c of contracts) {
      const m = getPostMonth(c.post_actual_date, c.post_planned_date);
      if (m) months.add(m);
    }
    return [...months].sort().map((m) => ({ value: m, label: formatPostMonth(m) }));
  }, [contracts]);

  const searchTerm = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      if (searchTerm && !c.name.toLowerCase().includes(searchTerm) && !c.instagram_handle.toLowerCase().includes(searchTerm)) {
        return false;
      }
      if (statusFilter && c.contract_status !== statusFilter) return false;
      if (typeFilter && c.collab_type !== typeFilter) return false;
      if (productFilter && c.product !== productFilter) return false;
      if (secondaryFilter && c.secondary_usage !== secondaryFilter) return false;
      if (monthFilter && getPostMonth(c.post_actual_date, c.post_planned_date) !== monthFilter) return false;
      return true;
    });
  }, [contracts, searchTerm, statusFilter, typeFilter, productFilter, secondaryFilter, monthFilter]);

  const statusCounts = useMemo(() => {
    const counts = new Map<ContractStatus, number>();
    for (const c of contracts) {
      counts.set(c.contract_status, (counts.get(c.contract_status) ?? 0) + 1);
    }
    return counts;
  }, [contracts]);

  const hasActiveFilter = Boolean(statusFilter || typeFilter || productFilter || secondaryFilter || monthFilter);

  const selectedContract = useMemo(
    () => (selectedId ? contracts.find((c) => c.id === selectedId) ?? null : null),
    [contracts, selectedId],
  );

  const handleStatusChange = useCallback(
    (id: string, status: ContractStatus) => {
      const run = async () => {
        try {
          const result = await updateContractStatus(id, status);
          toast.success(`상태가 '${CONTRACT_STATUS_LABEL[status]}'(으)로 변경되었습니다.`);
          if (result.expenseAmount > 0) {
            toast.success(`💰 지출관리에 ${formatKrw(result.expenseAmount)}을 자동 기록했어요.`);
          }
          handleRefresh();
        } catch (err) {
          toast.error(getErrorMessage(err, "상태 변경 실패"));
        }
      };
      run();
    },
    [handleRefresh],
  );

  const toggleSelect = useCallback((id: string, on: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (on: boolean) => {
      setCheckedIds(on ? new Set(filtered.map((c) => c.id)) : new Set());
    },
    [filtered],
  );

  const checkedContracts = useMemo(
    () => contracts.filter((c) => checkedIds.has(c.id)),
    [contracts, checkedIds],
  );

  /** 필터 걸린 목록 그대로 엑셀로 — xlsx 는 버튼을 눌렀을 때만 로드 */
  const handleExcelExport = useCallback(async () => {
    try {
      const XLSX = await import("xlsx");
      const sheetRows = filtered.map((c) => ({
        "이름/채널명": c.name,
        "Instagram": c.instagram_handle ? `@${c.instagram_handle}` : "",
        "협업 유형": COLLAB_TYPE_LABEL[c.collab_type],
        "제공 제품": PRODUCT_LABEL[c.product],
        "제품명·구성": c.product_detail ?? "",
        "소비자가(원)": c.retail_price ?? "",
        "약정가액(원)": c.agreed_value ?? "",
        "광고비 총액(원)": c.ad_fee_total ?? "",
        "부가세": c.collab_type === "paid" ? (c.ad_fee_vat_included ? "포함" : "별도") : "",
        "정산 구분": c.settlement_type ? SETTLEMENT_TYPE_LABEL[c.settlement_type] : "",
        "사업자등록번호": c.business_reg_no ?? "",
        "2차 활용": SECONDARY_USAGE_LABEL[c.secondary_usage],
        "2차 활용 비용(원)": c.secondary_usage_fee ?? "",
        "2차 활용 기간":
          c.secondary_usage === "not_allowed"
            ? ""
            : `${c.secondary_usage_start ?? ""} ~ ${c.secondary_usage_end ?? ""}`,
        "촬영 원본": RAW_FOOTAGE_LABEL[c.raw_footage],
        "제품 발송일": c.product_ship_date ?? "",
        "초안 전달일": c.draft_due_date ?? "",
        "게시 예정일": c.post_planned_date ?? "",
        "실제 게시일": c.post_actual_date ?? "",
        "게시 유지 종료일": getRetentionEnd(c.post_actual_date) ?? "",
        "계약 상태": CONTRACT_STATUS_LABEL[c.contract_status],
        "모두싸인 링크": c.modusign_url ?? "",
        "메모": c.memo ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "TMA 계약");
      XLSX.writeFile(wb, `TMA-계약목록-${today}.xlsx`);
      toast.success(`${filtered.length}건을 엑셀로 내려받았어요.`);
    } catch (err) {
      toast.error(getErrorMessage(err, "엑셀 내보내기 실패"));
    }
  }, [filtered, today]);

  const openNewForm = () => setFormState({ contract: null, prefill: null });
  const openEditForm = (contract: InfluencerContract) =>
    setFormState({ contract, prefill: null });
  /** 검색 결과가 없을 때 검색어 그대로 새 계약 시작 (이름 칸 자동완성이 바로 뜬다) */
  const openFormFromSearch = () =>
    setFormState({ contract: null, prefill: { name: search.trim() } });

  // 검색창 자동완성 — 리스트(influencers)에서 찾아 드랍다운으로 보여준다
  const listSuggestions = useInfluencerSuggestions(search, searchFocused);
  const contractByInfluencer = useMemo(() => {
    const byId = new Map<string, InfluencerContract>();
    const byHandle = new Map<string, InfluencerContract>();
    for (const c of contracts) {
      if (c.influencer_id) byId.set(c.influencer_id, c);
      if (c.instagram_handle) byHandle.set(c.instagram_handle.toLowerCase(), c);
    }
    return { byId, byHandle };
  }, [contracts]);

  const findContractFor = (inf: InfluencerListItem) =>
    contractByInfluencer.byId.get(inf.id) ??
    contractByInfluencer.byHandle.get(inf.username.toLowerCase());

  /** 드랍다운에서 선택 — 계약이 있으면 상세를 열고, 없으면 연결된 새 계약 폼을 연다 */
  const pickSuggestion = (inf: InfluencerListItem) => {
    setSearchFocused(false);
    const existing = findContractFor(inf);
    if (existing) {
      setSelectedId(existing.id);
      return;
    }
    setFormState({
      contract: null,
      prefill: {
        influencerId: inf.id,
        name: inf.display_name?.trim() || inf.username,
        handle: inf.username,
      },
    });
  };

  return (
    <div className="flex flex-col gap-3 sm:gap-4 px-0 py-3 sm:p-6 min-h-0">
      <InfluencerTabs />

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        {/* 제목 + 추가 버튼 */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
          <h1 className="text-base font-extrabold text-slate-800">
            TMA 계약 관리
            <span className="ml-2 text-xs font-normal text-slate-400">
              {filtered.length}명 / 전체 {contracts.length}명
            </span>
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/dashboard/influencer/contracts/templates")}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              📄 계약서 양식
            </button>
            <button
              type="button"
              onClick={handleExcelExport}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              ⬇ 엑셀
            </button>
            <button
              type="button"
              onClick={openNewForm}
              className="rounded-xl bg-[#2563eb] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all"
            >
              ＋ 새 계약 추가
            </button>
          </div>
        </div>

        {/* 선택 모드 바 */}
        {checkedIds.size > 0 && (
          <div className="mx-5 mt-3 flex flex-wrap items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700">
            <span>{checkedIds.size}명 선택됨</span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              🔒 정산 자료 다운로드
            </button>
            <button
              type="button"
              onClick={() => setCheckedIds(new Set())}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              선택 해제
            </button>
          </div>
        )}

        {/* 상태별 칩 */}
        <div className="flex flex-wrap gap-1.5 px-5 pt-3" aria-label="상태별 개수">
          <button
            type="button"
            onClick={() => setStatusFilter("")}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              statusFilter === ""
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            전체 <b>{contracts.length}</b>
          </button>
          {CONTRACT_STATUS_ORDER.map((status) => {
            const count = statusCounts.get(status) ?? 0;
            if (count === 0) return null;
            const active = statusFilter === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(active ? "" : status)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {CONTRACT_STATUS_LABEL[status]} <b>{count}</b>
              </button>
            );
          })}
        </div>

        {/* 검색 + 필터 */}
        <div className="grid grid-cols-2 gap-2 px-5 py-3.5 lg:grid-cols-[minmax(0,1fr)_repeat(5,150px)]">
          <div className="relative col-span-2 lg:col-span-1">
            <label className="relative block">
              <span className="sr-only">검색</span>
              <MagnifyingGlass
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSearchFocused(true); // 타이핑 중에는 항상 드랍다운을 연다(블러 타이머와의 경합 방지)
                }}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                placeholder="이름·채널명·인스타 계정 검색"
                autoComplete="off"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
                  aria-label="검색어 지우기"
                >
                  <X size={14} />
                </button>
              )}
            </label>
            {/* 리스트 자동완성 드랍다운 — 계약이 있으면 열고, 없으면 바로 만든다 */}
            {searchFocused && listSuggestions.length > 0 && (
              <ul
                className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-100 bg-white p-1 shadow-xl shadow-slate-900/10"
                role="listbox"
                aria-label="리스트에서 찾은 인플루언서"
              >
                {listSuggestions.map((inf) => {
                  const existing = findContractFor(inf);
                  return (
                    <li key={inf.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickSuggestion(inf)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-blue-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-700">
                            {inf.display_name?.trim() || inf.username}
                          </span>
                          <span className="block text-xs text-slate-400">
                            @{inf.username}
                            {typeof inf.follower_count === "number" &&
                              ` · 팔로워 ${inf.follower_count.toLocaleString("ko-KR")}`}
                          </span>
                        </span>
                        {existing ? (
                          <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            계약 보기
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                            ＋ 새 계약
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <Select
            options={[
              { value: "", label: "상태: 전체" },
              ...CONTRACT_STATUS_OPTIONS.map((opt) => ({
                ...opt,
                dotClass: CONTRACT_STATUS_DOT_CLASSES[opt.value],
              })),
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
            ariaLabel="계약 상태 필터"
            className={filterSelectCls}
          />
          <Select
            options={[{ value: "", label: "협업 유형: 전체" }, ...COLLAB_TYPE_OPTIONS]}
            value={typeFilter}
            onChange={setTypeFilter}
            ariaLabel="협업 유형 필터"
            className={filterSelectCls}
          />
          <Select
            options={[{ value: "", label: "제품: 전체" }, ...PRODUCT_OPTIONS]}
            value={productFilter}
            onChange={setProductFilter}
            ariaLabel="제품 필터"
            className={filterSelectCls}
          />
          <Select
            options={[{ value: "", label: "2차 활용: 전체" }, ...SECONDARY_USAGE_OPTIONS]}
            value={secondaryFilter}
            onChange={setSecondaryFilter}
            ariaLabel="2차 활용 필터"
            className={filterSelectCls}
          />
          <Select
            options={[{ value: "", label: "게시월: 전체" }, ...monthOptions]}
            value={monthFilter}
            onChange={setMonthFilter}
            ariaLabel="게시월 필터"
            className={filterSelectCls}
          />
        </div>

        {/* 테이블 */}
        <ContractsTable
          contracts={filtered}
          totalCount={contracts.length}
          settlementIds={settlementIds}
          today={today}
          hasSearch={Boolean(searchTerm)}
          hasActiveFilter={hasActiveFilter}
          selectedIds={checkedIds}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          onSelect={setSelectedId}
          onStatusChange={handleStatusChange}
          searchTerm={search.trim()}
          onCreateFromSearch={openFormFromSearch}
        />

        {/* 날짜 강조 안내 */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-400">
          <span>
            <span className="rounded bg-amber-50 px-1 py-0.5 font-semibold text-amber-700">노란색</span>{" "}
            {URGENT_SOON_DAYS}일 이내 임박
          </span>
          <span>
            <span className="font-semibold text-red-600">빨간색</span> 날짜 지남
          </span>
          <span>취소·정산 완료 행은 강조하지 않아요</span>
        </div>
      </div>

      {/* 상세 패널 */}
      <ContractDetailPanel
        contract={selectedContract}
        gateConfigured={gateConfigured}
        unlocked={unlocked}
        settlementVersion={settlementVersion}
        onUnlockedChange={setUnlocked}
        onClose={() => setSelectedId(null)}
        onEdit={openEditForm}
        onEditSettlement={(contract, settlement) => setSettlementTarget({ contract, settlement })}
        onStatusChange={handleStatusChange}
        onDeleted={() => {
          setSelectedId(null);
          handleRefresh();
        }}
      />

      {/* 계약 폼 */}
      {formState && (
        <ContractFormModal
          contract={formState.contract}
          prefill={formState.prefill}
          onClose={() => setFormState(null)}
          onSaved={() => {
            setFormState(null);
            handleRefresh();
          }}
        />
      )}

      {/* 정산 자료 다운로드 (선택 인원) */}
      {exportOpen && (
        <SettlementExportModal
          contracts={checkedContracts}
          gateConfigured={gateConfigured}
          unlocked={unlocked}
          onUnlockedChange={setUnlocked}
          onClose={() => setExportOpen(false)}
        />
      )}

      {/* 정산 정보 폼 (잠금 해제 상태에서 상세 패널을 통해서만 열림) */}
      {settlementTarget && (
        <SettlementFormModal
          contract={settlementTarget.contract}
          settlement={settlementTarget.settlement}
          onClose={() => setSettlementTarget(null)}
          onSaved={() => {
            setSettlementTarget(null);
            setSettlementVersion((v) => v + 1); // 상세 패널이 최신 정산 정보를 다시 불러온다
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}
