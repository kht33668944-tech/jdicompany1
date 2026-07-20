/**
 * IndexedDB 기반 업무 타임라인 로컬 캐시.
 *
 * 목적: 대시보드 재진입 시 최근 업무를 즉시 표시한다.
 *  - 캐시는 표시용일 뿐 권한 검증은 항상 서버 RLS 가 담당
 *  - 캐시 hit → 즉시 표시 → 백그라운드 fetch → 최신 데이터로 교체
 *  - 첨부 파일의 signed URL은 저장하지 않는다
 *  - IndexedDB 미지원/실패 시 모든 함수가 graceful no-op
 */

import { openDB, type IDBPDatabase } from "idb";
import type { WorkTimelineEntryWithProfile, WorkTimelineProfile } from "./types";

const DB_NAME = "jdi-work-timeline-cache";
const DB_VERSION = 1;
const TIMELINE_STORE = "recent_work_timeline";
const CACHE_SCHEMA_VERSION = 2;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 50;

interface CachedWorkTimelineRecord {
  key: string;
  entries: WorkTimelineEntryWithProfile[];
  profiles: WorkTimelineProfile[];
  cached_at: string;
  date?: string | null;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> | null {
  if (typeof window === "undefined") return null;
  if (!("indexedDB" in window)) return null;
  if (dbPromise) return dbPromise;

  dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(TIMELINE_STORE)) {
        db.createObjectStore(TIMELINE_STORE, { keyPath: "key" });
      }
    },
  }).catch((err) => {
    console.warn("[timelineCache] IndexedDB open failed:", err);
    dbPromise = null;
    throw err;
  });

  return dbPromise;
}

function timelineKey(userId: string): string {
  return JSON.stringify([CACHE_SCHEMA_VERSION, userId]);
}

function isExpired(cachedAt: string): boolean {
  const cachedAtMs = Date.parse(cachedAt);
  return Number.isNaN(cachedAtMs) || Date.now() - cachedAtMs >= CACHE_TTL_MS;
}

/**
 * 캐시된 최근 업무 타임라인을 반환한다.
 * - 캐시가 없거나 만료됐거나 IndexedDB 미지원이면 null
 */
export async function getCachedWorkTimeline(
  userId: string,
  date?: string,
): Promise<{ entries: WorkTimelineEntryWithProfile[]; profiles: WorkTimelineProfile[] } | null> {
  const dbp = getDB();
  if (!dbp) return null;

  try {
    const db = await dbp;
    const key = timelineKey(userId);
    const record = (await db.get(TIMELINE_STORE, key)) as CachedWorkTimelineRecord | undefined;
    if (!record || !Array.isArray(record.entries) || !Array.isArray(record.profiles)) return null;

    if (isExpired(record.cached_at)) {
      await db.delete(TIMELINE_STORE, key);
      return null;
    }

    // 날짜가 지정된(오늘만 보여주는) 미리보기는 다른 날짜에 저장된 캐시를 무시한다.
    if (date !== undefined && (record.date ?? null) !== date) {
      await db.delete(TIMELINE_STORE, key);
      return null;
    }

    return { entries: record.entries, profiles: record.profiles };
  } catch (err) {
    console.warn("[timelineCache] getCachedWorkTimeline failed:", err);
    return null;
  }
}

/**
 * 최근 업무 타임라인을 캐시에 저장한다.
 * 첨부 파일에는 만료 가능한 signed URL이 포함되므로 저장하지 않는다.
 */
export async function cacheWorkTimeline(
  userId: string,
  entries: WorkTimelineEntryWithProfile[],
  profiles: WorkTimelineProfile[],
  date?: string,
): Promise<void> {
  const dbp = getDB();
  if (!dbp) return;

  try {
    const db = await dbp;
    const record: CachedWorkTimelineRecord = {
      key: timelineKey(userId),
      entries: entries.slice(0, MAX_ENTRIES).map((entry) => ({
        ...entry,
        attachments: [],
      })),
      profiles,
      cached_at: new Date().toISOString(),
      date: date ?? null,
    };
    await db.put(TIMELINE_STORE, record);
  } catch (err) {
    console.warn("[timelineCache] cacheWorkTimeline failed:", err);
  }
}

/**
 * 사용자별 캐시를 삭제한다. userId가 없으면 전체 캐시를 삭제한다.
 */
export async function clearWorkTimelineCache(userId?: string): Promise<void> {
  const dbp = getDB();
  if (!dbp) return;

  try {
    const db = await dbp;
    if (typeof userId === "string") {
      await db.delete(TIMELINE_STORE, timelineKey(userId));
      return;
    }
    await db.clear(TIMELINE_STORE);
  } catch (err) {
    console.warn("[timelineCache] clearWorkTimelineCache failed:", err);
  }
}
