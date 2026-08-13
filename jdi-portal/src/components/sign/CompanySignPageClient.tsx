"use client";

// 계약관리(범용) 전자서명 페이지(공개, 모바일 우선).
// 계약서 전문 열람 → 문서에 정의된 상대방 입력 칸 채우기 → 서명(손서명 또는 법인 도장 업로드)
// → 제출 → 완료(사본 다운로드). TMA SignPageClient 와 달리 입력 폼이 데이터 주도다.

import { useMemo, useRef, useState } from "react";
import ContractDocViewV2 from "@/components/shared/ContractDocViewV2";
import SignatureCanvas, { type SignatureCanvasHandle } from "./SignatureCanvas";
import type { CompanySignPageData, FieldDef } from "@/lib/contracts/types";

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

/** 필드 종류별 입력 속성 */
function inputProps(fieldDef: FieldDef): React.InputHTMLAttributes<HTMLInputElement> {
  switch (fieldDef.type) {
    case "phone":
      return { inputMode: "tel", placeholder: "010-0000-0000" };
    case "email":
      return { inputMode: "email", placeholder: "you@example.com" };
    case "number":
      return { inputMode: "numeric", placeholder: "숫자 입력" };
    case "account":
      return { inputMode: "numeric", placeholder: "예: 302-1234-5678-11" };
    case "bank":
      return { placeholder: "예: 농협은행" };
    case "date":
      return { type: "date" };
    default:
      return {};
  }
}

export default function CompanySignPageClient({ token, data }: Props) {
  const sigRef = useRef<SignatureCanvasHandle>(null);
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

  const isCorp = data.counterpartyKind === "corp";
  const [signatureMode, setSignatureMode] = useState<"draw" | "stamp">("draw");
  const [stampFile, setStampFile] = useState<File | null>(null);
  const stampPreview = useMemo(
    () => (stampFile ? URL.createObjectURL(stampFile) : null),
    [stampFile],
  );

  const setValue = (key: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setValues((v) => ({ ...v, [key]: e.target.value }));

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
      {/* 계약서 전문 — 입력하면 노란 칸에 값이 실시간 반영된다 */}
      <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
        <ContractDocViewV2 content={data.content} mode="sign" partyB={partyB} partyValues={values} />
      </div>

      {/* 입력 + 서명 */}
      <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm sm:p-8">
        <h2 className="text-base font-bold text-slate-900">서명 정보 입력</h2>
        <p className="mt-1 text-[13px] text-slate-500">
          입력한 내용은 계약서의 노란 칸 자리에 그대로 들어가요. 모든 정보는 암호화되어 보관됩니다.
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
          {partyFields.map((fieldDef) =>
            fieldDef.type === "multiline" ? (
              <div key={fieldDef.key} className="sm:col-span-2">
                <label className={LABEL_CLS}>
                  {fieldDef.label} {fieldDef.required && "*"}
                </label>
                <textarea
                  className={`${INPUT_CLS} min-h-[84px] resize-y`}
                  value={values[fieldDef.key] ?? ""}
                  onChange={setValue(fieldDef.key)}
                />
              </div>
            ) : (
              <div key={fieldDef.key}>
                <label className={LABEL_CLS}>
                  {fieldDef.label} {fieldDef.required && "*"}
                </label>
                <input
                  className={INPUT_CLS}
                  value={values[fieldDef.key] ?? ""}
                  onChange={setValue(fieldDef.key)}
                  {...inputProps(fieldDef)}
                />
              </div>
            ),
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

        <button
          type="button"
          onClick={submit}
          disabled={busy || !canSign || !agreed}
          className="mt-5 w-full rounded-xl bg-[#2563eb] py-3.5 text-[15px] font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "제출 중… (잠시만 기다려주세요)" : "동의하고 서명 완료하기"}
        </button>
      </div>
    </Shell>
  );
}
