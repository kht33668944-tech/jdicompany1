import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_BUCKET, CHAT_FILE_URL_TTL_SECONDS } from "./constants";
import { getFilePreviewPath, parseFileContent } from "./utils";

export interface FileUrlSource {
  id: string;
  content: string;
}

export interface FileUrlPath {
  itemId: string;
  path: string;
}

export function collectFileUrlRequests(items: FileUrlSource[]): {
  paths: string[];
  itemPaths: FileUrlPath[];
} {
  const seen = new Set<string>();
  const paths: string[] = [];
  const itemPaths: FileUrlPath[] = [];

  for (const item of items) {
    const file = parseFileContent(item.content);
    if (!file?.path) continue;

    itemPaths.push({ itemId: item.id, path: file.path });
    if (seen.has(file.path)) continue;

    seen.add(file.path);
    paths.push(file.path);
  }

  return { paths, itemPaths };
}

/**
 * 메시지 목록에서 서명 URL 이 필요한 스토리지 경로를 모두 모은다.
 *
 * 이미지 메시지는 미리보기(썸네일)와 원본을 **둘 다** 쓴다
 * (MessageItem 의 ChatImage 가 previewPath = 화면 표시, storagePath = 저장/원본 링크).
 * 둘 다 미리 발급해 두어야 화면을 그린 뒤 추가 왕복이 생기지 않는다.
 * 삭제된 메시지의 첨부는 화면에 그리지 않으므로 발급 대상에서 제외한다.
 */
export function collectMessageFilePaths(
  messages: { content: string; type: string; is_deleted?: boolean | null }[]
): string[] {
  const seen = new Set<string>();

  for (const message of messages) {
    if (message.is_deleted) continue;
    if (message.type !== "image" && message.type !== "file") continue;
    const file = parseFileContent(message.content);
    if (!file) continue;

    const previewPath = getFilePreviewPath(file);
    if (previewPath) seen.add(previewPath);
    if (file.path) seen.add(file.path);
  }

  return Array.from(seen);
}

/**
 * 채팅 버킷에서 여러 경로의 서명 URL 을 한 번에 발급해 path → url 맵으로 돌려준다.
 * 서버 프리페치(queries.getMessageFileUrls)와 클라이언트 배치(actions.getChatFileUrls)가
 * 같은 발급·필터 규칙을 쓰도록 하는 단일 구현이다. 스토리지 오류는 그대로 던진다.
 */
export async function signChatFilePaths(
  supabase: SupabaseClient,
  paths: string[]
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(CHAT_BUCKET)
    .createSignedUrls(unique, CHAT_FILE_URL_TTL_SECONDS);
  if (error) throw error;

  const urls: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item?.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl;
  }
  return urls;
}

export function buildItemUrlMap(
  itemPaths: FileUrlPath[],
  urlsByPath: Record<string, string>
): Map<string, string> {
  const map = new Map<string, string>();

  for (const item of itemPaths) {
    const url = urlsByPath[item.path];
    if (url) map.set(item.itemId, url);
  }

  return map;
}
