import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_HOSTS = ["cdninstagram.com", "fbcdn.net", "instagram.com"];

function isAllowedHost(url: string): boolean {
  try {
    const u = new URL(url);
    return ALLOWED_HOSTS.some((host) => u.hostname.endsWith(host));
  } catch {
    return false;
  }
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

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/*",
      },
      cache: "force-cache",
      next: { revalidate: 86400 },
    });
    if (!r.ok) return new Response("not found", { status: 404 });
    const buf = await r.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "content-type": r.headers.get("content-type") ?? "image/jpeg",
        "cache-control": "public, max-age=86400, immutable",
      },
    });
  } catch (err) {
    console.error("[influencer-thumbnail] fetch failed", err);
    return new Response("upstream error", { status: 502 });
  }
}
