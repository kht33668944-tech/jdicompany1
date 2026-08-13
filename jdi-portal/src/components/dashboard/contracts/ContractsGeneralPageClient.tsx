"use client";

// 계약관리 메인 화면 — 계약서 목록(상태 칩·검색) + 새 계약서 만들기 + 편집/발송/취소/복제.

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import ModalContainer from "@/components/shared/ModalContainer";
import { getErrorMessage } from "@/lib/utils/errors";
import { formatDate } from "@/lib/utils/date";
import { MODAL_INPUT_CLS, MODAL_LABEL_CLS } from "@/lib/vault/constants";
import {
  cancelCompanyDocument,
  createCompanyDocument,
  duplicateCompanyDocument,
  getCompanyDocument,
  getCompanySignedPdfUrl,
  hideCompanyDocument,
  listCompanyDocuments,
} from "@/lib/contracts/actions";
import type {
  CompanyContractDocument,
  CompanyDocStatus,
  CompanyTemplateRow,
  CounterpartyKind,
} from "@/lib/contracts/types";
import CompanyDocEditor from "./CompanyDocEditor";

interface Props {
  initialDocuments: CompanyContractDocument[];
  templates: CompanyTemplateRow[];
}

type StatusFilter = "all" | CompanyDocStatus;

const STATUS_LABEL: Record<CompanyDocStatus, string> = {
  draft: "초안",
  sent: "서명 대기",
  signed: "서명 완료",
  canceled: "취소됨",
};
const STATUS_BADGE: Record<CompanyDocStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-50 text-blue-700",
  signed: "bg-emerald-50 text-emerald-700",
  canceled: "bg-rose-50 text-rose-500",
};

function NewDocModal({
  templates,
  onCreated,
  onClose,
}: {
  templates: CompanyTemplateRow[];
  onCreated: (doc: CompanyContractDocument) => void;
  onClose: () => void;
}) {
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [kind, setKind] = useState<CounterpartyKind>("individual");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const doc = await createCompanyDocument({
        templateId: templateId || null,
        title,
        counterpartyName: name,
        counterpartyCompany: company,
        counterpartyKind: kind,
      });
      toast.success("계약서 초안을 만들었어요. 내용을 확인하고 발송해주세요.");
      onCreated(doc);
    } catch (err) {
      toast.error(getErrorMessage(err, "계약서 생성에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalContainer onClose={onClose} maxWidth="max-w-lg">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-extrabold text-slate-800">새 계약서</h2>
        <p className="mt-0.5 text-xs text-slate-400">양식을 고르고 상대방 정보를 입력하세요.</p>
      </div>
      <div className="space-y-4 px-6 py-5">
        <div>
          <label className={MODAL_LABEL_CLS}>양식</label>
          <select
            className={MODAL_INPUT_CLS}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
            <option value="">빈 문서에서 시작</option>
          </select>
        </div>
        <div>
          <label className={MODAL_LABEL_CLS}>계약서 이름 *</label>
          <input
            className={MODAL_INPUT_CLS}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: OO상사 용역 계약"
          />
        </div>
        <div>
          <label className={MODAL_LABEL_CLS}>상대방 구분</label>
          <div className="flex gap-1.5">
            {(
              [
                ["individual", "개인"],
                ["corp", "회사(법인)"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setKind(value)}
                className={`flex-1 rounded-xl border px-3 py-2 text-[13px] font-bold transition-colors ${
                  kind === value
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={MODAL_LABEL_CLS}>상대방 이름(담당자) *</label>
            <input
              className={MODAL_INPUT_CLS}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
            />
          </div>
          {kind === "corp" && (
            <div>
              <label className={MODAL_LABEL_CLS}>상대방 회사명</label>
              <input
                className={MODAL_INPUT_CLS}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="주식회사 OO"
              />
            </div>
          )}
        </div>
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
          onClick={create}
          disabled={busy || !title.trim() || !name.trim()}
          className="rounded-xl bg-[#2563eb] px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {busy ? "만드는 중…" : "초안 만들기"}
        </button>
      </div>
    </ModalContainer>
  );
}

export default function ContractsGeneralPageClient({ initialDocuments, templates }: Props) {
  const [docs, setDocs] = useState(initialDocuments);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [editorDoc, setEditorDoc] = useState<CompanyContractDocument | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setDocs(await listCompanyDocuments());
    } catch (err) {
      toast.error(getErrorMessage(err, "목록을 새로 불러오지 못했습니다."));
    }
  };

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: docs.length, draft: 0, sent: 0, signed: 0, canceled: 0 };
    for (const d of docs) c[d.status] += 1;
    return c;
  }, [docs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        d.counterparty_name.toLowerCase().includes(q) ||
        (d.counterparty_company ?? "").toLowerCase().includes(q)
      );
    });
  }, [docs, statusFilter, search]);

  const openEditor = async (docId: string) => {
    if (busyId) return;
    setBusyId(docId);
    try {
      setEditorDoc(await getCompanyDocument(docId));
    } catch (err) {
      toast.error(getErrorMessage(err, "계약서를 열지 못했습니다."));
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async (doc: CompanyContractDocument) => {
    if (!doc.sign_token) return;
    const url = `${window.location.origin}/sign/c/${doc.sign_token}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast.success("서명 링크를 복사했어요. 카톡/문자/메일로 보내주세요.");
  };

  const run = async (docId: string, fn: () => Promise<unknown>, successMsg: string) => {
    if (busyId) return;
    setBusyId(docId);
    try {
      await fn();
      toast.success(successMsg);
      await refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "처리에 실패했습니다."));
    } finally {
      setBusyId(null);
    }
  };

  const viewPdf = async (docId: string) => {
    if (busyId) return;
    setBusyId(docId);
    try {
      const url = await getCompanySignedPdfUrl(docId);
      if (!url) {
        toast.error("PDF 파일을 찾을 수 없습니다.");
        return;
      }
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(getErrorMessage(err, "PDF 를 열지 못했습니다."));
    } finally {
      setBusyId(null);
    }
  };

  const actionBtnCls =
    "text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white/60 text-slate-600 hover:border-brand-400 hover:text-brand-600 disabled:opacity-50";

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">계약관리</h1>
          <p className="mt-0.5 text-[13px] text-slate-400">
            계약서를 만들고 서명 링크로 보내면, 서명 완료본이 보관함에 자동 저장돼요.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/dashboard/contracts/templates"
            prefetch={false}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            📄 양식 관리
          </Link>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700"
          >
            ＋ 새 계약서
          </button>
        </div>
      </div>

      {/* 검색 + 상태 칩 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
          <span className="text-slate-400">🔎</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="계약서 검색 — 이름·상대방·회사명"
            className="w-full bg-transparent text-sm text-slate-800 outline-none"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", `전체 ${counts.all}`],
            ["draft", `초안 ${counts.draft}`],
            ["sent", `서명 대기 ${counts.sent}`],
            ["signed", `서명 완료 ${counts.signed}`],
            ["canceled", `취소 ${counts.canceled}`],
          ] as [StatusFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={`rounded-xl border px-3.5 py-1.5 text-sm font-bold transition-colors ${
              statusFilter === key
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <div className="mb-3 text-3xl">📑</div>
          <p className="text-sm font-semibold text-slate-600">
            {docs.length === 0 ? "아직 계약서가 없어요" : "조건에 맞는 계약서가 없어요"}
          </p>
          <p className="mt-1.5 text-xs text-slate-400">
            {docs.length === 0
              ? "「＋ 새 계약서」로 시작하세요. 양식이 없다면 「양식 관리」에서 먼저 만들 수 있어요."
              : "검색어나 상태 필터를 바꿔보세요."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3.5 shadow-sm transition-colors hover:border-slate-200"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-lg">
                {doc.counterparty_kind === "corp" ? "🏢" : "🙋"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-bold text-slate-800">{doc.title}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[doc.status]}`}>
                    {STATUS_LABEL[doc.status]}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {doc.counterparty_company ? `${doc.counterparty_company} · ` : ""}
                  {doc.counterparty_name}
                  {doc.status === "signed" && doc.signed_at
                    ? ` · ${formatDate(doc.signed_at.slice(0, 10))} 체결`
                    : ` · ${formatDate(doc.created_at.slice(0, 10))} 생성`}
                  {doc.status === "sent" && doc.token_expires_at
                    ? ` · 링크 ${formatDate(doc.token_expires_at.slice(0, 10))}까지`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {doc.status === "draft" && (
                  <>
                    <button type="button" disabled={busyId === doc.id} onClick={() => openEditor(doc.id)} className={actionBtnCls}>
                      ✏️ 편집·발송
                    </button>
                    <button
                      type="button"
                      disabled={busyId === doc.id}
                      onClick={() => run(doc.id, () => hideCompanyDocument(doc.id), "목록에서 숨겼어요.")}
                      className={actionBtnCls}
                    >
                      숨기기
                    </button>
                  </>
                )}
                {doc.status === "sent" && (
                  <>
                    <button type="button" onClick={() => copyLink(doc)} className={actionBtnCls}>
                      🔗 링크 복사
                    </button>
                    <button
                      type="button"
                      disabled={busyId === doc.id}
                      onClick={() => run(doc.id, () => cancelCompanyDocument(doc.id), "발송을 취소했어요.")}
                      className={actionBtnCls}
                    >
                      발송 취소
                    </button>
                  </>
                )}
                {doc.status === "signed" && (
                  <button type="button" disabled={busyId === doc.id} onClick={() => viewPdf(doc.id)} className={actionBtnCls}>
                    📄 PDF 보기
                  </button>
                )}
                {doc.status !== "draft" && (
                  <button
                    type="button"
                    disabled={busyId === doc.id}
                    onClick={() =>
                      run(doc.id, () => duplicateCompanyDocument(doc.id), "새 초안으로 복제했어요.")
                    }
                    className={actionBtnCls}
                  >
                    복제
                  </button>
                )}
                {doc.status === "canceled" && (
                  <button
                    type="button"
                    disabled={busyId === doc.id}
                    onClick={() => run(doc.id, () => hideCompanyDocument(doc.id), "목록에서 숨겼어요.")}
                    className={actionBtnCls}
                  >
                    숨기기
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {docs.length > 0 && (
        <p className="text-center text-xs text-slate-400">
          서명 완료본은 보관함 → 계약서 보관함(2차 비밀번호)에서도 볼 수 있어요
        </p>
      )}

      {newOpen && (
        <NewDocModal
          templates={templates}
          onClose={() => setNewOpen(false)}
          onCreated={(doc) => {
            setNewOpen(false);
            setEditorDoc(doc);
            refresh();
          }}
        />
      )}

      {editorDoc && (
        <CompanyDocEditor
          target={{ mode: "doc", doc: editorDoc }}
          onClose={() => setEditorDoc(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
