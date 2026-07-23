// supabase/functions/influencer-extract/index.ts
// 인스타그램 프로필 Apify 추출 → influencers / influencer_posts / influencer_sync_logs 저장
//
// 미디어(프로필/썸네일) 다운로드는 응답 직후 EdgeRuntime.waitUntil로 백그라운드 처리 →
// 사용자 응답 시간에 영향 0. Storage 업로드 실패는 influencer_media_jobs.status='failed'에 기록.

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ============================================================
// 환경 변수
// ============================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APIFY_API_TOKEN = Deno.env.get("APIFY_API_TOKEN") ?? "";

const STORAGE_BUCKET = "influencer-media";
const MEDIA_FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MEDIA_FETCH_TIMEOUT_MS = 8_000; // 인스타 CDN 응답 안 오면 빠르게 포기

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
  // created_by는 더 이상 요청 본문에서 받지 않는다(위조 방지).
  // 등록자는 검증된 로그인 사용자(user.id)로 서버가 결정한다.
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
async function scrapeInstagramProfile(
  username: string,
): Promise<ApifyProfileResult> {
  // instagram-scraper details 모드 — 한 번에 프로필 메타 + 최근 게시물 24개.
  // directUrls + details가 검증된 조합 (usernames는 빈 응답 반환 사례 발견).
  const url =
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_API_TOKEN}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      directUrls: [`https://www.instagram.com/${username}/`],
      resultsType: "details",
      resultsLimit: 24,
      searchType: "user",
      addParentData: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify error ${res.status}: ${text}`);
  }

  // 응답이 ApifyProfileResult 형식이 아니라 게시물 배열일 수 있어 형식 감지 필요.
  // 첫 항목에 followersCount/biography 같은 프로필 필드가 있으면 ApifyProfileResult,
  // 없고 likesCount/timestamp 같은 게시물 필드뿐이면 ApifyPost[]로 간주하고 메타 구성.
  const raw = await res.json() as unknown[];
  if (!raw || raw.length === 0) {
    throw new Error(`Apify returned empty result for @${username}`);
  }

  const first = raw[0] as Record<string, unknown>;
  const looksLikeProfile =
    "followersCount" in first ||
    "biography" in first ||
    "latestPosts" in first ||
    "profilePicUrl" in first;

  if (looksLikeProfile) {
    const profile = first as unknown as ApifyProfileResult;
    console.log(
      `[scrape] @${username} (profile-shape) — posts:${profile.latestPosts?.length ?? 0}`,
    );
    return profile;
  }

  // 게시물 배열 형식 — 첫 게시물의 owner* 필드에서 메타를 복원하고
  // 전체 항목을 latestPosts로 사용.
  const posts = raw as unknown as ApifyPost[];
  const ownerFields = first as Record<string, unknown>;
  const constructedProfile: ApifyProfileResult = {
    username,
    fullName: (ownerFields.ownerFullName as string | undefined) ??
      (ownerFields.fullName as string | undefined),
    biography: undefined,
    profilePicUrl: (ownerFields.ownerProfilePicUrl as string | undefined) ??
      (ownerFields.profilePicUrl as string | undefined),
    followersCount: ownerFields.ownerFollowersCount as number | undefined,
    followsCount: undefined,
    postsCount: undefined,
    latestPosts: posts,
  };
  console.log(
    `[scrape] @${username} (posts-shape) — posts:${posts.length}, owner-meta-recovered`,
  );
  return constructedProfile;
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
// 미디어 백그라운드 다운로드 → Storage 업로드
//   - EdgeRuntime.waitUntil로 응답 후 비동기 실행 → 사용자 응답 시간 영향 0
//   - 실패 1건은 다른 건 처리에 영향 주지 않음 (개별 try/catch)
//   - 같은 path가 이미 있으면 upsert로 덮어쓰기 (재동기화 호환)
// ============================================================
type PostRow = {
  id: string;
  thumbnail_url: string | null;
  child_thumbnails: string[] | null;
};

function detectImageExt(contentType: string | null): string {
  if (!contentType) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

async function downloadImage(
  url: string,
): Promise<{ buf: ArrayBuffer; contentType: string } | null> {
  try {
    const ctl = new AbortController();
    const timeout = setTimeout(() => ctl.abort(), MEDIA_FETCH_TIMEOUT_MS);
    const r = await fetch(url, {
      headers: { "User-Agent": MEDIA_FETCH_UA, Accept: "image/*" },
      signal: ctl.signal,
    });
    clearTimeout(timeout);
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const contentType = r.headers.get("content-type") ?? "image/jpeg";
    return { buf, contentType };
  } catch {
    return null;
  }
}

async function uploadToStorage(
  admin: SupabaseClient,
  path: string,
  buf: ArrayBuffer,
  contentType: string,
): Promise<boolean> {
  const { error } = await admin.storage.from(STORAGE_BUCKET).upload(
    path,
    buf,
    { contentType, upsert: true, cacheControl: "31536000" },
  );
  if (error) {
    console.error(`[media] upload failed for ${path}:`, error.message);
    return false;
  }
  return true;
}

async function downloadAndStore(
  admin: SupabaseClient,
  url: string | null | undefined,
  pathPrefix: string,
): Promise<string | null> {
  if (!url) return null;
  const img = await downloadImage(url);
  if (!img) return null;
  const ext = detectImageExt(img.contentType);
  const path = `${pathPrefix}.${ext}`;
  const ok = await uploadToStorage(admin, path, img.buf, img.contentType);
  return ok ? path : null;
}

async function processMediaBackground(
  admin: SupabaseClient,
  jobId: string,
  influencerId: string,
  profileImageUrl: string | null,
  postRows: PostRow[],
): Promise<void> {
  // 1) 작업 시작 마크
  await admin.from("influencer_media_jobs").update({
    status: "running",
    attempts: 1,
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);

  let okCount = 0;
  let failCount = 0;

  try {
    // 2) 프로필 사진
    if (profileImageUrl) {
      const path = await downloadAndStore(
        admin,
        profileImageUrl,
        `profiles/${influencerId}`,
      );
      if (path) {
        await admin.from("influencers")
          .update({ profile_image_path: path })
          .eq("id", influencerId);
        okCount++;
      } else {
        failCount++;
      }
    }

    // 3) 게시물 썸네일 + 자식 (동시 6개씩 처리 — 인스타 rate-limit 방지)
    const CONCURRENCY = 6;
    for (let i = 0; i < postRows.length; i += CONCURRENCY) {
      const chunk = postRows.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(async (post) => {
        try {
          const thumbPath = await downloadAndStore(
            admin,
            post.thumbnail_url,
            `posts/${post.id}/thumb`,
          );

          const childrenPaths: string[] = [];
          const children = post.child_thumbnails ?? [];
          for (let n = 0; n < children.length; n++) {
            const cp = await downloadAndStore(
              admin,
              children[n],
              `posts/${post.id}/child_${n}`,
            );
            if (cp) childrenPaths.push(cp);
          }

          const patch: Record<string, unknown> = {};
          if (thumbPath) patch.thumbnail_path = thumbPath;
          if (childrenPaths.length > 0) {
            patch.child_thumbnail_paths = childrenPaths;
          }
          if (Object.keys(patch).length > 0) {
            await admin.from("influencer_posts")
              .update(patch)
              .eq("id", post.id);
            okCount++;
          } else {
            failCount++;
          }
        } catch (err) {
          failCount++;
          console.error(`[media] post ${post.id} failed:`, err);
        }
      }));
    }

    // 4) 작업 완료 마크
    await admin.from("influencer_media_jobs").update({
      status: "done",
      error_message: failCount > 0 ? `partial: ${failCount} failed` : null,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    console.log(
      `[media] influencer ${influencerId} done — ok=${okCount} fail=${failCount}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[media] influencer ${influencerId} fatal:`, message);
    await admin.from("influencer_media_jobs").update({
      status: "failed",
      error_message: message,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
  }
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

  // service_role 클라이언트 (posts/logs 같이 RLS 우회 필요한 작업용)
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 호출자 uid 확인: JWT를 실제 검증 (getUser가 auth 서버에 토큰 유효성 확인)
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(userJwt);
  if (authError || !user) {
    return new Response("unauthorized", { status: 401 });
  }

  // 승인된 사용자만 허용 (Apify 유료 호출 남용 방지)
  const { data: approvedRow } = await supabaseAdmin
    .from("profiles")
    .select("is_approved")
    .eq("id", user.id)
    .single();
  if (!approvedRow?.is_approved) {
    return new Response(
      JSON.stringify({ error: "forbidden: not an approved user" }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
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
    // 1. Apify 스크래핑 (단일 호출)
    const profile = await scrapeInstagramProfile(username);

    const followerCount = profile.followersCount ?? 0;
    const followingCount = profile.followsCount ?? 0;
    const postCount = profile.postsCount ?? 0;
    const posts = profile.latestPosts ?? [];

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

    // 등록자는 요청 본문의 입력값을 신뢰하지 않고,
    // 검증된 로그인 사용자 id로 서버가 결정한다.
    const createdBy = user.id;

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

    if (posts.length > 0) {
      const postRows = posts.map((p) => {
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

      const { data: insertedPosts, error: postsError } = await supabaseAdmin
        .from("influencer_posts")
        .insert(postRows)
        .select("id, thumbnail_url, child_thumbnails");

      if (postsError) {
        console.error("influencer_posts insert error:", postsError.message);
      }

      // 백그라운드 미디어 다운로드 큐 등록 + EdgeRuntime.waitUntil로 비동기 실행
      //   - 응답 시간 영향 0 (waitUntil은 응답 후에도 함수 인스턴스 유지)
      //   - influencer_media_jobs 테이블에 상태 기록 (모니터링/재시도용)
      const profileImageUrl = profile.profilePicUrl ?? null;
      const postsForMedia = (insertedPosts ?? []) as PostRow[];

      if (profileImageUrl || postsForMedia.length > 0) {
        const { data: job } = await supabaseAdmin
          .from("influencer_media_jobs")
          .insert({ influencer_id: influencerId, status: "pending" })
          .select("id")
          .single();

        if (job?.id) {
          const bgPromise = processMediaBackground(
            supabaseAdmin,
            job.id as string,
            influencerId,
            profileImageUrl,
            postsForMedia,
          );
          const er = (
            globalThis as unknown as {
              EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
            }
          ).EdgeRuntime;
          if (er?.waitUntil) {
            er.waitUntil(bgPromise);
          } else {
            // 로컬 dev fallback: 함수 종료 막지 않도록 catch만 부착
            bgPromise.catch((e) => console.error("[media] bg error:", e));
          }
        }
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
