# Web Push 알림 시스템 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** JDI 포털에서 채팅 메시지/in-app 알림이 발생하면 사용자의 폰/PC에 OS 푸시 알림이 도달하도록 한다.

**Architecture:** Supabase Database Webhook이 INSERT 이벤트를 Edge Function `push-dispatch`로 전달하면, 함수가 수신자를 결정하고 web-push 라이브러리로 VAPID 서명한 후 FCM/APNs에 발송한다. 클라이언트는 Service Worker 등록 + PushSubscription을 받아 Supabase에 저장한다.

**Tech Stack:**
- 프론트: Next.js 16 (App Router) + 수동 sw.js
- 백엔드: Supabase Edge Function (Deno) + DB Webhook
- 푸시: web-push 3.x (Deno esm.sh) + VAPID
- DB: PostgreSQL (Supabase)

**관련 문서:** `docs/superpowers/specs/2026-04-08-web-push-notifications-design.md`

**테스트 정책:** 본 프로젝트는 자동화된 테스트 프레임워크가 없다. 검증은 (1) `npm run lint`, (2) `npm run build`, (3) 수동 브라우저 검증으로 한다. 각 task는 끝에 명시된 검증 단계를 반드시 수행한다.

---

## 파일 구조 개요

**신규 생성:**
- `supabase/migrations/054_push_subscriptions.sql` — push_subscriptions 테이블 + notification_settings 컬럼 + channel_members.last_seen_at
- `supabase/functions/push-dispatch/index.ts` — Edge Function 본체
- `supabase/functions/push-dispatch/deno.json` — Deno import map
- `src/lib/push/constants.ts` — VAPID 공개키 export
- `src/lib/push/subscribe.ts` — 권한 요청 + Subscription 발급/해제
- `src/lib/push/actions.ts` — DB INSERT/DELETE
- `src/components/dashboard/chat/PushPromptBanner.tsx` — 채팅 진입 시 안내 배너

**수정:**
- `public/sw.js` — push, notificationclick 핸들러 추가
- `src/lib/notifications/types.ts` — `chat_message` 타입 추가
- `src/lib/notifications/constants.ts` — SETTING_TYPE_MAP 확장
- `src/lib/settings/types.ts` — NotificationSettings에 push_enabled, chat_message_notify 추가
- `src/lib/settings/actions.ts` — updateNotificationSettings 시그니처 확장
- `src/components/dashboard/settings/NotificationsSection.tsx` — 푸시 마스터 토글 + 채팅 토글 + 권한 연동
- `src/components/dashboard/chat/ChatPageClient.tsx` — PushPromptBanner 마운트 + last_seen_at heartbeat
- `.env.example` — NEXT_PUBLIC_VAPID_PUBLIC_KEY 추가

**수동 단계 (사용자가 직접 실행):**
- VAPID 키 페어 생성
- Vercel/Supabase 환경변수 등록
- `supabase db push --linked`
- `supabase functions deploy push-dispatch --no-verify-jwt`
- Supabase Studio에서 Database Webhook 2개 등록
- 본인 폰/PC에서 직접 검증

---

## Task 1: VAPID 키 생성과 환경변수 등록 (수동)

**왜 먼저:** 모든 구현이 이 키에 의존한다. 안 만들고 진행하면 나중에 모든 task를 다시 검증해야 한다.

**Files:**
- Modify: `.env.example` (key 자체는 커밋하지 않고 placeholder만)

- [ ] **Step 1: VAPID 키 페어 생성**

로컬 터미널에서 실행:
```bash
npx web-push generate-vapid-keys --json
```

출력 예시 (절대 커밋하지 말 것):
```json
{
  "publicKey": "BEx...길이 65자",
  "privateKey": "abc...길이 43자"
}
```

publicKey, privateKey를 임시 메모장에 복사해둔다.

- [ ] **Step 2: Vercel 환경변수 등록**

Vercel 대시보드 → 프로젝트 → Settings → Environment Variables 에 추가:
- 이름: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- 값: 위 publicKey
- 환경: Production / Preview / Development 모두 체크

- [ ] **Step 3: Supabase Secrets 등록**

Supabase 대시보드 → Project Settings → Edge Functions → Secrets 에 추가 (또는 CLI):
```bash
npx supabase secrets set VAPID_PUBLIC_KEY="BEx..." --linked
npx supabase secrets set VAPID_PRIVATE_KEY="abc..." --linked
npx supabase secrets set VAPID_SUBJECT="mailto:admin@jdicompany.com" --linked
```

> SERVICE_ROLE_KEY는 Edge Function이 자동으로 `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`로 접근 가능하므로 별도 등록 불필요.

- [ ] **Step 4: .env.example 갱신**

파일 마지막 줄에 추가:
```
# Web Push (값은 Vercel 대시보드에서 관리, 절대 커밋 X)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
```

- [ ] **Step 5: 로컬 .env.local 갱신**

`.env.local`에 publicKey 추가 (이 파일은 .gitignore에 있어야 함):
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BEx...
```

- [ ] **Step 6: 커밋**

```bash
git add .env.example
git commit -m "설정: NEXT_PUBLIC_VAPID_PUBLIC_KEY 환경변수 placeholder 추가"
```

---

## Task 2: DB 마이그레이션 054 — 스키마 추가

**Files:**
- Create: `supabase/migrations/054_push_subscriptions.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/054_push_subscriptions.sql`:

```sql
-- 054_push_subscriptions.sql
-- Web Push 알림: subscription 저장 + 알림 설정 확장 + 채널 활성 추적

-- ============================================================
-- 1. push_subscriptions 테이블
-- ============================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user
  ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 본인 subscription만 조회/추가/삭제
CREATE POLICY "Users select own push_subscriptions"
  ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own push_subscriptions"
  ON public.push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_approved_user());

CREATE POLICY "Users delete own push_subscriptions"
  ON public.push_subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- 2. notification_settings 컬럼 추가
-- ============================================================
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS push_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS chat_message_notify BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.notification_settings.push_enabled IS
  '브라우저 푸시 알림 마스터 스위치. 사용자가 권한을 동의하고 켰을 때만 TRUE.';
COMMENT ON COLUMN public.notification_settings.chat_message_notify IS
  '채팅 메시지 푸시 수신 여부. push_enabled = TRUE 일 때만 의미 있음.';

-- ============================================================
-- 3. channel_members 활성 추적
-- ============================================================
ALTER TABLE public.channel_members
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.channel_members.last_seen_at IS
  '사용자가 마지막으로 이 채널을 보고 있다고 신고한 시각. 5초 이내면 active로 간주, push 발송 제외.';

CREATE INDEX IF NOT EXISTS idx_channel_members_last_seen
  ON public.channel_members(channel_id, last_seen_at);

-- ============================================================
-- 4. heartbeat RPC — 채팅방 보고 있는 동안 5초마다 호출
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_channel_seen(p_channel_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.channel_members
  SET last_seen_at = NOW()
  WHERE channel_id = p_channel_id AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_channel_seen(UUID) TO authenticated;
```

- [ ] **Step 2: 마이그레이션 적용**

```bash
npx supabase db push --linked
```

기대 출력:
```
Applying migration 054_push_subscriptions.sql...
Finished supabase db push.
```

- [ ] **Step 3: Supabase Studio에서 검증**

브라우저에서 Supabase 대시보드 → Table Editor 에서 다음을 확인:
- `push_subscriptions` 테이블이 존재하고 컬럼 7개
- `notification_settings`에 `push_enabled`, `chat_message_notify` 컬럼 있음
- `channel_members`에 `last_seen_at` 컬럼 있음

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/054_push_subscriptions.sql
git commit -m "DB: push_subscriptions 테이블 + notification_settings 푸시 컬럼 + channel_members.last_seen_at"
```

---

## Task 3: Service Worker에 push 핸들러 추가

**Files:**
- Modify: `public/sw.js`

- [ ] **Step 1: push 이벤트 핸들러 추가**

`public/sw.js` 파일 마지막(현재 fetch 핸들러 다음, 파일 끝)에 추가:

```javascript
// ============================================================
// Web Push 알림
// ============================================================
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { title: "JDI 포털", body: event.data?.text() ?? "" };
  }

  const title = payload.title || "JDI 포털";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || payload.link || "jdi-portal",
    data: { link: payload.link || "/dashboard" },
    requireInteraction: false,
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/dashboard";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // 이미 열린 PWA/탭이 있으면 그쪽으로 포커스
      for (const client of all) {
        if (client.url.includes(self.location.origin)) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(link);
            } catch {
              /* navigate가 막히면 postMessage로 라우팅 */
              client.postMessage({ type: "NAVIGATE", link });
            }
          }
          return;
        }
      }
      // 없으면 새 창
      await self.clients.openWindow(link);
    })()
  );
});
```

- [ ] **Step 2: 캐시 버전 올리기**

같은 파일 line 12 부근:
```javascript
const CACHE_VERSION = "jdi-v1";
```
→ 변경:
```javascript
const CACHE_VERSION = "jdi-v2-push";
```

이렇게 해야 기존 클라이언트들이 새 SW로 자동 교체된다.

- [ ] **Step 3: lint 검증**

```bash
npm run lint
```

기대: 에러 0건. 경고만 있어도 OK (sw.js는 보통 lint 대상에서 제외).

- [ ] **Step 4: 빌드 검증**

```bash
npm run build
```

기대: build success. sw.js는 public/이라 빌드에 영향 없지만 안전 차원에서 확인.

- [ ] **Step 5: 커밋**

```bash
git add public/sw.js
git commit -m "SW: push, notificationclick 이벤트 핸들러 추가 (캐시 v2-push)"
```

---

## Task 4: notifications 타입에 chat_message 추가

**Files:**
- Modify: `src/lib/notifications/types.ts`
- Modify: `src/lib/notifications/constants.ts`

- [ ] **Step 1: NotificationType 확장**

`src/lib/notifications/types.ts` line 1-10 의 union type에 `"chat_message"` 추가:

```typescript
export type NotificationType =
  | "task_assigned"
  | "task_comment"
  | "task_status_changed"
  | "task_deadline"
  | "vacation_approved"
  | "vacation_rejected"
  | "schedule_invite"
  | "system_announce"
  | "signup_pending"
  | "chat_message";
```

- [ ] **Step 2: NOTIFICATION_TYPE_CONFIG 확장**

`src/lib/notifications/constants.ts`의 `NOTIFICATION_TYPE_CONFIG` 객체에 항목 추가 (signup_pending 다음):

```typescript
  signup_pending: { label: "가입 승인 대기", icon: "UserCirclePlus", color: "text-orange-500" },
  chat_message: { label: "채팅 메시지", icon: "ChatCircle", color: "text-indigo-500" },
};
```

- [ ] **Step 3: SETTING_TYPE_MAP 확장**

같은 파일의 SETTING_TYPE_MAP에 항목 추가:

```typescript
export const SETTING_TYPE_MAP: Record<string, NotificationType[]> = {
  vacation_notify: ["vacation_approved", "vacation_rejected"],
  schedule_remind: ["schedule_invite"],
  task_deadline: ["task_deadline", "task_assigned", "task_comment", "task_status_changed"],
  system_announce: ["system_announce", "signup_pending"],
  chat_message_notify: ["chat_message"],
};
```

- [ ] **Step 4: 빌드 검증**

```bash
npm run build
```

기대: build success, type error 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/notifications/types.ts src/lib/notifications/constants.ts
git commit -m "타입: NotificationType에 chat_message 추가, SETTING_TYPE_MAP 확장"
```

---

## Task 5: settings 타입/액션 확장

**Files:**
- Modify: `src/lib/settings/types.ts`
- Modify: `src/lib/settings/actions.ts`

- [ ] **Step 1: NotificationSettings 인터페이스 확장**

`src/lib/settings/types.ts`:

```typescript
export type SettingsTab = "profile" | "account" | "notifications" | "admin";

export interface NotificationSettings {
  user_id: string;
  vacation_notify: boolean;
  schedule_remind: boolean;
  task_deadline: boolean;
  system_announce: boolean;
  push_enabled: boolean;
  chat_message_notify: boolean;
}

export interface Department {
  id: string;
  name: string;
  created_at: string;
}
```

- [ ] **Step 2: settings/actions.ts 확인 및 수정**

먼저 현재 파일을 읽고 `updateNotificationSettings` 함수가 어떤 타입을 받는지 확인:

```bash
# 사용자가 직접 확인할 필요 없음 — agent가 Read 도구로 확인
```

시그니처가 `Partial<Omit<NotificationSettings, "user_id">>`를 받도록 되어 있으면 그대로 동작. 만약 명시적으로 4개 필드만 받는 형태라면 `Partial<...>`로 일반화한다.

수정 예시 (필요한 경우만):
```typescript
export async function updateNotificationSettings(
  userId: string,
  settings: Partial<Omit<NotificationSettings, "user_id">>
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("notification_settings")
    .upsert({ user_id: userId, ...settings, updated_at: new Date().toISOString() });
  if (error) throw error;
}
```

- [ ] **Step 3: 빌드 검증**

```bash
npm run build
```

기대: build success.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/settings/types.ts src/lib/settings/actions.ts
git commit -m "타입: NotificationSettings에 push_enabled, chat_message_notify 추가"
```

---

## Task 6: 푸시 도메인 모듈 — constants

**Files:**
- Create: `src/lib/push/constants.ts`

- [ ] **Step 1: 파일 생성**

`src/lib/push/constants.ts`:

```typescript
/** Web Push VAPID 공개키 — 빌드 시 환경변수로 주입 */
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** Service Worker 등록 경로 */
export const SW_PATH = "/sw.js";

/** localStorage 키: 채팅 진입 배너를 본 적이 있는지 */
export const CHAT_PUSH_PROMPT_KEY = "chat_push_prompt_dismissed";

/** Base64URL → Uint8Array 변환 (PushManager.subscribe applicationServerKey 형식 요건) */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
```

- [ ] **Step 2: 빌드 검증**

```bash
npm run build
```

- [ ] **Step 3: 커밋**

```bash
git add src/lib/push/constants.ts
git commit -m "푸시: VAPID 상수와 base64 변환 유틸 추가"
```

---

## Task 7: 푸시 도메인 모듈 — actions (DB 입출력)

**Files:**
- Create: `src/lib/push/actions.ts`

- [ ] **Step 1: 파일 생성**

`src/lib/push/actions.ts`:

```typescript
import { createClient } from "@/lib/supabase/client";

function getSupabase() {
  return createClient();
}

export interface SubscriptionPayload {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

/**
 * 같은 endpoint가 이미 있으면 무시 (UNIQUE 제약). 새 endpoint면 INSERT.
 */
export async function savePushSubscription(
  userId: string,
  payload: SubscriptionPayload
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: payload.endpoint,
        p256dh: payload.p256dh,
        auth: payload.auth,
        user_agent: payload.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" }
    );
  if (error) throw error;
}

export async function deletePushSubscription(
  userId: string,
  endpoint: string
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);
  if (error) throw error;
}

/**
 * 채팅방 보고 있다는 신호를 5초 주기로 호출.
 * RPC가 last_seen_at = NOW() 갱신.
 */
export async function touchChannelSeen(channelId: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.rpc("touch_channel_seen", { p_channel_id: channelId });
}
```

- [ ] **Step 2: 빌드 검증**

```bash
npm run build
```

- [ ] **Step 3: 커밋**

```bash
git add src/lib/push/actions.ts
git commit -m "푸시: subscription DB 액션과 channel heartbeat RPC 래퍼 추가"
```

---

## Task 8: 푸시 도메인 모듈 — subscribe (브라우저 API)

**Files:**
- Create: `src/lib/push/subscribe.ts`

- [ ] **Step 1: 파일 생성**

`src/lib/push/subscribe.ts`:

```typescript
import { VAPID_PUBLIC_KEY, SW_PATH, urlBase64ToUint8Array } from "./constants";
import { savePushSubscription, deletePushSubscription } from "./actions";

export type PushSupport = "ok" | "no-sw" | "no-push" | "no-notification" | "no-vapid";

/** 현재 환경이 Web Push를 지원하는지 + VAPID 키가 주입됐는지 확인 */
export function checkPushSupport(): PushSupport {
  if (typeof window === "undefined") return "no-sw";
  if (!("serviceWorker" in navigator)) return "no-sw";
  if (!("PushManager" in window)) return "no-push";
  if (!("Notification" in window)) return "no-notification";
  if (!VAPID_PUBLIC_KEY) return "no-vapid";
  return "ok";
}

/** 현재 브라우저에 활성 subscription이 있는지 */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (checkPushSupport() !== "ok") return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/** 권한 요청. "granted" | "denied" | "default" 반환 */
export async function requestPushPermission(): Promise<NotificationPermission> {
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

/**
 * 권한 요청 → SW 등록 확인 → subscribe → DB 저장.
 * 실패 시 throw. 이미 구독되어 있으면 그 subscription을 다시 DB에 upsert만 한다.
 */
export async function subscribeToPush(userId: string): Promise<PushSubscription> {
  const support = checkPushSupport();
  if (support !== "ok") {
    throw new Error(`푸시를 지원하지 않는 환경입니다 (${support})`);
  }

  const permission = await requestPushPermission();
  if (permission !== "granted") {
    throw new Error("알림 권한이 거부되었습니다.");
  }

  // SW 등록 (이미 등록되어 있으면 그대로 사용)
  let reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!reg) {
    reg = await navigator.serviceWorker.register(SW_PATH);
    await navigator.serviceWorker.ready;
  }

  // 기존 subscription 재사용 또는 신규
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  await savePushSubscription(userId, {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    userAgent: navigator.userAgent,
  });

  return sub;
}

/** 로컬 unsubscribe + DB DELETE */
export async function unsubscribeFromPush(userId: string): Promise<void> {
  const sub = await getCurrentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await deletePushSubscription(userId, endpoint);
}
```

- [ ] **Step 2: 빌드 검증**

```bash
npm run build
```

- [ ] **Step 3: 커밋**

```bash
git add src/lib/push/subscribe.ts
git commit -m "푸시: SW 등록 + 권한 요청 + PushManager 구독 모듈 추가"
```

---

## Task 9: 설정 페이지 — 푸시 토글 추가

**Files:**
- Modify: `src/components/dashboard/settings/NotificationsSection.tsx`

- [ ] **Step 1: 컴포넌트 전면 교체**

`src/components/dashboard/settings/NotificationsSection.tsx` 전체 내용을 다음으로 교체:

```typescript
"use client";

import { useEffect, useState } from "react";
import { AirplaneTilt, CalendarPlus, Timer, Megaphone, ChatCircle, BellRinging } from "phosphor-react";
import { updateNotificationSettings } from "@/lib/settings/actions";
import { subscribeToPush, unsubscribeFromPush, checkPushSupport, getCurrentSubscription } from "@/lib/push/subscribe";
import type { NotificationSettings } from "@/lib/settings/types";

interface NotificationsSectionProps {
  userId: string;
  initialSettings: NotificationSettings | null;
}

const TOGGLE_ITEMS = [
  {
    key: "chat_message_notify" as const,
    label: "채팅 메시지",
    description: "새 채팅 메시지가 오면 푸시 알림으로 받습니다.",
    icon: ChatCircle,
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-500",
  },
  {
    key: "vacation_notify" as const,
    label: "휴가 승인/반려 알림",
    description: "상신한 휴가 신청의 처리 결과에 대해 실시간 알림을 받습니다.",
    icon: AirplaneTilt,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-500",
  },
  {
    key: "schedule_remind" as const,
    label: "일정 리마인더",
    description: "등록된 회의 및 스케줄 시작 10분 전에 알림을 받습니다.",
    icon: CalendarPlus,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-500",
  },
  {
    key: "task_deadline" as const,
    label: "할일 마감 알림",
    description: "마감 기한이 임박한 할일 목록에 대해 안내 알림을 받습니다.",
    icon: Timer,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-500",
  },
  {
    key: "system_announce" as const,
    label: "시스템 공지사항",
    description: "서비스 정기 점검 및 주요 정책 변경 사항을 안내받습니다.",
    icon: Megaphone,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-500",
  },
];

const DEFAULT_SETTINGS = {
  vacation_notify: true,
  schedule_remind: true,
  task_deadline: false,
  system_announce: true,
  push_enabled: false,
  chat_message_notify: true,
};

export default function NotificationsSection({ userId, initialSettings }: NotificationsSectionProps) {
  const [settings, setSettings] = useState({
    vacation_notify: initialSettings?.vacation_notify ?? DEFAULT_SETTINGS.vacation_notify,
    schedule_remind: initialSettings?.schedule_remind ?? DEFAULT_SETTINGS.schedule_remind,
    task_deadline: initialSettings?.task_deadline ?? DEFAULT_SETTINGS.task_deadline,
    system_announce: initialSettings?.system_announce ?? DEFAULT_SETTINGS.system_announce,
    push_enabled: initialSettings?.push_enabled ?? DEFAULT_SETTINGS.push_enabled,
    chat_message_notify: initialSettings?.chat_message_notify ?? DEFAULT_SETTINGS.chat_message_notify,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supportMsg, setSupportMsg] = useState<string | null>(null);

  // 초기 마운트 시 환경 지원 여부 + 실제 브라우저 subscription 상태 동기화
  useEffect(() => {
    const support = checkPushSupport();
    if (support !== "ok") {
      const messages: Record<string, string> = {
        "no-sw": "이 브라우저는 Service Worker를 지원하지 않습니다.",
        "no-push": "이 브라우저는 Web Push를 지원하지 않습니다.",
        "no-notification": "이 브라우저는 알림 API를 지원하지 않습니다.",
        "no-vapid": "푸시 키가 설정되지 않았습니다. 관리자에게 문의하세요.",
      };
      setSupportMsg(messages[support]);
      return;
    }
    // 실제 브라우저에 sub 없는데 DB는 push_enabled = true 라면 OFF로 보정
    void (async () => {
      const sub = await getCurrentSubscription();
      if (!sub && settings.push_enabled) {
        setSettings((s) => ({ ...s, push_enabled: false }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePushMaster = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (settings.push_enabled) {
        // OFF 전환
        await unsubscribeFromPush(userId);
        const next = { ...settings, push_enabled: false };
        setSettings(next);
        await updateNotificationSettings(userId, { push_enabled: false });
      } else {
        // ON 전환
        await subscribeToPush(userId);
        const next = { ...settings, push_enabled: true };
        setSettings(next);
        await updateNotificationSettings(userId, { push_enabled: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "푸시 설정 변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (key: keyof typeof settings) => {
    if (key === "push_enabled") return handlePushMaster();
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    try {
      await updateNotificationSettings(userId, { [key]: updated[key] });
    } catch {
      setSettings(settings);
    }
  };

  const childDisabled = !settings.push_enabled;

  return (
    <section className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 p-8">
      <div className="mb-8">
        <h2 className="text-lg font-bold text-slate-800">알림 설정</h2>
        <p className="text-xs text-slate-400 mt-1">업무 관련 알림 수신 여부를 개별적으로 설정할 수 있습니다.</p>
      </div>

      {/* 마스터 토글 */}
      <div className="mb-6 p-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white text-indigo-500 flex items-center justify-center shadow-sm">
            <BellRinging size={24} weight="fill" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-700">푸시 알림 받기</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              브라우저/PWA가 닫혀 있어도 폰에서 알림을 받습니다.
              <br />
              <span className="text-slate-400">※ iPhone은 홈 화면에 앱 설치 후 사용 가능합니다.</span>
            </p>
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            {supportMsg && <p className="text-xs text-amber-600 mt-1">{supportMsg}</p>}
          </div>
        </div>
        <button
          onClick={handlePushMaster}
          disabled={busy || !!supportMsg}
          className={`relative w-12 h-6 rounded-full transition-colors disabled:opacity-50 ${
            settings.push_enabled ? "bg-indigo-500" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white border-2 transition-all ${
              settings.push_enabled ? "right-0.5 border-indigo-500" : "left-0.5 border-slate-300"
            }`}
          />
        </button>
      </div>

      {/* 종류별 토글 */}
      <div className={`space-y-4 ${childDisabled ? "opacity-50 pointer-events-none" : ""}`}>
        {TOGGLE_ITEMS.map((item) => {
          const Icon = item.icon;
          const checked = settings[item.key];
          return (
            <div
              key={item.key}
              className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100"
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl ${item.iconBg} ${item.iconColor} flex items-center justify-center`}>
                  <Icon size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-700">{item.label}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle(item.key)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  checked ? "bg-indigo-400" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white border-2 transition-all ${
                    checked ? "right-0.5 border-indigo-400" : "left-0.5 border-slate-300"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 빌드 검증**

```bash
npm run build
```

기대: build success.

- [ ] **Step 3: 로컬 개발 서버에서 수동 검증**

```bash
npm run dev
```

브라우저로 `http://localhost:3000/dashboard/settings` 접속 → 알림 탭. 다음 확인:
- 마스터 토글 + 5개 종류별 토글이 보임
- 마스터 OFF 상태에서 종류별 토글들이 흐릿하게 보임 (disabled)
- 마스터를 켜면 권한 팝업이 뜸 → 허용하면 토글 ON 유지
- 한 번 더 끄면 unsubscribe + DB 갱신

- [ ] **Step 4: 커밋**

```bash
git add src/components/dashboard/settings/NotificationsSection.tsx
git commit -m "UI: 설정 페이지에 푸시 마스터 토글 + 채팅 알림 토글 추가"
```

---

## Task 10: 채팅 진입 안내 배너

**Files:**
- Create: `src/components/dashboard/chat/PushPromptBanner.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`src/components/dashboard/chat/PushPromptBanner.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { BellRinging, X } from "phosphor-react";
import { subscribeToPush, checkPushSupport } from "@/lib/push/subscribe";
import { updateNotificationSettings } from "@/lib/settings/actions";
import { CHAT_PUSH_PROMPT_KEY } from "@/lib/push/constants";

interface PushPromptBannerProps {
  userId: string;
}

export default function PushPromptBanner({ userId }: PushPromptBannerProps) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (checkPushSupport() !== "ok") return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem(CHAT_PUSH_PROMPT_KEY)) return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(CHAT_PUSH_PROMPT_KEY, "1");
    setVisible(false);
  };

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await subscribeToPush(userId);
      await updateNotificationSettings(userId, { push_enabled: true, chat_message_notify: true });
      dismiss();
    } catch {
      // 거부됐거나 실패해도 배너는 닫음 — 설정에서 다시 켤 수 있음
      dismiss();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-4 mt-3 p-3 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-white text-indigo-500 flex items-center justify-center shrink-0">
          <BellRinging size={18} weight="fill" />
        </div>
        <p className="text-xs text-slate-700 truncate">
          알림을 켜면 채팅을 놓치지 않아요. 앱이 꺼져 있어도 폰으로 받을 수 있어요.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={enable}
          disabled={busy}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50"
        >
          {busy ? "처리 중..." : "켜기"}
        </button>
        <button
          onClick={dismiss}
          aria-label="닫기"
          className="w-7 h-7 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white flex items-center justify-center"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 검증**

```bash
npm run build
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/dashboard/chat/PushPromptBanner.tsx
git commit -m "UI: 채팅 진입 시 푸시 알림 안내 배너 추가"
```

---

## Task 11: 채팅 클라이언트에 배너 + heartbeat 통합

**Files:**
- Modify: `src/components/dashboard/chat/ChatPageClient.tsx`

- [ ] **Step 1: 현재 파일 구조 파악**

Read 도구로 `src/components/dashboard/chat/ChatPageClient.tsx` 전체 읽기. 다음을 파악:
- `userId` prop이 있는가?
- 현재 활성 채널 ID를 어디서 알 수 있는가? (`activeChannelId`, `selectedChannel.id`, route param 등)
- top-level JSX 어디에 배너를 끼울지

- [ ] **Step 2: PushPromptBanner 마운트**

`ChatPageClient.tsx` 컴포넌트의 최상단 JSX에 배너를 추가한다. 예 (실제 구조에 맞춰 위치 조정):

```typescript
import PushPromptBanner from "./PushPromptBanner";
// ...
return (
  <div className="...">
    <PushPromptBanner userId={userId} />
    {/* 기존 채팅 UI */}
  </div>
);
```

만약 `userId` prop이 없으면 부모 page.tsx에서 user.id를 받아서 prop으로 내려준다.

- [ ] **Step 3: 활성 채널 heartbeat useEffect 추가**

`ChatPageClient.tsx`에 다음 useEffect를 추가 (활성 채널 ID는 컴포넌트 상태 이름에 맞춰 교체):

```typescript
import { useEffect } from "react";
import { touchChannelSeen } from "@/lib/push/actions";

// 컴포넌트 본문 안:
useEffect(() => {
  if (!activeChannelId) return;
  // 진입 즉시 1회
  void touchChannelSeen(activeChannelId);
  // 5초 주기
  const id = setInterval(() => {
    if (document.visibilityState === "visible") {
      void touchChannelSeen(activeChannelId);
    }
  }, 5000);
  return () => clearInterval(id);
}, [activeChannelId]);
```

`activeChannelId` 변수명은 실제 코드에 맞춘다 (예: `selectedChannel?.id`).

- [ ] **Step 4: 빌드 검증**

```bash
npm run build
```

- [ ] **Step 5: 로컬 검증**

```bash
npm run dev
```

브라우저 → 채팅 페이지 진입 → 한 채널 클릭 → 개발자도구 Network 탭에서 5초마다 `touch_channel_seen` RPC가 호출되는지 확인.

처음 들어가는 사람이라면 권한 안내 배너가 상단에 보여야 함.

- [ ] **Step 6: 커밋**

```bash
git add src/components/dashboard/chat/ChatPageClient.tsx
git commit -m "UI: 채팅 클라이언트에 푸시 안내 배너 + 활성 채널 heartbeat 통합"
```

---

## Task 12: Edge Function — 디렉토리 + deno.json

**Files:**
- Create: `supabase/functions/push-dispatch/deno.json`

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p supabase/functions/push-dispatch
```

- [ ] **Step 2: deno.json 작성**

`supabase/functions/push-dispatch/deno.json`:

```json
{
  "imports": {
    "web-push": "https://esm.sh/web-push@3.6.7?target=deno",
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2"
  }
}
```

- [ ] **Step 3: 커밋 (index.ts와 함께 다음 task에서)**

이 파일만 따로 커밋하지 않음 — Task 13과 함께 묶음.

---

## Task 13: Edge Function — push-dispatch index.ts

**Files:**
- Create: `supabase/functions/push-dispatch/index.ts`

- [ ] **Step 1: 함수 본체 작성**

`supabase/functions/push-dispatch/index.ts`:

```typescript
// supabase/functions/push-dispatch/index.ts
// Web Push 발송 — notifications/messages 테이블 INSERT webhook을 받아 처리

import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// 환경 변수
// ============================================================
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@jdicompany.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ACTIVE_THRESHOLD_MS = 10_000; // 10초 이내 heartbeat = active

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error("VAPID keys missing");
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ============================================================
// 타입
// ============================================================
interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown> | null;
}

interface PushPayload {
  title: string;
  body: string;
  link: string;
  tag?: string;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// ============================================================
// 알림 종류 → notification_settings 컬럼 매핑
// (클라이언트 SETTING_TYPE_MAP과 동기화 유지)
// ============================================================
const SETTING_KEY_BY_TYPE: Record<string, string> = {
  task_assigned: "task_deadline",
  task_comment: "task_deadline",
  task_status_changed: "task_deadline",
  task_deadline: "task_deadline",
  vacation_approved: "vacation_notify",
  vacation_rejected: "vacation_notify",
  schedule_invite: "schedule_remind",
  system_announce: "system_announce",
  signup_pending: "system_announce",
  chat_message: "chat_message_notify",
};

// ============================================================
// 수신자 결정
// ============================================================
async function resolveRecipientsForNotifications(
  record: Record<string, unknown>
): Promise<{ userIds: string[]; payload: PushPayload; settingKey: string | null }> {
  const userId = record.user_id as string;
  const type = record.type as string;
  const title = (record.title as string) || "JDI 포털";
  const body = (record.body as string) || "";
  const link = (record.link as string) || "/dashboard";
  const settingKey = SETTING_KEY_BY_TYPE[type] ?? null;
  return {
    userIds: [userId],
    payload: { title, body, link, tag: `notif:${record.id}` },
    settingKey,
  };
}

async function resolveRecipientsForMessages(
  record: Record<string, unknown>
): Promise<{ userIds: string[]; payload: PushPayload; settingKey: string; channelId: string } | null> {
  const channelId = record.channel_id as string;
  const senderId = record.user_id as string;
  const msgType = (record.type as string) || "text";
  const content = (record.content as string) || "";

  // system 메시지는 푸시 안 함
  if (msgType === "system") return null;

  // 1) 채널 정보
  const { data: channel } = await supabase
    .from("channels")
    .select("name, type")
    .eq("id", channelId)
    .single();
  if (!channel || channel.type === "memo") return null;

  // 2) 발신자 프로필
  const { data: sender } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", senderId)
    .single();
  const senderName = sender?.full_name ?? "알 수 없음";

  // 3) 수신 멤버 (발신자 제외 + 음소거 제외)
  const { data: members } = await supabase
    .from("channel_members")
    .select("user_id, is_muted, last_seen_at")
    .eq("channel_id", channelId);
  if (!members) return null;

  const cutoff = Date.now() - ACTIVE_THRESHOLD_MS;
  const candidates = members
    .filter((m) => m.user_id !== senderId)
    .filter((m) => !m.is_muted)
    .filter((m) => {
      // 현재 채널 보고 있는 사용자는 제외
      if (!m.last_seen_at) return true;
      return new Date(m.last_seen_at).getTime() < cutoff;
    })
    .map((m) => m.user_id);

  if (candidates.length === 0) return null;

  // 4) 본문 가공
  let preview: string;
  if (msgType === "image") preview = "사진을 보냈습니다";
  else if (msgType === "file") preview = "파일을 보냈습니다";
  else preview = content.length > 100 ? content.slice(0, 100) + "..." : content;

  return {
    userIds: candidates,
    payload: {
      title: `${channel.name} - ${senderName}`,
      body: preview,
      link: `/dashboard/chat/${channelId}`,
      tag: `chat:${channelId}`,
    },
    settingKey: "chat_message_notify",
    channelId,
  };
}

// ============================================================
// settings 필터링 (push_enabled + 종류별 토글)
// ============================================================
async function filterBySettings(
  userIds: string[],
  settingKey: string | null
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const { data: rows } = await supabase
    .from("notification_settings")
    .select("user_id, push_enabled, " + (settingKey ?? "user_id"))
    .in("user_id", userIds);
  if (!rows) return [];

  return rows
    .filter((r) => (r as Record<string, unknown>).push_enabled === true)
    .filter((r) => {
      if (!settingKey) return true;
      return (r as Record<string, unknown>)[settingKey] !== false;
    })
    .map((r) => r.user_id as string);
}

// ============================================================
// Push 발송
// ============================================================
async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0) return;
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (!subs || subs.length === 0) return;

  await Promise.allSettled(
    (subs as SubscriptionRow[]).map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 }
        );
        // 사용 시각 갱신 (best effort)
        await supabase
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", sub.id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // 만료 → 삭제
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("push send failed", status, err);
        }
      }
    })
  );
}

// ============================================================
// HTTP 진입점
// ============================================================
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  let body: WebhookPayload;
  try {
    body = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  if (body.type !== "INSERT") {
    return new Response("ignored", { status: 200 });
  }

  try {
    let userIds: string[] = [];
    let payload: PushPayload | null = null;
    let settingKey: string | null = null;

    if (body.table === "notifications") {
      const r = await resolveRecipientsForNotifications(body.record);
      userIds = r.userIds;
      payload = r.payload;
      settingKey = r.settingKey;
    } else if (body.table === "messages") {
      const r = await resolveRecipientsForMessages(body.record);
      if (!r) return new Response("skipped", { status: 200 });
      userIds = r.userIds;
      payload = r.payload;
      settingKey = r.settingKey;
    } else {
      return new Response("ignored table", { status: 200 });
    }

    const filtered = await filterBySettings(userIds, settingKey);
    if (filtered.length === 0 || !payload) {
      return new Response("no recipients", { status: 200 });
    }

    await sendPushToUsers(filtered, payload);
    return new Response(JSON.stringify({ sent: filtered.length }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("dispatch error", err);
    return new Response("internal error", { status: 500 });
  }
});
```

- [ ] **Step 2: Edge Function 배포**

```bash
npx supabase functions deploy push-dispatch --no-verify-jwt --linked
```

`--no-verify-jwt`는 webhook이 JWT 없이 호출하기 때문에 필수.

기대 출력:
```
Deploying Function: push-dispatch
Deployed Function push-dispatch
```

- [ ] **Step 3: 함수 로컬 syntax 체크 (선택)**

```bash
deno check supabase/functions/push-dispatch/index.ts
```

Deno가 로컬에 없으면 이 단계는 스킵하고 배포 시 검증한다.

- [ ] **Step 4: 커밋**

```bash
git add supabase/functions/push-dispatch/
git commit -m "Edge Function: push-dispatch — 채팅/알림 INSERT webhook 처리 + web-push 발송"
```

---

## Task 14: Database Webhook 등록 (수동)

**Files:** 없음 (Supabase Studio UI 작업)

- [ ] **Step 1: notifications webhook 등록**

Supabase 대시보드 → Database → Webhooks → Create a new hook

- Name: `notifications-push-dispatch`
- Table: `public.notifications`
- Events: ☑ Insert
- Type: `Supabase Edge Functions`
- Edge Function: `push-dispatch`
- HTTP Method: `POST`
- HTTP Headers: 기본 그대로 (Supabase가 자동으로 service role 추가)

[Create] 클릭.

- [ ] **Step 2: messages webhook 등록**

같은 화면에서 다시 [Create a new hook]:

- Name: `messages-push-dispatch`
- Table: `public.messages`
- Events: ☑ Insert
- Type: `Supabase Edge Functions`
- Edge Function: `push-dispatch`
- HTTP Method: `POST`

[Create] 클릭.

- [ ] **Step 3: 등록 확인**

Webhook 목록에 두 항목 모두 보이고 enabled 상태인지 확인.

- [ ] **Step 4: 수동 트리거 테스트 (1차 확인)**

Supabase Studio → SQL Editor에서 본인 user_id로 더미 알림 생성:

```sql
SELECT public.insert_notification(
  '{본인 user_id}'::uuid,
  'system_announce',
  '푸시 테스트',
  '이 알림이 폰에 뜨면 성공입니다.',
  '/dashboard',
  '{}'::jsonb
);
```

브라우저/폰에 알림이 떠야 함. 이 단계가 안 되면 webhook 또는 Edge Function 로그를 확인 (Supabase 대시보드 → Functions → push-dispatch → Logs).

> ⚠️ 이 단계가 실패하면 Task 15(E2E 검증)로 넘어가지 말고 우선 디버깅한다.

---

## Task 15: E2E 수동 검증

**Files:** 없음

**준비:** 두 개의 디바이스 또는 두 개의 다른 브라우저 프로필 (수신자 1, 발신자 1).

- [ ] **Step 1: 채팅 푸시 — 데스크탑**

1. 수신자(A): Chrome으로 로그인 → 설정 → 알림 → 푸시 알림 받기 ON → 권한 허용
2. 다른 페이지(예: 대시보드)로 이동해서 채팅방을 보고 있지 않은 상태 만듦
3. 발신자(B): 다른 브라우저에서 로그인 → A가 멤버인 채널에서 메시지 전송
4. 기대: A의 데스크탑 우측 하단에 "채널명 - B: 메시지" 알림 → 클릭하면 해당 채팅방으로 이동

- [ ] **Step 2: 채팅 푸시 — 모바일 PWA (Android)**

1. 수신자 A: Android Chrome으로 사이트 접속 → 메뉴 "홈 화면에 추가"
2. 설치된 앱 실행 → 설정 → 푸시 ON
3. 앱을 완전히 종료 (백그라운드 X, 강제 종료)
4. B가 메시지 전송
5. 기대: A의 폰 알림 영역에 알림 도달 → 탭하면 PWA 실행 + 채팅방 열림

- [ ] **Step 3: 채팅 푸시 — 모바일 PWA (iPhone, iOS 16.4+)**

1. 수신자 A: iPhone Safari로 접속 → 공유 → 홈 화면에 추가
2. 홈 아이콘으로 PWA 실행 → 설정 → 푸시 ON → 권한 허용
3. 앱 강제 종료
4. B가 메시지 전송
5. 기대: 알림 도달

> iPhone에서 권한 팝업이 안 뜨면: 설정 앱 → JDI 포털 → 알림 → "알림 허용" 직접 켜기.

- [ ] **Step 4: Skip 조건 검증**

각 시나리오에서 알림이 **오지 않아야** 정상:

| 시나리오 | 결과 |
|---|---|
| A가 본인 보낸 메시지 | A에게 알림 X |
| A가 그 채널을 음소거 후 B 메시지 | X |
| A가 설정에서 chat_message_notify OFF 후 B 메시지 | X |
| A가 마스터 토글 OFF 후 B 메시지 | X |
| A가 그 채팅방을 현재 보고 있는 상태에서 B 메시지 | X (heartbeat 동작 확인) |

- [ ] **Step 5: in-app 알림 푸시 검증**

관리자 계정으로 휴가 신청 → 승인 → 신청자에게 푸시 도달 확인.
또는 SQL Editor에서 더미 INSERT:
```sql
SELECT public.insert_notification(
  '{user_id}'::uuid,
  'task_assigned',
  '새 할일',
  '테스트 할일이 배정되었습니다.',
  '/dashboard/tasks',
  '{}'::jsonb
);
```

- [ ] **Step 6: 만료 subscription 정리 검증**

설정에서 푸시 OFF → DB에서 `push_subscriptions` 행이 사라졌는지 확인.

- [ ] **Step 7: 최종 커밋 (필요 시 핫픽스)**

검증 중 발견한 버그가 있으면 핫픽스 후 커밋. 없으면 이 단계는 스킵.

---

## Task 16: 배포

- [ ] **Step 1: 모든 변경사항 push**

```bash
git push origin master
```

Vercel이 자동 배포 시작.

- [ ] **Step 2: Vercel 배포 확인**

Vercel 대시보드에서 빌드 성공 확인. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` 환경변수가 production에 등록되어 있는지 다시 한 번 확인.

- [ ] **Step 3: production URL에서 Task 15 단계 1~5 다시 검증**

로컬에서 잘 됐어도 production에서 한 번 더 확인. 특히 service worker scope/origin 차이 때문에 production에서만 발견되는 이슈가 종종 있다.

- [ ] **Step 4: 사내 공지**

직원분들에게 안내:
> "푸시 알림 기능이 추가되었습니다. 설정 → 알림 메뉴에서 켜주세요. 아이폰 사용자는 Safari로 접속한 뒤 '공유 → 홈 화면에 추가'로 앱을 설치하셔야 알림을 받을 수 있습니다."

---

## 자체 검토 (writing-plans 스킬 요구사항)

### Spec coverage 체크
- [✓] §4.1 push_subscriptions + 컬럼 → Task 2
- [✓] §4.2 sw.js push/notificationclick → Task 3
- [✓] §4.3 클라이언트 구독 모듈 → Task 6, 7, 8
- [✓] §4.4 (1) 설정 페이지 → Task 9
- [✓] §4.4 (2) 채팅 배너 → Task 10
- [✓] §4.5 Edge Function → Task 12, 13
- [✓] §4.6 last_seen_at heartbeat → Task 2 (DB) + Task 7 (RPC 래퍼) + Task 11 (UI 통합)
- [✓] §4.7 보안 모델 → 마이그레이션 RLS + Edge Function service role
- [✓] §6 에러 핸들링 → Edge Function 410/404 정리, settings 토글 실패 복원
- [✓] §7 테스트 계획 → Task 15
- [✓] §8 마이그레이션/배포 순서 → Task 1, 2, 13, 14, 16

### Placeholder scan
- TBD/TODO 없음
- "appropriate error handling" 같은 vague 구문 없음
- 모든 코드 step에 실제 코드 포함

### Type consistency
- `SubscriptionPayload`, `PushPayload`, `WebhookPayload` 모두 정의됨
- `touchChannelSeen` (Task 7) ↔ `touch_channel_seen` RPC (Task 2) 일치
- `savePushSubscription` 시그니처 ↔ `push_subscriptions` 컬럼 일치
- `SETTING_KEY_BY_TYPE` (Task 13) ↔ `SETTING_TYPE_MAP` (Task 4) 동일 의미 매핑

문제 없음.
