import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Vercel serverless 콜드 스타트 방지용 핑 엔드포인트
// - 외부 cron (cron-job.org) 이 5분마다 호출
// - 인증 불필요
// - Supabase SDK 초기화 + 각 페이지가 실제 쓰는 테이블에 가벼운 쿼리 1회씩
//   → DB 연결 풀, PostgREST JIT, Postgres query plan 캐시, V8 모듈 캐시 모두 warm
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 모듈 레벨 캐시: 동일 Lambda 인스턴스가 재사용될 때 초기화 비용 스킵
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

// 대시보드/할일/근태/일정 페이지가 첫 진입 시 실제로 쓰는 테이블 목록
const WARM_TABLES = [
  "profiles",
  "tasks",
  "task_activities",
  "attendance_records",
  "vacation_requests",
  "schedules",
] as const;

export async function GET() {
  const start = Date.now();
  let dbOk = false;
  try {
    await Promise.all(
      WARM_TABLES.map((t) => supabase.from(t).select("id").limit(1))
    );
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
