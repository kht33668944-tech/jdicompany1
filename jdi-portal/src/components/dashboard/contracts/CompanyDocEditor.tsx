"use client";

// 계약관리 편집기 — 양식(template)과 계약서 초안(doc)을 같은 화면으로 편집한다.
// 붙여넣기 자동 조항 분리 + 채움 칸(파랑/노랑) 삽입 + 조건표 블록 + 미리보기.
// doc 모드는 저장 후 바로 서명 링크를 만들 수 있다. (발송 후 수정 불가 — 무결성)

import { useRef, useState } from "react";
import { toast } from "sonner";
import ModalContainer from "@/components/shared/ModalContainer";
import ContractDocViewV2 from "@/components/shared/ContractDocViewV2";
import { getErrorMessage } from "@/lib/utils/errors";
import { MODAL_INPUT_CLS, MODAL_LABEL_CLS } from "@/lib/vault/constants";
import { TERMS_MARKER } from "@/lib/contracts/constants";
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
} from "@/lib/contracts/types";
import FieldManagerPanel from "./FieldManagerPanel";
import PasteImportModal from "./PasteImportModal";

type EditorTarget =
  | { mode: "template"; templateId: string | null; title: string; content: ContentV2 }
  | { mode: "doc"; doc: CompanyContractDocument };

interface Props {
  target: EditorTarget;
  onClose: () => void;
  /** 저장/발송 후 목록 갱신 */
  onChanged: () => void;
}

const SECTION_TITLE_CLS = "mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-400";

export default function CompanyDocEditor({ target, onClose, onChanged }: Props) {
  const docMode = target.mode === "doc";
  const [title, setTitle] = useState(docMode ? target.doc.title : target.title);
  const [content, setContent] = useState<ContentV2>(
    docMode ? target.doc.content : target.content,
  );
  const [counterpartyName, setCounterpartyName] = useState(
    docMode ? target.doc.counterparty_name : "",
  );
  const [counterpartyCompany, setCounterpartyCompany] = useState(
    docMode ? target.doc.counterparty_company ?? "" : "",
  );
  const [counterpartyKind, setCounterpartyKind] = useState<CounterpartyKind>(
    docMode ? target.doc.counterparty_kind : "individual",
  );
  // template 모드에서 새 양식을 한 번 저장하면 이후 저장은 update 로
  const [templateId, setTemplateId] = useState(docMode ? null : target.templateId);

  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState(false);
  const [sentLink, setSentLink] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const bodyRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const partyB = docMode
    ? counterpartyKind === "corp"
      ? counterpartyCompany || counterpartyName
      : counterpartyName
    : "(상대방)";

  // ── 조항 편집 ──────────────────────────────────────────
  const setClause = (index: number, patch: Partial<{ heading: string; body: string }>) =>
    setContent((c) => ({
      ...c,
      clauses: c.clauses.map((cl, i) => (i === index ? { ...cl, ...patch } : cl)),
    }));

  const addClause = () =>
    setContent((c) => ({
      ...c,
      clauses: [...c.clauses, { heading: `제${c.clauses.length + 1}조 `, body: "" }],
    }));

  const removeClause = (index: number) =>
    setContent((c) => {
      const clause = c.clauses[index];
      const next = { ...c, clauses: c.clauses.filter((_, i) => i !== index) };
      // 조건표 자리 조항을 지우면 조건표 데이터도 함께 정리
      if (clause.body.trim() === TERMS_MARKER) delete next.terms;
      return next;
    });

  const moveClause = (index: number, dir: -1 | 1) =>
    setContent((c) => {
      const to = index + dir;
      if (to < 0 || to >= c.clauses.length) return c;
      const clauses = [...c.clauses];
      [clauses[index], clauses[to]] = [clauses[to], clauses[index]];
      return { ...c, clauses };
    });

  /** 커서 위치에 {{key}} 삽입 */
  const insertToken = (clauseIndex: number, key: string) => {
    const el = bodyRefs.current[clauseIndex];
    const token = `{{${key}}}`;
    const body = content.clauses[clauseIndex].body;
    if (!el) {
      setClause(clauseIndex, { body: body + token });
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setClause(clauseIndex, { body: body.slice(0, start) + token + body.slice(end) });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  // ── 조건표 블록 ────────────────────────────────────────
  const hasTermsClause = content.clauses.some((c) => c.body.trim() === TERMS_MARKER);

  const addTermsBlock = () =>
    setContent((c) => ({
      ...c,
      clauses: [...c.clauses, { heading: "개별 조건표", body: TERMS_MARKER }],
      terms: c.terms?.length ? c.terms : [{ section: "기본 조건", label: "", value: "" }],
    }));

  const setTerm = (index: number, patch: Partial<{ section: string; label: string; value: string }>) =>
    setContent((c) => ({
      ...c,
      terms: (c.terms ?? []).map((t, i) => (i === index ? { ...t, ...patch } : t)),
    }));

  const addTermRow = () =>
    setContent((c) => ({
      ...c,
      terms: [
        ...(c.terms ?? []),
        { section: c.terms?.[c.terms.length - 1]?.section ?? "기본 조건", label: "", value: "" },
      ],
    }));

  const removeTermRow = (index: number) =>
    setContent((c) => ({ ...c, terms: (c.terms ?? []).filter((_, i) => i !== index) }));

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
        toast.success("계약서 초안을 저장했어요.");
      } else if (templateId) {
        await updateCompanyTemplate(templateId, title, content);
        toast.success("양식을 저장했어요.");
      } else {
        const created = await createCompanyTemplate(title, content);
        setTemplateId(created.id);
        toast.success("새 양식을 저장했어요.");
      }
      onChanged();
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err, "저장에 실패했습니다."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveAndSend = async () => {
    if (!docMode) return;
    if (!(await save())) return;
    setBusy(true);
    try {
      const { token } = await sendCompanyDocument(target.doc.id);
      const url = `${window.location.origin}/sign/c/${token}`;
      setSentLink(url);
      try {
        await navigator.clipboard.writeText(url);
        toast.success("서명 링크를 복사했어요. 카톡/문자/메일로 붙여넣어 보내세요.");
      } catch {
        // 클립보드 권한이 없으면 화면의 링크를 직접 복사하면 된다
      }
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, "서명 링크 생성에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  };

  // ── 발송 완료 화면 ─────────────────────────────────────
  if (sentLink) {
    return (
      <ModalContainer onClose={onClose} maxWidth="max-w-lg">
        <div className="p-6 text-center">
          <p className="text-3xl">🔗</p>
          <h2 className="mt-3 text-lg font-bold text-slate-800">서명 링크가 준비됐어요</h2>
          <p className="mt-2 text-sm text-slate-500">
            아래 링크를 카톡·문자·메일로 상대방에게 보내주세요.
            <br />
            링크는 <b>7일</b> 동안 유효하고, 서명이 끝나면 자동으로 잠깁니다.
          </p>
          <div className="mt-4 break-all rounded-xl bg-slate-50 px-4 py-3 text-[13px] font-semibold text-slate-700">
            {sentLink}
          </div>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(sentLink).catch(() => {});
                toast.success("복사했어요.");
              }}
              className="rounded-xl bg-[#2563eb] px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              링크 복사
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
        </div>
      </ModalContainer>
    );
  }

  return (
    <ModalContainer onClose={onClose} maxWidth="max-w-4xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-800">
            {docMode ? "계약서 편집" : templateId ? "양식 편집" : "새 양식 만들기"}
          </h2>
          <p className="text-xs text-slate-400">
            {docMode
              ? "이 계약서 1부에만 적용돼요. 발송 전까지 자유롭게 고칠 수 있어요."
              : "양식을 고쳐도 이미 만든 계약서는 바뀌지 않아요."}
          </p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1 text-[13px] font-bold">
          {([["edit", "편집"], ["preview", "미리보기"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg px-3.5 py-1.5 transition-colors ${
                tab === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
        {tab === "preview" ? (
          <ContractDocViewV2 content={content} mode="edit" partyB={partyB} />
        ) : (
          <div className="space-y-6">
            {/* 기본 정보 */}
            <section>
              <h3 className={SECTION_TITLE_CLS}>기본 정보</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className={docMode ? "" : "sm:col-span-2"}>
                  <label className={MODAL_LABEL_CLS}>{docMode ? "계약서 이름 *" : "양식 이름 *"}</label>
                  <input
                    className={MODAL_INPUT_CLS}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={docMode ? "예: OO상사 용역 계약" : "예: 용역 계약서"}
                  />
                </div>
                {docMode && (
                  <>
                    <div>
                      <label className={MODAL_LABEL_CLS}>상대방 구분</label>
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
                            onClick={() => setCounterpartyKind(kind)}
                            className={`flex-1 rounded-xl border px-3 py-2 text-[13px] font-bold transition-colors ${
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
                      <label className={MODAL_LABEL_CLS}>상대방 이름(담당자) *</label>
                      <input
                        className={MODAL_INPUT_CLS}
                        value={counterpartyName}
                        onChange={(e) => setCounterpartyName(e.target.value)}
                        placeholder="홍길동"
                      />
                    </div>
                    {counterpartyKind === "corp" && (
                      <div>
                        <label className={MODAL_LABEL_CLS}>상대방 회사명</label>
                        <input
                          className={MODAL_INPUT_CLS}
                          value={counterpartyCompany}
                          onChange={(e) => setCounterpartyCompany(e.target.value)}
                          placeholder="주식회사 OO"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* 채움 칸 */}
            <FieldManagerPanel content={content} onChange={setContent} docMode={docMode} />

            {/* 계약서 제목/서문 */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[12px] font-bold uppercase tracking-wide text-slate-400">
                  계약서 본문
                </h3>
                <button
                  type="button"
                  onClick={() => setPasteOpen(true)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-bold text-slate-600 hover:bg-slate-50"
                >
                  📋 붙여넣기로 채우기
                </button>
              </div>
              <div className="space-y-2">
                <div>
                  <label className={MODAL_LABEL_CLS}>문서 제목 (계약서 맨 위 큰 제목)</label>
                  <input
                    className={MODAL_INPUT_CLS}
                    value={content.title}
                    onChange={(e) => setContent((c) => ({ ...c, title: e.target.value }))}
                    placeholder="예: 용역 계약서"
                  />
                </div>
                <div>
                  <label className={MODAL_LABEL_CLS}>서문 (선택 — 제1조 앞 문단)</label>
                  <textarea
                    className={`${MODAL_INPUT_CLS} min-h-[64px] leading-relaxed`}
                    value={content.intro}
                    onChange={(e) => setContent((c) => ({ ...c, intro: e.target.value }))}
                    placeholder="주식회사 제이디아이컴퍼니(이하 “갑”)와 …(이하 “을”)은 다음과 같이 계약을 체결한다."
                  />
                </div>
              </div>
            </section>

            {/* 조항 목록 */}
            <section>
              <div className="space-y-2">
                {content.clauses.map((clause, i) =>
                  clause.body.trim() === TERMS_MARKER ? (
                    <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] text-slate-500">
                          <b>{clause.heading || "개별 조건표"}</b> — 아래 조건표가 이 자리에 들어가요.
                        </p>
                        <button
                          type="button"
                          onClick={() => removeClause(i)}
                          className="text-[12px] font-semibold text-slate-400 hover:text-rose-500"
                        >
                          조건표 제거
                        </button>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {(content.terms ?? []).map((term, ti) => (
                          <div key={ti} className="grid grid-cols-[96px_120px_1fr_auto] items-center gap-1.5">
                            <input
                              className={MODAL_INPUT_CLS}
                              value={term.section}
                              onChange={(e) => setTerm(ti, { section: e.target.value })}
                              placeholder="항목"
                            />
                            <input
                              className={MODAL_INPUT_CLS}
                              value={term.label}
                              onChange={(e) => setTerm(ti, { label: e.target.value })}
                              placeholder="이름"
                            />
                            <input
                              className={MODAL_INPUT_CLS}
                              value={term.value}
                              onChange={(e) => setTerm(ti, { value: e.target.value })}
                              placeholder="내용"
                            />
                            <button
                              type="button"
                              onClick={() => removeTermRow(ti)}
                              className="px-1 text-[12px] font-semibold text-slate-400 hover:text-rose-500"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addTermRow}
                          className="text-[12px] font-bold text-blue-600 hover:text-blue-700"
                        >
                          ＋ 행 추가
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="rounded-xl border border-slate-100 p-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          className={`${MODAL_INPUT_CLS} font-bold`}
                          value={clause.heading}
                          onChange={(e) => setClause(i, { heading: e.target.value })}
                          placeholder={`제${i + 1}조 (제목)`}
                        />
                        <button
                          type="button"
                          onClick={() => moveClause(i, -1)}
                          disabled={i === 0}
                          className="px-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                          aria-label="위로"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveClause(i, 1)}
                          disabled={i === content.clauses.length - 1}
                          className="px-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                          aria-label="아래로"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeClause(i)}
                          className="px-1.5 text-[12px] font-semibold text-slate-400 hover:text-rose-500"
                        >
                          삭제
                        </button>
                      </div>
                      <textarea
                        ref={(el) => {
                          bodyRefs.current[i] = el;
                        }}
                        className={`${MODAL_INPUT_CLS} mt-1.5 min-h-[110px] leading-relaxed`}
                        value={clause.body}
                        onChange={(e) => setClause(i, { body: e.target.value })}
                        placeholder="조항 내용을 입력하세요."
                      />
                      {content.fields.length > 0 && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className="text-[11.5px] text-slate-400">칸 삽입:</span>
                          <div className="flex flex-wrap gap-1">
                            {content.fields.map((fieldDef) => (
                              <button
                                key={fieldDef.key}
                                type="button"
                                onClick={() => insertToken(i, fieldDef.key)}
                                className={`rounded-md border border-dashed px-1.5 py-0.5 text-[11.5px] font-bold ${
                                  fieldDef.kind === "staff"
                                    ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                    : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                }`}
                              >
                                {fieldDef.label || fieldDef.key}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={addClause}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-600 hover:bg-slate-50"
                >
                  ＋ 조항 추가
                </button>
                {!hasTermsClause && (
                  <button
                    type="button"
                    onClick={addTermsBlock}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-bold text-slate-600 hover:bg-slate-50"
                  >
                    ＋ 조건표 블록 추가
                  </button>
                )}
              </div>
            </section>

            {/* 갑(회사) 정보 */}
            <section>
              <h3 className={SECTION_TITLE_CLS}>갑(회사) 담당자 — 서명란에 표시돼요</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={MODAL_LABEL_CLS}>담당자 이름</label>
                  <input
                    className={MODAL_INPUT_CLS}
                    value={content.company.manager}
                    onChange={(e) =>
                      setContent((c) => ({ ...c, company: { ...c.company, manager: e.target.value } }))
                    }
                  />
                </div>
                <div>
                  <label className={MODAL_LABEL_CLS}>담당자 연락처/이메일</label>
                  <input
                    className={MODAL_INPUT_CLS}
                    value={content.company.managerContact}
                    onChange={(e) =>
                      setContent((c) => ({
                        ...c,
                        company: { ...c.company, managerContact: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>
            </section>

            {/* 맺음말/하단 문구 */}
            <section>
              <h3 className={SECTION_TITLE_CLS}>맺음말 · 하단 문구</h3>
              <div className="space-y-2">
                <textarea
                  className={`${MODAL_INPUT_CLS} min-h-[52px]`}
                  value={content.closing}
                  onChange={(e) => setContent((c) => ({ ...c, closing: e.target.value }))}
                  placeholder="맺음말 (서명란 위 문장)"
                />
                <input
                  className={MODAL_INPUT_CLS}
                  value={content.footnote}
                  onChange={(e) => setContent((c) => ({ ...c, footnote: e.target.value }))}
                  placeholder="하단 작은 문구 (선택)"
                />
              </div>
            </section>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          닫기
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
        >
          저장
        </button>
        {docMode && (
          <button
            type="button"
            onClick={saveAndSend}
            disabled={busy}
            className="rounded-xl bg-[#2563eb] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
          >
            {busy ? "처리 중…" : "저장하고 서명 링크 만들기"}
          </button>
        )}
      </div>

      {pasteOpen && (
        <PasteImportModal
          onClose={() => setPasteOpen(false)}
          onApply={(parsed) =>
            setContent((c) => ({
              ...c,
              intro: parsed.intro || c.intro,
              clauses: parsed.clauses.length ? parsed.clauses : c.clauses,
            }))
          }
        />
      )}
    </ModalContainer>
  );
}
