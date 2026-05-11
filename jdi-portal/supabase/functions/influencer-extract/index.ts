// supabase/functions/influencer-extract/index.ts
// 인스타그램 프로필 Apify 추출 → influencers / influencer_posts / influencer_sync_logs 저장

import { createClient } from "jsr:@supabase/supabase-js@2";

// ============================================================
// 환경 변수
// ============================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APIFY_API_TOKEN = Deno.env.get("APIFY_API_TOKEN") ?? "";

if (!APIFY_API_TOKEN) {
  console.error("APIFY_API_TOKEN missing — scraping will fail");
}

// ============================================================
// 타입
// ============================================================
interface ApifyPost {
  url?: string;
  shortCode?: string;
  displayUrl?: string;
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  timestamp?: string;
  type?: "Image" | "Video" | "Sidecar";
  productType?: "clips" | "feed" | "igtv";
  videoUrl?: string;
  videoViewCount?: number;
  hashtags?: string[];
  childPosts?: Array<{ displayUrl?: string }>;
}

// ⚠️ 동일 정규식이 src/lib/influencer/post-utils.ts에도 존재 — 양쪽 동기 유지 필수
const SPONSORED_RE =
  /(\[?\s*AD\s*\]?|광고|협찬|유료\s*광고|sponsored|#광고|#협찬|#ad\b|#sponsored)/i;

function detectSponsored(caption: string | null | undefined): boolean {
  if (!caption) return false;
  return SPONSORED_RE.test(caption);
}

function extractHashtags(caption: string | null | undefined): string[] {
  if (!caption) return [];
  return Array.from(caption.matchAll(/#([\w가-힣]+)/g)).map((m) => m[1]);
}

function mapPostType(
  t: ApifyPost["type"],
): "image" | "video" | "carousel" | null {
  if (t === "Sidecar") return "carousel";
  if (t === "Video") return "video";
  if (t === "Image") return "image";
  return null;
}

interface ApifyProfileResult {
  username?: string;
  fullName?: string;
  biography?: string;
  profilePicUrl?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  latestPosts?: ApifyPost[];
}

interface ExtractRequest {
  profile_url: string;
  created_by?: string;
}

interface ExtractResponse {
  influencer_id: string;
  grade: string;
  engagement_rate: number;
  follower_count: number;
}

// ============================================================
// 유틸: URL → username 추출
// ============================================================
function extractUsername(profileUrl: string): string | null {
  // https://www.instagram.com/username/ 또는 instagram.com/username
  const match = profileUrl.match(/instagram\.com\/([\w.\-_]+)/);
  if (!match) return null;
  // 쿼리스트링·슬래시 제거
  return match[1].split("?")[0].replace(/\/$/, "");
}

// ============================================================
// Apify Actor 동기 호출
// ============================================================
interface ScrapeResult {
  profile: ApifyProfileResult;   // latestPosts는 ER/평균 계산 baseline (12개)
  galleryPosts: ApifyPost[];     // 갤러리용 합산 (게시물 30 + 릴스 30, 중복 제거)
}

async function scrapeInstagramProfile(
  username: string,
): Promise<ScrapeResult> {
  // 3개 액터 병렬 호출:
  //   1) profile-scraper → 프로필 메타(팔로워/bio/avg_likes 계산 기준)
  //   2) instagram-scraper (posts URL)  → 게시물 탭 30개
  //   3) instagram-scraper (reels URL)  → 릴스 탭 30개
  // ER/평균/등급은 (1)의 12개를 기준으로 계산해야 마케팅 표준에 부합.
  const profileUrl =
    `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`;
  const scraperUrl =
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`;

  const [profileRes, postsRes, reelsRes] = await Promise.all([
    fetch(profileUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernames: [username],
        resultsLimit: 12,
        resultsType: "posts",
      }),
    }),
    fetch(scraperUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directUrls: [`https://www.instagram.com/${username}/`],
        resultsLimit: 30,
        resultsType: "posts",
        searchType: "user",
        addParentData: false,
      }),
    }),
    fetch(scraperUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directUrls: [`https://www.instagram.com/${username}/reels/`],
        resultsLimit: 30,
        resultsType: "posts",
        searchType: "user",
        addParentData: false,
      }),
    }),
  ]);

  if (!profileRes.ok) {
    const text = await profileRes.text();
    throw new Error(`Apify profile error ${profileRes.status}: ${text}`);
  }
  const profileData = await profileRes.json() as ApifyProfileResult[];
  if (!profileData || profileData.length === 0) {
    throw new Error(`Apify profile empty for @${username}`);
  }
  const profile = profileData[0];

  // 게시물 / 릴스 호출 결과 (실패해도 진행)
  async function safeJson(res: Response): Promise<ApifyPost[]> {
    if (!res.ok) return [];
    try {
      return await res.json() as ApifyPost[];
    } catch {
      return [];
    }
  }
  const [postsList, reelsList] = await Promise.all([
    safeJson(postsRes),
    safeJson(reelsRes),
  ]);

  // ⚠️ reels 호출 결과를 강제로 clips로 마킹하지 않음.
  // Apify 응답의 type/productType을 그대로 신뢰해야 게시물/릴스가 올바르게 분류됨.
  // 합치고 shortCode/url 기준 중복 제거 (posts를 먼저 — 다른 거 같은 게시물이면 posts 응답 형식을 우선)
  const merged: ApifyPost[] = [];
  const seen = new Set<string>();
  for (const p of [...postsList, ...reelsList]) {
    const key = p.shortCode ?? p.url ?? "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(p);
  }

  console.log(
    `[scrape] @${username} — posts:${postsList.length} reels:${reelsList.length} merged:${merged.length}`,
  );

  return { profile, galleryPosts: merged };
}

// ============================================================
// 등급 계산 (팔로워 사이즈별 — 2025 업계 벤치마크)
// 같은 ER이라도 팔로워가 적을수록 평균이 높기 때문에 사이즈별로 임계값 다름
// ============================================================
function calcGrade(er: number, followerCount: number): string {
  // 나노 (~1만)
  if (followerCount < 10_000) {
    if (er >= 6) return "S";
    if (er >= 3) return "A";
    if (er >= 1) return "B";
    return "C";
  }
  // 마이크로 (1만~5만)
  if (followerCount < 50_000) {
    if (er >= 4) return "S";
    if (er >= 2) return "A";
    if (er >= 0.8) return "B";
    return "C";
  }
  // 미드 (5만~50만)
  if (followerCount < 500_000) {
    if (er >= 2.5) return "S";
    if (er >= 1.5) return "A";
    if (er >= 0.5) return "B";
    return "C";
  }
  // 매크로 (50만~100만)
  if (followerCount < 1_000_000) {
    if (er >= 1.5) return "S";
    if (er >= 0.8) return "A";
    if (er >= 0.3) return "B";
    return "C";
  }
  // 메가 (100만+)
  if (er >= 1.0) return "S";
  if (er >= 0.5) return "A";
  if (er >= 0.2) return "B";
  return "C";
}

// ============================================================
// HTTP 진입점
// ============================================================
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  // Supabase Auth JWT 검증 (호출자 인증 확인)
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response("unauthorized", { status: 401 });
  }
  const userJwt = authHeader.slice(7);

  // 호출자 JWT로 클라이언트 생성 → created_by = auth.uid() RLS 자동 충족
  const supabaseUser = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });

  // service_role 클라이언트 (posts/logs 같이 RLS 우회 필요한 작업용)
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 호출자 uid 확인
  const {
    data: { user },
    error: authError,
  } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: ExtractRequest;
  try {
    body = await req.json() as ExtractRequest;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  if (!body.profile_url) {
    return new Response("profile_url required", { status: 400 });
  }

  const username = extractUsername(body.profile_url);
  if (!username) {
    return new Response("invalid instagram profile_url", { status: 400 });
  }

  let influencerId: string | null = null;

  try {
    // 1. Apify 스크래핑 (profile + 게시물 + 릴스 병렬)
    const { profile, galleryPosts } = await scrapeInstagramProfile(username);

    const followerCount = profile.followersCount ?? 0;
    const followingCount = profile.followsCount ?? 0;
    const postCount = profile.postsCount ?? 0;
    // ER/평균/등급 계산용 baseline (최근 12개) — 마케팅 표준
    const posts = profile.latestPosts ?? [];
    // DB에 저장할 게시물 (갤러리용, 최대 60개 합산)
    const persistedPosts: ApifyPost[] =
      galleryPosts.length > 0 ? galleryPosts : posts;

    // 2. 평균 likes·comments 계산
    const avgLikes = posts.length > 0
      ? posts.reduce((s, p) => s + (p.likesCount ?? 0), 0) / posts.length
      : 0;
    const avgComments = posts.length > 0
      ? posts.reduce((s, p) => s + (p.commentsCount ?? 0), 0) / posts.length
      : 0;

    // 3. ER = (avg_likes + avg_comments) / follower_count × 100
    const engagementRate = followerCount > 0
      ? ((avgLikes + avgComments) / followerCount) * 100
      : 0;

    // 4. 등급
    const grade = calcGrade(engagementRate, followerCount);

    const createdBy = body.created_by ?? user.id;

    // 5. influencers upsert
    const { data: influencerRow, error: upsertError } = await supabaseAdmin
      .from("influencers")
      .upsert(
        {
          created_by: createdBy,
          platform: "instagram",
          username,
          profile_url: body.profile_url,
          display_name: profile.fullName ?? null,
          bio: profile.biography ?? null,
          profile_image_url: profile.profilePicUrl ?? null,
          follower_count: followerCount,
          following_count: followingCount,
          post_count: postCount,
          avg_likes: avgLikes,
          avg_comments: avgComments,
          engagement_rate: engagementRate,
          grade,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "platform,username" },
      )
      .select("id")
      .single();

    if (upsertError || !influencerRow) {
      throw new Error(`influencers upsert failed: ${upsertError?.message}`);
    }

    influencerId = influencerRow.id as string;

    // 6. influencer_posts: 기존 삭제 후 재삽입
    await supabaseAdmin
      .from("influencer_posts")
      .delete()
      .eq("influencer_id", influencerId);

    if (persistedPosts.length > 0) {
      const postRows = persistedPosts.map((p) => {
        const apifyHashtags = (p.hashtags ?? []).filter((h): h is string =>
          typeof h === "string" && h.length > 0
        );
        const hashtags = apifyHashtags.length > 0
          ? apifyHashtags
          : extractHashtags(p.caption);
        const children = (p.childPosts ?? [])
          .map((c) => c.displayUrl)
          .filter((u): u is string => typeof u === "string" && u.length > 0);
        return {
          influencer_id: influencerId,
          post_url: p.url ?? (p.shortCode
            ? `https://www.instagram.com/p/${p.shortCode}/`
            : null),
          thumbnail_url: p.displayUrl ?? null,
          caption: p.caption ?? null,
          likes: p.likesCount ?? 0,
          comments: p.commentsCount ?? 0,
          posted_at: p.timestamp ?? null,
          post_type: mapPostType(p.type),
          product_type: p.productType ?? null,
          view_count: p.videoViewCount ?? null,
          is_sponsored: detectSponsored(p.caption),
          hashtags,
          child_thumbnails: children,
          video_url: p.videoUrl ?? null,
        };
      });

      const { error: postsError } = await supabaseAdmin
        .from("influencer_posts")
        .insert(postRows);

      if (postsError) {
        console.error("influencer_posts insert error:", postsError.message);
      }
    }

    // 7. sync_logs — 성공
    await supabaseAdmin.from("influencer_sync_logs").insert({
      influencer_id: influencerId,
      status: "success",
      raw_data: profile as unknown as Record<string, unknown>,
    });

    const result: ExtractResponse = {
      influencer_id: influencerId,
      grade,
      engagement_rate: Math.round(engagementRate * 100) / 100,
      follower_count: followerCount,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("influencer-extract error:", message);

    // sync_logs — 실패 (influencer_id 있을 때만)
    if (influencerId) {
      await supabaseAdmin.from("influencer_sync_logs").insert({
        influencer_id: influencerId,
        status: "failed",
        error_message: message,
      });
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
});
