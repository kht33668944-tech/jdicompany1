import { parseFileContent } from "./utils";

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
