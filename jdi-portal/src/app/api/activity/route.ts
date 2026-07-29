import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { ACTIVITY_RETENTION_DAYS, getActivitiesByDateRange } from "@/lib/activity/queries";
import { addDays, toDateString } from "@/lib/utils/date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 전체 보기 페이지가 화면을 띄운 직후 뒤에서 불러오는 보관 기간 전체(7일) 활동.
 *
 * 페이지는 오늘 것만 서버에서 받아 즉시 렌더하고, 나머지 날짜는 이 라우트로
 * 한 번에 받아 캐시해둔다. 그래서 날짜 범위를 바꿔도 기다림이 없다.
 */
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 인자 없이 호출해야 KST 로 한 번만 변환된다 (page.tsx 와 같은 이유)
  const today = toDateString();
  const start = addDays(today, -(ACTIVITY_RETENTION_DAYS - 1));
  const endExclusive = addDays(today, 1);

  try {
    const activities = await getActivitiesByDateRange(auth.supabase, start, endExclusive);
    return NextResponse.json({ activities, start, end: today });
  } catch (error) {
    console.error("[api/activity] failed to load activities:", error);
    return NextResponse.json({ error: "Failed to load activities" }, { status: 500 });
  }
}
