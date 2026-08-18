"use client";

// 계약관리(범용) 전자서명 페이지(공개, 모바일 우선).
// 계약서 전문 열람 → 문서 안의 노란 칸을 눌러 그 자리에서 채우기 → 서명(손서명 또는 법인 도장)
// → 제출 → 완료(사본 다운로드).
//
// 입력을 화면 아래 폼에 몰아 두지 않는 이유: 조항이 많은 계약서에서는 그 값이 계약서
// 어디에 들어가는지 알 수 없다. 칸을 누르면 PC 는 그 자리 팝오버, 폰은 하단 시트로 받는다.
// 성명·사업자등록번호만 서명란 옆에 둔다 — 본문 칸이 아니라 서명란에 인쇄되는 값이라서다.
//
// ⚠️ 화면에서 무엇을 막든 최종 검증은 서버(lib/contracts/signService.ts)다. 그쪽을 대체하지 않는다.

import { useCallback, useMemo, useRef, useState } from "react";
import { CHECKBOX_ON } from "@/lib/contracts/constants";
import { fieldKeysInDocOrder, findFieldChip, scrollToFieldChip } from "@/lib/contracts/chipFlash";
import ContractDocViewV2 from "@/components/shared/ContractDocViewV2";
import SignatureCanvas, { type SignatureCanvasHandle } from "./SignatureCanvas";
import SignFieldPrompt from "./SignFieldPrompt";
import SignProgressBar from "./SignProgressBar";
import type { CompanySignPageData } from "@/lib/contracts/types";

const INPUT_CLS =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-slate-800 " +
  "placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
const LABEL_CLS = "mb-1.5 block text-[13px] font-semibold text-slate-600";

interface Props {
  token: string;
  data: CompanySignPageData;
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
          계약 이행 목적으로만 암호화되어 안전하게 보관됩니다.
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

export default function CompanySignPageClient({ token, data }: Props) {
  const sigRef = useRef<SignatureCanvasHandle>(null);
  const signBoxRef = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const partyFields = useMemo(
    () => data.content.fields.filter((f) => f.kind === "party"),
    [data.content.fields],
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [signerName, setSignerName] = useState("");
  const [businessRegNo, setBusinessRegNo] = useState("");

  // 지금 입력 중인 칸 (입력창은 이 key 로 문서에서 자기 자리를 스스로 찾는다)
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeField = partyFields.find((f) => f.key === activeKey) ?? null;

  const isCorp = data.counterpartyKind === "corp";
  const [signatureMode, setSignatureMode] = useState<"draw" | "stamp">("draw");
  const [stampFile, setStampFile] = useState<File | null>(null);
  const stampPreview = useMemo(
    () => (stampFile ? URL.createObjectURL(stampFile) : null),
    [stampFile],
  );

  // 필수 칸 진행 상황 — 서명 버튼을 열지 말지도 여기서 정한다(서버 검증과 별개의 안내용)
  const requiredFields = partyFields.filter((f) => f.required);
  const requiredLeft = requiredFields.filter((f) => !values[f.key]?.trim());

  /**
   * 문서에서 그 칸을 찾아 화면 가운데로 옮기고 입력창을 연다.
   * 체크박스는 입력할 게 없으므로 입력창을 열지 않고 그 자리에서 바로 켜고 끈다.
   */
  const openField = useCallback(
    (key: string) => {
      const def = partyFields.find((f) => f.key === key);
      if (def?.type === "checkbox") {
        setValues((prev) => ({ ...prev, [key]: prev[key] ? "" : CHECKBOX_ON }));
        setActiveKey(null);
        return;
      }
      setActiveKey(key);
      const el = findFieldChip(document, key);
      if (el) scrollToFieldChip(el);
    },
    [partyFields],
  );

  /**
   * 아직 안 채운 다음 필수 칸. 없으면 null.
   *
   * 순서는 반드시 **계약서에 보이는 순서**여야 한다. 칸이 만들어진 순서(content.fields)로
   * 옮기면 위에서 아래로 읽던 사람이 갑자기 아래 칸으로 튄다 — 실제로 그렇게 만들었다가 고쳤다.
   * 문서에 그려진 칸의 DOM 순서가 곧 읽는 순서다.
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
            href={`/api/sign/c/${token}/pdf`}
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
  const canSign = signatureMode === "stamp" ? Boolean(stampFile) : drawn;

  const submit = async () => {
    setError(null);
    let signature: string | null = null;
    if (signatureMode === "draw") {
      signature = sigRef.current?.toDataUrl() ?? null;
      if (!signature) {
        setError("서명란에 서명을 그려주세요.");
        return;
      }
    } else if (!stampFile) {
      setError("도장 이미지를 올려주세요.");
      return;
    }
    if (!agreed) {
      setError("계약 내용 확인·동의에 체크해주세요.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("signerName", signerName);
      form.set("fields", JSON.stringify(values));
      form.set("businessRegNo", businessRegNo);
      form.set("signatureMode", signatureMode);
      if (signature) form.set("signature", signature);
      if (signatureMode === "stamp" && stampFile) form.set("stampFile", stampFile);
      form.set("agreed", "true");

      const res = await fetch(`/api/sign/c/${token}`, { method: "POST", body: form });
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

  const partyB = isCorp ? data.counterpartyCompany || data.counterpartyName : data.counterpartyName;

  return (
    <Shell>
      {/* 진행 안내 — 남은 칸 수와 「다음 칸」 이동 */}
      {partyFields.length > 0 && (
        <SignProgressBar
          requiredTotal={requiredFields.length}
          requiredLeft={requiredLeft.length}
          onNext={() => goNext()}
        />
      )}

      {/* 계약서 전문 — 노란 칸을 누르면 그 자리에서 입력한다 */}
      <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
        <ContractDocViewV2
          content={data.content}
          mode="sign"
          partyB={partyB}
          partyValues={values}
          onFieldClick={openField}
          activeFieldKey={activeKey}
        />
      </div>

      {/* 서명 */}
      <div ref={signBoxRef} className="mt-4 rounded-2xl bg-white p-5 shadow-sm sm:p-8">
        <h2 className="text-base font-bold text-slate-900">서명</h2>
        <p className="mt-1 text-[13px] text-slate-500">
          아래 이름은 계약서 서명란에 그대로 인쇄돼요. 모든 정보는 암호화되어 보관됩니다.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLS}>{isCorp ? "대표자/서명자 성명 *" : "성명(실명) *"}</label>
            <input
              className={INPUT_CLS}
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="홍길동"
            />
          </div>
          {isCorp && (
            <div>
              <label className={LABEL_CLS}>사업자등록번호 *</label>
              <input
                className={INPUT_CLS}
                value={businessRegNo}
                onChange={(e) => setBusinessRegNo(e.target.value)}
                placeholder="000-00-00000"
                inputMode="numeric"
              />
            </div>
          )}
        </div>

        {/* 서명 방식 */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <label className={LABEL_CLS}>서명 *</label>
            {signatureMode === "draw" && (
              <button
                type="button"
                onClick={() => sigRef.current?.clear()}
                className="text-[12.5px] font-semibold text-slate-400 hover:text-slate-600"
              >
                지우기
              </button>
            )}
          </div>

          {isCorp && (
            <div className="mb-3 flex gap-2">
              {(
                [
                  ["draw", "✍️ 직접 서명 그리기"],
                  ["stamp", "🔴 법인 도장 이미지 올리기"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSignatureMode(mode)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-[13px] font-bold transition-colors ${
                    signatureMode === mode
                      ? "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 bg-white text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {signatureMode === "draw" ? (
            <>
              <SignatureCanvas ref={sigRef} onDrawnChange={setDrawn} />
              <p className="mt-1.5 text-[11.5px] text-slate-400">손가락 또는 마우스로 서명해주세요.</p>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
              {stampPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- 로컬 파일 미리보기(objectURL)
                <img src={stampPreview} alt="도장 미리보기" className="mx-auto h-24 w-24 object-contain" />
              ) : (
                <p className="text-[13px] text-slate-400">법인 도장 이미지(PNG/JPG, 5MB 이하)</p>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => setStampFile(e.target.files?.[0] ?? null)}
                className="mx-auto mt-3 block text-[13px] text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-200 file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-slate-600 hover:file:bg-slate-300"
              />
            </div>
          )}
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
            계약서에 아직 채우지 않은 칸이 {requiredLeft.length}개 있어요 —{" "}
            <b>「{requiredLeft[0].label}」</b> 부터 채우러 가기 ↑
          </button>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy || !canSign || !agreed || requiredLeft.length > 0}
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
