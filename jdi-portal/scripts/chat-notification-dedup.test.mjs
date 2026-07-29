/**
 * 채팅 알림 중복 회귀 방지 (정적 검사)
 *
 * 배경: 메시지 1건에 Windows 알림이 3개 떴다.
 *  1) 서버 웹푸시(서비스워커) 2) 브라우저 페이지 Realtime 3) 데스크톱 앱 Realtime
 * 같은 기기의 1)과 2)가 겹치는 것이 앱이 고칠 수 있는 중복이었고,
 * 기기별로 끄려고 설정을 만지면 DB 전역 값이 꺼져 휴대폰 푸시까지 죽었다.
 *
 * 아래 검사는 그 세 가지 수정이 되돌려지지 않았는지 확인한다.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const appRoot = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return readFileSync(path.join(appRoot, relativePath), "utf8");
}

test("서비스워커: 포털 화면이 보이는 중이면 푸시 알림을 띄우지 않는다", () => {
  const sw = read("public/sw.js");

  assert.match(
    sw,
    /visibilityState === "visible"/,
    "보이는 창 판정이 사라졌습니다 — 페이지 알림과 푸시 알림이 다시 겹칩니다.",
  );
  assert.match(
    sw,
    /client\.url\.startsWith\(self\.location\.origin\)/,
    "다른 origin 창까지 '열려 있음'으로 세면 알림이 통째로 사라질 수 있습니다.",
  );

  // push 핸들러가 실제로 그 판정을 기다렸다가 알림을 띄우는지
  const pushHandler = sw.slice(sw.indexOf('addEventListener("push"'));
  assert.match(
    pushHandler,
    /if \(await hasVisiblePortalWindow\(\)\) return;/,
    "push 핸들러가 보이는 창 판정을 건너뛰고 있습니다.",
  );
  assert.match(
    pushHandler,
    /await self\.registration\.showNotification\(title, options\)/,
    "판정 뒤에도 알림은 정상적으로 표시되어야 합니다.",
  );
});

test("페이지 알림: 화면이 안 보이고 푸시 구독이 있으면 서비스워커에 양보한다", () => {
  const desktop = read("src/lib/notifications/desktop.ts");

  // 서비스워커가 "보이는 창"을 양보하므로, 페이지는 반대로 "안 보이는 창"을 양보해야
  // 최소화·백그라운드 상태에서 알림이 2개 뜨는 구멍이 막힌다.
  assert.match(
    desktop,
    /if \(pushSubscribed && document\.visibilityState === "hidden"\) return;/,
    "이 가드가 없으면 창이 최소화됐을 때 푸시와 페이지 알림이 둘 다 뜹니다.",
  );
  assert.match(
    desktop,
    /reg\?\.pushManager\.getSubscription\(\)/,
    "구독 여부를 실제로 확인하지 않으면 데스크톱 앱 알림까지 잘못 막힙니다.",
  );
  assert.match(
    desktop,
    /document\.addEventListener\("visibilitychange", refreshPushSubscribed\)/,
    "구독을 켜고 끈 뒤에도 캐시가 갱신되어야 합니다.",
  );
});

test("설정: 푸시 끄기는 이 기기 구독만 해제하고 DB 전역 값을 끄지 않는다", () => {
  const section = read("src/components/dashboard/settings/NotificationsSection.tsx");

  assert.match(
    section,
    /await unsubscribeFromPush\(userId\)/,
    "OFF 전환이 이 기기 구독을 해제하지 않으면 그 기기로 푸시가 계속 옵니다.",
  );
  assert.doesNotMatch(
    section,
    /updateNotificationSettings\(\{\s*push_enabled:\s*false/,
    "push_enabled 는 모든 기기 공용입니다. false 로 쓰면 PC에서 껐을 때 휴대폰 푸시까지 죽습니다.",
  );
  // ON 전환은 반대로 전역 값을 켜 두어야 push-dispatch 필터를 통과한다.
  assert.match(
    section,
    /updateNotificationSettings\(\{\s*push_enabled:\s*true\s*\}\)/,
    "ON 전환에서 전역 push_enabled 를 켜지 않으면 서버가 푸시를 보내지 않습니다.",
  );
});

test("1:1 대화 알림 제목에 빈 괄호·빈 접두어가 붙지 않는다", () => {
  // 1:1 대화방은 name 이 빈 문자열로 저장된다 (069_chat_dm.sql).
  const dmMigration = read("supabase/migrations/069_chat_dm.sql");
  assert.match(
    dmMigration,
    /VALUES \('',\s*'',\s*'dm'/,
    "DM 채널 이름 저장 방식이 바뀌었다면 아래 두 검사의 전제를 다시 확인하세요.",
  );

  const provider = read("src/components/dashboard/chat/ChatUnreadProvider.tsx");
  assert.match(
    provider,
    /channelInfo\?\.name\?\.trim\(\) \?\? ""/,
    "`?? \"채팅\"` 은 null 만 걸러내 빈 문자열이 통과합니다 — 제목이 '이용준 ()' 이 됩니다.",
  );
  assert.match(
    provider,
    /channelName \? `\$\{senderName\} \(\$\{channelName\}\)` : senderName/,
    "채널 이름이 없으면 괄호 없이 보낸 사람 이름만 써야 합니다.",
  );

  const dispatch = read("supabase/functions/push-dispatch/index.ts");
  assert.match(
    dispatch,
    /channelName \? `\$\{channelName\} - \$\{senderName\}` : senderName/,
    "채널 이름이 없으면 '- 이용준' 이 아니라 '이용준' 이어야 합니다.",
  );
});
