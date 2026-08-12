"use client";

// 정산 자료 다운로드 — 선택한 인플루언서의 계좌·신분증을 회계 전달용 ZIP 하나로 묶는다.
// 2차 비밀번호 잠금 해제 후에만 열람/생성. ZIP 조립은 브라우저에서 하고
// xlsx/jszip 은 이 모달이 열릴 때만 로드된다(초기 JS 예산 보호).

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import ModalContainer from "@/components/shared/ModalContainer";
import LockSimple from "phosphor-react/dist/icons/LockSimple.esm.js";
import { getErrorMessage } from "@/lib/utils/errors";
import { unlockVault } from "@/lib/vault/actions";
import { getSettlementsForExport } from "@/lib/influencer/contracts/actions";
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

export default function SettlementExportModal({
  contracts,
  gateConfigured,
  unlocked,
  onUnlockedChange,
  onClose,
}: Props) {
  const [rows, setRows] = useState<SettlementExportRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const ids = useMemo(() => contracts.map((c) => c.id), [contracts]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getSettlementsForExport(ids));
    } catch (err) {
      toast.error(getErrorMessage(err, "정산 정보를 불러오지 못했습니다."));
      onUnlockedChange(false);
    } finally {
      setLoading(false);
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

  const handleUnlock = async () => {
    if (!password.trim() || busy) return;
    setBusy(true);
    try {
      const res = await unlockVault(password);
      if (res.ok) {
        setPassword("");
        onUnlockedChange(true);
        toast.success("잠금이 해제되었습니다. (20분 유지)");
      } else {
        toast.error("2차 비밀번호가 올바르지 않습니다.");
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "잠금 해제 실패"));
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    if (busy || included.length === 0) return;
    setBusy(true);
    try {
      // 무거운 라이브러리는 내려받기 버튼을 눌렀을 때만 로드
      const [XLSX, JSZipModule] = await Promise.all([import("xlsx"), import("jszip")]);
      const JSZip = JSZipModule.default;

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
          "신분증 파일": s.id_card_url ? `신분증/${idCardFileName(c, s)}` : "없음",
        };
      });
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "정산명단");
      const xlsxBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

      const zip = new JSZip();
      zip.file("정산명단.xlsx", xlsxBuffer);
      const folder = zip.folder("신분증")!;
      let missedFiles = 0;
      for (const c of included) {
        const s = settlementByContract.get(c.id)!;
        if (!s.id_card_url) continue;
        try {
          const res = await fetch(s.id_card_url);
          if (!res.ok) throw new Error(String(res.status));
          folder.file(idCardFileName(c, s), await res.arrayBuffer());
        } catch {
          missedFiles += 1;
        }
      }

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
        missedFiles
          ? `내려받았어요. (신분증 ${missedFiles}건은 받지 못해 명단에만 표시됩니다)`
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

      {!gateConfigured ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-500">
          2차 비밀번호가 아직 설정되지 않았어요. 보관함 → 계정 탭에서 관리자가 설정하면 사용할 수 있어요.
        </p>
      ) : !unlocked ? (
        <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3.5">
          <p className="flex items-center gap-1.5 text-sm text-slate-600">
            <LockSimple size={15} weight="fill" className="text-slate-400" />
            정산 자료에는 <b>계좌번호·신분증</b>이 들어가요. 내려받으려면 <b>2차 비밀번호</b>가 필요합니다.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUnlock();
              }}
              placeholder="2차 비밀번호"
              aria-label="2차 비밀번호"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <button
              type="button"
              onClick={handleUnlock}
              disabled={busy}
              className="rounded-lg bg-[#2563eb] px-3.5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              잠금 해제
            </button>
          </div>
        </div>
      ) : loading || rows === null ? (
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
                        <td className="whitespace-nowrap px-3 py-2">{s.id_card_url ? "✓" : "✗ 없음"}</td>
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
