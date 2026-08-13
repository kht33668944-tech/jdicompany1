"use client";

// 발송된 계약서 화면 — 편집 대신 "서명 링크"를 보여준다.
//
// 발송 직후에도 이 화면으로 온다. 발송하면 서버가 이 라우트를 다시 렌더링하므로
// 링크를 클라이언트 상태로만 들고 있으면 화면이 덮여 링크를 잃어버린다.
// 그래서 링크는 항상 저장된 sign_token 에서 다시 만들어 보여준다.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils/errors";
import { formatDate } from "@/lib/utils/date";
import { COMPANY_CONTRACTS_PATH } from "@/lib/contracts/constants";
import { cancelCompanyDocument } from "@/lib/contracts/actions";
import type { CompanyContractDocument } from "@/lib/contracts/types";

export default function ContractSentScreen({ doc }: { doc: CompanyContractDocument }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // 주소는 마운트 후에 붙인다 — 서버 렌더에는 window 가 없어 곧바로 쓰면 하이드레이션이 어긋난다
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const link = doc.sign_token ? `/sign/c/${doc.sign_token}` : null;
  const fullLink = link ? `${origin}${link}` : null;

  const copy = async () => {
    if (!fullLink) return;
    await navigator.clipboard.writeText(fullLink).catch(() => {});
    toast.success("복사했어요. 카톡·문자·메일로 붙여넣어 보내세요.");
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await cancelCompanyDocument(doc.id);
      toast.success("발송을 취소했어요. 목록에서 복제해 고쳐 보낼 수 있어요.");
      router.push(COMPANY_CONTRACTS_PATH);
    } catch (err) {
      toast.error(getErrorMessage(err, "취소에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-3xl">🔗</p>
        <h2 className="mt-3 text-lg font-bold text-slate-800">서명을 기다리는 중이에요</h2>
        <p className="mt-1 text-[13px] font-semibold text-slate-500">{doc.title}</p>
        <p className="mt-2 text-sm text-slate-500">
          아래 링크를 카톡·문자·메일로 <b>{doc.counterparty_name}</b> 님께 보내주세요.
          {doc.token_expires_at && (
            <>
              <br />
              링크는 <b>{formatDate(doc.token_expires_at.slice(0, 10))}</b>까지 유효합니다.
            </>
          )}
        </p>

        {fullLink ? (
          <div className="mt-4 break-all rounded-xl bg-slate-50 px-4 py-3 text-[13px] font-semibold text-slate-700">
            {fullLink}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600">
            링크가 만료되었거나 취소되었습니다. 목록에서 복제해 다시 보내주세요.
          </p>
        )}

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {fullLink && (
            <button
              type="button"
              onClick={copy}
              className="rounded-xl bg-[#2563eb] px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              링크 복사
            </button>
          )}
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            발송 취소
          </button>
          <button
            type="button"
            onClick={() => router.push(COMPANY_CONTRACTS_PATH)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            목록으로
          </button>
        </div>

        <p className="mt-4 text-[11.5px] text-slate-400">
          서명이 끝나면 완료본이 보관함(계약서 보관함)에 자동으로 저장돼요.
        </p>
      </div>
    </div>
  );
}
