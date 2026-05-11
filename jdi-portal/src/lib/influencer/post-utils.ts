// 인플루언서 게시물 분석 공용 유틸
// ⚠️ SPONSORED_RE 는 supabase/functions/influencer-extract/index.ts 와 동기 유지

import type { InfluencerPost } from "./types";

const SPONSORED_RE =
  /(\[?\s*AD\s*\]?|광고|협찬|유료\s*광고|sponsored|#광고|#협찬|#ad\b|#sponsored)/i;

export function detectSponsored(caption: string | null | undefined): boolean {
  if (!caption) return false;
  return SPONSORED_RE.test(caption);
}

export function extractHashtags(caption: string | null | undefined): string[] {
  if (!caption) return [];
  return Array.from(caption.matchAll(/#([\w가-힣]+)/g)).map((m) => m[1]);
}

export function calcPostER(
  post: Pick<InfluencerPost, "likes" | "comments">,
  followerCount: number | null,
): number | null {
  if (!followerCount || followerCount <= 0) return null;
  const likes = post.likes ?? 0;
  const comments = post.comments ?? 0;
  return ((likes + comments) / followerCount) * 100;
}

export function isBestPost(
  post: Pick<InfluencerPost, "likes">,
  avgLikes: number | null,
): boolean {
  if (!avgLikes || avgLikes <= 0 || post.likes === null) return false;
  return post.likes >= avgLikes * 1.5;
}

// 갤러리 탭 분류
// 게시물 탭: post_type !== 'video' && product_type !== 'clips' (NULL 데이터는 게시물로 간주)
// 릴스 탭: product_type === 'clips' || post_type === 'video'
export function isReel(
  post: Pick<InfluencerPost, "post_type" | "product_type">,
): boolean {
  return post.product_type === "clips" || post.post_type === "video";
}
