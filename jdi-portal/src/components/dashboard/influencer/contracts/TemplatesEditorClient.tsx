"use client";

// 계약서 양식 편집 — 여기서 고치면 "앞으로 만드는" 모든 계약서에 적용된다.
// (이미 만든 계약서에는 영향 없음 — 계약서는 생성 시점 내용을 스냅샷으로 갖는다.)

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils/errors";
import { MODAL_INPUT_CLS, MODAL_LABEL_CLS } from "@/lib/vault/constants";
import { getTemplate, saveTemplate } from "@/lib/influencer/contracts/documents/actions";
import { DEFAULT_TEMPLATES, TERMS_MARKER } from "@/lib/influencer/contracts/documents/template";
import type { TemplateContent, TemplateKey } from "@/lib/influencer/contracts/documents/types";

const TABS: { key: TemplateKey; label: string }[] = [
  { key: "paid", label: "광고비 지급형" },
  { key: "seeding", label: "순수 협찬형" },
];

export default function TemplatesEditorClient() {
  const [tab, setTab] = useState<TemplateKey>("paid");
  const [content, setContent] = useState<TemplateContent | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (key: TemplateKey) => {
    setContent(null);
    try {
      setContent(await getTemplate(key));
    } catch (err) {
      toast.error(getErrorMessage(err, "양식을 불러오지 못했습니다."));
      setContent(DEFAULT_TEMPLATES[key]);
    }
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  const setField = <K extends keyof TemplateContent>(key: K, value: TemplateContent[K]) =>
    setContent((c) => (c ? { ...c, [key]: value } : c));

  const setClause = (index: number, patch: Partial<{ heading: string; body: string }>) =>
    setContent((c) =>
      c
        ? { ...c, clauses: c.clauses.map((cl, i) => (i === index ? { ...cl, ...patch } : cl)) }
        : c,
    );

  const save = async () => {
    if (!content || busy) return;
    setBusy(true);
    try {
      await saveTemplate(tab, content);
      toast.success("양식을 저장했어요. 앞으로 만드는 계약서부터 적용됩니다.");
    } catch (err) {
      toast.error(getErrorMessage(err, "저장에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const resetToDefault = () => {
    if (!window.confirm("기본 양식으로 되돌릴까요? (저장을 눌러야 확정됩니다)")) return;
    setContent(DEFAULT_TEMPLATES[tab]);
    toast.info("기본 양식을 불러왔어요. 아래 '양식 저장'을 눌러 확정하세요.");
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-slate-800">계약서 양식 편집</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">
            여기서 고치면 <b>앞으로 만드는</b> 계약서에 적용돼요. 이미 만든 계약서는 바뀌지 않아요.
          </p>
        </div>
        <Link
          href="/dashboard/influencer/contracts"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          ← 계약 관리로
        </Link>
      </div>

      <div className="mb-4 flex rounded-xl bg-slate-100 p-1 text-sm font-bold w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 transition-colors ${
              tab === t.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!content ? (
        <p className="py-10 text-center text-sm text-slate-400">양식을 불러오는 중…</p>
      ) : (
        <div className="space-y-5 rounded-2xl bg-white p-5 shadow-sm sm:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={MODAL_LABEL_CLS}>제목</label>
              <input className={MODAL_INPUT_CLS} value={content.title} onChange={(e) => setField("title", e.target.value)} />
            </div>
            <div>
              <label className={MODAL_LABEL_CLS}>부제목</label>
              <input className={MODAL_INPUT_CLS} value={content.subtitle} onChange={(e) => setField("subtitle", e.target.value)} />
            </div>
          </div>

          <div>
            <label className={MODAL_LABEL_CLS}>전문 (계약서 첫 문단)</label>
            <textarea
              className={`${MODAL_INPUT_CLS} min-h-[80px] leading-relaxed`}
              value={content.intro}
              onChange={(e) => setField("intro", e.target.value)}
            />
          </div>

          <div>
            <label className={MODAL_LABEL_CLS}>조항 본문 (클릭해서 펼치기)</label>
            <div className="space-y-2">
              {content.clauses.map((clause, i) =>
                clause.body.trim() === TERMS_MARKER ? (
                  <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-[13px] text-slate-500">
                    <b>{clause.heading}</b> — 이 자리에는 계약별 개별 조건표(자동 생성)가 들어가요.
                  </div>
                ) : (
                  <details key={i} className="rounded-xl border border-slate-100">
                    <summary className="cursor-pointer px-4 py-3 text-[13.5px] font-bold text-slate-700 hover:bg-slate-50">
                      {clause.heading}
                    </summary>
                    <div className="space-y-2 px-4 pb-4">
                      <input
                        className={MODAL_INPUT_CLS}
                        value={clause.heading}
                        onChange={(e) => setClause(i, { heading: e.target.value })}
                      />
                      <textarea
                        className={`${MODAL_INPUT_CLS} min-h-[160px] leading-relaxed`}
                        value={clause.body}
                        onChange={(e) => setClause(i, { body: e.target.value })}
                      />
                    </div>
                  </details>
                ),
              )}
            </div>
          </div>

          <div>
            <label className={MODAL_LABEL_CLS}>조건표 아래 강조 문구</label>
            <textarea
              className={`${MODAL_INPUT_CLS} min-h-[60px]`}
              value={content.importantNote}
              onChange={(e) => setField("importantNote", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={MODAL_LABEL_CLS}>서명 안내문</label>
              <textarea
                className={`${MODAL_INPUT_CLS} min-h-[60px]`}
                value={content.closing}
                onChange={(e) => setField("closing", e.target.value)}
              />
            </div>
            <div>
              <label className={MODAL_LABEL_CLS}>맨 아래 문구</label>
              <textarea
                className={`${MODAL_INPUT_CLS} min-h-[60px]`}
                value={content.footnote}
                onChange={(e) => setField("footnote", e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={resetToDefault}
              className="text-[13px] text-slate-400 underline hover:text-slate-600"
            >
              기본 양식으로 되돌리기
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-xl bg-[#2563eb] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
            >
              {busy ? "저장 중…" : "양식 저장"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
