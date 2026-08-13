"use client";

// 보관함 "계약서 보관함" 탭 — 전자서명이 완료된 TMA 계약서를 한곳에서 보고 내려받는다.
// 파일을 복사해 두는 게 아니라, 계약 관리의 원본(비공개 버킷)을 가리키는 "창"이다.
// 계약서 PDF에 주소·계좌 등 개인정보가 들어 있으므로 계정 보관함과 같은
// 2차 비밀번호 잠금을 지나야 목록이 보인다.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import VaultUnlockGate from "@/components/shared/VaultUnlockGate";
import { getErrorMessage } from "@/lib/utils/errors";
import { lockVault } from "@/lib/vault/actions";
import {
  getSignedContractsForVault,
  getSignedPdfUrl,
  type VaultContractRow,
} from "@/lib/influencer/contracts/documents/actions";
import { formatDate } from "@/lib/utils/date";

interface Props {
  gateConfigured: boolean;
  initialUnlocked: boolean;
}

export default function ContractsVaultTab({ gateConfigured, initialUnlocked }: Props) {
  const [unlocked, setUnlocked] = useState(initialUnlocked);
  const [rows, setRows] = useState<VaultContractRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await getSignedContractsForVault());
    } catch (err) {
      toast.error(getErrorMessage(err, "계약서 목록을 불러오지 못했습니다."));
      setUnlocked(false);
      setRows(null);
    }
  }, []);

  useEffect(() => {
    if (unlocked && rows === null) load();
  }, [unlocked, rows, load]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.instagram_handle.toLowerCase().includes(q) ||
        (r.signer_name ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const handleDownload = async (row: VaultContractRow) => {
    if (busyId) return;
    setBusyId(row.doc_id);
    try {
      const url = await getSignedPdfUrl(row.doc_id);
      if (!url) {
        toast.error("PDF 파일을 찾을 수 없습니다.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(getErrorMessage(err, "파일을 열지 못했습니다."));
    } finally {
      setBusyId(null);
    }
  };

  const handleLock = async () => {
    await lockVault().catch(() => {});
    setUnlocked(false);
    setRows(null);
    toast.success("다시 잠갔습니다.");
  };

  if (!unlocked) {
    return (
      <div className="max-w-md">
        <VaultUnlockGate
          gateConfigured={gateConfigured}
          notice={
            <>
              계약서에는 주소·계좌 같은 개인정보가 있어 <b>2차 비밀번호</b>로 잠겨 있어요.
            </>
          }
          onUnlocked={() => setUnlocked(true)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔎 이름·계정·서명자 검색"
          className="w-full max-w-sm rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <span className="text-xs text-slate-400">
          서명 완료 {rows?.length ?? 0}건 · 원본은 계약 관리와 같은 금고에 있어요
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={handleLock}
          className="text-xs text-slate-400 underline hover:text-slate-600"
        >
          다시 잠그기
        </button>
      </div>

      {rows === null ? (
        <p className="py-10 text-center text-sm text-slate-400">계약서 목록을 불러오는 중…</p>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">
          {rows.length === 0
            ? "아직 서명 완료된 계약서가 없어요. 인플루언서가 서명하면 여기 자동으로 쌓입니다."
            : "검색 결과가 없어요."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <div
              key={row.doc_id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3.5 shadow-sm"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-[11px] font-bold text-red-500">
                PDF
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">
                  {row.name}
                  {row.instagram_handle && (
                    <span className="ml-1.5 text-xs font-normal text-slate-400">@{row.instagram_handle}</span>
                  )}
                  {row.contract_deleted && (
                    <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                      계약 삭제됨 · 증거 보존
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-400">
                  {row.template_key === "paid" ? "광고비 지급형" : "순수 협찬형"} ·{" "}
                  {row.signer_name ?? "서명자"} 서명 ·{" "}
                  {row.signed_at ? formatDate(row.signed_at.slice(0, 10)) : "—"}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === row.doc_id}
                onClick={() => handleDownload(row)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busyId === row.doc_id ? "여는 중…" : "⬇ 다운로드"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
