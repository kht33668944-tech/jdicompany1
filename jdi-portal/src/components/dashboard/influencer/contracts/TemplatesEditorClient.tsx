"use client";

// 인플루언서(TMA) 계약서 양식 편집 — 계약관리와 같은 문서형 편집기를 쓴다.
// 여기서 고치면 "앞으로 만드는" 계약서에 적용된다.
// (이미 만든 계약서는 생성 시점 내용을 스냅샷으로 갖고 있어 영향 없음 — 서명본도 안전하다.)
//
// 계약관리(ContentV2)와 조항 구조가 같아서(제목/서문/조항[제목+본문]/{{TERMS}}/맺음말/하단문구)
// 편집기를 그대로 공유한다. TMA 에만 있는 부제목·강조 문구는 왼쪽 패널에서 받는다.
// TMA 는 본문에 채움 칸을 심지 않으므로 allowFields={false}, 조건표는 자리만 잡는다.
//
// ⚠️ 편집기(TipTap)는 무거워서 반드시 dynamic(ssr:false) 로만 부른다 — 초기 JS 예산 보호.

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils/errors";
import { MODAL_INPUT_CLS, MODAL_LABEL_CLS } from "@/lib/vault/constants";
import { getTemplate, saveTemplate } from "@/lib/influencer/contracts/documents/actions";
import { DEFAULT_TEMPLATES } from "@/lib/influencer/contracts/documents/template";
import type { TemplateContent, TemplateKey } from "@/lib/influencer/contracts/documents/types";
import type { ContentV2 } from "@/lib/contracts/types";

const ContractRichEditor = dynamic(
  () => import("@/components/dashboard/contracts/ContractRichEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[520px] animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
    ),
  },
);

const TABS: { key: TemplateKey; label: string }[] = [
  { key: "paid", label: "광고비 지급형" },
  { key: "seeding", label: "순수 협찬형" },
];

/** TMA 양식을 편집기가 아는 모양(ContentV2)으로 감싼다 — 조항 구조가 같아 그대로 옮겨 담는다 */
function toEditorContent(t: TemplateContent): ContentV2 {
  return {
    version: 2,
    title: t.title,
    intro: t.intro,
    clauses: t.clauses,
    fields: [], // TMA 는 본문에 채움 칸을 쓰지 않는다
    company: { name: "", ceo: "", address: "", manager: "", managerContact: "" },
    closing: t.closing,
    footnote: t.footnote,
  };
}

export default function TemplatesEditorClient() {
  const [tab, setTab] = useState<TemplateKey>("paid");
  const [content, setContent] = useState<TemplateContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  // 편집기는 처음 한 번만 내용을 받는다(그 뒤로는 편집기가 문서를 소유).
  // 탭을 바꾸거나 기본 양식을 불러오면 이 값을 올려 새로 마운트한다.
  const [editorSeq, setEditorSeq] = useState(0);

  const load = useCallback(async (key: TemplateKey) => {
    setContent(null);
    try {
      setContent(await getTemplate(key));
    } catch (err) {
      toast.error(getErrorMessage(err, "양식을 불러오지 못했습니다."));
      setContent(DEFAULT_TEMPLATES[key]);
    }
    setDirty(false);
    setEditorSeq((n) => n + 1);
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  // 저장하지 않고 나가려 하면 붙잡는다
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setField = <K extends keyof TemplateContent>(key: K, value: TemplateContent[K]) => {
    setContent((c) => (c ? { ...c, [key]: value } : c));
    setDirty(true);
  };

  /** 편집기가 본문을 고칠 때마다 — 제목·서문·조항만 돌려준다 */
  const onDocChange = useCallback((partial: Pick<ContentV2, "title" | "intro" | "clauses">) => {
    setContent((c) => (c ? { ...c, ...partial } : c));
    setDirty(true);
  }, []);

  const editorContent = useMemo(
    () => (content ? toEditorContent(content) : null),
    // 편집기는 처음 값만 쓰므로 탭이 바뀔 때(editorSeq)만 새로 만든다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorSeq, content !== null],
  );

  const save = async () => {
    if (!content || busy) return;
    setBusy(true);
    try {
      await saveTemplate(tab, content);
      setDirty(false);
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
    setDirty(true);
    setEditorSeq((n) => n + 1);
    toast.info("기본 양식을 불러왔어요. 오른쪽 위 '양식 저장'을 눌러 확정하세요.");
  };

  const switchTab = (key: TemplateKey) => {
    if (key === tab) return;
    if (dirty && !window.confirm("저장하지 않은 변경이 있어요. 그대로 이동할까요?")) return;
    setTab(key);
  };

  return (
    <div className="flex h-[calc(100vh-64px)] min-h-0 flex-col">
      {/* 상단 바 */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <Link
          href="/dashboard/influencer/contracts"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-50"
        >
          ← 계약 관리
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-extrabold text-slate-800">계약서 양식 편집</h1>
          <p className="text-[11.5px] text-slate-500">
            여기서 고치면 <b>앞으로 만드는</b> 계약서에 적용돼요. 이미 만든 계약서는 안 바뀝니다.
          </p>
        </div>

        <div className="flex rounded-xl bg-slate-100 p-1 text-[13px] font-bold">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTab(t.key)}
              className={`rounded-lg px-3.5 py-1.5 transition-colors ${
                tab === t.key
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-[12px] font-bold text-amber-600">저장 안 됨</span>}
          <button
            type="button"
            onClick={save}
            disabled={busy || !content}
            className="rounded-xl bg-[#2563eb] px-5 py-2 text-[13px] font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "저장 중…" : "양식 저장"}
          </button>
        </div>
      </div>

      {!content || !editorContent ? (
        <p className="py-16 text-center text-sm text-slate-400">양식을 불러오는 중…</p>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* 왼쪽 — 본문 밖의 값들 */}
          <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4 lg:block">
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-slate-400">
              문서 정보
            </h2>
            <div className="space-y-3">
              <div>
                <label className={MODAL_LABEL_CLS}>부제목</label>
                <input
                  className={MODAL_INPUT_CLS}
                  value={content.subtitle}
                  onChange={(e) => setField("subtitle", e.target.value)}
                  placeholder="예: 2026 TMA 크리스마스 시즌"
                />
              </div>
              <div>
                <label className={MODAL_LABEL_CLS}>조건표 아래 강조 문구</label>
                <textarea
                  className={`${MODAL_INPUT_CLS} min-h-[64px] leading-relaxed`}
                  value={content.importantNote}
                  onChange={(e) => setField("importantNote", e.target.value)}
                />
              </div>
              <div>
                <label className={MODAL_LABEL_CLS}>서명 안내문</label>
                <textarea
                  className={`${MODAL_INPUT_CLS} min-h-[56px] leading-relaxed`}
                  value={content.closing}
                  onChange={(e) => setField("closing", e.target.value)}
                />
              </div>
              <div>
                <label className={MODAL_LABEL_CLS}>맨 아래 문구</label>
                <textarea
                  className={`${MODAL_INPUT_CLS} min-h-[56px] leading-relaxed`}
                  value={content.footnote}
                  onChange={(e) => setField("footnote", e.target.value)}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={resetToDefault}
              className="mt-5 w-full rounded-xl border border-slate-200 px-3 py-2 text-[12.5px] font-semibold text-slate-500 hover:bg-slate-50"
            >
              기본 양식으로 되돌리기
            </button>

            <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-400">
              워드나 한글에서 계약서를 복사해 오른쪽 문서에 붙여넣으면 <b>제N조</b>를 알아보고
              조항으로 나눠 담아요.
            </p>
          </aside>

          {/* 오른쪽 — 문서형 편집기(계약관리와 같은 것) */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ContractRichEditor
              key={`${tab}-${editorSeq}`}
              initialContent={editorContent}
              fields={[]}
              terms={[]}
              onTermsChange={() => {}}
              onDocChange={onDocChange}
              onCreateField={() => null}
              onUpdateField={() => {}}
              onDeleteField={() => {}}
              highlightFieldKey={null}
              onHighlightHandled={() => {}}
              allowFields={false}
              termsPlaceholder
            />
          </div>
        </div>
      )}
    </div>
  );
}
