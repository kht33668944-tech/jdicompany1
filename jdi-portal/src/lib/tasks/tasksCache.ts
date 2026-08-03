/**
 * IndexedDB 기반 할일 목록 로컬 캐시 (쓰기 전용).
 *
 * 현재 동작:
 *  - `cacheTasks` — 할일 목록을 불러온 뒤 `TasksPageClient` 가 저장
 *  - `clearTasksCache` — 로그아웃 시 삭제
 *  - 저장된 값을 화면에 먼저 보여주는 읽기 경로는 없다. 초기 목록은 서버 컴포넌트가
 *    빠른 경로로 내려주므로(`src/lib/tasks/fast-queries.ts`) 캐시 hit 표시가 필요 없다.
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
 * 전체 할일 배열을 캐시에 저장 (단일 키 덮어쓰기).
 */
export async function cacheTasks(tasks: TaskWithDetails[]): Promise<void> {
  const dbp = getDB();
  if (!dbp) return;
  try {
    const db = await dbp;
    // Supabase 응답은 plain JSON 이라 IndexedDB 의 structured clone 이 그대로 처리
    const record: CachedTasksRecord = {
      key: ALL_KEY,
      tasks,
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
