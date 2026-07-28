"use client";

import { useState } from "react";
import { toast } from "sonner";
import Trash from "phosphor-react/dist/icons/Trash.esm.js";
import { toDateStringFromTimestamp } from "@/lib/utils/date";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/influencer/labels";
import type { CampaignStatus } from "@/lib/influencer/types";
import type { InfluencerCampaignEvent } from "@/lib/influencer/contact-types";
import { addCampaignEvent, deleteCampaignEvent } from "@/lib/influencer/contact-actions";

interface Props {
  campaignId: string;
  currentUserId: string | null;
  events: InfluencerCampaignEvent[];
  onChanged: () => void;
}

function statusLabel(value: string | null): string {
  if (!value) return "없음";
  return CAMPAIGN_STATUS_LABEL[value as CampaignStatus] ?? value;
}

export default function CampaignEventTimeline({
  campaignId,
  currentUserId,
  events,
  onChanged,
}: Props) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await addCampaignEvent(campaignId, trimmed);
      setBody("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "기록 저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (eventId: string) => {
    try {
      await deleteCampaignEvent(eventId);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "기록 삭제 실패");
    }
  };

  return (
    <div className="space-y-1.5">
      {events.length === 0 && (
        <p className="text-[11px] text-slate-400">아직 기록이 없습니다.</p>
      )}

      {events.map((event) => (
        <div key={event.id} className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex gap-2">
            <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
              {toDateStringFromTimestamp(event.created_at).slice(5)}
            </span>
            {event.kind === "status_change" ? (
              <span className="text-[11px] text-slate-400">
                {statusLabel(event.from_status)} → {statusLabel(event.to_status)} 로 변경
              </span>
            ) : (
              <span className="text-[11px] text-slate-600 break-words">{event.body}</span>
            )}
          </div>
          {event.kind === "note" && event.created_by === currentUserId && (
            <button
              onClick={() => void handleDelete(event.id)}
              aria-label="기록 삭제"
              className="shrink-0 text-slate-300 hover:text-red-500 transition-colors"
            >
              <Trash size={12} />
            </button>
          )}
        </div>
      ))}

      <div className="flex items-center gap-1.5 pt-1">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleAdd();
          }}
          placeholder="협의 내용 기록 (예: 단가 20만 요구)"
          className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          onClick={() => void handleAdd()}
          disabled={saving || !body.trim()}
          className="shrink-0 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-40"
        >
          기록
        </button>
      </div>
    </div>
  );
}
