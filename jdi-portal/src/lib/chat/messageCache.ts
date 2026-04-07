/**
 * IndexedDB 기반 채팅 메시지 로컬 캐시.
 *
 * 목적: 채팅방 두 번째 진입부터 즉시 메시지 표시 (네트워크 round-trip 0).
 *  - 캐시는 표시용일 뿐 권한 검증은 항상 서버 RLS 가 담당
 *  - 캐시 hit → 즉시 표시 → 백그라운드 fetch → 최신 데이터로 교체
 *  - IndexedDB 미지원/실패 시 모든 함수가 graceful no-op
 *  - 채널당 최대 MAX_PER_CHANNEL 개만 유지 (용량 폭주 방지)
 */

import { openDB, type IDBPDatabase } from "idb";
import type { Message } from "./types";

const DB_NAME = "jdi-chat-cache";
const DB_VERSION = 1;
const MESSAGES_STORE = "messages";
const META_STORE = "channel_meta";

// 채널당 캐시 상한 — 30개씩 페이지네이션이라 200 이면 ~6페이지 분량, 실용적으로 충분
const MAX_PER_CHANNEL = 200;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> | null {
  if (typeof window === "undefined") return null;
  if (!("indexedDB" in window)) return null;
  if (dbPromise) return dbPromise;

  dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        const store = db.createObjectStore(MESSAGES_STORE, { keyPath: "id" });
        // 채널별 + 시간 정렬 조회용 복합 인덱스
        store.createIndex("by_channel_time", ["channel_id", "created_at"]);
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "channel_id" });
      }
    },
  }).catch((err) => {
    // 시크릿 모드/권한 거부 등 — 캐시 비활성화로 폴백
    console.warn("[messageCache] IndexedDB open failed:", err);
    dbPromise = null;
    throw err;
  });

  return dbPromise;
}

/**
 * 채널의 캐시된 메시지를 시간순(오래된 → 최신)으로 반환.
 * - 캐시가 없거나 IndexedDB 미지원이면 빈 배열
 */
export async function getCachedMessages(channelId: string): Promise<Message[]> {
  const dbp = getDB();
  if (!dbp) return [];
  try {
    const db = await dbp;
    const tx = db.transaction(MESSAGES_STORE, "readonly");
    const index = tx.store.index("by_channel_time");
    const range = IDBKeyRange.bound([channelId, ""], [channelId, "\uffff"]);
    const rows = await index.getAll(range);
    // 인덱스가 [channel_id, created_at] 정렬을 보장하지만 안전하게 한 번 더
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return rows as Message[];
  } catch (err) {
    console.warn("[messageCache] getCachedMessages failed:", err);
    return [];
  }
}

/**
 * 메시지 배열을 캐시에 일괄 저장 (upsert).
 * - 채널당 MAX_PER_CHANNEL 개 초과 시 가장 오래된 메시지부터 정리
 */
export async function cacheMessages(channelId: string, messages: Message[]): Promise<void> {
  if (messages.length === 0) return;
  const dbp = getDB();
  if (!dbp) return;
  try {
    const db = await dbp;
    const tx = db.transaction([MESSAGES_STORE, META_STORE], "readwrite");
    const store = tx.objectStore(MESSAGES_STORE);

    for (const m of messages) {
      // 내부 표시용 데이터만 저장 — 무거운 객체/순환 참조 방지
      await store.put(serialize(m));
    }

    // 메타: 마지막 동기화 시각
    await tx.objectStore(META_STORE).put({
      channel_id: channelId,
      last_synced_at: new Date().toISOString(),
    });

    await tx.done;

    // 백그라운드로 정리 (await 안 함 — 사용자 흐름 차단 X)
    void pruneChannel(channelId);
  } catch (err) {
    console.warn("[messageCache] cacheMessages failed:", err);
  }
}

/**
 * 단일 메시지 upsert (실시간 INSERT/UPDATE 용).
 */
export async function upsertCachedMessage(message: Message): Promise<void> {
  const dbp = getDB();
  if (!dbp) return;
  try {
    const db = await dbp;
    await db.put(MESSAGES_STORE, serialize(message));
  } catch (err) {
    console.warn("[messageCache] upsertCachedMessage failed:", err);
  }
}

/**
 * 채널 캐시 전체 삭제 (디버그/로그아웃 용).
 */
export async function clearChannelCache(channelId: string): Promise<void> {
  const dbp = getDB();
  if (!dbp) return;
  try {
    const db = await dbp;
    const tx = db.transaction([MESSAGES_STORE, META_STORE], "readwrite");
    const index = tx.objectStore(MESSAGES_STORE).index("by_channel_time");
    const range = IDBKeyRange.bound([channelId, ""], [channelId, "\uffff"]);
    let cursor = await index.openCursor(range);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.objectStore(META_STORE).delete(channelId);
    await tx.done;
  } catch (err) {
    console.warn("[messageCache] clearChannelCache failed:", err);
  }
}

/**
 * 채널의 캐시 크기를 MAX_PER_CHANNEL 이하로 정리.
 * - 가장 오래된 메시지부터 삭제
 */
async function pruneChannel(channelId: string): Promise<void> {
  const dbp = getDB();
  if (!dbp) return;
  try {
    const db = await dbp;
    const tx = db.transaction(MESSAGES_STORE, "readwrite");
    const index = tx.store.index("by_channel_time");
    const range = IDBKeyRange.bound([channelId, ""], [channelId, "\uffff"]);
    const total = await index.count(range);
    if (total <= MAX_PER_CHANNEL) {
      await tx.done;
      return;
    }
    let toDelete = total - MAX_PER_CHANNEL;
    let cursor = await index.openCursor(range); // 오래된 것부터
    while (cursor && toDelete > 0) {
      await cursor.delete();
      toDelete--;
      cursor = await cursor.continue();
    }
    await tx.done;
  } catch (err) {
    console.warn("[messageCache] pruneChannel failed:", err);
  }
}

/**
 * 메시지 객체를 IndexedDB 친화 형태로 정규화.
 * - undefined → null 변환 (구조화 복제 호환)
 * - 함수/심볼 등 비직렬화 필드 제거
 */
function serialize(m: Message): Message {
  return JSON.parse(JSON.stringify(m));
}
