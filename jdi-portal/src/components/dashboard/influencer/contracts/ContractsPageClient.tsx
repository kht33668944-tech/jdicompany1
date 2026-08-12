"use client";

// TMA 계약 관리 페이지 셸 — 탭 / 요약·상태 칩 / 검색·필터 / 테이블 / 상세 패널 / 폼 모달 조립.
// 100건 규모라 서버에서 전량을 받아 클라이언트에서 즉시 필터링한다.

import { useCallback, useMemo, useState, useTransition } from "react";
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
  COLLAB_TYPE_OPTIONS,
  CONTRACT_STATUS_DOT_CLASSES,
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_ORDER,
  CONTRACT_STATUS_OPTIONS,
  PRODUCT_OPTIONS,
  SECONDARY_USAGE_OPTIONS,
} from "@/lib/influencer/contracts/labels";
import { formatPostMonth, getPostMonth } from "@/lib/influencer/contracts/dates";
import type {
  ContractSettlement,
  ContractStatus,
  InfluencerContract,
} from "@/lib/influencer/contracts/types";
import { kstNow, toDateString } from "@/lib/utils/date";

// 폼 모달은 열 때만 로드(초기 JS 절약)
const ContractFormModal = dynamic(() => import("./ContractFormModal"), { ssr: false });
const SettlementFormModal = dynamic(() => import("./SettlementFormModal"), { ssr: false });

interface Props {
  contracts: InfluencerContract[];
  settlementContractIds: string[];
  gateConfigured: boolean;
  initialUnlocked: boolean;
}

const filterSelectCls =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600";

export default function ContractsPageClient({
  contracts,
  settlementContractIds,
  gateConfigured,
  initialUnlocked,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [secondaryFilter, setSecondaryFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formContract, setFormContract] = useState<InfluencerContract | null>(null);
  const [settlementTarget, setSettlementTarget] = useState<{
    contract: InfluencerContract;
    settlement: ContractSettlement | null;
  } | null>(null);
  const [unlocked, setUnlocked] = useState(initialUnlocked);

  const settlementIds = useMemo(() => new Set(settlementContractIds), [settlementContractIds]);
  const today = useMemo(() => toDateString(kstNow()), []);

  const handleRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

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
          await updateContractStatus(id, status);
          toast.success(`상태가 '${CONTRACT_STATUS_LABEL[status]}'(으)로 변경되었습니다.`);
          handleRefresh();
        } catch (err) {
          toast.error(getErrorMessage(err, "상태 변경 실패"));
        }
      };
      run();
    },
    [handleRefresh],
  );

  const openNewForm = () => {
    setFormContract(null);
    setFormOpen(true);
  };
  const openEditForm = (contract: InfluencerContract) => {
    setFormContract(contract);
    setFormOpen(true);
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
          <button
            type="button"
            onClick={openNewForm}
            className="rounded-xl bg-[#2563eb] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all"
          >
            ＋ 새 계약 추가
          </button>
        </div>

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
          <label className="relative col-span-2 lg:col-span-1">
            <span className="sr-only">검색</span>
            <MagnifyingGlass
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름·채널명·인스타 계정 검색"
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
          onSelect={setSelectedId}
          onStatusChange={handleStatusChange}
        />

        {/* 날짜 강조 안내 */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-400">
          <span>
            <span className="rounded bg-amber-50 px-1 py-0.5 font-semibold text-amber-700">노란색</span> 3일 이내 임박
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
      {formOpen && (
        <ContractFormModal
          contract={formContract}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            handleRefresh();
          }}
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
            // 상세 패널이 잠금 해제 상태면 정산 정보를 다시 불러오도록 갱신
            handleRefresh();
            if (selectedId) {
              const id = selectedId;
              setSelectedId(null);
              // 패널 재마운트로 최신 정산 정보 로드
              setTimeout(() => setSelectedId(id), 0);
            }
          }}
        />
      )}
    </div>
  );
}
