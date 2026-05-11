"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { InfluencerWithPosts, InfluencerCampaign, CampaignStatus, InfluencerPost } from "@/lib/influencer/types";
import {
  updateInfluencerNotes,
  updateInfluencerTags,
  addCampaign,
  updateCampaign,
  updateCampaignStatus,
  deleteCampaign,
  resyncInfluencer,
  analyzeInfluencer,
  archiveInfluencer,
} from "@/lib/influencer/actions";
import GradeBadge from "./GradeBadge";
import StatusBadge from "./StatusBadge";
import InfluencerMediaGallery from "./InfluencerMediaGallery";
import PostLightbox from "./PostLightbox";
import Image from "next/image";
import { resolveMediaUrl, shouldSkipOptimize } from "@/lib/influencer/proxy";
import { CAMPAIGN_STATUS_OPTIONS } from "@/lib/influencer/labels";
import {
  getTier,
  calcEstimatedReach,
  calcLikeCommentRatio,
  calcErVsTierAverage,
} from "@/lib/influencer/metrics";

import X from "phosphor-react/dist/icons/X.esm.js";
import Robot from "phosphor-react/dist/icons/Robot.esm.js";
import ArrowsClockwise from "phosphor-react/dist/icons/ArrowsClockwise.esm.js";
import Sparkle from "phosphor-react/dist/icons/Sparkle.esm.js";
import Archive from "phosphor-react/dist/icons/Archive.esm.js";
import Plus from "phosphor-react/dist/icons/Plus.esm.js";
import Trash from "phosphor-react/dist/icons/Trash.esm.js";
import Tag from "phosphor-react/dist/icons/Tag.esm.js";
import NotePencil from "phosphor-react/dist/icons/NotePencil.esm.js";
import PencilSimple from "phosphor-react/dist/icons/PencilSimple.esm.js";

type PanelPhase = "closed" | "opening" | "open" | "closing";

type Props = {
  influencerId: string | null;
  onClose: () => void;
};

function formatNumber(n: number | null): string {
  if (n === null) return "—";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return String(Math.round(n));
}

function PostThumbnail({
  url,
  path,
  alt,
}: {
  url: string | null;
  path?: string | null;
  alt: string;
}) {
  const [errored, setErrored] = useState(false);
  const src = resolveMediaUrl(url, path);
  if (!src || errored) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">
        없음
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(max-width: 1024px) 25vw, 12vw"
      onError={() => setErrored(true)}
      className="object-cover group-hover:scale-105 transition-transform duration-200"
      unoptimized={shouldSkipOptimize(src)}
    />
  );
}

function formatPct(n: number | null): string {
  if (n === null) return "—";
  return `${n.toFixed(2)}%`;
}

// ── 캠페인 추가 폼 ──────────────────────────────────────────────
interface AddCampaignFormProps {
  influencerId: string;
  onSaved: (c: InfluencerCampaign) => void;
  onCancel: () => void;
}

function AddCampaignForm({ influencerId, onSaved, onCancel }: AddCampaignFormProps) {
  const [name, setName] = useState("");
  const [product, setProduct] = useState("");
  const [cost, setCost] = useState("");
  const [contactDate, setContactDate] = useState("");
  const [contractDate, setContractDate] = useState("");
  const [shipDate, setShipDate] = useState("");
  const [contentDeadline, setContentDeadline] = useState("");
  const [postDate, setPostDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("캠페인 이름을 입력하세요."); return; }
    setSaving(true);
    try {
      const saved = await addCampaign({
        influencer_id: influencerId,
        campaign_name: name.trim(),
        product_name: product.trim() || undefined,
        cost: cost ? Number(cost) : undefined,
        contact_date: contactDate || undefined,
        contract_date: contractDate || undefined,
        ship_date: shipDate || undefined,
        content_deadline: contentDeadline || undefined,
        expected_post_date: postDate || undefined,
      });
      toast.success("캠페인이 추가되었습니다.");
      onSaved(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "캠페인 추가 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-200">
      <input
        type="text"
        placeholder="캠페인 이름 *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="제품명"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <input
          type="number"
          placeholder="비용 (원)"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>
      {/* 날짜 5개 — 시딩 캘린더 막대 시각화용 */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[10px] text-slate-500 mb-0.5">연락일 (DM)</label>
          <input
            type="date"
            value={contactDate}
            onChange={(e) => setContactDate(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-600"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-0.5">계약 진행</label>
          <input
            type="date"
            value={contractDate}
            onChange={(e) => setContractDate(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-600"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-0.5">발송일</label>
          <input
            type="date"
            value={shipDate}
            onChange={(e) => setShipDate(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-600"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-0.5">콘텐츠 마감</label>
          <input
            type="date"
            value={contentDeadline}
            onChange={(e) => setContentDeadline(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-600"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-0.5">포스팅 예정</label>
          <input
            type="date"
            value={postDate}
            onChange={(e) => setPostDate(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-600"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={saving}
          className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}

// ── 캠페인 수정 폼 (인라인 편집) ──────────────────────────────
interface EditCampaignFormProps {
  campaign: InfluencerCampaign;
  onSaved: (updated: InfluencerCampaign) => void;
  onCancel: () => void;
}

function EditCampaignForm({ campaign, onSaved, onCancel }: EditCampaignFormProps) {
  const [name, setName] = useState(campaign.campaign_name);
  const [product, setProduct] = useState(campaign.product_name ?? "");
  const [cost, setCost] = useState(campaign.cost !== null ? String(campaign.cost) : "");
  const [status, setStatus] = useState<CampaignStatus>(campaign.status);
  const [contactDate, setContactDate] = useState(campaign.contact_date ?? "");
  const [contractDate, setContractDate] = useState(campaign.contract_date ?? "");
  const [shipDate, setShipDate] = useState(campaign.ship_date ?? "");
  const [contentDeadline, setContentDeadline] = useState(campaign.content_deadline ?? "");
  const [postDate, setPostDate] = useState(campaign.expected_post_date ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("캠페인 이름을 입력하세요."); return; }
    setSaving(true);
    try {
      const patch = {
        campaign_name: name.trim(),
        product_name: product.trim() || null,
        cost: cost ? Number(cost) : null,
        status,
        contact_date: contactDate || null,
        contract_date: contractDate || null,
        ship_date: shipDate || null,
        content_deadline: contentDeadline || null,
        expected_post_date: postDate || null,
      };
      await updateCampaign(campaign.id, patch);
      toast.success("캠페인이 수정되었습니다.");
      onSaved({ ...campaign, ...patch });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "캠페인 수정 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50/40 rounded-xl p-3 space-y-2 ring-1 ring-blue-200">
      <input
        type="text"
        placeholder="캠페인 이름 *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="제품명"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <input
          type="number"
          placeholder="비용 (원)"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as CampaignStatus)}
        className="w-full text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        aria-label="캠페인 상태"
      >
        {CAMPAIGN_STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[10px] text-slate-500 mb-0.5">연락일 (DM)</label>
          <input
            type="date"
            value={contactDate}
            onChange={(e) => setContactDate(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-600"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-0.5">계약 진행</label>
          <input
            type="date"
            value={contractDate}
            onChange={(e) => setContractDate(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-600"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-0.5">발송일</label>
          <input
            type="date"
            value={shipDate}
            onChange={(e) => setShipDate(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-600"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-0.5">콘텐츠 마감</label>
          <input
            type="date"
            value={contentDeadline}
            onChange={(e) => setContentDeadline(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-600"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-0.5">포스팅 예정</label>
          <input
            type="date"
            value={postDate}
            onChange={(e) => setPostDate(e.target.value)}
            className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-600"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={saving}
          className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}

// ── 메인 패널 ──────────────────────────────────────────────────
export default function InfluencerDetailPanel({ influencerId, onClose }: Props) {
  const [influencer, setInfluencer] = useState<InfluencerWithPosts | null>(null);
  const [campaigns, setCampaigns] = useState<InfluencerCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<PanelPhase>("closed");
  const [prevId, setPrevId] = useState<string | null>(null);

  const [notes, setNotes] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [showAddCampaign, setShowAddCampaign] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activePost, setActivePost] = useState<InfluencerPost | null>(null);

  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visible = phase !== "closed";
  const sliding = phase === "open";

  // ── 패널 열기/닫기 상태 머신 ──
  if (influencerId !== prevId) {
    setPrevId(influencerId);
    if (influencerId) {
      setPhase("opening");
      setError(null);
      setInfluencer(null);
      setCampaigns([]);
      setShowAddCampaign(false);
      setEditingCampaignId(null);
      setActivePost(null);
    } else if (prevId) {
      setPhase("closing");
    }
  }

  useEffect(() => {
    if (phase !== "opening") return;
    const raf = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => {
    if (phase !== "closing") return;
    const t = setTimeout(() => {
      setPhase("closed");
      setInfluencer(null);
      setCampaigns([]);
      setError(null);
    }, 220);
    return () => clearTimeout(t);
  }, [phase]);

  // ── 데이터 로드 ──
  useEffect(() => {
    if (!influencerId) return;
    let cancelled = false;
    setLoading(true);
    const supabase = createClient();

    Promise.all([
      supabase
        .from("influencers")
        .select("*")
        .eq("id", influencerId)
        .single()
        .then(({ data, error }) => {
          if (error) throw error;
          return data as InfluencerWithPosts;
        })
        .then(async (inf) => {
          const { data: posts } = await supabase
            .from("influencer_posts")
            .select("id, influencer_id, post_url, thumbnail_url, thumbnail_path, caption, likes, comments, posted_at, fetched_at, post_type, product_type, view_count, is_sponsored, hashtags, child_thumbnails, child_thumbnail_paths, video_url")
            .eq("influencer_id", influencerId)
            .order("posted_at", { ascending: false, nullsFirst: false })
            .limit(60);
          return { ...inf, recent_posts: posts ?? [] } as InfluencerWithPosts;
        }),
      supabase
        .from("influencer_campaigns")
        .select("*")
        .eq("influencer_id", influencerId)
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []) as InfluencerCampaign[];
        }),
    ])
      .then(([inf, cams]) => {
        if (cancelled) return;
        setInfluencer(inf);
        setCampaigns(cams);
        setNotes(inf.notes ?? "");
        setTags(inf.tags ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "데이터 로드 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [influencerId]);

  // ── ESC 닫기 / body scroll lock ──
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [visible, onClose]);

  // ── 메모 디바운스 저장 ──
  const handleNotesChange = useCallback((val: string) => {
    setNotes(val);
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
    notesDebounceRef.current = setTimeout(async () => {
      if (!influencerId) return;
      try {
        await updateInfluencerNotes(influencerId, val);
      } catch {
        toast.error("메모 저장 실패");
      }
    }, 1000);
  }, [influencerId]);

  // ── 태그 추가/삭제 ──
  const handleAddTag = useCallback(async () => {
    const t = tagInput.trim();
    if (!t || !influencerId || tags.includes(t)) { setTagInput(""); return; }
    const next = [...tags, t];
    setTags(next);
    setTagInput("");
    try {
      await updateInfluencerTags(influencerId, next);
    } catch {
      toast.error("태그 저장 실패");
      setTags(tags);
    }
  }, [tagInput, influencerId, tags]);

  const handleRemoveTag = useCallback(async (tag: string) => {
    if (!influencerId) return;
    const next = tags.filter((t) => t !== tag);
    setTags(next);
    try {
      await updateInfluencerTags(influencerId, next);
    } catch {
      toast.error("태그 삭제 실패");
      setTags(tags);
    }
  }, [influencerId, tags]);

  // ── 캠페인 상태 변경 ──
  const handleStatusChange = useCallback(async (campaignId: string, status: CampaignStatus) => {
    try {
      await updateCampaignStatus(campaignId, status);
      setCampaigns((prev) => prev.map((c) => c.id === campaignId ? { ...c, status } : c));
      toast.success("상태가 변경되었습니다.");
    } catch {
      toast.error("상태 변경 실패");
    }
  }, []);

  const handleDeleteCampaign = useCallback(async (campaignId: string) => {
    try {
      await deleteCampaign(campaignId);
      setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));
      toast.success("캠페인이 삭제되었습니다.");
    } catch {
      toast.error("캠페인 삭제 실패");
    }
  }, []);

  // ── 하단 액션 ──
  const handleResync = useCallback(async () => {
    if (!influencerId) return;
    setActionLoading("resync");
    try {
      await resyncInfluencer(influencerId);
      toast.success("재동기화가 시작되었습니다.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "재동기화 실패");
    } finally {
      setActionLoading(null);
    }
  }, [influencerId]);

  const handleAnalyze = useCallback(async () => {
    if (!influencerId) return;
    setActionLoading("analyze");
    try {
      await analyzeInfluencer(influencerId);
      toast.success("AI 재분석이 시작되었습니다.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI 분석 실패");
    } finally {
      setActionLoading(null);
    }
  }, [influencerId]);

  const handleArchive = useCallback(async () => {
    if (!influencerId) return;
    setActionLoading("archive");
    try {
      await archiveInfluencer(influencerId);
      toast.success("보관되었습니다.");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "보관 처리 실패");
      setActionLoading(null);
    }
  }, [influencerId, onClose]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* 배경 오버레이 — 모바일/태블릿에서는 단색, 데스크탑은 갤러리가 차지 */}
      <div
        className={`absolute inset-0 lg:hidden bg-black/30 backdrop-blur-sm transition-opacity duration-220 ${
          sliding ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`absolute inset-0 hidden lg:block bg-slate-950/85 transition-opacity duration-220 ${
          sliding ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />

      {/* 좌측 와이드 갤러리 (lg 이상에서만) */}
      {influencer && (
        <div className="hidden lg:flex absolute inset-y-0 left-0 right-[560px] flex-col min-h-0">
          <InfluencerMediaGallery
            influencer={influencer}
            visible={sliding}
            onPostClick={setActivePost}
            onClose={onClose}
          />
        </div>
      )}

      {/* 패널 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="인플루언서 상세"
        className={`absolute top-0 right-0 h-full w-full sm:w-[480px] lg:w-[560px] bg-white shadow-xl flex flex-col transform transition-transform duration-220 ease-out ${
          sliding ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <span className="text-sm font-semibold text-slate-700">인플루언서 상세</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="닫기"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-5 space-y-4 animate-pulse">
              <div className="flex gap-4 items-start">
                <div className="w-20 h-20 rounded-full bg-slate-200 shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-5 w-32 bg-slate-200 rounded" />
                  <div className="h-4 w-24 bg-slate-100 rounded" />
                  <div className="h-4 w-16 bg-slate-100 rounded" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-14 rounded-xl bg-slate-100" />
                ))}
              </div>
              <div className="h-24 rounded-xl bg-slate-100" />
            </div>
          )}

          {error && (
            <div className="p-5 flex flex-col items-center justify-center gap-3 h-64">
              <p className="text-sm text-red-500">{error}</p>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                닫기
              </button>
            </div>
          )}

          {!loading && !error && influencer && (
            <div className="p-5 space-y-5">
              {/* 프로필 */}
              <div className="flex gap-4 items-start">
                <div className="shrink-0">
                  {(() => {
                    const src = resolveMediaUrl(
                      influencer.profile_image_url,
                      influencer.profile_image_path,
                    );
                    return src ? (
                      <Image
                        src={src}
                        alt={`@${influencer.username} 프로필`}
                        width={80}
                        height={80}
                        sizes="80px"
                        className="w-20 h-20 rounded-full object-cover border-2 border-slate-100"
                        unoptimized={shouldSkipOptimize(src)}
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-2xl font-bold text-slate-500">
                        {influencer.username[0]?.toUpperCase() ?? "?"}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex-1 min-w-0 space-y-1 pt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800">@{influencer.username}</span>
                    <GradeBadge grade={influencer.grade} size="md" />
                    <StatusBadge status={influencer.status} type="influencer" />
                  </div>
                  {influencer.display_name && (
                    <p className="text-sm text-slate-500">{influencer.display_name}</p>
                  )}
                  {influencer.category && (
                    <p className="text-xs text-slate-400">{influencer.category}</p>
                  )}
                  {influencer.profile_url && (
                    <a
                      href={influencer.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline"
                    >
                      프로필 보기 →
                    </a>
                  )}
                </div>
              </div>

              {/* 통계 */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "팔로워", value: formatNumber(influencer.follower_count) },
                  { label: "참여율", value: formatPct(influencer.engagement_rate) },
                  { label: "평균 좋아요", value: formatNumber(influencer.avg_likes) },
                  { label: "평균 댓글", value: formatNumber(influencer.avg_comments) },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="bg-slate-50 rounded-xl p-3 flex flex-col items-center gap-1"
                  >
                    <span className="text-sm font-semibold text-slate-800">{value}</span>
                    <span className="text-[10px] text-slate-400 text-center leading-tight">{label}</span>
                  </div>
                ))}
              </div>

              {/* 마케터 지표 — 사이즈 / 도달 / 품질 */}
              {(() => {
                const tier = getTier(influencer.follower_count);
                const reach = calcEstimatedReach(influencer.follower_count);
                const erDelta = calcErVsTierAverage(influencer.engagement_rate, influencer.follower_count);
                const ratio = calcLikeCommentRatio(influencer.avg_likes, influencer.avg_comments);
                const ratioStatus = ratio === null
                  ? null
                  : ratio < 50
                    ? { label: "댓글 활발", cls: "text-emerald-600" }
                    : ratio <= 200
                      ? { label: "정상", cls: "text-slate-500" }
                      : ratio <= 500
                        ? { label: "주의", cls: "text-amber-600" }
                        : { label: "봇 의심", cls: "text-rose-600" };
                return (
                  <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Sparkle size={12} weight="fill" className="text-violet-500" />
                      <span className="text-[11px] font-semibold text-violet-700">마케터 지표</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {/* 사이즈 티어 */}
                      <div className="bg-white rounded-xl p-2.5 flex flex-col gap-0.5">
                        <span className="text-[10px] text-slate-400">사이즈</span>
                        <span className="text-sm font-semibold text-slate-800">
                          {tier ? tier.shortLabel : "—"}
                          {tier && (
                            <span className="ml-1 text-[10px] font-normal text-slate-400">
                              ({tier.rangeLabel})
                            </span>
                          )}
                        </span>
                      </div>
                      {/* 예상 도달 */}
                      <div className="bg-white rounded-xl p-2.5 flex flex-col gap-0.5">
                        <span className="text-[10px] text-slate-400">
                          예상 도달 / 포스팅
                        </span>
                        <span className="text-sm font-semibold text-slate-800">
                          {reach > 0 ? `${formatNumber(reach)}명` : "—"}
                          {tier && (
                            <span className="ml-1 text-[10px] font-normal text-slate-400">
                              (×{(tier.reachRate * 100).toFixed(1)}%)
                            </span>
                          )}
                        </span>
                      </div>
                      {/* 사이즈 평균 대비 ER */}
                      <div className="bg-white rounded-xl p-2.5 flex flex-col gap-0.5">
                        <span className="text-[10px] text-slate-400">사이즈 평균 ER 대비</span>
                        {erDelta === null ? (
                          <span className="text-sm font-semibold text-slate-400">—</span>
                        ) : (
                          <span className={`text-sm font-semibold ${erDelta >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                            {erDelta >= 0 ? "▲ +" : "▼ "}{Math.round(erDelta)}%
                          </span>
                        )}
                      </div>
                      {/* 좋아요:댓글 비율 */}
                      <div className="bg-white rounded-xl p-2.5 flex flex-col gap-0.5">
                        <span className="text-[10px] text-slate-400">좋아요 : 댓글 비율</span>
                        {ratio === null || !ratioStatus ? (
                          <span className="text-sm font-semibold text-slate-400">—</span>
                        ) : (
                          <span className="text-sm font-semibold text-slate-800">
                            {ratio} : 1
                            <span className={`ml-1.5 text-[10px] font-medium ${ratioStatus.cls}`}>
                              {ratioStatus.label}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* bio */}
              {influencer.bio && (
                <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 rounded-xl px-4 py-3">
                  {influencer.bio}
                </p>
              )}

              {/* AI 인사이트 */}
              {(influencer.ai_summary || influencer.ai_insights) && (
                <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Robot size={14} className="text-violet-500" weight="bold" />
                    <span className="text-xs font-semibold text-slate-600">AI 인사이트</span>
                  </div>
                  {influencer.ai_summary && (
                    <p className="text-sm font-medium text-slate-700 leading-relaxed">
                      {influencer.ai_summary}
                    </p>
                  )}
                  {influencer.ai_insights && (
                    <div className="space-y-2">
                      {influencer.ai_insights.persona && (
                        <InsightRow label="페르소나" value={influencer.ai_insights.persona} />
                      )}
                      {influencer.ai_insights.approach && (
                        <InsightRow label="추천 어프로치" value={influencer.ai_insights.approach} />
                      )}
                      {influencer.ai_insights.fake_signal && (
                        <InsightRow
                          label="가짜 팔로워 신호"
                          value={influencer.ai_insights.fake_signal}
                          accent="red"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 최근 게시물 — lg 미만 전용. 데스크탑은 좌측 갤러리가 대체 */}
              {influencer.recent_posts.length > 0 && (
                <div className="space-y-2 lg:hidden">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    최근 게시물
                  </h4>
                  <div className="grid grid-cols-4 gap-1.5">
                    {influencer.recent_posts.slice(0, 8).map((post) => (
                      <a
                        key={post.id}
                        href={post.post_url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 group block"
                      >
                        <PostThumbnail
                          url={post.thumbnail_url}
                          path={post.thumbnail_path}
                          alt="게시물 썸네일"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-end justify-center pb-1.5 gap-2 opacity-0 group-hover:opacity-100">
                          {post.likes !== null && (
                            <span className="text-white text-[10px] font-medium">
                              ♥ {formatNumber(post.likes)}
                            </span>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* 캠페인 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    캠페인
                  </h4>
                  <button
                    onClick={() => setShowAddCampaign(true)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  >
                    <Plus size={13} weight="bold" />
                    캠페인 추가
                  </button>
                </div>

                {showAddCampaign && (
                  <AddCampaignForm
                    influencerId={influencer.id}
                    onSaved={(c) => {
                      setCampaigns((prev) => [c, ...prev]);
                      setShowAddCampaign(false);
                    }}
                    onCancel={() => setShowAddCampaign(false)}
                  />
                )}

                {campaigns.length === 0 && !showAddCampaign && (
                  <p className="text-xs text-slate-400 py-2">등록된 캠페인이 없습니다.</p>
                )}

                <div className="space-y-2">
                  {campaigns.map((c) => (
                    editingCampaignId === c.id ? (
                      <EditCampaignForm
                        key={c.id}
                        campaign={c}
                        onSaved={(updated) => {
                          setCampaigns((prev) => prev.map((x) => x.id === updated.id ? updated : x));
                          setEditingCampaignId(null);
                        }}
                        onCancel={() => setEditingCampaignId(null)}
                      />
                    ) : (
                      <div
                        key={c.id}
                        className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-100"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium text-slate-700 leading-tight">
                            {c.campaign_name}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => setEditingCampaignId(c.id)}
                              className="p-1 rounded text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                              aria-label="캠페인 수정"
                            >
                              <PencilSimple size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteCampaign(c.id)}
                              className="p-1 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                              aria-label="캠페인 삭제"
                            >
                              <Trash size={13} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            value={c.status}
                            onChange={(e) => handleStatusChange(c.id, e.target.value as CampaignStatus)}
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                            aria-label="캠페인 상태"
                          >
                            {CAMPAIGN_STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <StatusBadge status={c.status} type="campaign" />
                        </div>
                        <div className="flex gap-3 text-[11px] text-slate-400 flex-wrap">
                          {c.product_name && <span>제품: {c.product_name}</span>}
                          {c.cost !== null && <span>비용: {c.cost.toLocaleString()}원</span>}
                        </div>
                        <div className="flex gap-3 text-[11px] flex-wrap">
                          {c.contact_date && <span className="text-slate-400">연락: {c.contact_date}</span>}
                          {c.contract_date && (
                            <span className="flex items-center gap-1 text-rose-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" />
                              계약: {c.contract_date}
                            </span>
                          )}
                          {c.ship_date && <span className="text-slate-400">발송: {c.ship_date}</span>}
                          {c.content_deadline && (
                            <span className="flex items-center gap-1 text-orange-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
                              마감: {c.content_deadline}
                            </span>
                          )}
                          {c.expected_post_date && <span className="text-slate-400">포스팅: {c.expected_post_date}</span>}
                        </div>
                        {c.notes && (
                          <p className="text-xs text-slate-500 leading-relaxed">{c.notes}</p>
                        )}
                      </div>
                    )
                  ))}
                </div>
              </div>

              {/* 메모 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <NotePencil size={13} className="text-slate-400" />
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">메모</h4>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder="인플루언서에 대한 메모를 입력하세요…"
                  rows={3}
                  className="w-full text-sm px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none text-slate-700 placeholder:text-slate-300 transition-colors"
                />
              </div>

              {/* 태그 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Tag size={13} className="text-slate-400" />
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">태그</h4>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-0.5 text-blue-400 hover:text-blue-700 transition-colors"
                        aria-label={`${tag} 태그 삭제`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }}
                    placeholder="태그 입력 후 Enter"
                    className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700 placeholder:text-slate-300 transition-colors"
                  />
                  <button
                    onClick={handleAddTag}
                    className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    추가
                  </button>
                </div>
              </div>

              {/* 하단 여백 */}
              <div className="h-2" />
            </div>
          )}
        </div>

        {/* 하단 액션 바 */}
        {influencer && (
          <div className="shrink-0 px-5 py-4 border-t border-slate-100 flex gap-2">
            <ActionButton
              onClick={handleResync}
              loading={actionLoading === "resync"}
              icon={<ArrowsClockwise size={14} weight="bold" />}
              label="재동기화"
            />
            <ActionButton
              onClick={handleAnalyze}
              loading={actionLoading === "analyze"}
              icon={<Sparkle size={14} weight="bold" />}
              label="AI 재분석"
            />
            <ActionButton
              onClick={handleArchive}
              loading={actionLoading === "archive"}
              icon={<Archive size={14} weight="bold" />}
              label="보관"
              variant="danger"
            />
          </div>
        )}
      </div>

      {/* 라이트박스 */}
      {activePost && influencer && (
        <PostLightbox
          post={activePost}
          influencer={influencer}
          campaigns={campaigns.filter((c) => c.status !== "done")}
          onClose={() => setActivePost(null)}
          onCampaignLinked={(updated) => {
            setCampaigns((prev) =>
              prev.map((c) => (c.id === updated.id ? updated : c)),
            );
            setActivePost(null);
          }}
        />
      )}
    </div>
  );
}

// ── 보조 컴포넌트 ──────────────────────────────────────────────
function InsightRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "red";
}) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="shrink-0 text-slate-400 w-24">{label}</span>
      <span className={`text-slate-600 ${accent === "red" ? "text-red-500" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function ActionButton({
  onClick,
  loading,
  icon,
  label,
  variant,
}: {
  onClick: () => void;
  loading: boolean;
  icon: React.ReactNode;
  label: string;
  variant?: "danger";
}) {
  const base =
    "flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl transition-colors disabled:opacity-50";
  const styles =
    variant === "danger"
      ? "bg-red-50 text-red-600 hover:bg-red-100"
      : "bg-slate-100 text-slate-600 hover:bg-slate-200";

  return (
    <button onClick={onClick} disabled={loading} className={`${base} ${styles}`}>
      {loading ? (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        icon
      )}
      {label}
    </button>
  );
}
