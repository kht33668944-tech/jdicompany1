import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// DB 연결 풀 / PostgREST JIT / 쿼리 플랜 캐시 warm 유지용 핑 엔드포인트
// - instrumentation.ts 가 컨테이너 내부에서 4분마다 self-ping (Railway always-on이라
//   콜드 스타트는 없지만, 장시간 idle 후 첫 DB 요청 지연을 줄임)
// - 인증 불필요 (middleware.ts 에서 예외 처리)
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
