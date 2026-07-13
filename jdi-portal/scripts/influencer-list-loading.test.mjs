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
  assert.match(client, /setHasMore\(next\.length\s*===\s*25\)/);

  const listSelect = queries.match(/\.select\(\s*([\s\S]*?)\s*\);\s*\n\s*if \(status\)/)?.[1] ?? "";
  for (const excludedField of ["bio", "ai_insights", "ai_summary", "notes"]) {
    assert.doesNotMatch(listSelect, new RegExp(`\\b${excludedField}\\b`));
  }
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
