"use client";

// 인플루언서(TMA) 전자서명 페이지(공개, 모바일 우선).
// 계약서 전문 열람 → 계약서 맨 끝 「서명 및 계약 정보」 표의 빈칸을 눌러 그 자리에서 채우기
// → 신분증(선택) → 손서명 → 제출 → 완료(사본 다운로드).
//
// 입력을 화면 아래 폼에 몰아 두지 않는 이유: 조항이 열 개 넘는 계약서에서는 그 값이
// 계약서 어디에 들어가는지 알 수 없다. 칸을 누르면 PC 는 그 자리 팝오버, 폰은 하단 시트로 받는다.
// (계약관리 서명 페이지와 같은 방식 — 입력창·진행 막대 부품을 그대로 공유한다.)
//
// ⚠️ 화면에서 무엇을 막든 최종 검증은 서버(lib/influencer/contracts/documents/signService.ts)다.
//    그쪽을 대체하지 않는다.

import { useCallback, useMemo, useRef, useState } from "react";
import ContractDocView from "@/components/shared/ContractDocView";
import { fieldKeysInDocOrder, findFieldChip, scrollToFieldChip } from "@/lib/contracts/chipFlash";
import SignatureCanvas, { type SignatureCanvasHandle } from "./SignatureCanvas";
import SignFieldPrompt from "./SignFieldPrompt";
import SignProgressBar from "./SignProgressBar";
import TmaSignerBlock from "./TmaSignerBlock";
import { TMA_SIGNER_FIELDS, visibleSignerFields } from "./tmaSignerFields";
import type { SignPageData } from "@/lib/influencer/contracts/documents/types";

const LABEL_CLS = "mb-1.5 block text-[13px] font-semibold text-slate-600";

interface Props {
  token: string;
  data: SignPageData;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 py-6 px-3 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        <p className="mb-3 text-center text-[13px] font-bold tracking-widest text-slate-400">
          JDI COMPANY · 전자계약
        </p>
        {children}
        <p className="mt-6 text-center text-[11.5px] text-slate-400">
          본 페이지는 주식회사 제이디아이컴퍼니의 전자서명 시스템입니다. 입력하신 정보는
          계약 이행·정산 목적으로만 암호화되어 안전하게 보관됩니다.
        </p>
      </div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
      <p className="text-lg font-bold text-slate-800">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{body}</p>
    </div>
  );
}

export default function SignPageClient({ token, data }: Props) {
  const sigRef = useRef<SignatureCanvasHandle>(null);
  const signBoxRef = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const isBusiness = data.settlementType === "business";
  const fields = useMemo(() => visibleSignerFields(isBusiness), [isBusiness]);

  // FormData 키 = 이 객체의 키. 보이지 않는 칸(사업자등록번호)도 빈 값으로 함께 보낸다(기존과 동일).
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(TMA_SIGNER_FIELDS.map((f) => [f.key, ""])),
    channel: data.content.headerMeta.partyB,
  }));
  const [idCard, setIdCard] = useState<File | null>(null);

  // 지금 입력 중인 칸 (입력창은 이 key 로 표에서 자기 자리를 스스로 찾는다)
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeField = fields.find((f) => f.key === activeKey) ?? null;

  // 필수 칸 진행 상황 — 제출 버튼을 열지 말지도 여기서 정한다(서버 검증과 별개의 안내용)
  const requiredFields = fields.filter((f) => f.required);
  const requiredLeft = requiredFields.filter((f) => !values[f.key]?.trim());

  /** 표에서 그 칸을 찾아 화면 가운데로 옮기고 입력창을 연다 */
  const openField = useCallback((key: string) => {
    setActiveKey(key);
    const el = findFieldChip(document, key);
    if (el) scrollToFieldChip(el);
  }, []);

  /**
   * 아직 안 채운 다음 필수 칸. 없으면 null.
   * 순서는 화면에 보이는 순서(DOM 순서)를 따른다 — 정의 순서로 옮기면 커서가 엉뚱하게 튄다.
   */
  const nextRequiredKey = (afterKey?: string) => {
    const requiredKeys = new Set(requiredFields.map((f) => f.key));
    return (
      fieldKeysInDocOrder(document).find(
        (k) => requiredKeys.has(k) && k !== afterKey && !values[k]?.trim(),
      ) ?? null
    );
  };

  /** 「다음 칸」 — 남은 필수 칸으로, 다 채웠으면 서명 영역으로 */
  const goNext = (afterKey?: string) => {
    const key = nextRequiredKey(afterKey);
    if (key) {
      openField(key);
      return;
    }
    setActiveKey(null);
    signBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ── 상태별 안내 화면 ──────────────────────────────────
  if (data.status === "signed" || done) {
    return (
      <Shell>
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">✅</p>
          <p className="mt-3 text-lg font-bold text-slate-800">서명이 완료되었습니다</p>
          <p className="mt-2 text-sm text-slate-500">
            계약이 정상적으로 체결되었어요. 아래 버튼으로 서명 완료본(PDF)을 저장해 두세요.
            <br />이 링크로는 30일 동안 사본을 다시 받을 수 있습니다.
          </p>
          <a
            href={`/api/sign/${token}/pdf`}
            className="mt-5 inline-block rounded-xl bg-[#2563eb] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all"
          >
            계약서 사본 다운로드 (PDF)
          </a>
        </div>
      </Shell>
    );
  }

  if (data.expired) {
    return (
      <Shell>
        <Notice
          title="서명 링크가 만료되었습니다"
          body="링크 유효기간(7일)이 지났어요. 담당자에게 새 서명 링크를 요청해주세요."
        />
      </Shell>
    );
  }

  // ── 제출 ──────────────────────────────────────────────
  const submit = async () => {
    setError(null);
    const signature = sigRef.current?.toDataUrl();
    if (!signature) {
      setError("서명란에 서명을 그려주세요.");
      return;
    }
    if (!agreed) {
      setError("계약 내용 확인·동의에 체크해주세요.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      Object.entries(values).forEach(([k, v]) => form.set(k, v));
      form.set("signature", signature);
      form.set("agreed", "true");
      if (idCard) form.set("idCard", idCard);

      const res = await fetch(`/api/sign/${token}`, { method: "POST", body: form });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "제출에 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "제출에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      {/* 진행 안내 — 남은 칸 수와 「다음 칸」 이동 */}
      <SignProgressBar
        requiredTotal={requiredFields.length}
        requiredLeft={requiredLeft.length}
        onNext={() => goNext()}
      />

      {/* 계약서 전문 + 맨 끝의 「서명 및 계약 정보」 표(여기서 바로 채운다) */}
      <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
        <ContractDocView content={data.content} />

        <div className="mt-6">
          <p className="mb-2 text-[12.5px] text-slate-500">
            아래 <b className="text-amber-600">노란 칸</b>을 눌러 채워주세요. 입력한 값은 계약서
            서명란에 그대로 인쇄됩니다.
          </p>
          <TmaSignerBlock
            fields={fields}
            values={values}
            activeKey={activeKey}
            onFieldClick={openField}
          />
        </div>
      </div>

      {/* 신분증 · 서명 · 동의 — 계약서에 인쇄되지 않는 것들 */}
      <div ref={signBoxRef} className="mt-4 rounded-2xl bg-white p-5 shadow-sm sm:p-8">
        <h2 className="text-base font-bold text-slate-900">서명</h2>

        <div className="mt-4">
          <label className={LABEL_CLS}>신분증 사진 (선택)</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => setIdCard(e.target.files?.[0] ?? null)}
            className="block w-full text-[13px] text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-slate-600 hover:file:bg-slate-200"
          />
          <p className="mt-1 text-[11.5px] text-slate-400">
            정산(원천징수 신고)에 필요한 경우에만 요청드려요.
          </p>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <label className={LABEL_CLS}>서명 *</label>
            <button
              type="button"
              onClick={() => sigRef.current?.clear()}
              className="text-[12.5px] font-semibold text-slate-400 hover:text-slate-600"
            >
              지우기
            </button>
          </div>
          <SignatureCanvas ref={sigRef} onDrawnChange={setDrawn} />
          <p className="mt-1.5 text-[11.5px] text-slate-400">손가락 또는 마우스로 서명해주세요.</p>
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-xl bg-slate-50 px-4 py-3.5">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-blue-600"
          />
          <span className="text-[13.5px] text-slate-700">
            위 계약서 전문을 확인했으며, 계약 내용에 동의하고 전자서명합니다.
          </span>
        </label>

        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3.5 py-2.5 text-[13px] font-semibold text-rose-600">
            {error}
          </p>
        )}

        {/* 안 채운 필수 칸이 있으면 제출을 막고 그 자리로 데려간다(서버도 같은 값을 다시 검증한다) */}
        {requiredLeft.length > 0 && (
          <button
            type="button"
            onClick={() => openField(requiredLeft[0].key)}
            className="mt-4 w-full rounded-xl bg-amber-50 px-3.5 py-3 text-left text-[13px] font-semibold text-amber-700 hover:bg-amber-100"
          >
            아직 채우지 않은 칸이 {requiredLeft.length}개 있어요 —{" "}
            <b>「{requiredLeft[0].label}」</b> 부터 채우러 가기 ↑
          </button>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy || !drawn || !agreed || requiredLeft.length > 0}
          className="mt-4 w-full rounded-xl bg-[#2563eb] py-3.5 text-[15px] font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "제출 중… (잠시만 기다려주세요)" : "동의하고 서명 완료하기"}
        </button>
      </div>

      {/* 칸 입력창 — PC 는 그 자리 팝오버, 폰은 하단 시트 */}
      {activeField && (
        <SignFieldPrompt
          key={activeField.key}
          fieldDef={activeField}
          value={values[activeField.key] ?? ""}
          onChange={(v) => setValues((prev) => ({ ...prev, [activeField.key]: v }))}
          onClose={() => setActiveKey(null)}
          // 「다음 칸」과 같은 판단을 쓴다 — 버튼이 있는데 서명 영역으로 튀는 일이 없게
          onNext={nextRequiredKey(activeField.key) ? () => goNext(activeField.key) : null}
        />
      )}
    </Shell>
  );
}
