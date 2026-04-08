import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Vercel serverless 콜드 스타트 방지용 핑 엔드포인트
// - 외부 cron (cron-job.org) 이 5분마다 호출
// - 인증 불필요
// - Supabase SDK 초기화 + 각 페이지가 실제 쓰는 테이블에 가벼운 쿼리 1회씩
//   → DB 연결 풀, PostgREST JIT, Postgres query plan 캐시, V8 모듈 캐시 모두 warm
//
// 주의:
// - RLS 로 결과는 0건이지만 실제 쿼리가 DB까지 왕복하므로 warm-up 효과는 동일
// - Promise.all 로 병렬 실행 → 실행 시간 < 1초 유지 (cron-job.org 타임아웃 안전)
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

    // 대시보드/할일/근태/일정 페이지가 첫 진입 시 실제로 쓰는 테이블들을
    // 미리 한 번씩 찔러서 연결·쿼리플래너 캐시를 warm 유지
    await Promise.all([
      supabase.from("profiles").select("id").limit(1),
      supabase.from("tasks").select("id").limit(1),
      supabase.from("task_activities").select("id").limit(1),
      supabase.from("attendance_records").select("id").limit(1),
      supabase.from("vacation_requests").select("id").limit(1),
      supabase.from("schedules").select("id").limit(1),
    ]);
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
