"use client";

// 보관함 "계약서 보관함" 탭 — 전자서명이 완료된 TMA 계약서를 한곳에서 보고 내려받는다.
// 파일을 복사해 두는 게 아니라, 계약 관리의 원본(비공개 버킷)을 가리키는 "창"이다.
// 계약서 PDF에 주소·계좌 등 개인정보가 들어 있으므로 계정 보관함과 같은
// 2차 비밀번호 잠금(VaultLockCard)을 지나야 목록이 보인다.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils/errors";
import { lockVault } from "@/lib/vault/actions";
import {
  getSignedContractsForVault,
  getSignedPdfUrl,
  type VaultContractRow,
} from "@/lib/influencer/contracts/documents/actions";
import { triggerDownload } from "@/lib/utils/download";
import { formatDate } from "@/lib/utils/date";
import VaultLockCard from "./VaultLockCard";
import FilePreviewModal from "./FilePreviewModal";

interface Props {
  gateConfigured: boolean;
  initialUnlocked: boolean;
}

type TypeFilter = "all" | "paid" | "seeding";

const TYPE_LABEL: Record<"paid" | "seeding", string> = {
  paid: "광고비형",
  seeding: "순수협찬형",
};
const TYPE_BADGE: Record<"paid" | "seeding", string> = {
  paid: "bg-blue-50 text-blue-700",
  seeding: "bg-emerald-50 text-emerald-700",
};

/** 저장 파일명: TMA계약서_이름_서명일.pdf */
function downloadFileName(row: VaultContractRow): string {
  const date = row.signed_at ? row.signed_at.slice(0, 10) : "";
  return `TMA계약서_${row.name}${date ? `_${date}` : ""}.pdf`;
}

export default function ContractsVaultTab({ gateConfigured, initialUnlocked }: Props) {
  const [unlocked, setUnlocked] = useState(initialUnlocked);
  const [rows, setRows] = useState<VaultContractRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<VaultContractRow | null>(null);

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

  const counts = useMemo(() => {
    const paid = rows?.filter((r) => r.template_key === "paid").length ?? 0;
    const seeding = rows?.filter((r) => r.template_key === "seeding").length ?? 0;
    return { all: paid + seeding, paid, seeding };
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.template_key !== typeFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.instagram_handle.toLowerCase().includes(q) ||
        (r.signer_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, typeFilter]);

  const handleDownload = async (row: VaultContractRow) => {
    if (busyId) return;
    setBusyId(row.doc_id);
    try {
      const url = await getSignedPdfUrl(row.doc_id);
      if (!url) {
        toast.error("PDF 파일을 찾을 수 없습니다.");
        return;
      }
      triggerDownload(url, downloadFileName(row));
      toast.success("다운로드를 시작했어요.");
    } catch (err) {
      toast.error(getErrorMessage(err, "파일을 내려받지 못했습니다."));
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

  // 1) 게이트 미설정 — 계정 탭에서 설정하도록 안내
  if (!gateConfigured) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <div className="text-3xl mb-3">🔒</div>
        <h3 className="font-extrabold text-slate-800">2차 비밀번호가 아직 없습니다</h3>
        <p className="text-sm text-slate-500 mt-2">
          계정 보관함 탭에서 관리자(대표님)가 2차 비밀번호를 설정하면 계약서 보관함도 함께 사용할 수 있어요.
        </p>
      </div>
    );
  }

  // 2) 잠금 상태 — 계정 보관함과 동일한 잠금 카드
  if (!unlocked) {
    return (
      <VaultLockCard
        title="계약서 보관함 · 2차 비밀번호"
        description="계약서에는 주소·계좌 같은 개인정보가 있어요. 직원끼리만 공유하는 2차 비밀번호를 입력하세요."
        onUnlocked={() => setUnlocked(true)}
      />
    );
  }

  // 3) 해제 상태
  return (
    <div className="space-y-4">
      {/* 검색 + 잠그기 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5">
          <span className="text-slate-400">🔎</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="계약서 검색 — 이름·인스타 계정·서명자"
            className="w-full text-sm bg-transparent outline-none text-slate-800"
          />
        </div>
        <button
          type="button"
          onClick={handleLock}
          className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          🔒 다시 잠그기
        </button>
      </div>

      {/* 유형 필터 칩 */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", `전체 ${counts.all}`],
            ["paid", `광고비형 ${counts.paid}`],
            ["seeding", `순수협찬형 ${counts.seeding}`],
          ] as [TypeFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTypeFilter(key)}
            className={`px-3.5 py-1.5 rounded-xl border text-sm font-bold transition-colors ${
              typeFilter === key
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">
          인플루언서가 서명하면 자동으로 이곳에 쌓여요
        </span>
      </div>

      {/* 목록 */}
      {rows === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <div className="text-3xl mb-3">📝</div>
          <p className="text-sm font-semibold text-slate-600">
            {rows.length === 0 ? "아직 서명 완료된 계약서가 없어요" : "조건에 맞는 계약서가 없어요"}
          </p>
          <p className="mt-1.5 text-xs text-slate-400">
            {rows.length === 0
              ? "인플루언서 → TMA 계약에서 서명 링크를 보내고, 서명이 끝나면 여기 자동으로 나타나요."
              : "검색어나 유형 필터를 바꿔보세요."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <div
              key={row.doc_id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3.5 shadow-sm hover:border-slate-200 transition-colors"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-[11px] font-extrabold text-red-500">
                PDF
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-bold text-slate-800">{row.name}</span>
                  {row.instagram_handle && (
                    <span className="text-xs text-slate-400">@{row.instagram_handle}</span>
                  )}
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${TYPE_BADGE[row.template_key]}`}
                  >
                    {TYPE_LABEL[row.template_key]}
                  </span>
                  {row.contract_deleted && (
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                      계약 삭제됨 · 증거 보존
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  ✍️ {row.signer_name ?? "서명자"} 서명 ·{" "}
                  {row.signed_at ? formatDate(row.signed_at.slice(0, 10)) : "—"} 체결
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPreview(row)}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white/60 text-slate-600 hover:border-brand-400 hover:text-brand-600"
                >
                  👁 미리보기
                </button>
                <button
                  type="button"
                  disabled={busyId === row.doc_id}
                  onClick={() => handleDownload(row)}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white/60 text-slate-600 hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
                >
                  {busyId === row.doc_id ? "받는 중…" : "⤓ 다운로드"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <p className="text-center text-xs text-slate-400">
          서명 완료 계약서 {counts.all}건 · 원본은 비공개 저장소에 안전하게 보관 중
        </p>
      )}

      {preview && (
        <FilePreviewModal
          title={`${preview.name} — TMA 계약서`}
          fileName={downloadFileName(preview)}
          fetchUrl={() => getSignedPdfUrl(preview.doc_id)}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
