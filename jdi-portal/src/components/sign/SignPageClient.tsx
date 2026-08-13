"use client";

// 인플루언서 전자서명 페이지(공개, 모바일 우선).
// 계약서 전문 열람 → 필수 정보 입력 → 손서명 → 제출 → 완료(사본 다운로드).

import { useRef, useState } from "react";
import ContractDocView from "@/components/shared/ContractDocView";
import SignatureCanvas, { type SignatureCanvasHandle } from "./SignatureCanvas";
import type { SignPageData } from "@/lib/influencer/contracts/documents/types";

const INPUT_CLS =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[15px] text-slate-800 " +
  "placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
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
  const [drawn, setDrawn] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [fields, setFields] = useState({
    name: "",
    channel: data.content.headerMeta.partyB,
    address: "",
    phone: "",
    email: "",
    businessRegNo: "",
    bankName: "",
    bankAccount: "",
    accountHolder: "",
  });
  const [idCard, setIdCard] = useState<File | null>(null);

  const set = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

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
      Object.entries(fields).forEach(([k, v]) => form.set(k, v));
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

  const isBusiness = data.settlementType === "business";

  return (
    <Shell>
      {/* 계약서 전문 */}
      <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
        <ContractDocView content={data.content} />
      </div>

      {/* 입력 + 서명 */}
      <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm sm:p-8">
        <h2 className="text-base font-bold text-slate-900">서명 정보 입력</h2>
        <p className="mt-1 text-[13px] text-slate-500">
          계약서 서명란과 정산(제품 발송·비용 지급)에 필요한 정보입니다. 모든 정보는
          암호화되어 보관돼요.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLS}>성명(실명) *</label>
            <input className={INPUT_CLS} value={fields.name} onChange={set("name")} placeholder="홍길동" />
          </div>
          <div>
            <label className={LABEL_CLS}>채널명/계정</label>
            <input className={INPUT_CLS} value={fields.channel} onChange={set("channel")} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL_CLS}>주소 (제품 수령지) *</label>
            <input className={INPUT_CLS} value={fields.address} onChange={set("address")} placeholder="도로명 주소 + 상세 주소" />
          </div>
          <div>
            <label className={LABEL_CLS}>연락처 *</label>
            <input className={INPUT_CLS} value={fields.phone} onChange={set("phone")} placeholder="010-0000-0000" inputMode="tel" />
          </div>
          <div>
            <label className={LABEL_CLS}>이메일</label>
            <input className={INPUT_CLS} value={fields.email} onChange={set("email")} placeholder="you@example.com" inputMode="email" />
          </div>
          {isBusiness && (
            <div className="sm:col-span-2">
              <label className={LABEL_CLS}>사업자등록번호 *</label>
              <input className={INPUT_CLS} value={fields.businessRegNo} onChange={set("businessRegNo")} placeholder="000-00-00000" />
            </div>
          )}
          <div>
            <label className={LABEL_CLS}>은행명 *</label>
            <input className={INPUT_CLS} value={fields.bankName} onChange={set("bankName")} placeholder="예: 국민은행" />
          </div>
          <div>
            <label className={LABEL_CLS}>계좌번호 *</label>
            <input className={INPUT_CLS} value={fields.bankAccount} onChange={set("bankAccount")} placeholder="숫자와 - 만" inputMode="numeric" />
          </div>
          <div>
            <label className={LABEL_CLS}>예금주 *</label>
            <input className={INPUT_CLS} value={fields.accountHolder} onChange={set("accountHolder")} />
          </div>
          <div>
            <label className={LABEL_CLS}>신분증 사진 (선택)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setIdCard(e.target.files?.[0] ?? null)}
              className="block w-full text-[13px] text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-slate-600 hover:file:bg-slate-200"
            />
            <p className="mt-1 text-[11.5px] text-slate-400">정산(원천징수 신고)에 필요한 경우에만 요청드려요.</p>
          </div>
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

        <button
          type="button"
          onClick={submit}
          disabled={busy || !drawn || !agreed}
          className="mt-5 w-full rounded-xl bg-[#2563eb] py-3.5 text-[15px] font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "제출 중… (잠시만 기다려주세요)" : "동의하고 서명 완료하기"}
        </button>
      </div>
    </Shell>
  );
}
