/**
 * IndexedDB 기반 일정(월별) 로컬 캐시.
 *
 * 목적: 일정 페이지 재진입 / 월 전환 시 즉시 표시 (네트워크 round-trip 0).
 *  - 캐시는 표시용일 뿐 권한 검증은 항상 서버 RLS 가 담당
 *  - 캐시 hit → 즉시 표시 → 백그라운드 fetch → 최신 데이터로 교체
 *  - IndexedDB 미지원/실패 시 모든 함수가 graceful no-op
 *  - 키: "YYYY-MM" 문자열
 */

import { openDB, type IDBPDatabase } from "idb";
import type { ScheduleWithProfile } from "./types";

const DB_NAME = "jdi-schedule-cache";
const DB_VERSION = 1;
const MONTH_STORE = "month_schedules";

interface CachedMonthRecord {
  key: string; // "YYYY-MM"
  schedules: ScheduleWithProfile[];
  cached_at: string; // ISO
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> | null {
  if (typeof window === "undefined") return null;
  if (!("indexedDB" in window)) return null;
  if (dbPromise) return dbPromise;

  dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(MONTH_STORE)) {
        db.createObjectStore(MONTH_STORE, { keyPath: "key" });
      }
    },
  }).catch((err) => {
    console.warn("[scheduleCache] IndexedDB open failed:", err);
    dbPromise = null;
    throw err;
  });

  return dbPromise;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * 캐시된 월별 일정 반환. 없거나 IndexedDB 미지원이면 null.
 */
export async function getCachedMonth(
  year: number,
  month: number
): Promise<ScheduleWithProfile[] | null> {
  const dbp = getDB();
  if (!dbp) return null;
  try {
    const db = await dbp;
    const row = (await db.get(MONTH_STORE, monthKey(year, month))) as
      | CachedMonthRecord
      | undefined;
    if (!row) return null;
    return row.schedules;
  } catch (err) {
    console.warn("[scheduleCache] getCachedMonth failed:", err);
    return null;
  }
}

/**
 * 월별 일정 캐시 저장 (upsert).
 */
export async function cacheMonth(
  year: number,
  month: number,
  schedules: ScheduleWithProfile[]
): Promise<void> {
  const dbp = getDB();
  if (!dbp) return;
  try {
    const db = await dbp;
    // Supabase 응답은 plain JSON 이라 IndexedDB 의 structured clone 이 그대로 처리
    const record: CachedMonthRecord = {
      key: monthKey(year, month),
      schedules,
      cached_at: new Date().toISOString(),
    };
    await db.put(MONTH_STORE, record);
  } catch (err) {
    console.warn("[scheduleCache] cacheMonth failed:", err);
  }
}

/**
 * 특정 월 캐시 무효화 (mutation 후 호출).
 */
export async function invalidateMonthCache(year: number, month: number): Promise<void> {
  const dbp = getDB();
  if (!dbp) return;
  try {
    const db = await dbp;
    await db.delete(MONTH_STORE, monthKey(year, month));
  } catch (err) {
    console.warn("[scheduleCache] invalidateMonthCache failed:", err);
  }
}

/**
 * 일정 캐시 전체 삭제 (디버그/로그아웃 용).
 */
export async function clearScheduleCache(): Promise<void> {
  const dbp = getDB();
  if (!dbp) return;
  try {
    const db = await dbp;
    await db.clear(MONTH_STORE);
  } catch (err) {
    console.warn("[scheduleCache] clearScheduleCache failed:", err);
  }
}

