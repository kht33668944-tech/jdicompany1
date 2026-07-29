import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFileSync(path.join(appRoot, relativePath), "utf8");

test("influencer list loading is bounded to 25 records without detailed fields", () => {
  const queries = readSource("src/lib/influencer/queries.ts");
  const page = readSource("src/app/dashboard/influencer/page.tsx");
  const actions = readSource("src/lib/influencer/actions.ts");
  const client = readSource("src/components/dashboard/influencer/InfluencerPageClient.tsx");

  assert.match(queries, /pageSize\s*=\s*25/);
  assert.match(page, /getInfluencers\(\{[^}]*pageSize:\s*25[^}]*\}\)/s);
  assert.match(actions, /loadMoreInfluencers[\s\S]*?pageSize:\s*25/);
  assert.match(client, /influencers\.length\s*===\s*25/);
  assert.match(client, /setLastPageFull\(next\.length\s*===\s*25\)/);

  const listSelect = queries.match(/\.select\(\s*([\s\S]*?)\s*\);\s*\n\s*if \(status\)/)?.[1] ?? "";
  for (const excludedField of ["bio", "ai_insights", "ai_summary", "notes"]) {
    assert.doesNotMatch(listSelect, new RegExp(`\\b${excludedField}\\b`));
  }
});

// 회귀 방지: 분석 완료 후 router.refresh() 로 새 목록이 내려와도 화면에 안 붙던 버그.
// 서버가 준 1페이지를 useState 로 복사하면 첫 진입 값에 묶여 신규 인플루언서가 보이지 않는다.
test("influencer list renders the server prop directly instead of copying it into state", () => {
  const client = readSource("src/components/dashboard/influencer/InfluencerPageClient.tsx");

  assert.doesNotMatch(client, /useState\(\s*influencers\s*\)/);
  assert.match(client, /const loadedInfluencers = useMemo\(/);
  assert.match(client, /\[\s*influencers\s*,[\s\S]*?\]\s*\)/);
});

// 회귀 방지: 검색을 이미 불러온 25명 안에서만 걸러내면 나머지는 검색해도 안 나온다.
test("influencer search queries the server, not only the loaded page", () => {
  const actions = readSource("src/lib/influencer/actions.ts");
  const client = readSource("src/components/dashboard/influencer/InfluencerPageClient.tsx");

  assert.match(actions, /export async function searchInfluencers\(/);
  assert.match(actions, /searchInfluencers[\s\S]*?sanitizeSearchTerm\(/);
  assert.match(client, /searchInfluencers\(searchTerm\)/);
});

test("InfluencerTable mounts only one responsive list mapping", () => {
  const table = readSource("src/components/dashboard/influencer/InfluencerTable.tsx");

  assert.match(table, /function useIsMobile\(\)[\s\S]*?matchMedia\("\(max-width: 639px\)"\)/);
  assert.match(table, /\{isMobile && \([\s\S]*?displayed\.map\(/);
  assert.match(table, /\{!isMobile && \([\s\S]*?displayed\.map\(/);
  assert.doesNotMatch(table, /\[\] as InfluencerListItem\[\]\.map\(/);
});

test("InfluencerTable wires its load-more button to existing pagination props", () => {
  const table = readSource("src/components/dashboard/influencer/InfluencerTable.tsx");

  assert.match(table, /\{hasMore && \([\s\S]*?<button[\s\S]*?onClick=\{onLoadMore\}[\s\S]*?disabled=\{loadingMore\}[\s\S]*?\{loadingMore \? "불러오는 중\.\.\." : "더 불러오기"\}/);
});
