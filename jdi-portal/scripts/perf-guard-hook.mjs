#!/usr/bin/env node
/**
 * 성능 회귀 방지 훅 (Claude Code Stop 훅에서 호출)
 *
 * 목적: 바이브코딩으로 코드를 크게 손대다 실수로 속도 최적화(미들웨어 인증 캐시,
 * keepalive, 빠른 경로, 대시보드 사전 필터 등)를 깨뜨리는 것을 자동으로 잡아낸다.
 *
 * 동작:
 *  1) 순수 대화(코드 변경 없음)에선 아무것도 하지 않고 즉시 통과 → 느려지지 않음.
 *  2) jdi-portal/src 또는 supabase/migrations 에 변경이 있으면 `npm run test:performance` 실행.
 *  3) 테스트 실패 시 exit 2 로 Claude 에게 실패 내용을 전달 → Claude 가 원인을 찾아 고치게 한다.
 *
 * 무한루프 방지: Stop 훅 재진입(stop_hook_active)이면 조용히 통과한다.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- stdin(JSON) 읽기: Stop 훅 재진입이면 다시 검사하지 않는다 ---
let payload = {};
try {
  const raw = readFileSync(0, "utf8");
  if (raw && raw.trim()) payload = JSON.parse(raw);
} catch {
  /* stdin 없거나 JSON 아니면 무시 */
}
if (payload.stop_hook_active) process.exit(0);

// --- 1) 성능 민감 파일이 변경됐는지 확인 (없으면 즉시 통과) ---
let changed = "";
try {
  changed = execSync("git status --porcelain", {
    cwd: appRoot,
    encoding: "utf8",
  });
} catch {
  process.exit(0); // git 저장소가 아니거나 git 없으면 조용히 통과
}

const relevant = changed
  .split("\n")
  .map((line) => line.slice(3).trim()) // "XY path" 형식에서 경로만
  .filter(Boolean)
  .some((p) => p.includes("src/") || p.includes("supabase/migrations"));

if (!relevant) process.exit(0);

// --- 2) 성능 테스트 실행 ---
try {
  execSync("npm run test:performance", {
    cwd: appRoot,
    stdio: "pipe",
    encoding: "utf8",
  });
  process.exit(0); // 통과 → 조용히 종료
} catch (error) {
  const out = `${error.stdout || ""}\n${error.stderr || ""}`.trim();
  console.error(
    [
      "⚠️ 성능 회귀 방지 테스트 실패 — 최근 코드 변경이 사이트 속도 최적화를 깨뜨렸을 수 있습니다.",
      "루트 CLAUDE.md의 '성능 불변조건'을 확인하고, 원인이 된 변경을 되돌리거나 고친 뒤 다시 검증하세요.",
      "재현: cd jdi-portal && npm run test:performance",
      "",
      out,
    ].join("\n"),
  );
  process.exit(2); // Claude 에게 피드백 전달 → 자동 수정 유도
}
