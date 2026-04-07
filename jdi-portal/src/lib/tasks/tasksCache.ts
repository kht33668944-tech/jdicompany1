/**
 * IndexedDB 기반 할일 목록 로컬 캐시.
 *
 * 목적: 할일 페이지 두 번째 진입부터 즉시 목록 표시 (네트워크 round-trip 0).
 *  - 캐시는 표시용일 뿐 권한 검증은 항상 서버 RLS 가 담당
 *  - 캐시 hit → 즉시 표시 → 백그라운드 fetch → 최신 데이터로 교체
 *  - IndexedDB 미지원/실패 시 모든 함수가 graceful no-op
 *  - 페이지네이션 없음 — 전체 배열을 단일 키("all")로 저장
 */

import { openDB, type IDBPDatabase } from "idb";
import type { TaskWithDetails } from "./types";

const DB_NAME = "jdi-tasks-cache";
const DB_VERSION = 1;
const TASKS_STORE = "tasks_list";
const ALL_KEY = "all";

interface CachedTasksRecord {
  key: string;
  tasks: TaskWithDetails[];
  cached_at: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> | null {
  if (typeof window === "undefined") return null;
  if (!("indexedDB" in window)) return null;
  if (dbPromise) return dbPromise;

  dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(TASKS_STORE)) {
        db.createObjectStore(TASKS_STORE, { keyPath: "key" });
      }
    },
  }).catch((err) => {
    // 시크릿 모드/권한 거부 등 — 캐시 비활성화로 폴백
    console.warn("[tasksCache] IndexedDB open failed:", err);
    dbPromise = null;
    throw err;
  });

  return dbPromise;
}

/**
 * 캐시된 전체 할일 배열을 반환.
 * - 캐시가 없거나 IndexedDB 미지원이면 null
 */
export async function getCachedTasks(): Promise<TaskWithDetails[] | null> {
  const dbp = getDB();
  if (!dbp) return null;
  try {
    const db = await dbp;
    const rec = (await db.get(TASKS_STORE, ALL_KEY)) as CachedTasksRecord | undefined;
    if (!rec || !Array.isArray(rec.tasks)) return null;
    return rec.tasks;
  } catch (err) {
    console.warn("[tasksCache] getCachedTasks failed:", err);
    return null;
  }
}

/**
 * 전체 할일 배열을 캐시에 저장 (단일 키 덮어쓰기).
 */
export async function cacheTasks(tasks: TaskWithDetails[]): Promise<void> {
  const dbp = getDB();
  if (!dbp) return;
  try {
    const db = await dbp;
    const record: CachedTasksRecord = {
      key: ALL_KEY,
      // 구조화 복제 호환을 위해 정규화 (undefined → null, 함수/심볼 제거)
      tasks: JSON.parse(JSON.stringify(tasks)) as TaskWithDetails[],
      cached_at: new Date().toISOString(),
    };
    await db.put(TASKS_STORE, record);
  } catch (err) {
    console.warn("[tasksCache] cacheTasks failed:", err);
  }
}

/**
 * 캐시 전체 삭제 (디버그/로그아웃 용).
 */
export async function clearTasksCache(): Promise<void> {
  const dbp = getDB();
  if (!dbp) return;
  try {
    const db = await dbp;
    await db.delete(TASKS_STORE, ALL_KEY);
  } catch (err) {
    console.warn("[tasksCache] clearTasksCache failed:", err);
  }
}
