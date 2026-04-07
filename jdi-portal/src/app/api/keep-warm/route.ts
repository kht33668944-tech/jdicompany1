import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Vercel serverless 콜드 스타트 방지용 핑 엔드포인트
// - 외부 cron 이 5분마다 호출
// - 인증 불필요
// - 단순 응답이 아니라 Supabase 클라이언트를 실제로 초기화 + 가벼운 쿼리 1회
//   → DB 연결 풀, Supabase SDK 모듈 V8 캐시, 라우트 컴파일 모두 warm 유지
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  let dbOk = false;
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => [],
          setAll: () => {},
        },
      }
    );
    // 인증 없이도 통과하는 가벼운 RPC: 토큰 없이도 DB 라운드트립만 발생하면 됨
    // (RLS 로 결과는 0건이지만 connection pool warm 효과는 동일)
    await supabase.from("profiles").select("id").limit(1);
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return NextResponse.json({
    ok: true,
    db: dbOk,
    ms: Date.now() - start,
    ts: Date.now(),
  });
}
