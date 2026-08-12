"use client";

// 계약 상세 패널의 "계약서 · 전자서명" 섹션.
// 계약서 생성 → 편집·발송(링크 복사) → 서명 상태 확인 → 완료 PDF 다운로드까지 담당.

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils/errors";
import {
  cancelDocument,
  createDocument,
  duplicateDocument,
  getContractDocuments,
  getSignedPdfUrl,
} from "@/lib/influencer/contracts/documents/actions";
import type { ContractDocument, DocStatus } from "@/lib/influencer/contracts/documents/types";
import { formatDate } from "@/lib/utils/date";

const ContractDocEditorModal = dynamic(() => import("./ContractDocEditorModal"), { ssr: false });

const STATUS_BADGE: Record<DocStatus, { label: string; cls: string }> = {
  draft: { label: "초안", cls: "bg-slate-100 text-slate-600" },
  sent: { label: "서명 대기", cls: "bg-amber-50 text-amber-700" },
  signed: { label: "서명 완료", cls: "bg-emerald-50 text-emerald-700" },
  canceled: { label: "취소됨", cls: "bg-slate-50 text-slate-400" },
};

const BTN_SM =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export default function ContractDocsSection({ contractId }: { contractId: string }) {
  const [docs, setDocs] = useState<ContractDocument[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ContractDocument | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    try {
      setDocs(await getContractDocuments(contractId));
    } catch (err) {
      toast.error(getErrorMessage(err, "계약서 목록을 불러오지 못했습니다."));
      setDocs([]);
    }
  }, [contractId]);

  useEffect(() => {
    setDocs(null);
    setShowHistory(false);
    load();
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(getErrorMessage(err, "처리에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () =>
    run(async () => {
      const doc = await createDocument(contractId);
      await load();
      setEditing(doc);
    });

  const handleCopyLink = async (doc: ContractDocument) => {
    if (!doc.sign_token) return;
    const url = `${window.location.origin}/sign/${doc.sign_token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("서명 링크를 복사했어요. DM/카톡으로 보내세요.");
    } catch {
      window.prompt("아래 링크를 복사하세요:", url);
    }
  };

  const handleCancel = (doc: ContractDocument) =>
    run(async () => {
      if (!window.confirm(doc.status === "sent" ? "보낸 서명 링크를 취소할까요? 링크가 즉시 무효화됩니다." : "이 초안을 폐기할까요?")) return;
      await cancelDocument(doc.id);
      toast.success(doc.status === "sent" ? "서명 링크를 취소했어요." : "초안을 폐기했어요.");
      await load();
    });

  const handleDuplicate = (doc: ContractDocument) =>
    run(async () => {
      const copy = await duplicateDocument(doc.id);
      await load();
      setEditing(copy);
    });

  const handleDownloadPdf = (doc: ContractDocument) =>
    run(async () => {
      const url = await getSignedPdfUrl(doc.id);
      if (!url) {
        toast.error("PDF 파일을 찾을 수 없습니다.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    });

  if (docs === null) {
    return <p className="text-sm text-slate-400">계약서 정보를 불러오는 중…</p>;
  }

  const active = docs.filter((d) => d.status !== "canceled");
  const canceled = docs.filter((d) => d.status === "canceled");
  const hasSigned = docs.some((d) => d.status === "signed");

  return (
    <div className="space-y-2.5">
      {active.length === 0 && (
        <p className="text-sm text-slate-400">
          아직 만든 계약서가 없어요. 계약 조건을 채운 뒤 만들면 자동으로 채워져요.
        </p>
      )}

      {active.map((doc) => {
        const badge = STATUS_BADGE[doc.status];
        return (
          <div key={doc.id} className="rounded-xl border border-slate-100 px-3.5 py-3">
            <div className="flex items-center gap-2">
              <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${badge.cls}`}>
                {badge.label}
              </span>
              <span className="text-[12px] text-slate-400">
                {doc.template_key === "paid" ? "광고비 지급형" : "순수 협찬형"} ·{" "}
                {formatDate(doc.created_at.slice(0, 10))} 생성
              </span>
            </div>

            {doc.status === "sent" && (
              <p className="mt-1.5 text-[12px] text-slate-500">
                {doc.viewed_at ? "✓ 열람함 · " : "아직 안 열어봄 · "}
                링크 유효기간 ~{doc.token_expires_at ? formatDate(doc.token_expires_at.slice(0, 10)) : "—"}
              </p>
            )}
            {doc.status === "signed" && (
              <p className="mt-1.5 text-[12px] font-semibold text-emerald-700">
                ✓ {doc.signer_name ?? "서명자"} 님이 {doc.signed_at ? formatDate(doc.signed_at.slice(0, 10)) : ""} 서명 완료
              </p>
            )}

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {doc.status === "draft" && (
                <>
                  <button type="button" disabled={busy} onClick={() => setEditing(doc)} className={BTN_SM}>
                    ✏️ 편집·발송
                  </button>
                  <button type="button" disabled={busy} onClick={() => handleCancel(doc)} className={BTN_SM}>
                    폐기
                  </button>
                </>
              )}
              {doc.status === "sent" && (
                <>
                  <button type="button" disabled={busy} onClick={() => handleCopyLink(doc)} className={BTN_SM}>
                    🔗 서명 링크 복사
                  </button>
                  <button type="button" disabled={busy} onClick={() => handleCancel(doc)} className={BTN_SM}>
                    발송 취소
                  </button>
                </>
              )}
              {doc.status === "signed" && (
                <button type="button" disabled={busy} onClick={() => handleDownloadPdf(doc)} className={BTN_SM}>
                  📄 서명 완료본 PDF
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* 서명 완료본이 있으면 새 계약서 생성은 숨기지 않되 안내만 — 조건 변경 재계약 대비 */}
      {!active.some((d) => d.status === "draft" || d.status === "sent") && (
        <button
          type="button"
          disabled={busy}
          onClick={handleCreate}
          className="w-full rounded-xl border-2 border-dashed border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-500 hover:border-blue-300 hover:text-blue-600 disabled:opacity-50"
        >
          {busy ? "만드는 중…" : hasSigned ? "＋ 새 계약서 만들기 (조건 변경 시)" : "📄 계약서 만들기"}
        </button>
      )}

      {canceled.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-[12px] text-slate-400 underline hover:text-slate-600"
          >
            취소된 계약서 {canceled.length}건 {showHistory ? "접기" : "보기"}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5">
              {canceled.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-400">
                  <span>
                    {formatDate(doc.created_at.slice(0, 10))} 생성 · 취소됨
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDuplicate(doc)}
                    className="font-bold text-slate-500 underline hover:text-blue-600 disabled:opacity-50"
                  >
                    이 내용으로 다시 만들기
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <ContractDocEditorModal
          doc={editing}
          onClose={() => setEditing(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
