"use client";

// 계약서 초안 편집 모달 — 조건표 값·조항 본문·담당자 정보를 자유롭게 고친 뒤
// 저장하거나, 바로 서명 링크를 만들어 복사한다. (발송 후에는 수정 불가 — 무결성)

import { useMemo, useState } from "react";
import { toast } from "sonner";
import ModalContainer from "@/components/shared/ModalContainer";
import ContractDocView from "@/components/shared/ContractDocView";
import { getErrorMessage } from "@/lib/utils/errors";
import { MODAL_INPUT_CLS, MODAL_LABEL_CLS } from "@/lib/vault/constants";
import {
  sendDocument,
  updateDocumentContent,
} from "@/lib/influencer/contracts/documents/actions";
import { TERMS_MARKER } from "@/lib/influencer/contracts/documents/template";
import type {
  ContractDocument,
  DocContent,
} from "@/lib/influencer/contracts/documents/types";

interface Props {
  doc: ContractDocument;
  onClose: () => void;
  /** 저장/발송 후 목록 갱신 */
  onChanged: () => void;
}

export default function ContractDocEditorModal({ doc, onClose, onChanged }: Props) {
  const [content, setContent] = useState<DocContent>(doc.content);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState(false);
  const [sentLink, setSentLink] = useState<string | null>(null);

  const setTerm = (index: number, value: string) =>
    setContent((c) => ({
      ...c,
      terms: c.terms.map((t, i) => (i === index ? { ...t, value } : t)),
    }));

  const setClause = (index: number, patch: Partial<{ heading: string; body: string }>) =>
    setContent((c) => ({
      ...c,
      clauses: c.clauses.map((cl, i) => (i === index ? { ...cl, ...patch } : cl)),
    }));

  const setCompany = (key: "manager" | "managerContact", value: string) =>
    setContent((c) => ({ ...c, company: { ...c.company, [key]: value } }));

  const save = async () => {
    setBusy(true);
    try {
      await updateDocumentContent(doc.id, content);
      toast.success("계약서 초안을 저장했어요.");
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
    if (!(await save())) return;
    setBusy(true);
    try {
      const { token } = await sendDocument(doc.id);
      const url = `${window.location.origin}/sign/${token}`;
      setSentLink(url);
      try {
        await navigator.clipboard.writeText(url);
        toast.success("서명 링크를 복사했어요. DM/카톡으로 붙여넣어 보내세요.");
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

  const termSections = useMemo(() => {
    // 조건표를 항목(section) 단위로 묶어 보여준다
    const groups: { section: string; rows: { index: number; label: string; value: string }[] }[] = [];
    content.terms.forEach((t, index) => {
      const last = groups[groups.length - 1];
      if (last && last.section === t.section) {
        last.rows.push({ index, label: t.label, value: t.value });
      } else {
        groups.push({ section: t.section, rows: [{ index, label: t.label, value: t.value }] });
      }
    });
    return groups;
  }, [content.terms]);

  // 발송 완료 화면 — 링크를 크게 보여주고 복사 버튼 제공
  if (sentLink) {
    return (
      <ModalContainer onClose={onClose} maxWidth="max-w-lg">
        <div className="p-6 text-center">
          <p className="text-3xl">🔗</p>
          <h2 className="mt-3 text-lg font-bold text-slate-800">서명 링크가 준비됐어요</h2>
          <p className="mt-2 text-sm text-slate-500">
            아래 링크를 인스타 DM이나 카톡으로 인플루언서에게 보내주세요.
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
          <h2 className="text-base font-extrabold text-slate-800">계약서 편집</h2>
          <p className="text-xs text-slate-400">{content.subtitle} · {content.headerMeta.partyB}</p>
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
          <ContractDocView content={content} />
        ) : (
          <div className="space-y-6">
            {/* 개별 조건표 */}
            <section>
              <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                개별 조건표 (제2조) — 값을 자유롭게 고칠 수 있어요
              </h3>
              <div className="space-y-3">
                {termSections.map((group) => (
                  <div key={group.section} className="rounded-xl border border-slate-100 p-3">
                    <p className="mb-2 text-[12px] font-bold text-slate-500">{group.section}</p>
                    <div className="space-y-2">
                      {group.rows.map((row) => (
                        <div key={row.index} className="grid grid-cols-[130px_1fr] items-center gap-2">
                          <span className="text-[12.5px] text-slate-500">{row.label}</span>
                          <input
                            className={MODAL_INPUT_CLS}
                            value={row.value}
                            onChange={(e) => setTerm(row.index, e.target.value)}
                            placeholder="—"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 갑 담당자 */}
            <section>
              <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                갑(회사) 담당자 — 서명란에 표시돼요
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={MODAL_LABEL_CLS}>담당자 이름</label>
                  <input
                    className={MODAL_INPUT_CLS}
                    value={content.company.manager}
                    onChange={(e) => setCompany("manager", e.target.value)}
                  />
                </div>
                <div>
                  <label className={MODAL_LABEL_CLS}>담당자 연락처/이메일</label>
                  <input
                    className={MODAL_INPUT_CLS}
                    value={content.company.managerContact}
                    onChange={(e) => setCompany("managerContact", e.target.value)}
                  />
                </div>
              </div>
            </section>

            {/* 조항 본문 */}
            <section>
              <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-400">
                조항 본문 — 이 계약서에만 적용돼요 (모든 계약서를 바꾸려면 ‘계약서 양식’에서)
              </h3>
              <div className="space-y-2">
                {content.clauses.map((clause, i) =>
                  clause.body.trim() === TERMS_MARKER ? (
                    <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-[13px] text-slate-500">
                      <b>{clause.heading}</b> — 위의 개별 조건표가 이 자리에 들어가요.
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
                          className={`${MODAL_INPUT_CLS} min-h-[140px] leading-relaxed`}
                          value={clause.body}
                          onChange={(e) => setClause(i, { body: e.target.value })}
                        />
                      </div>
                    </details>
                  ),
                )}
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
        <button
          type="button"
          onClick={saveAndSend}
          disabled={busy}
          className="rounded-xl bg-[#2563eb] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
        >
          {busy ? "처리 중…" : "저장하고 서명 링크 만들기"}
        </button>
      </div>
    </ModalContainer>
  );
}
