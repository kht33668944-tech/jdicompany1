"use client";

// 정산 자료 다운로드 — 선택한 인플루언서의 계좌·신분증을 회계 전달용 ZIP 하나로 묶는다.
// 2차 비밀번호 잠금 해제 후에만 열람/생성. ZIP 조립은 브라우저에서 하고
// xlsx/jszip 은 이 모달이 열릴 때만 로드된다(초기 JS 예산 보호).
// 신분증 임시 링크(2분)는 다운로드 버튼을 누른 시점에 발급한다(미리보기 중 만료 방지).

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import ModalContainer from "@/components/shared/ModalContainer";
import VaultUnlockGate from "@/components/shared/VaultUnlockGate";
import { getErrorMessage } from "@/lib/utils/errors";
import {
  getIdCardUrlsForExport,
  getSettlementsForExport,
} from "@/lib/influencer/contracts/actions";
import { getContractPayout, getWithholding } from "@/lib/influencer/contracts/payout";
import { SETTLEMENT_TYPE_LABEL } from "@/lib/influencer/contracts/labels";
import type { InfluencerContract, SettlementExportRow } from "@/lib/influencer/contracts/types";
import { formatKrw } from "@/lib/expenses/format";
import { kstNow, toDateString } from "@/lib/utils/date";

interface Props {
  contracts: InfluencerContract[]; // 선택된 계약들
  gateConfigured: boolean;
  unlocked: boolean;
  onUnlockedChange: (unlocked: boolean) => void;
  onClose: () => void;
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "이름없음";
}

function idCardFileName(contract: InfluencerContract, row: SettlementExportRow): string {
  const ext =
    row.id_card_name?.split(".").pop()?.toLowerCase() ||
    row.id_card_path?.split(".").pop()?.toLowerCase() ||
    "jpg";
  return `${safeFileName(contract.name)}.${ext}`;
}

/** 신분증 파일 병렬 다운로드(동시 6개) — 실패한 건수만 세고 계속 진행 */
async function fetchIdCards(
  targets: { fileName: string; url: string }[],
): Promise<{ files: { fileName: string; buffer: ArrayBuffer }[]; missed: number }> {
  const files: { fileName: string; buffer: ArrayBuffer }[] = [];
  let missed = 0;
  for (let i = 0; i < targets.length; i += 6) {
    const chunk = targets.slice(i, i + 6);
    const results = await Promise.all(
      chunk.map(async ({ fileName, url }) => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          return { fileName, buffer: await res.arrayBuffer() };
        } catch {
          return null;
        }
      }),
    );
    for (const r of results) {
      if (r) files.push(r);
      else missed += 1;
    }
  }
  return { files, missed };
}

export default function SettlementExportModal({
  contracts,
  gateConfigured,
  unlocked,
  onUnlockedChange,
  onClose,
}: Props) {
  const [rows, setRows] = useState<SettlementExportRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const ids = useMemo(() => contracts.map((c) => c.id), [contracts]);

  const load = useCallback(async () => {
    try {
      setRows(await getSettlementsForExport(ids));
    } catch (err) {
      toast.error(getErrorMessage(err, "정산 정보를 불러오지 못했습니다."));
      onUnlockedChange(false);
    }
  }, [ids, onUnlockedChange]);

  useEffect(() => {
    if (unlocked) load();
  }, [unlocked, load]);

  const settlementByContract = useMemo(() => {
    const map = new Map<string, SettlementExportRow>();
    for (const r of rows ?? []) map.set(r.contract_id, r);
    return map;
  }, [rows]);

  const included = contracts.filter((c) => settlementByContract.has(c.id));
  const skipped = contracts.length - included.length;

  const handleDownload = async () => {
    if (busy || included.length === 0) return;
    setBusy(true);
    try {
      // 무거운 라이브러리 로드와 신분증 링크 발급을 병렬로
      const [XLSX, JSZipModule, idCardUrls] = await Promise.all([
        import("xlsx"),
        import("jszip"),
        getIdCardUrlsForExport(included.map((c) => c.id)),
      ]);
      const JSZip = JSZipModule.default;
      const urlByContract = new Map(idCardUrls.map((r) => [r.contract_id, r.url]));

      const sheetRows = included.map((c) => {
        const s = settlementByContract.get(c.id)!;
        const payout = getContractPayout(c);
        const withholding = getWithholding(payout, c.settlement_type);
        return {
          "이름/채널명": c.name,
          "Instagram": c.instagram_handle ? `@${c.instagram_handle}` : "",
          "정산 구분": c.settlement_type ? SETTLEMENT_TYPE_LABEL[c.settlement_type] : "미정",
          "사업자등록번호": c.business_reg_no ?? "",
          "지급액(원)": payout,
          "원천징수 3.3%(원)": withholding,
          "실지급액(원)": payout - withholding,
          "은행": s.bank_name,
          "계좌번호": s.bank_account,
          "예금주": s.account_holder,
          "휴대폰": s.phone,
          "배송지 주소": s.address,
          "신분증 파일": urlByContract.has(c.id) ? `신분증/${idCardFileName(c, s)}` : "없음",
        };
      });
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "정산명단");
      const xlsxBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

      const zip = new JSZip();
      zip.file("정산명단.xlsx", xlsxBuffer);
      const folder = zip.folder("신분증")!;
      const targets = included
        .filter((c) => urlByContract.has(c.id))
        .map((c) => ({
          fileName: idCardFileName(c, settlementByContract.get(c.id)!),
          url: urlByContract.get(c.id)!,
        }));
      const { files, missed } = await fetchIdCards(targets);
      for (const f of files) folder.file(f.fileName, f.buffer);

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `TMA-정산자료-${toDateString(kstNow())}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success(
        missed
          ? `내려받았어요. (신분증 ${missed}건은 받지 못해 명단에만 표시됩니다)`
          : "정산 자료를 내려받았어요. 전달 후에는 파일을 지워주세요.",
      );
    } catch (err) {
      toast.error(getErrorMessage(err, "정산 자료 생성 실패"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalContainer onClose={onClose} maxWidth="max-w-2xl">
      <h2 className="mb-1 text-base font-extrabold text-slate-800">정산 자료 다운로드</h2>
      <p className="mb-4 text-xs text-slate-400">
        선택한 {contracts.length}명의 계좌·신분증을 회계 전달용 ZIP 하나로 묶어요.
      </p>

      {!unlocked ? (
        <VaultUnlockGate
          gateConfigured={gateConfigured}
          notice={
            <>
              정산 자료에는 <b>계좌번호·신분증</b>이 들어가요. 내려받으려면 <b>2차 비밀번호</b>가
              필요합니다.
            </>
          }
          onUnlocked={() => onUnlockedChange(true)}
        />
      ) : rows === null ? (
        <p className="py-8 text-center text-sm text-slate-400">정산 정보를 불러오는 중…</p>
      ) : (
        <>
          {skipped > 0 && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              ⚠ 선택한 {contracts.length}명 중 {skipped}명은 정산 정보가 등록되지 않아 제외돼요.
            </p>
          )}
          <div className="mb-4 max-h-64 overflow-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  {["이름", "구분", "지급액", "원천징수", "실지급액", "계좌", "신분증"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {included.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                      정산 정보가 등록된 선택 인원이 없어요.
                    </td>
                  </tr>
                ) : (
                  included.map((c) => {
                    const s = settlementByContract.get(c.id)!;
                    const payout = getContractPayout(c);
                    const withholding = getWithholding(payout, c.settlement_type);
                    return (
                      <tr key={c.id}>
                        <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{c.name}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {c.settlement_type ? SETTLEMENT_TYPE_LABEL[c.settlement_type] : "미정"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {payout ? formatKrw(payout) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-500">
                          {withholding
                            ? `-${formatKrw(withholding)}`
                            : c.settlement_type === "business"
                              ? "세금계산서"
                              : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums">
                          {payout ? formatKrw(payout - withholding) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                          {s.bank_name} {s.bank_account}
                          <span className="block text-[11px] text-slate-400">{s.account_holder}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">{s.id_card_path ? "✓" : "✗ 없음"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            📦 ZIP 안에는 <b>정산명단.xlsx</b>(위 표 + 휴대폰·주소·사업자번호)와 <b>신분증/</b> 폴더가 들어가요.
            개인정보가 포함된 파일이니 전달 후에는 PC에서 삭제하는 걸 권장해요.
          </p>
        </>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          닫기
        </button>
        {unlocked && rows !== null && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy || included.length === 0}
            className="rounded-xl bg-[#2563eb] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
          >
            {busy ? "만드는 중…" : `📦 ZIP 다운로드 (${included.length}명)`}
          </button>
        )}
      </div>
    </ModalContainer>
  );
}
