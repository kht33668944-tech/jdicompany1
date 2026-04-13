import type { NextRequest } from "next/server";

export function extractClientIp(request: NextRequest): string {
  // 1. x-forwarded-for (프록시/로드밸런서가 설정)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first && first !== "::1" && first !== "127.0.0.1") return first;
  }
  // 2. x-real-ip (nginx 등)
  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp !== "::1" && realIp !== "127.0.0.1") return realIp;
  // 3. fallback
  return forwarded?.split(",")[0].trim() || "unknown";
}
