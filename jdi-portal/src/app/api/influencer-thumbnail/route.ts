import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_HOSTS = ["cdninstagram.com", "fbcdn.net", "instagram.com"];
const UPSTREAM_TIMEOUT_MS = 900;
const NEGATIVE_CACHE_MAX_ENTRIES = 100;
const NEGATIVE_CACHE_SECONDS = {
  notFound: 60 * 60,
  upstreamError: 5 * 60,
} as const;

type NegativeCacheEntry = {
  cacheSeconds: number;
  expiresAt: number;
};

const negativeCache = new Map<string, NegativeCacheEntry>();

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="프로필 이미지 없음"><rect width="96" height="96" fill="#e2e8f0"/><circle cx="48" cy="35" r="17" fill="#94a3b8"/><path d="M17 90c4-19 17-29 31-29s27 10 31 29" fill="#94a3b8"/></svg>`;

function isAllowedHost(url: string): boolean {
  try {
    const u = new URL(url);
    return ALLOWED_HOSTS.some(
      (host) => u.hostname === host || u.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

function getCachedFailure(url: string): NegativeCacheEntry | null {
  const cached = negativeCache.get(url);
  if (!cached) return null;
  if (cached.expiresAt > Date.now()) return cached;

  negativeCache.delete(url);
  return null;
}

function cacheFailure(url: string, cacheSeconds: number): NegativeCacheEntry {
  for (const [key, entry] of negativeCache) {
    if (entry.expiresAt <= Date.now()) negativeCache.delete(key);
  }

  if (!negativeCache.has(url)) {
    while (negativeCache.size >= NEGATIVE_CACHE_MAX_ENTRIES) {
      const oldestKey = negativeCache.keys().next().value;
      if (!oldestKey) break;
      negativeCache.delete(oldestKey);
    }
  }

  const entry = {
    cacheSeconds,
    expiresAt: Date.now() + cacheSeconds * 1000,
  };
  negativeCache.set(url, entry);
  return entry;
}

function placeholderResponse(cacheSeconds: number): Response {
  return new Response(PLACEHOLDER_SVG, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": `public, max-age=${cacheSeconds}`,
    },
  });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const url = req.nextUrl.searchParams.get("url");
  if (!url || !isAllowedHost(url)) {
    return new Response("invalid url", { status: 400 });
  }

  const cachedFailure = getCachedFailure(url);
  if (cachedFailure) return placeholderResponse(cachedFailure.cacheSeconds);

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/*",
      },
      cache: "force-cache",
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (r.status === 404 || r.status === 410) {
      const failure = cacheFailure(url, NEGATIVE_CACHE_SECONDS.notFound);
      return placeholderResponse(failure.cacheSeconds);
    }
    if (r.status >= 500) {
      const failure = cacheFailure(url, NEGATIVE_CACHE_SECONDS.upstreamError);
      return placeholderResponse(failure.cacheSeconds);
    }
    if (!r.ok) return new Response("not found", { status: 404 });

    const buf = await r.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "content-type": r.headers.get("content-type") ?? "image/jpeg",
        "cache-control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    const failure = cacheFailure(url, NEGATIVE_CACHE_SECONDS.upstreamError);
    return placeholderResponse(failure.cacheSeconds);
  }
}
