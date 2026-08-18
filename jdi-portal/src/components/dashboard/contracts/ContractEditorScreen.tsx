"use client";

// 계약서/양식 편집 화면 (전체 화면).
// 왼쪽에 계약 정보·채움 칸, 가운데에 A4 문서형 편집기를 둔다.
// 모달이 아니라 페이지인 이유: 문서 편집은 넓은 화면과 자체 스크롤이 필요하고,
// 공용 모달의 포커스 트랩이 편집 영역(contenteditable)과 충돌하기 때문이다.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import ContractDocViewV2 from "@/components/shared/ContractDocViewV2";
import { getErrorMessage } from "@/lib/utils/errors";
import { COMPANY_CONTRACTS_PATH, TERMS_MARKER } from "@/lib/contracts/constants";
import { nextFieldKey } from "@/lib/contracts/tokens";
import {
  createCompanyTemplate,
  sendCompanyDocument,
  updateCompanyDocument,
  updateCompanyTemplate,
} from "@/lib/contracts/actions";
import type {
  CompanyContractDocument,
  ContentV2,
  CounterpartyKind,
  CreateFieldInput,
  FieldDef,
  TermRow,
} from "@/lib/contracts/types";
import FieldSidePanel from "./FieldSidePanel";

// 편집기는 무거운 라이브러리(TipTap)를 쓰므로 이 화면에 들어올 때만 내려받는다.
// (초기 JS 예산 보호 — 정적 import 금지, scripts/company-contracts.test.mjs 가 고정)
const ContractRichEditor = dynamic(() => import("./ContractRichEditor"), {
  ssr: false,
  loading: () => (
    <div className="m-6 min-h-[520px] flex-1 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
  ),
});

export type EditorTarget =
  | { mode: "doc"; doc: CompanyContractDocument }
  | { mode: "template"; templateId: string | null; title: string; content: ContentV2 };

const INPUT_CLS =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 focus:border-blue-400 focus:outline-none";
const LABEL_CLS = "mb-1 block text-[11px] font-bold text-slate-400";

export default function ContractEditorScreen({ target }: { target: EditorTarget }) {
  const router = useRouter();
  const docMode = target.mode === "doc";

  const [title, setTitle] = useState(docMode ? target.doc.title : target.title);
  const [content, setContent] = useState<ContentV2>(docMode ? target.doc.content : target.content);
  const [counterpartyName, setCounterpartyName] = useState(
    docMode ? target.doc.counterparty_name : "",
  );
  const [counterpartyCompany, setCounterpartyCompany] = useState(
    docMode ? target.doc.counterparty_company ?? "" : "",
  );
  const [counterpartyKind, setCounterpartyKind] = useState<CounterpartyKind>(
    docMode ? target.doc.counterparty_kind : "individual",
  );
  const [templateId, setTemplateId] = useState(docMode ? null : target.templateId);

  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [jumpKey, setJumpKey] = useState<string | null>(null);

  const partyB = docMode
    ? counterpartyKind === "corp"
      ? counterpartyCompany || counterpartyName
      : counterpartyName
    : "(상대방)";

  // 저장하지 않은 변경이 있으면 새로고침/창닫기 때 브라우저가 확인한다
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const patchContent = useCallback((updater: (c: ContentV2) => ContentV2) => {
    setContent(updater);
    setDirty(true);
  }, []);

  // ── 편집기 → 상태 ──────────────────────────────────────
  const handleDocChange = useCallback(
    (partial: Pick<ContentV2, "title" | "intro" | "clauses">) => {
      patchContent((c) => {
        const next: ContentV2 = { ...c, ...partial };
        // 조건표 블록을 지웠으면 표 데이터도 정리한다(저장 검증 불일치 방지)
        if (!next.clauses.some((cl) => cl.body.trim() === TERMS_MARKER)) delete next.terms;
        return next;
      });
    },
    [patchContent],
  );

  const handleTermsChange = useCallback(
    (rows: TermRow[]) => patchContent((c) => ({ ...c, terms: rows })),
    [patchContent],
  );

  const handleCreateField = useCallback(
    (input: CreateFieldInput): FieldDef | null => {
      let created: FieldDef | null = null;
      patchContent((c) => {
        // 같은 이름이 이미 있으면 그 칸을 재사용한다(중복 방지)
        const existing = c.fields.find(
          (f) => f.kind === input.kind && f.label === input.label,
        );
        if (existing) {
          created = existing;
          return c;
        }
        const def: FieldDef = {
          key: nextFieldKey(c),
          kind: input.kind,
          label: input.label,
          type: input.type,
          required: true,
          ...(input.kind === "staff" ? { value: "" } : {}),
        };
        created = def;
        return { ...c, fields: [...c.fields, def] };
      });
      return created;
    },
    [patchContent],
  );

  const handleUpdateField = useCallback(
    (key: string, patch: Partial<FieldDef>) =>
      patchContent((c) => ({
        ...c,
        fields: c.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)),
      })),
    [patchContent],
  );

  const handleDeleteField = useCallback(
    (key: string) =>
      patchContent((c) => ({ ...c, fields: c.fields.filter((f) => f.key !== key) })),
    [patchContent],
  );

  // ── 저장/발송 ──────────────────────────────────────────
  const save = async (): Promise<boolean> => {
    setBusy(true);
    try {
      if (docMode) {
        await updateCompanyDocument(target.doc.id, {
          title,
          counterpartyName,
          counterpartyCompany,
          counterpartyKind,
          content,
        });
        toast.success("계약서를 저장했어요.");
      } else if (templateId) {
        await updateCompanyTemplate(templateId, title, content);
        toast.success("양식을 저장했어요.");
      } else {
        const created = await createCompanyTemplate(title, content);
        setTemplateId(created.id);
        toast.success("새 양식을 저장했어요.");
        router.replace(`${COMPANY_CONTRACTS_PATH}/templates/${created.id}`);
      }
      setDirty(false);
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, "저장에 실패했습니다."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  /**
   * 발송 전 PDF 미리보기 — 상대방이 받을 진짜 PDF 를 새 탭에서 연다.
   * 편집 중 내용은 저장 전에는 DB 에 없으므로 **먼저 저장**한다.
   *
   * 새 탭은 저장을 기다리기 전에 미리 연다 — 저장(await) 뒤에 window.open 을 부르면
   * 브라우저가 "사용자가 누른 것"으로 보지 않아 팝업으로 막힐 수 있다.
   */
  const savePreviewPdf = async () => {
    if (!docMode) return;
    const tab = window.open("about:blank", "_blank");
    if (!(await save())) {
      tab?.close();
      return;
    }
    const url = `/api/contracts/${target.doc.id}/preview-pdf`;
    if (tab) tab.location.href = url;
    else window.open(url, "_blank");
  };

  const saveAndSend = async () => {
    if (!docMode) return;
    if (!(await save())) return;
    setBusy(true);
    try {
      const { token } = await sendCompanyDocument(target.doc.id);
      setDirty(false);
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/sign/c/${token}`);
        toast.success("서명 링크를 복사했어요. 카톡/문자/메일로 붙여넣어 보내세요.");
      } catch {
        // 클립보드 권한이 없으면 다음 화면의 링크를 직접 복사하면 된다
      }
      // 발송하면 이 라우트가 서버에서 다시 그려지며 "서명 대기" 화면(링크 표시)으로 바뀐다
      router.refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "서명 링크 생성에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    if (dirty) {
      setLeaveOpen(true);
      return;
    }
    router.push(COMPANY_CONTRACTS_PATH);
  };

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* 상단 바 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
        <button
          type="button"
          onClick={goBack}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-600 hover:bg-slate-50"
        >
          ← 목록
        </button>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          placeholder={docMode ? "계약서 이름" : "양식 이름"}
          className="min-w-[180px] flex-1 rounded-lg border border-transparent px-2 py-1.5 text-[15px] font-extrabold text-slate-800 hover:border-slate-200 focus:border-blue-400 focus:outline-none"
        />
        {dirty && <span className="text-[11.5px] font-semibold text-amber-600">저장 안 됨</span>}
        <div className="flex rounded-xl bg-slate-100 p-1 text-[12.5px] font-bold">
          {([["edit", "편집"], ["preview", "미리보기"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                tab === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-[13px] font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
        >
          저장
        </button>
        {docMode && (
          <button
            type="button"
            onClick={savePreviewPdf}
            disabled={busy}
            title="상대방이 받을 진짜 PDF 를 새 탭에서 확인합니다"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            저장하고 PDF 미리보기
          </button>
        )}
        {docMode && (
          <button
            type="button"
            onClick={saveAndSend}
            disabled={busy}
            className="rounded-xl bg-[#2563eb] px-4 py-2 text-[13px] font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "처리 중…" : "저장하고 서명 링크 만들기"}
          </button>
        )}
      </div>

      {/* 본문 */}
      <div className="flex min-h-0 flex-1">
        {/* 왼쪽 패널 */}
        <aside className="w-[288px] shrink-0 space-y-5 overflow-y-auto border-r border-slate-200 bg-slate-50/60 px-4 py-4">
          {docMode && (
            <section>
              <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                계약 정보
              </h3>
              <div className="space-y-2.5">
                <div>
                  <label className={LABEL_CLS}>상대방 구분</label>
                  <div className="flex gap-1.5">
                    {(
                      [
                        ["individual", "개인"],
                        ["corp", "회사(법인)"],
                      ] as const
                    ).map(([kind, label]) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => {
                          setCounterpartyKind(kind);
                          setDirty(true);
                        }}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-[12px] font-bold transition-colors ${
                          counterpartyKind === kind
                            ? "border-blue-300 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={LABEL_CLS}>상대방 이름(담당자)</label>
                  <input
                    className={INPUT_CLS}
                    value={counterpartyName}
                    onChange={(e) => {
                      setCounterpartyName(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="홍길동"
                  />
                </div>
                {counterpartyKind === "corp" && (
                  <div>
                    <label className={LABEL_CLS}>상대방 회사명</label>
                    <input
                      className={INPUT_CLS}
                      value={counterpartyCompany}
                      onChange={(e) => {
                        setCounterpartyCompany(e.target.value);
                        setDirty(true);
                      }}
                      placeholder="주식회사 OO"
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          <FieldSidePanel
            content={content}
            onChange={(next) => patchContent(() => next)}
            docMode={docMode}
            onJumpToField={setJumpKey}
          />

          <details className="rounded-xl border border-slate-200 bg-white p-2.5">
            <summary className="cursor-pointer text-[12px] font-bold text-slate-600">
              갑(회사) 담당자 · 맺음말
            </summary>
            <div className="mt-2.5 space-y-2">
              <div>
                <label className={LABEL_CLS}>담당자 이름</label>
                <input
                  className={INPUT_CLS}
                  value={content.company.manager}
                  onChange={(e) =>
                    patchContent((c) => ({
                      ...c,
                      company: { ...c.company, manager: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className={LABEL_CLS}>담당자 연락처/이메일</label>
                <input
                  className={INPUT_CLS}
                  value={content.company.managerContact}
                  onChange={(e) =>
                    patchContent((c) => ({
                      ...c,
                      company: { ...c.company, managerContact: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label className={LABEL_CLS}>맺음말</label>
                <textarea
                  className={`${INPUT_CLS} min-h-[64px]`}
                  value={content.closing}
                  onChange={(e) => patchContent((c) => ({ ...c, closing: e.target.value }))}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>하단 작은 문구</label>
                <input
                  className={INPUT_CLS}
                  value={content.footnote}
                  onChange={(e) => patchContent((c) => ({ ...c, footnote: e.target.value }))}
                />
              </div>
            </div>
          </details>
        </aside>

        {/* 문서 */}
        {tab === "edit" ? (
          <ContractRichEditor
            initialContent={docMode ? target.doc.content : target.content}
            fields={content.fields}
            terms={content.terms ?? []}
            onTermsChange={handleTermsChange}
            onDocChange={handleDocChange}
            onCreateField={handleCreateField}
            onUpdateField={handleUpdateField}
            onDeleteField={handleDeleteField}
            highlightFieldKey={jumpKey}
            onHighlightHandled={() => setJumpKey(null)}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 px-4 py-6">
            <div className="mx-auto w-full max-w-[794px] rounded-sm bg-white px-[52px] py-[56px] shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)]">
              <ContractDocViewV2 content={content} mode="edit" partyB={partyB} />
            </div>
          </div>
        )}
      </div>

      {/* 저장 안 하고 나가기 확인 */}
      {leaveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <p className="text-base font-bold text-slate-800">저장하지 않은 변경이 있어요</p>
            <p className="mt-1.5 text-[13px] text-slate-500">
              지금 나가면 방금 고친 내용이 사라집니다.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setLeaveOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold text-slate-700 hover:bg-slate-50"
              >
                계속 편집
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (await save()) router.push(COMPANY_CONTRACTS_PATH);
                }}
                className="rounded-xl bg-[#2563eb] px-4 py-2 text-[13px] font-bold text-white hover:bg-blue-700"
              >
                저장하고 나가기
              </button>
              <button
                type="button"
                onClick={() => router.push(COMPANY_CONTRACTS_PATH)}
                className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-[13px] font-bold text-rose-500 hover:bg-rose-50"
              >
                그냥 나가기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
