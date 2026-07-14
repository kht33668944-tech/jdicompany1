import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const layout = readFileSync(path.join(appRoot, "src/app/layout.tsx"), "utf8");
const globals = readFileSync(path.join(appRoot, "src/app/globals.css"), "utf8");
const loginCard = readFileSync(path.join(appRoot, "src/components/LoginCard.tsx"), "utf8");

test("Stage 7 removes Google Inter while retaining the existing Pretendard stylesheet", () => {
  assert.doesNotMatch(layout, /next\/font\/google/);
  assert.doesNotMatch(layout, /\bInter\b|\binter\b|--font-inter/);
  assert.doesNotMatch(globals, /--font-inter/);
  assert.match(
    globals,
    /--font-sans:\s*"Pretendard",\s*system-ui,\s*-apple-system,\s*BlinkMacSystemFont,\s*"Segoe UI",\s*sans-serif;/,
  );
  assert.match(
    layout,
    /https:\/\/cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard@v1\.3\.9\/dist\/web\/static\/pretendard\.min\.css/,
  );
});

test("successful login records privacy-safe milestones without an approval round trip", () => {
  const marks = ["login-auth", "login-dashboard-navigation"];
  for (const mark of marks) {
    assert.match(loginCard, new RegExp(`performance\\.mark\\("${mark}"\\)`));
  }

  const authMark = loginCard.indexOf('performance.mark("login-auth")');
  const navigationMark = loginCard.indexOf('performance.mark("login-dashboard-navigation")');
  const signIn = loginCard.indexOf("await supabase.auth.signInWithPassword");
  const navigation = loginCard.indexOf("router.replace(nextPath)");

  assert.ok(signIn < authMark && authMark < navigationMark);
  assert.ok(navigationMark < navigation);
  assert.doesNotMatch(loginCard, /\.from\(["']profiles["']\)|select\(["']is_approved["']\)/);
  assert.doesNotMatch(loginCard, /performance\.mark\([^)]*(?:username|email|user\.id|password|nextPath|error)/i);
});
