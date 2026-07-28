"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { InfluencerCampaign } from "@/lib/influencer/types";
import {
  updateCampaignShipping,
  unmarkCampaignPaid,
} from "@/lib/influencer/contact-actions";
import PayoutConfirmDialog from "./PayoutConfirmDialog";

interface Props {
  campaign: InfluencerCampaign;
  onChanged: () => void;
}

const INPUT_CLS =
  "min-w-0 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

/** 택배사·송장번호 + 지급 완료 체크. 배송 입력은 포커스가 빠질 때 저장한다. */
export default function CampaignFulfillmentFields({ campaign, onChanged }: Props) {
  const [courier, setCourier] = useState(campaign.courier ?? "");
  const [tracking, setTracking] = useState(campaign.tracking_number ?? "");
  const [showPayout, setShowPayout] = useState(false);
  const [busy, setBusy] = useState(false);

  const isPaid = campaign.payout_status === "paid";

  const saveShipping = async () => {
    const nextCourier = courier.trim() || null;
    const nextTracking = tracking.trim() || null;
    if (nextCourier === (campaign.courier ?? null) && nextTracking === (campaign.tracking_number ?? null)) {
      return; // 바뀐 게 없으면 저장하지 않는다
    }
    try {
      await updateCampaignShipping(campaign.id, {
        courier: nextCourier,
        tracking_number: nextTracking,
      });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "배송 정보 저장 실패");
    }
  };

  const handleTogglePaid = async () => {
    if (!isPaid) {
      setShowPayout(true);
      return;
    }
    const deleteExpense = campaign.expense_id
      ? window.confirm(
          "지급 해제합니다.\n\n확인을 누르면 연결된 지출도 함께 삭제합니다.\n취소를 누르면 지출은 남겨두고 연결만 끊습니다."
        )
      : false;
    setBusy(true);
    try {
      await unmarkCampaignPaid(campaign.id, deleteExpense);
      toast.success("지급 상태를 해제했습니다.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "지급 해제 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          className={`${INPUT_CLS} w-20`}
          placeholder="택배사"
          value={courier}
          onChange={(e) => setCourier(e.target.value)}
          onBlur={() => void saveShipping()}
        />
        <input
          className={`${INPUT_CLS} flex-1`}
          placeholder="송장번호"
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          onBlur={() => void saveShipping()}
        />
        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 shrink-0 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isPaid}
            disabled={busy}
            onChange={() => void handleTogglePaid()}
            className="accent-emerald-600"
          />
          지급
        </label>
      </div>

      {isPaid && campaign.paid_at && (
        <p className="text-[11px] text-emerald-600">{campaign.paid_at} 지급 완료</p>
      )}

      {showPayout && (
        <PayoutConfirmDialog
          campaignId={campaign.id}
          cost={campaign.cost}
          onDone={() => {
            setShowPayout(false);
            onChanged();
          }}
          onCancel={() => setShowPayout(false)}
        />
      )}
    </>
  );
}
