// 인플루언서 미디어 URL 해석
//   1) Storage path가 있으면 Supabase Storage public URL을 그대로 반환 (Cloudflare CDN, 1년 캐시)
//   2) 없으면 인스타 CDN URL을 /api/influencer-thumbnail 프록시로 우회 (Referer/hot-link 차단 회피)
//   3) supabase.co 도메인은 프록시 우회 — 직접 사용 가능

const STORAGE_BUCKET = "influencer-media";

function getSupabasePublicBase(): string {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url) return "";
  return `${url}/storage/v1/object/public/${STORAGE_BUCKET}`;
}

/**
 * Storage path를 public URL로 변환. path가 비어있으면 null.
 */
export function storagePathToUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = getSupabasePublicBase();
  if (!base) return null;
  // path가 슬래시로 시작하면 제거
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return `${base}/${clean}`;
}

/**
 * 미디어 URL 해석 — path 우선, 없으면 raw URL을 프록시 경유.
 * @param rawUrl  인스타 CDN URL (fallback)
 * @param path    Supabase Storage 경로 (있으면 우선)
 */
export function resolveMediaUrl(
  rawUrl: string | null | undefined,
  path?: string | null | undefined,
): string | null {
  // 1순위: Storage path
  const storageUrl = storagePathToUrl(path);
  if (storageUrl) return storageUrl;

  // 2순위: 기존 프록시 경로
  return proxyImageUrl(rawUrl ?? null);
}

/**
 * 기존 프록시 함수 — Storage path 없을 때 fallback.
 */
export function proxyImageUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  if (!rawUrl.startsWith("http")) return rawUrl;
  try {
    const u = new URL(rawUrl);
    if (u.hostname.endsWith("supabase.co") || u.hostname === "localhost") {
      return rawUrl;
    }
  } catch {
    return rawUrl;
  }
  return `/api/influencer-thumbnail?url=${encodeURIComponent(rawUrl)}`;
}
