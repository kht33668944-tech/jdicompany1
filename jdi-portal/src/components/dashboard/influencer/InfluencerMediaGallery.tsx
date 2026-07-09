"use client";

import { useMemo, useState } from "react";
import type {
  InfluencerPost,
  InfluencerWithPosts,
} from "@/lib/influencer/types";
import NextImage from "next/image";
import { resolveMediaUrl, shouldSkipOptimize } from "@/lib/influencer/proxy";
import { calcPostER, isBestPost, isReel } from "@/lib/influencer/post-utils";

import FilmStrip from "phosphor-react/dist/icons/FilmStrip.esm.js";
import Play from "phosphor-react/dist/icons/Play.esm.js";
import Stack from "phosphor-react/dist/icons/Stack.esm.js";
import Fire from "phosphor-react/dist/icons/Fire.esm.js";
import Megaphone from "phosphor-react/dist/icons/Megaphone.esm.js";
import Heart from "phosphor-react/dist/icons/Heart.esm.js";
import ChatCircle from "phosphor-react/dist/icons/ChatCircle.esm.js";
import Eye from "phosphor-react/dist/icons/Eye.esm.js";
import ImageIcon from "phosphor-react/dist/icons/Image.esm.js";

type MediaFilter = "all" | "photo" | "reel";
type Sort = "recent" | "er" | "likes" | "views";

interface Filters {
  hideSponsored: boolean;
  onlyBest: boolean;
  onlySponsored: boolean;
}

interface Props {
  influencer: InfluencerWithPosts;
  visible: boolean;
  onPostClick: (post: InfluencerPost) => void;
  onClose: () => void;
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return String(Math.round(n));
}

export default function InfluencerMediaGallery({
  influencer,
  visible,
  onPostClick,
  onClose,
}: Props) {
  const [media, setMedia] = useState<MediaFilter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [filters, setFilters] = useState<Filters>({
    hideSponsored: false,
    onlyBest: false,
    onlySponsored: false,
  });

  const allPosts = useMemo(() => influencer.recent_posts ?? [], [influencer.recent_posts]);

  const visiblePosts = useMemo(() => {
    let list = allPosts;
    if (media === "reel") list = list.filter((p) => isReel(p));
    else if (media === "photo") list = list.filter((p) => !isReel(p));

    if (filters.hideSponsored) list = list.filter((p) => !p.is_sponsored);
    if (filters.onlySponsored) list = list.filter((p) => p.is_sponsored);
    if (filters.onlyBest) {
      list = list.filter((p) => isBestPost(p, influencer.avg_likes));
    }

    const followers = influencer.follower_count;
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "er": {
          const ea = calcPostER(a, followers) ?? -1;
          const eb = calcPostER(b, followers) ?? -1;
          return eb - ea;
        }
        case "likes":
          return (b.likes ?? 0) - (a.likes ?? 0);
        case "views":
          return (b.view_count ?? 0) - (a.view_count ?? 0);
        case "recent":
        default: {
          const ta = a.posted_at ? new Date(a.posted_at).getTime() : 0;
          const tb = b.posted_at ? new Date(b.posted_at).getTime() : 0;
          return tb - ta;
        }
      }
    });
    return list;
  }, [
    allPosts,
    media,
    sort,
    filters.hideSponsored,
    filters.onlySponsored,
    filters.onlyBest,
    influencer.avg_likes,
    influencer.follower_count,
  ]);

  return (
    <div
      className={`flex-1 flex flex-col min-h-0 min-w-0 transition-opacity duration-220 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      onClick={(e) => {
        // 격자 셀 또는 컨트롤이 아닌 빈 영역 클릭 시 닫기
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* 헤더 */}
      <div className="px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-white text-sm font-semibold truncate">
            @{influencer.username}
          </h2>
          <span className="text-xs text-slate-400">
            게시물 {allPosts.length}개
          </span>
        </div>
        <span className="text-[11px] text-slate-400 hidden xl:inline">
          ESC 또는 바깥 클릭 시 닫기
        </span>
      </div>

      {/* 정렬 / 필터 바 */}
      <div className="px-6 py-3 flex items-center gap-2 flex-wrap shrink-0 border-b border-white/10">
        <label className="text-[11px] text-slate-300 mr-1">정렬</label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="text-xs px-2 py-1 rounded-lg bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 [&>option]:bg-slate-900 [&>option]:text-white"
          aria-label="정렬"
        >
          <option value="recent">최신순</option>
          <option value="er">참여율 높은순</option>
          <option value="likes">좋아요 많은순</option>
          <option value="views">조회수 많은순</option>
        </select>

        <span className="w-px h-4 bg-white/10 mx-1" />

        <FilterChip
          active={media === "all"}
          onClick={() => setMedia("all")}
          label="전체"
        />
        <FilterChip
          active={media === "photo"}
          onClick={() => setMedia("photo")}
          icon={<ImageIcon size={11} weight="fill" />}
          label="사진"
        />
        <FilterChip
          active={media === "reel"}
          onClick={() => setMedia("reel")}
          icon={<FilmStrip size={11} weight="fill" />}
          label="영상"
        />

        <span className="w-px h-4 bg-white/10 mx-1" />

        <FilterChip
          active={filters.onlyBest}
          onClick={() =>
            setFilters((f) => ({ ...f, onlyBest: !f.onlyBest }))
          }
          icon={<Fire size={11} weight="fill" />}
          label="베스트만"
        />
        <FilterChip
          active={filters.hideSponsored}
          onClick={() =>
            setFilters((f) => ({
              ...f,
              hideSponsored: !f.hideSponsored,
              onlySponsored: f.hideSponsored ? f.onlySponsored : false,
            }))
          }
          label="광고 제외"
        />
        <FilterChip
          active={filters.onlySponsored}
          onClick={() =>
            setFilters((f) => ({
              ...f,
              onlySponsored: !f.onlySponsored,
              hideSponsored: f.onlySponsored ? f.hideSponsored : false,
            }))
          }
          icon={<Megaphone size={11} weight="fill" />}
          label="광고만"
        />
      </div>

      {/* 격자 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visiblePosts.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-slate-400 text-sm">
            조건에 맞는 게시물이 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-3 xl:grid-cols-4 gap-1">
            {visiblePosts.map((post) => (
              <PostGridCell
                key={post.id}
                post={post}
                er={calcPostER(post, influencer.follower_count)}
                best={isBestPost(post, influencer.avg_likes)}
                onClick={() => onPostClick(post)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 셀 ──────────────────────────────────────────────────────────
function PostGridCell({
  post,
  er,
  best,
  onClick,
}: {
  post: InfluencerPost;
  er: number | null;
  best: boolean;
  onClick: () => void;
}) {
  const reel = isReel(post);
  const carousel = post.post_type === "carousel";
  const thumb = resolveMediaUrl(post.thumbnail_url, post.thumbnail_path);

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-square rounded-md overflow-hidden bg-slate-800 group focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label="게시물 자세히 보기"
    >
      {thumb ? (
        <NextImage
          src={thumb}
          alt={post.caption ? post.caption.slice(0, 80) : "게시물 썸네일"}
          fill
          sizes="(max-width: 1280px) 33vw, 25vw"
          className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          unoptimized={shouldSkipOptimize(thumb)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
          이미지 없음
        </div>
      )}

      {/* 좌상단: ER + 배지 */}
      <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 items-start">
        {er !== null && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/60 text-white">
            {er.toFixed(2)}%
          </span>
        )}
        {best && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-500/90 text-white">
            <Fire size={10} weight="fill" />
            베스트
          </span>
        )}
        {post.is_sponsored && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/90 text-white">
            <Megaphone size={10} weight="fill" />
            광고
          </span>
        )}
      </div>

      {/* 우상단: 타입 아이콘 */}
      <div className="absolute top-1.5 right-1.5">
        {reel && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-black/60 text-white">
            <Play size={10} weight="fill" />
          </span>
        )}
        {!reel && carousel && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-black/60 text-white">
            <Stack size={10} weight="fill" />
          </span>
        )}
      </div>

      {/* 좌하단: 릴스 조회수 */}
      {reel && post.view_count !== null && (
        <div className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-white drop-shadow">
          <Eye size={10} weight="fill" />
          {formatNumber(post.view_count)}
        </div>
      )}

      {/* 호버 오버레이 */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-150 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
        <span className="inline-flex items-center gap-1 text-white text-xs font-semibold">
          <Heart size={12} weight="fill" />
          {formatNumber(post.likes)}
        </span>
        <span className="inline-flex items-center gap-1 text-white text-xs font-semibold">
          <ChatCircle size={12} weight="fill" />
          {formatNumber(post.comments)}
        </span>
      </div>
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
        active
          ? "bg-blue-500 text-white"
          : "bg-white/10 text-slate-300 hover:bg-white/20"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
