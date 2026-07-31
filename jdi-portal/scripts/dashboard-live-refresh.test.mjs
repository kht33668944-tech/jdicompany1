import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p) => readFileSync(join(process.cwd(), p), "utf8");

// 검토 요청·업무지시 같은 새 알림은 Realtime 으로 즉시 도착하는데,
// 대시보드 위젯(검토할 업무 등)은 서버 렌더 데이터라 갱신 계기가 없으면
// 로그아웃 전까지 안 보이는 사고가 있었다 (2026-07-31).
// NotificationProvider 가 알림 도착을 window 이벤트로 방송하고,
// 대시보드가 그 이벤트를 받아 router.refresh() 로 즉시 데이터를 다시 불러야 한다.
test("알림이 Realtime 으로 도착하면 대시보드가 즉시 갱신된다", () => {
  const provider = read("src/components/dashboard/NotificationProvider.tsx");
  assert.match(
    provider,
    /dispatchEvent\(new CustomEvent\("jdi:notification-received"/,
    "NotificationProvider 는 알림 도착을 window 이벤트로 방송해야 합니다",
  );

  const client = read("src/components/dashboard/DashboardClient.tsx");
  assert.match(
    client,
    /addEventListener\("jdi:notification-received"/,
    "DashboardClient 는 알림 도착 이벤트를 받아 즉시 갱신해야 합니다",
  );
});

// next.config.ts 의 staleTimes(dynamic 5분) 때문에 메뉴를 오가면
// 라우터 캐시가 오래된 대시보드 화면을 그대로 되살린다.
// 마운트 직후 신선도 검사 + 화면이 보이는 동안 주기 검사(Realtime 유실 안전망)가 필요하다.
test("대시보드는 마운트 직후와 주기적으로 신선도를 검사한다", () => {
  const client = read("src/components/dashboard/DashboardClient.tsx");
  // 마운트 직후 한 번 — 라우터 캐시로 되살아난 오래된 화면 대비
  assert.match(
    client,
    /refreshIfStale\(\);\s*\n/,
    "마운트 시 refreshIfStale() 를 한 번 호출해야 합니다",
  );
  // 주기 검사 — Realtime 구독이 끊겨 있어도 몇 분 안에 따라잡는 안전망
  assert.match(client, /setInterval\(/, "화면이 보이는 동안 주기 신선도 검사가 필요합니다");
  assert.match(client, /clearInterval\(/, "주기 검사는 언마운트 시 정리해야 합니다");
});

// router.refresh() 가 실패(네트워크 끊김 등)하면 진행 중 표시가 영원히 남아
// 이후 모든 갱신이 막히는 사고를 막는다 — 진행 중 표시는 시간이 지나면 만료되어야 한다.
test("갱신 진행 중 표시는 실패 시에도 스스로 풀린다", () => {
  const client = read("src/components/dashboard/DashboardClient.tsx");
  assert.match(
    client,
    /REFRESH_IN_FLIGHT_TIMEOUT_MS/,
    "진행 중 표시(inFlight)는 타임아웃으로 만료되어야 영구히 갱신이 막히지 않습니다",
  );
});
