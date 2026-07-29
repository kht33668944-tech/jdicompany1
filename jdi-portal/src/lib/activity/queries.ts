import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityLogEntry } from "./types";

/** activity_log 는 7일만 보관한다 (마이그레이션 117 의 pg_cron 정리와 같은 값) */
export const ACTIVITY_RETENTION_DAYS = 7;

/** 하루치 상한. 7일 보관이라 실제로는 훨씬 적지만 화면이 폭주하지 않도록 막아둔다. */
const MAX_ROWS = 500;

function kstDayStart(date: string): string {
  return `${date}T00:00:00+09:00`;
}

/**
 * [startDate, endDateExclusive) 범위(KST 날짜 기준)의 활동을 최신순으로 읽는다.
 * RLS(승인 사용자만 SELECT)가 최종 방어선이다.
 */
export async function getActivitiesByDateRange(
  supabase: SupabaseClient,
  startDate: string,
  endDateExclusive: string
): Promise<ActivityLogEntry[]> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("*")
    .gte("created_at", kstDayStart(startDate))
    .lt("created_at", kstDayStart(endDateExclusive))
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) throw error;
  return (data ?? []) as ActivityLogEntry[];
}
