import * as XLSX from "xlsx";

const MAX_XLSX_ROWS = 5_000;

export interface ParsedUrl {
  raw: string;
  url: string;
  username: string;
}

/** 인스타그램 URL 파싱. 유효하지 않으면 null 반환 */
export function parseInstagramUrl(input: string): ParsedUrl | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (
      parsed.hostname !== "www.instagram.com" &&
      parsed.hostname !== "instagram.com"
    ) {
      return null;
    }
    // pathname: /username 또는 /username/ 형태
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;
    const username = parts[0];
    // 예약어 필터링
    const reserved = new Set(["p", "reel", "stories", "explore", "accounts"]);
    if (reserved.has(username)) return null;

    const normalizedUrl = `https://www.instagram.com/${username}/`;
    return { raw: trimmed, url: normalizedUrl, username };
  } catch {
    return null;
  }
}

/** 텍스트에서 URL 목록 추출 (줄바꿈 구분) */
export function extractUrlsFromText(text: string): ParsedUrl[] {
  const lines = text
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.flatMap((line) => {
    const result = parseInstagramUrl(line);
    return result ? [result] : [];
  });
}

/** CSV/XLSX 텍스트 파싱 — URL 컬럼 자동 감지 */
export function extractUrlsFromCsvText(
  text: string,
  columnHint?: string
): ParsedUrl[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const urlColNames = ["url", "URL", "프로필", "프로필URL", "instagram", "Instagram", "link", "링크"];
  const hintCols = columnHint ? [columnHint] : [];
  const allCandidates = [...hintCols, ...urlColNames];

  let colIndex = -1;
  for (const name of allCandidates) {
    const idx = header.findIndex(
      (h) => h.toLowerCase() === name.toLowerCase()
    );
    if (idx !== -1) {
      colIndex = idx;
      break;
    }
  }

  const results: ParsedUrl[] = [];
  const dataLines = colIndex !== -1 ? lines.slice(1) : lines;

  for (const line of dataLines) {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const candidate = colIndex !== -1 ? cols[colIndex] : cols[0];
    if (!candidate) continue;
    const parsed = parseInstagramUrl(candidate);
    if (parsed) results.push(parsed);
  }
  return results;
}

/** XLSX ArrayBuffer에서 URL 추출 */
export async function extractUrlsFromXlsx(
  buffer: ArrayBuffer
): Promise<ParsedUrl[]> {
  const workbook = XLSX.read(buffer, {
    type: "array",
    dense: true,
    sheetRows: MAX_XLSX_ROWS + 1,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  if (rows.length === 0) return [];

  // URL 컬럼 자동 감지
  const urlColNames = ["url", "프로필", "프로필url", "instagram", "link", "링크"];
  const firstRow = rows[0];
  const keys = Object.keys(firstRow);
  let urlKey: string | null = null;
  for (const name of urlColNames) {
    const found = keys.find((k) => k.toLowerCase().includes(name));
    if (found) {
      urlKey = found;
      break;
    }
  }

  const results: ParsedUrl[] = [];
  for (const row of rows.slice(0, MAX_XLSX_ROWS)) {
    const candidate = urlKey
      ? String(row[urlKey] ?? "")
      : String(Object.values(row)[0] ?? "");
    const parsed = parseInstagramUrl(candidate);
    if (parsed) results.push(parsed);
  }
  return results;
}
