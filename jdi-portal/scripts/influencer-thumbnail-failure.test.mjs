import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(
  path.join(appRoot, "src/app/api/influencer-thumbnail/route.ts"),
  "utf8",
);

test("thumbnail proxy keeps authentication and boundary-safe allowed-host validation", () => {
  assert.match(route, /await supabase\.auth\.getUser\(\)/);
  assert.match(route, /if \(!user\) return new Response\("unauthorized", \{ status: 401 \}\)/);
  assert.match(route, /if \(!url \|\| !isAllowedHost\(url\)\)/);
  assert.match(
    route,
    /u\.hostname === host \|\| u\.hostname\.endsWith\(`\.\$\{host\}`\)/,
  );
  assert.doesNotMatch(route, /u\.hostname\.endsWith\(host\)/);
});

test("thumbnail proxy limits upstream fetches and negative-caches failures", () => {
  assert.match(route, /const UPSTREAM_TIMEOUT_MS = 900/);
  assert.match(route, /AbortSignal\.timeout\(UPSTREAM_TIMEOUT_MS\)/);
  assert.match(route, /const NEGATIVE_CACHE_MAX_ENTRIES = \d+/);
  assert.match(route, /negativeCache\.get\(url\)/);
  assert.match(route, /negativeCache\.set\(url,/);
  assert.match(route, /if \(cachedFailure\) return placeholderResponse\(cachedFailure\.cacheSeconds\)/);
  assert.match(route, /NEGATIVE_CACHE_SECONDS\.notFound/);
  assert.match(route, /NEGATIVE_CACHE_SECONDS\.upstreamError/);
  assert.ok(
    route.indexOf("const cachedFailure = getCachedFailure(url)") <
      route.indexOf("const r = await fetch(url"),
    "a cached failure is returned before an upstream fetch can start",
  );
});

test("thumbnail proxy serves cacheable SVG placeholders for remediated upstream failures", () => {
  assert.match(route, /r\.status === 404 \|\| r\.status === 410/);
  assert.match(route, /r\.status >= 500/);
  assert.match(route, /"content-type": "image\/svg\+xml"/);
  assert.match(route, /"cache-control": `public, max-age=\$\{cacheSeconds\}`/);
  assert.doesNotMatch(route, /console\.(?:error|warn|log)\(/);
});
