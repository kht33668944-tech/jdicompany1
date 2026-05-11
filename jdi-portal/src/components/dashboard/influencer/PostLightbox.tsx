"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import ModalContainer from "@/components/shared/ModalContainer";
import { resolveMediaUrl } from "@/lib/influencer/proxy";
import { calcPostER, extractHashtags, isBestPost } from "@/lib/influencer/post-utils";
import type {
  Influencer,
  InfluencerCampaign,
  InfluencerPost,
} from "@/lib/influencer/types";
import LinkPostToCampaignDialog from "./LinkPostToCampaignDialog";

import CaretLeft from "phosphor-react/dist/icons/CaretLeft.esm.js";
import CaretRight from "phosphor-react/dist/icons/CaretRight.esm.js";
import Heart from "phosphor-react/dist/icons/Heart.esm.js";
import ChatCircle from "phosphor-react/dist/icons/ChatCircle.esm.js";
import Play from "phosphor-react/dist/icons/Play.esm.js";
import ArrowSquareOut from "phosphor-react/dist/icons/ArrowSquareOut.esm.js";
import PushPin from "phosphor-react/dist/icons/PushPin.esm.js";
import Fire from "phosphor-react/dist/icons/Fire.esm.js";
import Megaphone from "phosphor-react/dist/icons/Megaphone.esm.js";

interface Props {
  post: InfluencerPost;
  influencer: Pick<
    Influencer,
    | "username"
    | "profile_image_url"
    | "profile_image_path"
    | "follower_count"
    | "avg_likes"
  >;
  campaigns: InfluencerCampaign[];
  onClose: () => void;
  onCampaignLinked: (updated: InfluencerCampaign) => void;
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return String(Math.round(n));
}

export default function PostLightbox({
  post,
  influencer,
  campaigns,
  onClose,
  onCampaignLinked,
}: Props) {
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  // 캐러셀: child_thumbnails(url)와 child_thumbnail_paths(storage)를 zip해서
  // 각 슬라이드별로 storage 우선 + url fallback이 동작하도록 구성
  const carouselSlides = useMemo<Array<{ url: string | null; path: string | null }>>(() => {
    const urls = post.child_thumbnails ?? [];
    const paths = post.child_thumbnail_paths ?? [];
    if (urls.length > 0) {
      return urls.map((u, i) => ({ url: u, path: paths[i] ?? null }));
    }
    return post.thumbnail_url || post.thumbnail_path
      ? [{ url: post.thumbnail_url, path: post.thumbnail_path }]
      : [];
  }, [
    post.child_thumbnails,
    post.child_thumbnail_paths,
    post.thumbnail_url,
    post.thumbnail_path,
  ]);
  const carouselImages = carouselSlides;

  const isCarousel = post.post_type === "carousel" && carouselImages.length > 1;
  const isVideo = post.post_type === "video";

  const hashtags = useMemo(() => {
    if (post.hashtags && post.hashtags.length > 0) return post.hashtags;
    return extractHashtags(post.caption);
  }, [post.hashtags, post.caption]);

  const er = calcPostER(post, influencer.follower_count);
  const best = isBestPost(post, influencer.avg_likes);

  // 캐러셀 키보드 네비
  useEffect(() => {
    if (!isCarousel) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setCarouselIdx((i) => (i - 1 + carouselImages.length) % carouselImages.length);
      } else if (e.key === "ArrowRight") {
        setCarouselIdx((i) => (i + 1) % carouselImages.length);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isCarousel, carouselImages.length]);

  const showVideoInline = isVideo && post.video_url && !videoFailed;
  const currentImageUrl = (() => {
    if (isCarousel) {
      const slide = carouselImages[carouselIdx];
      return slide ? resolveMediaUrl(slide.url, slide.path) : null;
    }
    return resolveMediaUrl(post.thumbnail_url, post.thumbnail_path);
  })();
  const posterUrl = resolveMediaUrl(post.thumbnail_url, post.thumbnail_path);

  return (
    <>
      <ModalContainer onClose={onClose} maxWidth="max-w-6xl" className="!p-0 overflow-hidden">
        <div className="flex flex-col lg:flex-row bg-white rounded-2xl overflow-hidden">
          {/* 좌측: 미디어 */}
          <div className="relative bg-slate-900 flex items-center justify-center lg:w-3/5 aspect-[4/5] lg:aspect-auto lg:max-h-[80vh]">
            {showVideoInline ? (
              <video
                src={post.video_url ?? undefined}
                controls
                autoPlay
                muted
                playsInline
                preload="metadata"
                onError={() => setVideoFailed(true)}
                className="max-w-full max-h-full"
                poster={posterUrl ?? undefined}
              />
            ) : currentImageUrl ? (
              <Image
                src={currentImageUrl}
                alt="게시물 미리보기"
                fill
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-contain"
                priority
                unoptimized={currentImageUrl.startsWith("/api/")}
              />
            ) : (
              <div className="text-slate-400 text-sm">이미지를 불러올 수 없습니다.</div>
            )}

            {/* 비디오 실패 fallback 안내 */}
            {isVideo && videoFailed && (
              <div className="absolute bottom-3 left-3 right-3 bg-amber-50/95 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2">
                동영상을 재생할 수 없습니다. 인스타그램에서 확인해 주세요.
              </div>
            )}

            {/* 캐러셀 네비게이션 */}
            {isCarousel && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setCarouselIdx(
                      (i) => (i - 1 + carouselImages.length) % carouselImages.length,
                    )
                  }
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 hover:bg-white text-slate-700 shadow"
                  aria-label="이전 이미지"
                >
                  <CaretLeft size={18} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={() => setCarouselIdx((i) => (i + 1) % carouselImages.length)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 hover:bg-white text-slate-700 shadow"
                  aria-label="다음 이미지"
                >
                  <CaretRight size={18} weight="bold" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                  {carouselIdx + 1} / {carouselImages.length}
                </div>
              </>
            )}
          </div>

          {/* 우측: 메타 */}
          <div className="lg:w-2/5 flex flex-col max-h-[80vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
              {(() => {
                const src = resolveMediaUrl(
                  influencer.profile_image_url,
                  influencer.profile_image_path,
                );
                return src ? (
                  <Image
                    src={src}
                    alt={`@${influencer.username}`}
                    width={36}
                    height={36}
                    sizes="36px"
                    className="w-9 h-9 rounded-full object-cover"
                    unoptimized={src.startsWith("/api/")}
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-slate-200" />
                );
              })()}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">
                  @{influencer.username}
                </div>
                <div className="text-[11px] text-slate-400">
                  {post.posted_at
                    ? new Date(post.posted_at).toLocaleDateString("ko-KR")
                    : "—"}
                </div>
              </div>
              <div className="flex flex-wrap gap-1 justify-end">
                {best && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600 text-[10px] font-semibold">
                    <Fire size={10} weight="fill" /> 베스트
                  </span>
                )}
                {post.is_sponsored && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-semibold">
                    <Megaphone size={10} weight="fill" /> 광고
                  </span>
                )}
              </div>
            </div>

            <div className="px-5 py-4 space-y-4 flex-1">
              {/* 통계 */}
              <div className="grid grid-cols-3 gap-2">
                <Stat
                  icon={<Heart size={12} weight="fill" className="text-rose-400" />}
                  value={formatNumber(post.likes)}
                  label="좋아요"
                />
                <Stat
                  icon={<ChatCircle size={12} weight="fill" className="text-slate-400" />}
                  value={formatNumber(post.comments)}
                  label="댓글"
                />
                {isVideo || post.view_count !== null ? (
                  <Stat
                    icon={<Play size={12} weight="fill" className="text-violet-500" />}
                    value={formatNumber(post.view_count)}
                    label="조회수"
                  />
                ) : (
                  <Stat
                    icon={<span className="text-violet-500 text-[10px] font-bold">ER</span>}
                    value={er === null ? "—" : `${er.toFixed(2)}%`}
                    label="참여율"
                  />
                )}
              </div>

              {/* ER (비디오 케이스에선 별도 줄) */}
              {(isVideo || post.view_count !== null) && er !== null && (
                <div className="text-xs text-slate-500">
                  <span className="text-slate-400">참여율(ER):</span>{" "}
                  <span className="font-semibold text-slate-700">{er.toFixed(2)}%</span>
                </div>
              )}

              {/* 캡션 */}
              {post.caption && (
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed break-words">
                  {post.caption}
                </p>
              )}

              {/* 해시태그 */}
              {hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* 외부 링크 */}
              {post.post_url && (
                <a
                  href={post.post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  인스타그램에서 보기
                  <ArrowSquareOut size={12} weight="bold" />
                </a>
              )}
            </div>

            {/* 하단 액션 바 */}
            <div className="px-5 py-4 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={() => setLinkOpen(true)}
                disabled={!post.post_url || campaigns.length === 0}
                className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                title={
                  campaigns.length === 0
                    ? "진행 중인 캠페인이 없습니다."
                    : "이 게시물을 진행 중 캠페인의 결과로 등록"
                }
              >
                <PushPin size={14} weight="bold" />
                캠페인 결과로 등록
              </button>
              {campaigns.length === 0 && (
                <p className="text-[11px] text-slate-400 text-center mt-1.5">
                  연결할 수 있는 진행 중 캠페인이 없습니다.
                </p>
              )}
            </div>
          </div>
        </div>
      </ModalContainer>

      {linkOpen && (
        <LinkPostToCampaignDialog
          post={post}
          campaigns={campaigns}
          onCancel={() => setLinkOpen(false)}
          onSuccess={(updated) => {
            setLinkOpen(false);
            onCampaignLinked(updated);
          }}
        />
      )}
    </>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-2.5 flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1">
        {icon}
        <span className="text-sm font-semibold text-slate-800">{value}</span>
      </div>
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  );
}
