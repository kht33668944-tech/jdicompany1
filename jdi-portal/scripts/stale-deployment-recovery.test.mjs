import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const read = (p) => readFileSync(join(process.cwd(), p), "utf8");
const exists = (p) => existsSync(join(process.cwd(), p));

/**
 * 배포하면 Next.js 가 Server Action ID 를 새로 만들기 때문에, 그 전에 열려 있던
 * 화면은 `Server Action ... was not found on the server` 로 실패한다.
 * 데스크톱 앱이 트레이에 상주해 화면을 며칠씩 열어 두는 환경이라 매 배포마다
 * 직원이 이 오류를 만난다 — 2026-07-30 운영에서 실제 발생.
 */

test("배포 갱신 오류를 알아보고 안내 문구로 바꾼다", () => {
  const src = read("src/lib/utils/errors.ts");

  assert.match(src, /export function isStaleDeploymentError/);
  // Next 버전에 따라 문구가 달라서 두 가지를 모두 본다.
  assert.match(src, /Failed to find Server Action/);
  assert.match(src, /was not found on the server/);

  // 앱 전체가 쓰는 통로에서 영어 원문 대신 안내를 돌려주고 감시자에게 알린다.
  assert.match(src, /export function getErrorMessage/);
  assert.match(src, /isStaleDeploymentError\(error\)/);
  assert.match(src, /STALE_DEPLOYMENT_MESSAGE/);
  assert.match(src, /dispatchEvent\(new CustomEvent\(STALE_DEPLOYMENT_EVENT\)\)/);
  // 서버 렌더링 중에는 window 가 없으므로 반드시 가드가 있어야 한다.
  assert.match(src, /typeof window/);
});

test("감시자가 새로고침을 처리하고, 작성 중인 내용은 지키며, 무한 새로고침을 막는다", () => {
  const path = "src/components/dashboard/StaleDeploymentWatcher.tsx";
  assert.ok(exists(path), `${path} 가 없습니다`);
  const src = read(path);

  assert.match(src, /^"use client";/m);

  // 가로챈 오류(이벤트) + 아무도 안 받은 오류(2종) 모두 잡아야 한다.
  assert.match(src, /addEventListener\(STALE_DEPLOYMENT_EVENT/);
  assert.match(src, /addEventListener\("unhandledrejection"/);
  assert.match(src, /addEventListener\("error"/);

  // 실제로 새로고침을 해야 의미가 있다.
  assert.match(src, /window\.location\.reload\(\)/);

  // 작성 중이던 글을 날리지 않는다 → 입력이 있으면 자동 새로고침 대신 버튼을 준다.
  // (판별 방법은 자유롭게 바꾸되, 자동 새로고침이 조건부라는 점과 버튼 제공은 유지한다.)
  assert.match(src, /canAutoReload/);
  assert.match(src, /label: "새로고침"/);

  // 새로고침 뒤 같은 오류가 반복되면 무한 새로고침이 된다 — 쿨다운 필수.
  assert.match(src, /RELOAD_COOLDOWN_MS/);

  // 여러 경로에서 신호가 겹쳐 와도 한 번만 처리한다.
  assert.match(src, /handled/);

  // 정리 함수에서 리스너와 타이머를 모두 걷는다.
  assert.match(src, /removeEventListener\(STALE_DEPLOYMENT_EVENT/);
  assert.match(src, /clearTimeout\(/);
});

test("감시자가 대시보드 전체에 실제로 붙어 있다", () => {
  const shell = read("src/components/dashboard/DashboardShell.tsx");
  assert.match(shell, /import StaleDeploymentWatcher from "\.\/StaleDeploymentWatcher"/);
  assert.match(shell, /<StaleDeploymentWatcher \/>/);
});
