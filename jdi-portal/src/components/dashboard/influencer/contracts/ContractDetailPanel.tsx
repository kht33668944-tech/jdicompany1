"use client";

// 계약 상세 — 우측 슬라이드 패널. 정산 정보(개인정보)는 2차 비밀번호 잠금을 풀어야 보인다.

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import X from "phosphor-react/dist/icons/X.esm.js";
import ContractStatusDropdown from "./ContractStatusDropdown";
import ContractDocsSection from "./ContractDocsSection";
import VaultUnlockGate from "@/components/shared/VaultUnlockGate";
import { getErrorMessage } from "@/lib/utils/errors";
import { lockVault } from "@/lib/vault/actions";
import {
  deleteContract,
  getIdCardSignedUrl,
  getSettlement,
} from "@/lib/influencer/contracts/actions";
import {
  COLLAB_TYPE_LABEL,
  PRODUCT_LABEL,
  RAW_FOOTAGE_LABEL,
  REQUIRED_FILES_LABEL,
  SECONDARY_USAGE_LABEL,
  SETTLEMENT_TYPE_LABEL,
} from "@/lib/influencer/contracts/labels";
import { getRetentionEnd } from "@/lib/influencer/contracts/dates";
import type {
  ContractSettlement,
  ContractStatus,
  InfluencerContract,
} from "@/lib/influencer/contracts/types";
import { formatKrw } from "@/lib/expenses/format";
import { formatDate } from "@/lib/utils/date";

interface Props {
  contract: InfluencerContract | null;
  gateConfigured: boolean;
  unlocked: boolean;
  /** 정산 정보가 밖(폼 모달)에서 저장될 때마다 +1 — 패널이 다시 불러온다 */
  settlementVersion: number;
  onUnlockedChange: (unlocked: boolean) => void;
  onClose: () => void;
  onEdit: (contract: InfluencerContract) => void;
  onEditSettlement: (contract: InfluencerContract, settlement: ContractSettlement | null) => void;
  onStatusChange: (id: string, status: ContractStatus) => void;
  onDeleted: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 py-4 last:border-b-0">
      <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value, dim }: { label: string; value: React.ReactNode; dim?: boolean }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-sm py-0.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className={dim ? "text-slate-400" : "font-semibold text-slate-700 tabular-nums"}>{value}</dd>
    </div>
  );
}

function fmtDateOrDash(dateStr: string | null) {
  return dateStr ? formatDate(dateStr) : <span className="text-slate-300">—</span>;
}

function fmtKrwOrDash(value: number | null) {
  return value === null ? <span className="text-slate-300">—</span> : formatKrw(value);
}

function CheckLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`text-sm ${ok ? "font-semibold text-emerald-700" : "text-slate-400"}`}>
      {ok ? "✓" : "–"} {label}
    </div>
  );
}

export default function ContractDetailPanel({
  contract,
  gateConfigured,
  unlocked,
  settlementVersion,
  onUnlockedChange,
  onClose,
  onEdit,
  onEditSettlement,
  onStatusChange,
  onDeleted,
}: Props) {
  const [settlement, setSettlement] = useState<ContractSettlement | null>(null);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const contractId = contract?.id ?? null;

  const loadSettlement = useCallback(async (id: string) => {
    setSettlementLoading(true);
    try {
      setSettlement(await getSettlement(id));
    } catch (err) {
      toast.error(getErrorMessage(err, "정산 정보를 불러오지 못했습니다."));
      onUnlockedChange(false);
    } finally {
      setSettlementLoading(false);
    }
  }, [onUnlockedChange]);

  useEffect(() => {
    setSettlement(null);
    if (contractId && unlocked) loadSettlement(contractId);
  }, [contractId, unlocked, settlementVersion, loadSettlement]);

  useEffect(() => {
    if (!contract) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [contract, onClose]);

  if (!contract) return null;

  const retentionEnd = getRetentionEnd(contract.post_actual_date);

  const handleLock = async () => {
    await lockVault().catch(() => {});
    onUnlockedChange(false);
    setSettlement(null);
    toast.success("다시 잠갔습니다.");
  };

  const handleViewIdCard = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const url = await getIdCardSignedUrl(contract.id);
      if (!url) {
        toast.error("등록된 신분증 파일이 없습니다.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(getErrorMessage(err, "신분증 파일을 열지 못했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    if (!window.confirm(`'${contract.name}' 계약을 삭제할까요?\n(목록에서 숨겨지며, 필요하면 관리자가 복구할 수 있습니다.)`)) return;
    setBusy(true);
    try {
      await deleteContract(contract.id);
      toast.success("계약이 삭제되었습니다.");
      onDeleted();
    } catch (err) {
      toast.error(getErrorMessage(err, "계약 삭제 실패"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-slate-900/25" onClick={onClose} aria-label="닫기" />
      <aside className="relative flex h-full w-full max-w-[460px] flex-col bg-white shadow-2xl" aria-label="계약 상세">
        {/* 헤더 */}
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-extrabold text-slate-800">{contract.name}</h2>
            {contract.instagram_handle && (
              <p className="text-xs text-slate-400">@{contract.instagram_handle}</p>
            )}
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <ContractStatusDropdown
              status={contract.contract_status}
              onChange={(next) => onStatusChange(contract.id, next)}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5">
          <Section title="기본 정보">
            <Row label="협업 유형" value={COLLAB_TYPE_LABEL[contract.collab_type]} />
            <Row label="제공 제품" value={PRODUCT_LABEL[contract.product]} />
            <Row label="제품명·구성" value={contract.product_detail ?? "—"} dim={!contract.product_detail} />
            <Row
              label="리스트·스케줄"
              value={
                contract.influencer_id
                  ? contract.campaign_id
                    ? "연동됨 (시딩 스케줄에 반영)"
                    : "리스트만 연결됨"
                  : "연동 안 됨 — 인스타 계정을 입력하면 자동 연동돼요"
              }
              dim={!contract.influencer_id}
            />
          </Section>

          <Section title="금액 · 정산 구분">
            <Row label="소비자가" value={fmtKrwOrDash(contract.retail_price)} />
            <Row label="약정가액" value={fmtKrwOrDash(contract.agreed_value)} />
            {contract.collab_type === "paid" && (
              <Row
                label="광고비 총액"
                value={
                  contract.ad_fee_total === null
                    ? "—"
                    : `${formatKrw(contract.ad_fee_total)} (${contract.ad_fee_vat_included ? "부가세 포함" : "부가세 별도"})`
                }
                dim={contract.ad_fee_total === null}
              />
            )}
            <Row
              label="정산 구분"
              value={contract.settlement_type ? SETTLEMENT_TYPE_LABEL[contract.settlement_type] : "선택 안 함"}
              dim={!contract.settlement_type}
            />
            {contract.settlement_type === "business" && (
              <Row label="사업자번호" value={contract.business_reg_no ?? "미입력"} dim={!contract.business_reg_no} />
            )}
          </Section>

          <Section title="2차 활용">
            <Row label="허용 여부" value={SECONDARY_USAGE_LABEL[contract.secondary_usage]} />
            {contract.secondary_usage === "paid" && (
              <Row label="추가비용" value={fmtKrwOrDash(contract.secondary_usage_fee)} />
            )}
            {contract.secondary_usage !== "not_allowed" && (
              <>
                <Row
                  label="활용 기간"
                  value={`${contract.secondary_usage_start ?? "?"} ~ ${contract.secondary_usage_end ?? "?"}`}
                />
                <div className="mt-2 space-y-0.5">
                  <CheckLine ok={contract.allow_jdi_sns} label="JDI 자사 SNS 재게시" />
                  <CheckLine ok={contract.allow_meta_ads} label="Instagram/Meta 유료 광고" />
                  <CheckLine ok={contract.allow_edit} label="발췌·컷편집·자막·로고·음악·타 영상 결합" />
                  <CheckLine ok={contract.partnership_ad_access} label="파트너십 광고 권한 협조" />
                </div>
              </>
            )}
          </Section>

          <Section title="촬영 원본">
            <Row label="제공 여부" value={RAW_FOOTAGE_LABEL[contract.raw_footage]} />
            {contract.raw_footage === "paid" && (
              <Row label="추가비용" value={fmtKrwOrDash(contract.raw_footage_fee)} />
            )}
            {contract.raw_footage !== "not_provided" && (
              <>
                <Row label="제공 범위" value={contract.raw_footage_scope ?? "—"} dim={!contract.raw_footage_scope} />
                <Row label="전달일" value={fmtDateOrDash(contract.raw_footage_due)} />
              </>
            )}
          </Section>

          <Section title="일정 · 파일">
            <Row label="제품 발송일" value={fmtDateOrDash(contract.product_ship_date)} />
            <Row label="초안 전달일" value={fmtDateOrDash(contract.draft_due_date)} />
            <Row label="게시 예정일" value={fmtDateOrDash(contract.post_planned_date)} />
            <Row label="실제 게시일" value={fmtDateOrDash(contract.post_actual_date)} />
            <Row
              label="게시 유지 종료"
              value={
                retentionEnd ? (
                  <>
                    {formatDate(retentionEnd)}{" "}
                    <span className="text-[11px] font-normal text-slate-400">(게시일+6개월 자동)</span>
                  </>
                ) : (
                  "게시 후 자동 계산"
                )
              }
              dim={!retentionEnd}
            />
            <Row label="필수 파일" value={REQUIRED_FILES_LABEL[contract.required_files_status]} />
          </Section>

          <Section title="계약서 · 전자서명">
            <ContractDocsSection contractId={contract.id} />
          </Section>

          <Section title="정산 정보 (개인정보)">
            {!unlocked ? (
              <VaultUnlockGate
                gateConfigured={gateConfigured}
                notice={
                  <>
                    개인정보 보호를 위해 <b>2차 비밀번호</b>로 잠겨 있어요.
                  </>
                }
                onUnlocked={() => onUnlockedChange(true)}
              />
            ) : settlementLoading ? (
              <p className="text-sm text-slate-400">정산 정보를 불러오는 중…</p>
            ) : (
              <>
                {settlement ? (
                  <>
                    <Row label="휴대폰 번호" value={settlement.phone || "—"} dim={!settlement.phone} />
                    <Row label="배송지 주소" value={settlement.address || "—"} dim={!settlement.address} />
                    <Row label="은행" value={settlement.bank_name || "—"} dim={!settlement.bank_name} />
                    <Row label="계좌번호" value={settlement.bank_account || "—"} dim={!settlement.bank_account} />
                    <Row label="예금주" value={settlement.account_holder || "—"} dim={!settlement.account_holder} />
                    <Row
                      label="신분증 사진"
                      value={
                        settlement.id_card_path ? (
                          <button
                            type="button"
                            onClick={handleViewIdCard}
                            disabled={busy}
                            className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                          >
                            📄 {settlement.id_card_name ?? "신분증 파일"} 보기
                          </button>
                        ) : (
                          "아직 업로드 전"
                        )
                      }
                      dim={!settlement.id_card_path}
                    />
                  </>
                ) : (
                  <p className="text-sm text-slate-400">아직 등록된 정산 정보가 없어요.</p>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onEditSettlement(contract, settlement)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    정산 정보 {settlement ? "수정" : "입력"}
                  </button>
                  <button
                    type="button"
                    onClick={handleLock}
                    className="text-xs text-slate-400 underline hover:text-slate-600"
                  >
                    다시 잠그기
                  </button>
                </div>
              </>
            )}
          </Section>

          <Section title="계약 · 메모">
            <Row
              label="모두싸인"
              value={
                contract.modusign_url ? (
                  <a
                    href={contract.modusign_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    문서 열기 ↗
                  </a>
                ) : (
                  "링크 없음"
                )
              }
              dim={!contract.modusign_url}
            />
            <Row
              label="메모"
              value={<span className="whitespace-pre-wrap">{contract.memo ?? "—"}</span>}
              dim={!contract.memo}
            />
          </Section>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3.5">
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="rounded-xl px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            삭제
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={() => onEdit(contract)}
              className="rounded-xl bg-[#2563eb] px-5 py-2 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all"
            >
              수정
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
