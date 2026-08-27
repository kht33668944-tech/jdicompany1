import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const appRoot = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return readFileSync(path.join(appRoot, relativePath), "utf8");
}

const routeSource = read("src/app/api/cron/jandi-report/route.ts");
const middlewareSource = read("src/lib/supabase/middleware.ts");

test("라우트는 CRON_SECRET 을 상수시간으로 비교한다", () => {
  assert.match(routeSource, /CRON_SECRET/);
  assert.match(routeSource, /timingSafeEqual/);
});

test("라우트는 비밀키 불일치 시 401 을 준다", () => {
  assert.match(routeSource, /status:\s*401/);
});

test("라우트는 오류 내용을 응답 본문에 담지 않는다", () => {
  // 내부 오류 메시지(스택, DB 오류)를 그대로 클라이언트에 흘리면 안 된다.
  assert.ok(
    !/JSON\.stringify\(\s*error/.test(routeSource),
    "오류 객체를 응답 본문에 직렬화하면 안 됩니다",
  );
  assert.ok(
    !/message:\s*(error|String\(error\))/.test(routeSource),
    "오류 메시지를 응답 본문에 담으면 안 됩니다",
  );
});

test("웹훅 주소와 비밀키가 소스에 하드코딩되어 있지 않다", () => {
  for (const source of [routeSource, read("src/lib/jandi/send.ts")]) {
    assert.ok(
      !/wh\.jandi\.com/.test(source),
      "잔디 웹훅 주소를 소스에 넣으면 안 됩니다 — 환경변수로만 씁니다",
    );
  }
});

test("미들웨어는 /api/cron/ 을 로그인 리다이렉트에서 제외한다", () => {
  assert.match(middlewareSource, /startsWith\("\/api\/cron\/"\)/);
});

test("미들웨어는 /api/cron/ 을 인증 조기 생략 목록에 넣지 않는다", () => {
  // 조기 생략 목록은 updateSession 맨 앞의 즉시 통과 블록이다.
  // 여기에 /api/cron/ 이 들어가면 성능 장치의 의미가 흐려지고 경계가 무너진다.
  const earlyExit = middlewareSource.split("let supabaseResponse")[0];
  assert.ok(
    earlyExit.includes('"/api/health"') && earlyExit.includes('"/api/keepalive"'),
    "조기 생략 목록의 위치를 찾지 못했습니다 — 테스트를 갱신하세요",
  );
  assert.ok(
    !earlyExit.includes("/api/cron"),
    "/api/cron/ 을 인증 조기 생략 목록에 넣으면 안 됩니다",
  );
});
