import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "jdi-work-timeline-drafts";
const DB_VERSION = 1;
const DRAFT_STORE = "drafts";
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export interface WorkTimelineDraftImage {
  id: string;
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
}

export interface WorkTimelineDraftPayload {
  title: string;
  description: string;
  completedAt: string;
  taskId: string | null;
  images: WorkTimelineDraftImage[];
}

export interface WorkTimelineDraftRecord extends WorkTimelineDraftPayload {
  key: string;
  userId: string;
  scope: string;
  updatedAt: number;
}

export type WorkTimelineDraftSaveResult = "saved" | "text-only" | "unavailable";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> | null {
  if (typeof window === "undefined" || !("indexedDB" in window)) return null;
  if (dbPromise) return dbPromise;

  dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: "key" });
      }
    },
  }).catch((error) => {
    console.warn("[workTimelineDraft] IndexedDB open failed:", error);
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

function getDraftKey(userId: string, scope: string): string {
  return `${userId}:${scope}`;
}

async function clearExpiredDrafts(db: IDBPDatabase): Promise<void> {
  const transaction = db.transaction(DRAFT_STORE, "readwrite");
  let cursor = await transaction.store.openCursor();
  const now = Date.now();
  while (cursor) {
    const record = cursor.value as Partial<WorkTimelineDraftRecord>;
    if (typeof record.updatedAt !== "number" || now - record.updatedAt > DRAFT_TTL_MS) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await transaction.done;
}

export async function getWorkTimelineDraft(
  userId: string,
  scope: string,
): Promise<WorkTimelineDraftRecord | null> {
  if (!userId || !scope) return null;
  const dbp = getDB();
  if (!dbp) return null;

  try {
    const db = await dbp;
    await clearExpiredDrafts(db);
    const key = getDraftKey(userId, scope);
    const record = await db.get(DRAFT_STORE, key) as WorkTimelineDraftRecord | undefined;
    if (!record) return null;
    if (record.userId !== userId || record.scope !== scope || record.key !== key) {
      await db.delete(DRAFT_STORE, key);
      return null;
    }
    if (Date.now() - record.updatedAt > DRAFT_TTL_MS) {
      await db.delete(DRAFT_STORE, key);
      return null;
    }
    return record;
  } catch (error) {
    console.warn("[workTimelineDraft] Draft read failed:", error);
    return null;
  }
}

export async function saveWorkTimelineDraft(
  userId: string,
  scope: string,
  payload: WorkTimelineDraftPayload,
): Promise<WorkTimelineDraftSaveResult> {
  if (!userId || !scope) return "unavailable";
  const dbp = getDB();
  if (!dbp) return "unavailable";

  try {
    const db = await dbp;
    const record: WorkTimelineDraftRecord = {
      ...payload,
      key: getDraftKey(userId, scope),
      userId,
      scope,
      updatedAt: Date.now(),
    };
    try {
      await db.put(DRAFT_STORE, record);
      return "saved";
    } catch (error) {
      if (payload.images.length === 0) throw error;
      console.warn("[workTimelineDraft] Image draft save failed; retrying text only:", error);
      await db.put(DRAFT_STORE, { ...record, images: [] });
      return "text-only";
    }
  } catch (error) {
    console.warn("[workTimelineDraft] Draft save failed:", error);
    return "unavailable";
  }
}

export async function clearWorkTimelineDraft(userId: string, scope: string): Promise<void> {
  if (!userId || !scope) return;
  const dbp = getDB();
  if (!dbp) return;

  try {
    const db = await dbp;
    await db.delete(DRAFT_STORE, getDraftKey(userId, scope));
  } catch (error) {
    console.warn("[workTimelineDraft] Draft clear failed:", error);
  }
}
