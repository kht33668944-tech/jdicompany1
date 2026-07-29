// Apify 비용 회귀 방지.
//
// 배경: influencer-extract 가 apify/instagram-scraper 를 resultsType:"details" 로 호출했는데,
// 이 모드에서는 resultsLimit 이 무시되어 게시물 100건이 통째로 딸려왔다.
// Apify 는 결과 1건 단위로 과금하므로 인플루언서 1명 등록에 101건(약 390원)이 청구됐다.
// 프로필 전용 actor(1명 = 1건, 약 4원)로 바꾼 뒤 다시 그 조합으로 돌아가지 않도록 막는다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFileSync(path.join(appRoot, relativePath), "utf8");

// 주석에는 "예전엔 details 를 썼다"는 설명이 남아 있으므로, 금지 패턴 검사는 실제 코드만 대상으로 한다.
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("influencer-extract never uses the details mode that ignores resultsLimit", () => {
  const extract = stripComments(readSource("supabase/functions/influencer-extract/index.ts"));

  // details 모드는 resultsLimit 이 적용되지 않아 게시물 100건이 청구된다.
  assert.doesNotMatch(
    extract,
    /resultsType:\s*["']details["']/,
    'resultsType:"details" 는 resultsLimit 이 무시되어 결과 100건이 과금된다. posts 모드를 쓸 것.',
  );
});

test("influencer-extract prefers the per-profile actor and caps fallback results", () => {
  const extract = readSource("supabase/functions/influencer-extract/index.ts");

  // 1순위: 1명당 결과 1건만 쓰는 프로필 전용 actor
  assert.match(extract, /PROFILE_ACTOR\s*=\s*["']apify~instagram-profile-scraper["']/);
  assert.match(extract, /callApifyActor\(PROFILE_ACTOR,\s*\{\s*usernames:\s*\[username\]/);

  // 폴백도 posts 모드 + resultsLimit 으로 건수를 묶어 둔다
  assert.match(extract, /resultsType:\s*["']posts["']/);
  assert.match(extract, /resultsLimit:\s*POSTS_PER_PROFILE/);
  assert.match(extract, /POSTS_PER_PROFILE\s*=\s*(\d+)/);

  const postsPerProfile = Number(extract.match(/POSTS_PER_PROFILE\s*=\s*(\d+)/)[1]);
  assert.ok(
    postsPerProfile > 0 && postsPerProfile <= 24,
    `게시물 상한이 ${postsPerProfile} 건이다. 비용이 건수에 비례하므로 24건 이하로 유지할 것.`,
  );

  // 어느 경로로 가져왔고 결과 몇 건을 썼는지 남겨야 비용이 새는 걸 앱에서 확인할 수 있다.
  assert.match(extract, /_scrape:\s*\{\s*actor:\s*scrapeActor,\s*result_count:\s*resultCount/);
});

test("bulk resync warns about its Apify cost before running", () => {
  const table = readSource("src/components/dashboard/influencer/InfluencerTable.tsx");
  const constants = readSource("src/lib/influencer/constants.ts");

  assert.match(constants, /export const APIFY_COST_PER_INFLUENCER_KRW\s*=\s*\d+/);
  assert.match(table, /APIFY_COST_PER_INFLUENCER_KRW/);
  assert.match(table, /confirm\([\s\S]*?예상 비용[\s\S]*?\)/);
});
