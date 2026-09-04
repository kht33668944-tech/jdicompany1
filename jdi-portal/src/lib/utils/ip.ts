import type { NextRequest } from "next/server";

export function extractClientIp(request: NextRequest): string {
  // 0. cf-connecting-ip — 운영(jdiportal.com)은 Cloudflare 를 지나므로 이 헤더가 항상 있고,
  //    Cloudflare 가 매 요청 덮어써서 접속자가 조작할 수 없다. x-forwarded-for 의 맨 앞 값은
  //    접속자가 미리 채워 보낼 수 있어(프록시들은 뒤에 덧붙임) 증거용으로는 이 헤더를 우선한다.
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp && cfIp !== "::1" && cfIp !== "127.0.0.1") return cfIp;
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
