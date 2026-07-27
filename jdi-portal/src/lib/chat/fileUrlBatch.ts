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
 */
export function collectMessageFilePaths(messages: { content: string }[]): string[] {
  const seen = new Set<string>();

  for (const message of messages) {
    const file = parseFileContent(message.content);
    if (!file) continue;

    const previewPath = getFilePreviewPath(file);
    if (previewPath) seen.add(previewPath);
    if (file.path) seen.add(file.path);
  }

  return Array.from(seen);
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
