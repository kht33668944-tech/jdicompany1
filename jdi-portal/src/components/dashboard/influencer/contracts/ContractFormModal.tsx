"use client";

// 계약 추가/수정 폼 — 협업 유형·2차 활용·원본 제공 선택에 따라 필요한 칸만 보여준다.
// 정산 정보(개인정보)는 이 폼이 아니라 상세 패널의 잠금 섹션에서 따로 입력한다.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ModalContainer from "@/components/shared/ModalContainer";
import Select from "@/components/shared/Select";
import { getErrorMessage } from "@/lib/utils/errors";
import { searchInfluencers } from "@/lib/influencer/actions";
import type { InfluencerListItem } from "@/lib/influencer/types";
import { createContract, updateContract } from "@/lib/influencer/contracts/actions";
import {
  COLLAB_TYPE_OPTIONS,
  CONTRACT_STATUS_DOT_CLASSES,
  CONTRACT_STATUS_OPTIONS,
  PRODUCT_OPTIONS,
  RAW_FOOTAGE_OPTIONS,
  REQUIRED_FILES_OPTIONS,
  SECONDARY_USAGE_OPTIONS,
  SETTLEMENT_TYPE_OPTIONS,
} from "@/lib/influencer/contracts/labels";
import { getRetentionEnd } from "@/lib/influencer/contracts/dates";
import type {
  CollabType,
  ContractInput,
  ContractProduct,
  ContractStatus,
  InfluencerContract,
  RawFootage,
  RequiredFilesStatus,
  SecondaryUsage,
  SettlementType,
} from "@/lib/influencer/contracts/types";
import { parseKrwInput } from "@/lib/expenses/format";
import { formatDate } from "@/lib/utils/date";

interface Props {
  contract: InfluencerContract | null; // null = 새 계약
  onClose: () => void;
  onSaved: () => void;
}

const inputCls =
  "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const labelCls = "text-sm font-bold text-slate-700 ml-1 block mb-1.5";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-xs font-extrabold text-blue-600">{children}</h3>;
}

/** 2~3개 선택지 세그먼트 버튼 */
function Seg<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`flex-1 rounded-xl border px-2 py-2 text-sm transition-colors ${
              active
                ? "border-blue-500 bg-blue-50 font-bold text-blue-700"
                : "border-slate-200 bg-white font-medium text-slate-500 hover:bg-slate-50"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-blue-600"
      />
      {label}
    </label>
  );
}

/** 금액 입력 문자열 → 원 단위 정수(빈 값은 null). 숫자가 아니면 한국어 오류 throw. */
function moneyOrNull(value: string, label: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = parseKrwInput(trimmed);
  if (Number.isNaN(parsed) || parsed < 0) throw new Error(`${label}을(를) 숫자로 입력해주세요.`);
  return Math.round(parsed);
}

export default function ContractFormModal({ contract, onClose, onSaved }: Props) {
  const [name, setName] = useState(contract?.name ?? "");
  const [instagramHandle, setInstagramHandle] = useState(contract?.instagram_handle ?? "");
  // 리스트(influencers) 연결 — 자동완성으로 고르면 채워지고, 없으면 저장 시 서버가 인스타 계정으로 매칭/자동 등록
  const [influencerId, setInfluencerId] = useState<string | null>(contract?.influencer_id ?? null);
  const [suggestions, setSuggestions] = useState<InfluencerListItem[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const skipNextSearch = useRef(false);
  const [collabType, setCollabType] = useState<CollabType>(contract?.collab_type ?? "seeding");
  const [contractStatus, setContractStatus] = useState<ContractStatus>(contract?.contract_status ?? "candidate");

  const [product, setProduct] = useState<ContractProduct>(contract?.product ?? "tree_150");
  const [productDetail, setProductDetail] = useState(contract?.product_detail ?? "");
  const [retailPrice, setRetailPrice] = useState(contract?.retail_price?.toLocaleString("ko-KR") ?? "");
  const [agreedValue, setAgreedValue] = useState(contract?.agreed_value?.toLocaleString("ko-KR") ?? "");
  const [adFeeTotal, setAdFeeTotal] = useState(contract?.ad_fee_total?.toLocaleString("ko-KR") ?? "");
  const [vatIncluded, setVatIncluded] = useState(contract?.ad_fee_vat_included ?? true);
  const [settlementType, setSettlementType] = useState<SettlementType | "">(contract?.settlement_type ?? "");
  const [businessRegNo, setBusinessRegNo] = useState(contract?.business_reg_no ?? "");

  const [secondaryUsage, setSecondaryUsage] = useState<SecondaryUsage>(contract?.secondary_usage ?? "not_allowed");
  const [secondaryUsageFee, setSecondaryUsageFee] = useState(contract?.secondary_usage_fee?.toLocaleString("ko-KR") ?? "");
  const [secondaryStart, setSecondaryStart] = useState(contract?.secondary_usage_start ?? "");
  const [secondaryEnd, setSecondaryEnd] = useState(contract?.secondary_usage_end ?? "");
  const [allowJdiSns, setAllowJdiSns] = useState(contract?.allow_jdi_sns ?? false);
  const [allowMetaAds, setAllowMetaAds] = useState(contract?.allow_meta_ads ?? false);
  const [allowEdit, setAllowEdit] = useState(contract?.allow_edit ?? false);
  const [partnershipAdAccess, setPartnershipAdAccess] = useState(contract?.partnership_ad_access ?? false);

  const [rawFootage, setRawFootage] = useState<RawFootage>(contract?.raw_footage ?? "not_provided");
  const [rawFootageFee, setRawFootageFee] = useState(contract?.raw_footage_fee?.toLocaleString("ko-KR") ?? "");
  const [rawFootageScope, setRawFootageScope] = useState(contract?.raw_footage_scope ?? "");
  const [rawFootageDue, setRawFootageDue] = useState(contract?.raw_footage_due ?? "");

  const [productShipDate, setProductShipDate] = useState(contract?.product_ship_date ?? "");
  const [draftDueDate, setDraftDueDate] = useState(contract?.draft_due_date ?? "");
  const [postPlannedDate, setPostPlannedDate] = useState(contract?.post_planned_date ?? "");
  const [postActualDate, setPostActualDate] = useState(contract?.post_actual_date ?? "");
  const [requiredFilesStatus, setRequiredFilesStatus] = useState<RequiredFilesStatus>(
    contract?.required_files_status ?? "none",
  );

  const [modusignUrl, setModusignUrl] = useState(contract?.modusign_url ?? "");
  const [memo, setMemo] = useState(contract?.memo ?? "");
  const [busy, setBusy] = useState(false);

  const retentionEnd = useMemo(() => getRetentionEnd(postActualDate || null), [postActualDate]);

  // 이름 입력 → 기존 리스트에서 자동완성 검색 (300ms 디바운스, 이미 연결됐으면 안 함)
  useEffect(() => {
    if (influencerId) return;
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const term = name.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const rows = await searchInfluencers(term);
        if (!cancelled) {
          setSuggestions(rows.slice(0, 6));
          setSuggestOpen(rows.length > 0);
        }
      } catch {
        // 검색 실패는 조용히 무시 — 직접 입력으로 계속 진행 가능
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name, influencerId]);

  const pickInfluencer = (inf: InfluencerListItem) => {
    skipNextSearch.current = true;
    setName(inf.display_name?.trim() || inf.username);
    setInstagramHandle(inf.username);
    setInfluencerId(inf.id);
    setSuggestions([]);
    setSuggestOpen(false);
  };

  const unlinkInfluencer = () => {
    setInfluencerId(null);
  };

  const statusOptions = useMemo(
    () =>
      CONTRACT_STATUS_OPTIONS.map((opt) => ({
        ...opt,
        dotClass: CONTRACT_STATUS_DOT_CLASSES[opt.value],
      })),
    [],
  );

  const handleSave = async () => {
    if (busy) return;
    if (!name.trim()) {
      toast.error("이름/채널명을 입력해주세요.");
      return;
    }
    setBusy(true);
    try {
      const input: ContractInput = {
        influencer_id: influencerId,
        name,
        instagram_handle: instagramHandle,
        collab_type: collabType,
        product,
        product_detail: productDetail || null,
        retail_price: moneyOrNull(retailPrice, "소비자가"),
        agreed_value: moneyOrNull(agreedValue, "약정가액"),
        ad_fee_total: collabType === "paid" ? moneyOrNull(adFeeTotal, "광고비 총액") : null,
        ad_fee_vat_included: vatIncluded,
        settlement_type: settlementType || null,
        business_reg_no: settlementType === "business" ? businessRegNo || null : null,
        secondary_usage: secondaryUsage,
        secondary_usage_fee:
          secondaryUsage === "paid" ? moneyOrNull(secondaryUsageFee, "2차 활용 추가비용") : null,
        secondary_usage_start: secondaryUsage !== "not_allowed" ? secondaryStart || null : null,
        secondary_usage_end: secondaryUsage !== "not_allowed" ? secondaryEnd || null : null,
        allow_jdi_sns: secondaryUsage !== "not_allowed" && allowJdiSns,
        allow_meta_ads: secondaryUsage !== "not_allowed" && allowMetaAds,
        allow_edit: secondaryUsage !== "not_allowed" && allowEdit,
        partnership_ad_access: partnershipAdAccess,
        raw_footage: rawFootage,
        raw_footage_fee: rawFootage === "paid" ? moneyOrNull(rawFootageFee, "촬영 원본 추가비용") : null,
        raw_footage_scope: rawFootage !== "not_provided" ? rawFootageScope || null : null,
        raw_footage_due: rawFootage !== "not_provided" ? rawFootageDue || null : null,
        product_ship_date: productShipDate || null,
        draft_due_date: draftDueDate || null,
        post_planned_date: postPlannedDate || null,
        post_actual_date: postActualDate || null,
        required_files_status: requiredFilesStatus,
        contract_status: contractStatus,
        modusign_url: modusignUrl || null,
        memo: memo || null,
      };
      const result = contract
        ? await updateContract(contract.id, input)
        : await createContract(input);
      const base = contract ? "계약이 수정되었습니다." : "새 계약이 추가되었습니다.";
      toast.success(result.scheduled ? `${base} 시딩 스케줄에도 반영했어요.` : base);
      if (result.addedToList) {
        toast.success("리스트에 새로 등록하고 분석을 시작했어요.");
      }
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, contract ? "계약 수정 실패" : "계약 추가 실패"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalContainer onClose={onClose} maxWidth="max-w-3xl">
      <h2 className="mb-4 text-base font-extrabold text-slate-800">
        {contract ? "계약 수정" : "새 계약 추가"}
      </h2>

      <div className="-mr-2 max-h-[70vh] space-y-5 overflow-y-auto pr-2">
        {/* ① 기본 정보 */}
        <section>
          <SectionTitle>① 기본 정보</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="relative">
              <label htmlFor="contract-name" className={labelCls}>
                이름 / 채널명 <span className="text-red-500">*</span>
              </label>
              <input
                id="contract-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                placeholder="입력하면 리스트에서 자동으로 찾아요"
                autoComplete="off"
                className={inputCls}
              />
              {suggestOpen && suggestions.length > 0 && (
                <ul
                  className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-100 bg-white p-1 shadow-xl shadow-slate-900/10"
                  role="listbox"
                  aria-label="리스트에서 찾은 인플루언서"
                >
                  {suggestions.map((inf) => (
                    <li key={inf.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickInfluencer(inf)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-blue-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-700">
                            {inf.display_name?.trim() || inf.username}
                          </span>
                          <span className="block text-xs text-slate-400">@{inf.username}</span>
                        </span>
                        {typeof inf.follower_count === "number" && (
                          <span className="shrink-0 text-xs text-slate-400 tabular-nums">
                            팔로워 {inf.follower_count.toLocaleString("ko-KR")}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {influencerId && (
                <p className="ml-1 mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  ✓ 리스트 연결됨 {instagramHandle && `@${instagramHandle}`}
                  <button
                    type="button"
                    onClick={unlinkInfluencer}
                    className="text-emerald-500 hover:text-emerald-800"
                    aria-label="리스트 연결 해제"
                  >
                    ×
                  </button>
                </p>
              )}
            </div>
            <div>
              <label htmlFor="contract-handle" className={labelCls}>Instagram 계정</label>
              <input
                id="contract-handle"
                type="text"
                value={instagramHandle}
                onChange={(e) => setInstagramHandle(e.target.value)}
                placeholder="@ 없이 입력"
                className={inputCls}
              />
              {!influencerId && (
                <p className="ml-1 mt-1 text-xs text-slate-400">
                  계정을 넣으면 저장할 때 리스트·시딩 스케줄에 자동으로 연동돼요.
                </p>
              )}
            </div>
            <div>
              <span className={labelCls}>협업 유형</span>
              <Seg options={COLLAB_TYPE_OPTIONS} value={collabType} onChange={setCollabType} ariaLabel="협업 유형" />
            </div>
            <div>
              <span className={labelCls}>계약 상태</span>
              <Select
                options={statusOptions}
                value={contractStatus}
                onChange={(v) => setContractStatus(v as ContractStatus)}
                ariaLabel="계약 상태"
                className={inputCls}
              />
            </div>
          </div>
        </section>

        {/* ② 제품 · 금액 */}
        <section>
          <SectionTitle>② 제품 · 금액</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className={labelCls}>제공 제품</span>
              <Seg options={PRODUCT_OPTIONS} value={product} onChange={setProduct} ariaLabel="제공 제품" />
            </div>
            <div>
              <label htmlFor="contract-product-detail" className={labelCls}>제품명 · 구성</label>
              <input
                id="contract-product-detail"
                type="text"
                value={productDetail}
                onChange={(e) => setProductDetail(e.target.value)}
                placeholder="예: 프리미엄 트리 풀세트 + 오너먼트"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="contract-retail" className={labelCls}>소비자가</label>
              <input
                id="contract-retail"
                type="text"
                inputMode="numeric"
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
                placeholder="예: 189,000"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="contract-agreed" className={labelCls}>약정가액</label>
              <input
                id="contract-agreed"
                type="text"
                inputMode="numeric"
                value={agreedValue}
                onChange={(e) => setAgreedValue(e.target.value)}
                placeholder="협찬 제공가 기준 금액"
                className={inputCls}
              />
            </div>
            {collabType === "paid" && (
              <>
                <div>
                  <label htmlFor="contract-adfee" className={labelCls}>광고비 총액</label>
                  <input
                    id="contract-adfee"
                    type="text"
                    inputMode="numeric"
                    value={adFeeTotal}
                    onChange={(e) => setAdFeeTotal(e.target.value)}
                    placeholder="예: 1,500,000"
                    className={inputCls}
                  />
                </div>
                <div className="flex items-end pb-2.5">
                  <CheckRow checked={vatIncluded} onChange={setVatIncluded} label="부가세 포함 (JDI 기본)" />
                </div>
              </>
            )}
            <div>
              <span className={labelCls}>정산 구분</span>
              <Select
                options={[{ value: "", label: "선택 안 함" }, ...SETTLEMENT_TYPE_OPTIONS]}
                value={settlementType}
                onChange={(v) => setSettlementType(v as SettlementType | "")}
                ariaLabel="정산 구분"
                className={inputCls}
              />
            </div>
            {settlementType === "business" && (
              <div>
                <label htmlFor="contract-bizno" className={labelCls}>
                  사업자등록번호 <span className="font-normal text-slate-400">(선택)</span>
                </label>
                <input
                  id="contract-bizno"
                  type="text"
                  value={businessRegNo}
                  onChange={(e) => setBusinessRegNo(e.target.value)}
                  placeholder="000-00-00000"
                  className={inputCls}
                />
              </div>
            )}
          </div>
        </section>

        {/* ③ 2차 활용 */}
        <section>
          <SectionTitle>③ 2차 활용</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className={labelCls}>2차 활용 허용</span>
              <Seg
                options={SECONDARY_USAGE_OPTIONS}
                value={secondaryUsage}
                onChange={setSecondaryUsage}
                ariaLabel="2차 활용 허용"
              />
            </div>
            {secondaryUsage === "paid" && (
              <div>
                <label htmlFor="contract-secfee" className={labelCls}>2차 활용 추가비용</label>
                <input
                  id="contract-secfee"
                  type="text"
                  inputMode="numeric"
                  value={secondaryUsageFee}
                  onChange={(e) => setSecondaryUsageFee(e.target.value)}
                  placeholder="예: 300,000"
                  className={inputCls}
                />
              </div>
            )}
            {secondaryUsage !== "not_allowed" && (
              <>
                <div>
                  <label htmlFor="contract-secstart" className={labelCls}>2차 활용 시작일</label>
                  <input
                    id="contract-secstart"
                    type="date"
                    value={secondaryStart}
                    onChange={(e) => setSecondaryStart(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="contract-secend" className={labelCls}>2차 활용 종료일</label>
                  <input
                    id="contract-secend"
                    type="date"
                    value={secondaryEnd}
                    onChange={(e) => setSecondaryEnd(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <span className={labelCls}>허용 범위</span>
                  <CheckRow checked={allowJdiSns} onChange={setAllowJdiSns} label="JDI 자사 SNS 재게시" />
                  <CheckRow checked={allowMetaAds} onChange={setAllowMetaAds} label="Instagram / Meta 유료 광고" />
                  <CheckRow
                    checked={allowEdit}
                    onChange={setAllowEdit}
                    label="발췌·컷편집·자막·로고·음악 추가 및 타 영상 결합"
                  />
                </div>
              </>
            )}
            <div className="sm:col-span-2">
              <CheckRow
                checked={partnershipAdAccess}
                onChange={setPartnershipAdAccess}
                label="파트너십 광고 권한 협조"
              />
            </div>
          </div>
        </section>

        {/* ④ 촬영 원본 */}
        <section>
          <SectionTitle>④ 촬영 원본</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className={labelCls}>촬영 원본 제공</span>
              <Seg options={RAW_FOOTAGE_OPTIONS} value={rawFootage} onChange={setRawFootage} ariaLabel="촬영 원본 제공" />
            </div>
            {rawFootage === "paid" && (
              <div>
                <label htmlFor="contract-rawfee" className={labelCls}>원본 추가비용</label>
                <input
                  id="contract-rawfee"
                  type="text"
                  inputMode="numeric"
                  value={rawFootageFee}
                  onChange={(e) => setRawFootageFee(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
            {rawFootage !== "not_provided" && (
              <>
                <div>
                  <label htmlFor="contract-rawscope" className={labelCls}>제공 범위</label>
                  <input
                    id="contract-rawscope"
                    type="text"
                    value={rawFootageScope}
                    onChange={(e) => setRawFootageScope(e.target.value)}
                    placeholder="예: 릴스 원본 클립 전체"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="contract-rawdue" className={labelCls}>원본 전달일</label>
                  <input
                    id="contract-rawdue"
                    type="date"
                    value={rawFootageDue}
                    onChange={(e) => setRawFootageDue(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </>
            )}
          </div>
        </section>

        {/* ⑤ 일정 · 파일 */}
        <section>
          <SectionTitle>⑤ 일정 · 파일</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="contract-ship" className={labelCls}>제품 발송일</label>
              <input
                id="contract-ship"
                type="date"
                value={productShipDate}
                onChange={(e) => setProductShipDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="contract-draft" className={labelCls}>초안 전달일</label>
              <input
                id="contract-draft"
                type="date"
                value={draftDueDate}
                onChange={(e) => setDraftDueDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="contract-planned" className={labelCls}>게시 예정일</label>
              <input
                id="contract-planned"
                type="date"
                value={postPlannedDate}
                onChange={(e) => setPostPlannedDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="contract-actual" className={labelCls}>실제 게시일</label>
              <input
                id="contract-actual"
                type="date"
                value={postActualDate}
                onChange={(e) => setPostActualDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <span className={labelCls}>
                게시 유지 종료일 <span className="font-normal text-slate-400">(자동 계산)</span>
              </span>
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 tabular-nums">
                {retentionEnd ? `${formatDate(retentionEnd)} (게시일 + 6개월)` : "실제 게시일 입력 시 +6개월로 자동 표시"}
              </div>
            </div>
            <div>
              <span className={labelCls}>필수 파일 전달 상태</span>
              <Select
                options={REQUIRED_FILES_OPTIONS}
                value={requiredFilesStatus}
                onChange={(v) => setRequiredFilesStatus(v as RequiredFilesStatus)}
                ariaLabel="필수 파일 전달 상태"
                className={inputCls}
              />
            </div>
          </div>
        </section>

        {/* ⑥ 계약 링크 · 메모 */}
        <section>
          <SectionTitle>⑥ 계약 링크 · 메모</SectionTitle>
          <div className="space-y-3">
            <div>
              <label htmlFor="contract-modusign" className={labelCls}>
                모두싸인 문서 링크{" "}
                <span className="font-normal text-slate-400">(지금은 수동 관리 — 자동 연동은 추후)</span>
              </label>
              <input
                id="contract-modusign"
                type="text"
                value={modusignUrl}
                onChange={(e) => setModusignUrl(e.target.value)}
                placeholder="https://app.modusign.co.kr/..."
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="contract-memo" className={labelCls}>메모</label>
              <textarea
                id="contract-memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="협의 내용, 특이사항 등"
                rows={3}
                className={`${inputCls} resize-y`}
              />
            </div>
            <p className="ml-1 text-xs text-slate-400">
              휴대폰 번호·주소·계좌·신분증 같은 정산 정보는 저장 후 상세 화면의 <b>정산 정보</b> 섹션에서
              입력해요. (2차 비밀번호 잠금으로 보호)
            </p>
          </div>
        </section>
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="rounded-xl bg-[#2563eb] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
        >
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </ModalContainer>
  );
}
