"use client";

import { useState } from "react";
import { toast } from "sonner";
import ModalContainer from "@/components/shared/ModalContainer";
import { linkPostToCampaign } from "@/lib/influencer/actions";
import type { InfluencerCampaign, InfluencerPost } from "@/lib/influencer/types";
import { CAMPAIGN_STATUS_OPTIONS } from "@/lib/influencer/labels";

interface Props {
  post: InfluencerPost;
  campaigns: InfluencerCampaign[];
  onSuccess: (updated: InfluencerCampaign) => void;
  onCancel: () => void;
}

export default function LinkPostToCampaignDialog({
  post,
  campaigns,
  onSuccess,
  onCancel,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>(campaigns[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!selectedId) {
      toast.error("연결할 캠페인을 선택하세요.");
      return;
    }
    if (!post.post_url) {
      toast.error("게시물 URL이 없습니다.");
      return;
    }
    setSaving(true);
    try {
      const updated = await linkPostToCampaign(selectedId, post.post_url, post.posted_at);
      toast.success("캠페인에 게시물이 연결되었습니다.");
      onSuccess(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "연결 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalContainer onClose={onCancel} maxWidth="max-w-md">
      <h3 className="text-base font-semibold text-slate-800 mb-1">캠페인 결과로 등록</h3>
      <p className="text-xs text-slate-500 mb-4">
        선택한 캠페인의 실제 게시물로 연결되며 상태가 <b>게시 완료</b>로 변경됩니다.
      </p>

      {campaigns.length === 0 ? (
        <div className="bg-slate-50 rounded-xl px-4 py-6 text-center text-sm text-slate-500">
          진행 중인 캠페인이 없습니다.
        </div>
      ) : (
        <>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">
            연결할 캠페인
          </label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            aria-label="캠페인 선택"
          >
            {campaigns.map((c) => {
              const statusLabel =
                CAMPAIGN_STATUS_OPTIONS.find((o) => o.value === c.status)?.label ?? c.status;
              const product = c.product_name ? ` · ${c.product_name}` : "";
              return (
                <option key={c.id} value={c.id}>
                  [{statusLabel}] {c.campaign_name}{product}
                </option>
              );
            })}
          </select>

          <div className="mt-4 bg-slate-50 rounded-xl p-3 space-y-1 text-xs text-slate-500">
            <div>
              <span className="text-slate-400">게시 URL:</span>{" "}
              <span className="text-slate-700 break-all">{post.post_url}</span>
            </div>
            <div>
              <span className="text-slate-400">게시일:</span>{" "}
              <span className="text-slate-700">
                {post.posted_at ? new Date(post.posted_at).toLocaleDateString("ko-KR") : "오늘"}
              </span>
            </div>
          </div>
        </>
      )}

      <div className="flex gap-2 justify-end mt-5">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || campaigns.length === 0}
          className="text-xs px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "연결 중…" : "연결하기"}
        </button>
      </div>
    </ModalContainer>
  );
}
