"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import Select, { type SelectOption } from "@/components/shared/Select";
import { createClient } from "@/lib/supabase/client";
import { toDateString } from "@/lib/utils/date";
import { markCampaignPaid } from "@/lib/influencer/contact-actions";

interface Props {
  campaignId: string;
  cost: number | null;
  onDone: () => void;
  onCancel: () => void;
}

const INPUT_CLS =
  "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

/**
 * 지급 완료 확인 창.
 * expenses.payment_method 가 필수라서 결제수단을 반드시 받아야 한다.
 */
export default function PayoutConfirmDialog({ campaignId, cost, onDone, onCancel }: Props) {
  const [paidAt, setPaidAt] = useState(() => toDateString());
  const [methods, setMethods] = useState<string[]>([]);
  const [method, setMethod] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("payment_methods")
      .select("name")
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error(`결제수단을 불러오지 못했습니다: ${error.message}`);
          return;
        }
        const names = (data ?? []).map((m) => m.name as string);
        setMethods(names);
        setMethod((prev) => prev || names[0] || "");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options: SelectOption[] = methods.map((m) => ({ value: m, label: m }));
  const hasCost = (cost ?? 0) > 0;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await markCampaignPaid(campaignId, { paidAt, paymentMethod: method || "미지정" });
      toast.success(
        hasCost ? "지급 완료로 바꾸고 지출에 기록했습니다." : "지급 완료로 바꿨습니다."
      );
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "지급 처리 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-xl space-y-3">
        <h3 className="text-sm font-bold text-slate-800">지급 완료 처리</h3>

        {hasCost ? (
          <p className="text-xs text-slate-500 leading-relaxed">
            {cost?.toLocaleString()}원이 지출관리에 &quot;인플루언서 시딩&quot; 분류로 자동
            기록됩니다.
          </p>
        ) : (
          <p className="text-xs text-slate-500 leading-relaxed">
            금액이 없는 시딩이라 지출은 만들지 않고 지급 완료 표시만 합니다.
          </p>
        )}

        <div>
          <label className="text-[11px] font-semibold text-slate-500 block mb-1">지급일</label>
          <input
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className={INPUT_CLS}
          />
        </div>

        {hasCost && (
          <div>
            <label className="text-[11px] font-semibold text-slate-500 block mb-1">결제수단</label>
            {options.length > 0 ? (
              <Select
                value={method}
                onChange={setMethod}
                options={options}
                ariaLabel="결제수단"
              />
            ) : (
              <input
                className={INPUT_CLS}
                placeholder="결제수단 입력"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              />
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || (hasCost && !method.trim())}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "처리 중…" : "지급 완료"}
          </button>
        </div>
      </div>
    </div>
  );
}
