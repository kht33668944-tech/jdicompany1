// 계약 데이터 → 계약서 본문(DocContent) 조립.
// 클라이언트/서버 공용(순수 함수) — 미리보기·편집 화면·서버 생성이 같은 결과를 쓴다.

import { formatKrw } from "@/lib/expenses/format";
import {
  PRODUCT_LABEL,
  RAW_FOOTAGE_LABEL,
  SECONDARY_USAGE_LABEL,
  SETTLEMENT_TYPE_LABEL,
} from "@/lib/influencer/contracts/labels";
import type { InfluencerContract } from "@/lib/influencer/contracts/types";
import { DEFAULT_COMPANY, TMA_CAMPAIGN_LABEL } from "./template";
import type { DocContent, TemplateContent, TemplateKey, TermRow } from "./types";

/** 계약서 지면에 쓰는 계약 구분 표기(화면 배지 라벨보다 격식 있는 형태) */
const DOC_COLLAB_LABEL: Record<TemplateKey, string> = {
  paid: "광고비 지급형",
  seeding: "순수 협찬형",
};

const date = (d: string | null) => d ?? "";
const money = (n: number | null) => (n === null ? "" : formatKrw(n));

/** 2차 활용 허용 범위 — 체크된 항목을 원본 계약서 문구 그대로 나열 */
function secondaryScope(c: InfluencerContract): string {
  const items: string[] = [];
  if (c.allow_jdi_sns) items.push("JDI 자사 SNS 재게시");
  if (c.allow_meta_ads) items.push("Instagram·Meta 유료 광고");
  if (c.allow_edit) items.push("발췌·컷편집·자막·로고·음악 추가 및 타 영상 결합");
  return items.join(" / ");
}

/**
 * 개별 조건표(제2조) 생성 — 계약 화면의 데이터로 값을 채운다.
 * 값은 전부 자유 문자열이라 편집 화면에서 건별로 고칠 수 있다. 빈 값은 화면·PDF에서 "—".
 */
export function buildTerms(c: InfluencerContract, key: TemplateKey): TermRow[] {
  const rows: TermRow[] = [
    { section: "협업 유형", label: "계약 구분", value: DOC_COLLAB_LABEL[key] },
    { section: "제공 제품", label: "트리 크기", value: PRODUCT_LABEL[c.product] },
    { section: "제공 제품", label: "제품명·구성", value: c.product_detail ?? "" },
    {
      section: "제공 제품",
      label: "소비자가 / 약정가액",
      value: [
        c.retail_price !== null ? `소비자가 ${formatKrw(c.retail_price)}` : "",
        c.agreed_value !== null ? `약정가액 ${formatKrw(c.agreed_value)}` : "",
      ].filter(Boolean).join(" / "),
    },
    {
      section: "계정·채널",
      label: "Instagram 계정",
      value: c.instagram_handle ? `@${c.instagram_handle}` : "",
    },
    { section: "계정·채널", label: "기타 채널", value: "" },
    { section: "제작물", label: "제작 형식", value: "Instagram Reels 중심 숏폼 영상 1편" },
    { section: "일정", label: "제품 발송일", value: date(c.product_ship_date) },
    { section: "일정", label: "초안 전달일", value: date(c.draft_due_date) },
    { section: "일정", label: "게시 예정일", value: date(c.post_planned_date) },
    { section: "게시 유지", label: "유지 기간", value: "실제 게시일로부터 3개월" },
  ];

  if (key === "paid") {
    rows.push(
      {
        section: "광고비",
        label: "총 계약금액",
        value: c.ad_fee_total !== null
          ? `${formatKrw(c.ad_fee_total)} (${c.ad_fee_vat_included ? "부가세 포함" : "부가세 별도"})`
          : "",
      },
      {
        section: "정산",
        label: "정산 구분",
        value: c.settlement_type
          ? (c.settlement_type === "business" ? "사업자·세금계산서 발행" : "개인·법령상 원천징수 적용")
          : "",
      },
      ...(c.settlement_type === "business"
        ? [{ section: "정산", label: "사업자등록번호", value: c.business_reg_no ?? "" }]
        : []),
      // 클린본을 안 받는 건에서는 "필수 파일 전달 완료"가 오지 않아 지급 시점이 생기지 않는다.
      // 그래서 게시 완료를 기준으로 두고, 파일이 있는 건만 그 전달을 함께 본다.
      {
        section: "정산",
        label: "지급기한",
        value: c.allow_edit
          ? "게시 및 필수 파일 전달 완료 후 7영업일 이내"
          : "게시 완료 후 7영업일 이내",
      },
    );
  } else {
    rows.push(
      {
        section: "정산",
        label: "정산 구분",
        value: c.settlement_type ? SETTLEMENT_TYPE_LABEL[c.settlement_type] : "",
      },
      {
        section: "정산",
        label: "지급기한",
        value: "2차 활용비·원본 제공비 합의 시, 조건 충족 후 7영업일 이내",
      },
    );
  }

  rows.push(
    { section: "2차 활용", label: "허용 여부", value: SECONDARY_USAGE_LABEL[c.secondary_usage] },
    ...(c.secondary_usage === "paid"
      ? [{ section: "2차 활용", label: "추가비용", value: money(c.secondary_usage_fee) }]
      : []),
    ...(c.secondary_usage !== "not_allowed"
      ? [
          {
            section: "2차 활용",
            label: "활용 기간",
            value: c.secondary_usage_start || c.secondary_usage_end
              ? `${date(c.secondary_usage_start)} ~ ${date(c.secondary_usage_end)}`
              : "",
          },
          { section: "2차 활용", label: "허용 범위", value: secondaryScope(c) },
          { section: "2차 활용", label: "제외 범위", value: "상세페이지 사용은 포함하지 않음" },
        ]
      : []),
    {
      section: "파트너십 광고",
      label: "권한 승인",
      value: c.partnership_ad_access ? "게시물 연결/광고 권한 승인에 협조" : "해당 없음",
    },
    {
      section: "필수 납품 파일",
      label: "파일 구성",
      // 2026-08-21 변경: 파트너십 광고 연동만 쓰면 게시물을 그대로 돌리므로 클린본이 쓰이지 않는다.
      // 편집 활용(allow_edit)을 허용한 건에서만 클린 완성본을 함께 받는다.
      value: c.allow_edit
        ? "게시본 + 자막·워터마크 없는 클린 완성본"
        : "게시본만",
    },
    { section: "필수 납품 파일", label: "전달기한", value: "게시 후 3영업일 이내" },
    { section: "촬영 원본", label: "제공 여부", value: RAW_FOOTAGE_LABEL[c.raw_footage] },
    ...(c.raw_footage === "paid"
      ? [{ section: "촬영 원본", label: "추가비용", value: money(c.raw_footage_fee) }]
      : []),
    ...(c.raw_footage !== "not_provided"
      ? [
          { section: "촬영 원본", label: "제공 범위", value: c.raw_footage_scope ?? "" },
          { section: "촬영 원본", label: "전달일", value: date(c.raw_footage_due) },
        ]
      : []),
    { section: "담당 연락", label: "갑 담당자", value: "" },
    { section: "담당 연락", label: "을 연락처", value: "서명 시 을이 기재" },
  );

  return rows;
}

/** 양식 + 계약 데이터 → 계약서 1부의 본문 스냅샷 */
export function buildDocContent(
  contract: InfluencerContract,
  template: TemplateContent,
  key: TemplateKey,
): DocContent {
  return {
    ...template,
    headerMeta: {
      partyB: contract.instagram_handle
        ? `${contract.name} (@${contract.instagram_handle})`
        : contract.name,
      contractTypeLabel: DOC_COLLAB_LABEL[key],
      campaign: TMA_CAMPAIGN_LABEL,
    },
    terms: buildTerms(contract, key),
    company: { ...DEFAULT_COMPANY },
  };
}
