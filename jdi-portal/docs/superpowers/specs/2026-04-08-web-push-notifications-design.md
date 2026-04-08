# Web Push 알림 시스템 — 설계 문서

**작성일**: 2026-04-08
**작성자**: 김효태 + Claude
**상태**: 리뷰 대기

## 1. 목표

JDI 포털 사용자에게 브라우저/PWA가 닫혀 있어도 폰에 푸시 알림이 도달하도록 한다.

- **주 사용처**: 채팅 메시지 도착 알림 (가장 중요)
- **부 사용처**: 기존 in-app 알림(할일/스케줄/휴가/오류접수 등) 동시 푸시

비목표:
- 이메일/SMS 발송 (제외)
- 스케줄 미리알림 같은 시간 기반 트리거 (이번 범위 X, 향후)

## 2. 사용자 결정 사항 요약

| 항목 | 결정 |
|---|---|
| 범위 | 채팅 + 기존 in-app 알림 전체, 종류별 on/off |
| 백엔드 | Supabase Edge Function + DB Webhook |
| 권한 요청 UX | 설정 페이지 토글 + 채팅 첫 진입 시 안내 배너 (한 번만) |
| 알림 형식 | 채널명 - 보낸 사람: 메시지 미리보기 (예: "마케팅팀 - 김효태: 점심 뭐 먹어?") |
| 클릭 동작 | 설치된 PWA를 열고 해당 채팅방(`/dashboard/chat/[channelId]`)으로 이동 |
| Skip 조건 | 본인 발신 / 채널 음소거 / 설정 OFF / 현재 그 채널을 보고 있는 세션 |

## 3. 시스템 개요

```
[브라우저/PWA]
   │ ① 알림 권한 동의 + Push Subscription 발급
   │ ② subscription을 Supabase에 저장
   ▼
[Supabase: push_subscriptions 테이블]
   ▲
   │
[Supabase: messages / notifications INSERT]
   │ ③ DB Webhook 트리거
   ▼
[Supabase Edge Function: push-dispatch]
   │ ④ 수신자 결정 + 권한/음소거/세팅 필터
   │ ⑤ web-push 라이브러리로 VAPID 서명 + 발송
   ▼
[FCM / APNs (구글/애플 푸시 게이트웨이)]
   │
   ▼
[사용자 폰 OS] → 알림 표시 → 클릭 → PWA 열기
```

## 4. 컴포넌트별 설계

### 4.1 데이터베이스 스키마 (마이그레이션 054)

#### `push_subscriptions` 테이블 (신규)
```sql
CREATE TABLE public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,            -- 푸시 게이트웨이 URL (FCM/APNs)
  p256dh      TEXT NOT NULL,            -- 클라이언트 공개키 (암호화용)
  auth        TEXT NOT NULL,            -- 인증 시크릿
  user_agent  TEXT,                     -- 디버깅/관리용
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX idx_push_subs_user ON public.push_subscriptions(user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
```

RLS:
- 본인 subscription만 SELECT/INSERT/DELETE 가능
- Service role(Edge Function)만 전체 SELECT 가능

#### `notification_settings` 컬럼 추가
기존 테이블에 다음 컬럼들 추가:
```sql
ALTER TABLE public.notification_settings
  ADD COLUMN push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN chat_message_notify BOOLEAN NOT NULL DEFAULT TRUE;
```
- `push_enabled`: 마스터 스위치 (전체 푸시 on/off)
- `chat_message_notify`: 채팅 알림 on/off (기존 vacation/schedule/task/system 컬럼과 동일 패턴)

마스터 OFF면 종류 무관 모든 푸시 차단. 마스터 ON + 특정 종류 OFF면 그 종류만 차단.

#### `presence` 또는 `active_channels` (Redis-less 대안)
"현재 보고 있는 채팅방" 판정은 클라이언트가 채널 진입/이탈 시 Supabase Realtime Presence channel을 통해 broadcast. Edge Function이 발송 직전 presence 상태를 조회. 이걸 위한 별도 DB 테이블은 두지 않음 — Realtime Presence API 활용.

### 4.2 Service Worker 확장 (`public/sw.js`)

기존 캐싱 SW에 push 이벤트 핸들러 두 개 추가:

```javascript
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const { title, body, channelId, icon, tag } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon ?? "/icon-192.png",
      badge: "/icon-192.png",
      tag: tag ?? channelId, // 같은 채널 알림은 합쳐짐
      data: { channelId, link: data.link },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link ?? "/dashboard/chat";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // 이미 PWA 윈도우가 열려있으면 그쪽으로 포커스 + 라우팅
      for (const client of all) {
        if (client.url.includes("/dashboard")) {
          client.focus();
          client.navigate(link);
          return;
        }
      }
      // 없으면 새로 열기
      await self.clients.openWindow(link);
    })()
  );
});
```

설치된 PWA가 있으면 OS가 자동으로 PWA 창으로 열어줌. 브라우저 탭만 있으면 그 탭을 사용.

### 4.3 클라이언트 구독 모듈 (`src/lib/push/`)

신규 도메인 폴더 생성 (`actions.ts`, `subscribe.ts`, `constants.ts`).

#### `subscribe.ts`
- `requestPushPermission()`: `Notification.requestPermission()` 호출 후 결과 반환
- `subscribeToPush(userId)`: SW 등록 → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC })` → DB INSERT
- `unsubscribeFromPush(userId)`: 로컬 subscription 해제 + DB DELETE
- `isPushSubscribed()`: 현재 브라우저에 활성 subscription 있는지 확인

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` 환경변수를 포함해 빌드.

### 4.4 UX 진입점

#### (1) 설정 페이지 — 알림 섹션 (B안)
경로: `src/components/dashboard/settings/NotificationSettings.tsx` (또는 기존 설정 컴포넌트 확장)

UI 구성:
```
┌─ 알림 설정 ────────────────────────────────┐
│ [○] 푸시 알림 받기  ← 마스터 토글           │
│   ├ 채팅 메시지              [○]            │
│   ├ 할일 (배정/댓글/마감)    [○]            │
│   ├ 스케줄 초대              [○]            │
│   ├ 휴가 승인/반려           [○]            │
│   └ 시스템 공지              [○]            │
│                                            │
│ ※ iPhone은 홈 화면에 앱 설치 후 사용 가능   │
└────────────────────────────────────────────┘
```

마스터 토글 ON 시:
1. 브라우저 권한 요청
2. 거부 시 안내 메시지 + 토글 자동 OFF
3. 승인 시 SW 등록 + subscription DB 저장 + `notification_settings.push_enabled = true`

#### (2) 채팅 첫 진입 안내 배너 (C안)
경로: `src/components/dashboard/chat/PushPromptBanner.tsx` (신규)

표시 조건:
- `Notification.permission === "default"` (한 번도 결정 안 한 상태)
- localStorage 플래그 `chat_push_prompt_dismissed`가 없을 때

표시 위치: 채팅 페이지 상단 배너 (한 번 X 또는 켜기 누르면 다시 안 뜸)

```
┌─────────────────────────────────────────────┐
│ 🔔 알림을 켜면 채팅을 놓치지 않아요         │
│                          [켜기]  [나중에]   │
└─────────────────────────────────────────────┘
```

### 4.5 Supabase Edge Function: `push-dispatch`

경로: `supabase/functions/push-dispatch/index.ts`

DB Webhook 두 개에서 호출됨:
- `notifications` 테이블 AFTER INSERT
- `messages` 테이블 AFTER INSERT (where `type != 'system'`)

#### 동작 흐름

**입력**: Supabase webhook payload `{ type: "INSERT", table, record, schema }`

**1) 수신자 목록 결정**
- `notifications` → `record.user_id` 단일 (이미 결정됨)
- `messages`:
  - `channel_members`에서 해당 채널 멤버 전원 조회
  - 발신자(`record.user_id`) 제외
  - `is_muted = true`인 멤버 제외

**2) 알림 페이로드 구성**
- `notifications` 케이스: `record.title`, `record.body`, `record.link`
- `messages` 케이스:
  - 채널명, 발신자 프로필을 추가 쿼리로 조회
  - title: `${channel.name} - ${sender.full_name}`
  - body: `record.content` (앞 100자) — 단, `type === 'image'` 이면 "사진을 보냈습니다", `type === 'file'` 이면 "파일을 보냈습니다"
  - link: `/dashboard/chat/${record.channel_id}`

**3) 수신자별 필터링**
- `notification_settings` 일괄 조회
- `push_enabled = false` 인 사용자 제외
- 알림 종류별 컬럼(`chat_message_notify` 등)이 false인 사용자 제외
- Realtime Presence 조회: 해당 채널에 현재 active한 클라이언트가 있는 user는 제외

**4) Push 발송**
- 각 수신자의 모든 `push_subscriptions` 조회
- `web-push` Deno 라이브러리(`https://esm.sh/web-push@3.6.7`)로 VAPID 서명 후 발송
- 각 발송은 병렬(`Promise.allSettled`)
- 응답 코드 처리:
  - 410 Gone, 404 Not Found → 만료된 subscription → DB에서 DELETE
  - 5xx → 재시도 1회 후 무시 (다음 알림 때 다시 시도됨)

#### 환경변수
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: 사전 생성 후 Supabase Secrets에 저장
- `VAPID_SUBJECT`: `mailto:admin@jdicompany.com`
- `SUPABASE_SERVICE_ROLE_KEY`: 함수가 RLS 우회해서 push_subscriptions 읽기 위함

#### Webhook 등록 (Supabase Studio에서 수동 1회)
- `notifications` table → INSERT → POST `https://<project>.supabase.co/functions/v1/push-dispatch`
- `messages` table → INSERT → 동일 endpoint
- HTTP Header에 `Authorization: Bearer <function-secret>` 추가

### 4.6 Realtime Presence 통합 (현재 보는 채널 스킵)

채팅 페이지(`ChannelChatClient.tsx`)에서 채널 진입 시:
```typescript
const channel = supabase.channel(`presence:channel:${channelId}`, {
  config: { presence: { key: userId } },
});
await channel.subscribe(...);
await channel.track({ active: true });
// 이탈 시 channel.untrack() + channel.unsubscribe()
```

Edge Function은 발송 직전:
```typescript
const presence = await supabase
  .channel(`presence:channel:${channelId}`)
  .subscribe();
const state = presence.presenceState();
// state에 user_id 있으면 그 사용자는 발송 제외
```

> ⚠️ Edge Function에서 Realtime Presence 조회는 일반적이지 않은 패턴. **대안**: client가 `channel_members.last_seen_at` 컬럼을 5초마다 갱신 → Edge Function이 5초 이내 갱신된 사용자는 active로 판정. 이게 더 단순하고 검증 쉬움.
>
> **결정**: 5초 heartbeat 방식 채택. `channel_members`에 `last_seen_at TIMESTAMPTZ` 컬럼 추가, 클라이언트가 채널 보고 있는 동안 5초 주기로 UPDATE.

### 4.7 보안 모델

- **VAPID private key**: Supabase Secrets에만 존재. 클라이언트/Vercel에 노출 X
- **Webhook 인증**: Supabase Webhook 헤더 secret으로 Edge Function이 호출자 검증
- **push_subscriptions RLS**: 본인만 읽기/쓰기. Service role만 전체 접근
- **payload 내용**: 메시지 본문이 푸시에 평문으로 들어감 (현재 in-app 알림과 동일 수준). E2E 암호화는 비목표.

## 5. 데이터 흐름 — 시나리오별

### 시나리오 A: 채팅 메시지 발송
1. A가 "마케팅팀" 채널에 메시지 INSERT
2. DB Webhook 발화 → Edge Function 호출
3. 채널 멤버 [A, B, C] 조회 → A 제외
4. B, C의 settings 조회: B는 chat_message_notify ON, C는 OFF
5. C 제외 → B만 남음
6. B의 last_seen_at 확인 — 30초 전 → active 아님 → 발송 진행
7. B의 push_subscriptions 2개(폰, 노트북) 조회
8. 두 디바이스 모두에 발송
9. B 폰에 "마케팅팀 - A: ..." 알림 → 클릭 → PWA 열림 → 채팅방 이동

### 시나리오 B: 할일 배정
1. 관리자가 할일 배정 → `createNotification()` 호출 → `notifications` INSERT
2. 같은 webhook 경로
3. Edge Function: notifications 케이스 → record.user_id 단일 수신자
4. settings 확인 후 발송

### 시나리오 C: 만료된 subscription
1. Edge Function이 push 발송 → FCM이 410 반환
2. 함수가 해당 endpoint를 push_subscriptions에서 DELETE
3. 다음 푸시부터 자동 제외

## 6. 에러 핸들링

| 상황 | 처리 |
|---|---|
| VAPID 서명 실패 | 로그 + skip (한 사용자 실패가 다른 사용자 발송 막지 않음) |
| 410/404 응답 | 해당 subscription 삭제 |
| 5xx 응답 | 1회 재시도 후 포기 |
| Edge Function 타임아웃 | webhook 자동 재시도 (Supabase 기본 동작) |
| 권한 거부 | UI에서 토글 OFF + 안내 메시지 |
| iOS PWA 미설치 | 설정 화면에 안내 문구 노출 |

## 7. 테스트 계획

### 단위/수동
- VAPID 키 생성 후 `web-push` CLI로 단일 subscription 발송 테스트
- Edge Function을 `supabase functions serve`로 로컬 실행 + curl로 가짜 webhook payload 전송
- 권한 거부 → UI 토글 OFF 동작 확인
- 음소거 채널 → 발송 안 됨 확인
- 본인 발신 → 본인 폰에 안 옴 확인
- 채팅방 활성 상태 → 발송 안 됨 확인

### 통합
- Android Chrome PWA 설치 후 다른 기기에서 메시지 발송 → 폰 알림 도착 확인
- iOS Safari PWA 홈 화면 추가 후 동일 테스트
- 알림 클릭 → 올바른 채팅방 진입 확인
- 마스터 토글 OFF → 모든 푸시 안 옴 확인
- 채팅 토글만 OFF → 채팅 외 알림은 옴 확인

## 8. 마이그레이션/배포 순서

1. VAPID 키 페어 생성 (`npx web-push generate-vapid-keys`)
2. Supabase Secrets에 등록 (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`)
3. Vercel 환경변수 `NEXT_PUBLIC_VAPID_PUBLIC_KEY` 등록
4. 마이그레이션 054 push (push_subscriptions 테이블 + notification_settings 컬럼 + last_seen_at 컬럼)
5. Edge Function 배포 (`supabase functions deploy push-dispatch`)
6. Supabase Studio에서 webhook 2개 등록
7. Next.js 코드 배포 (sw.js + 설정 UI + 채팅 배너 + push 도메인 모듈)
8. 본인 계정으로 직접 테스트 후 안내문 공지

## 9. 향후 확장 (이번 범위 X)

- 이메일 알림 fallback (푸시 권한 없는 사용자)
- 푸시 알림 그룹화/요약 (10분 동안 같은 채널 메시지는 하나로 묶기)
- 알림 클릭 시 메시지 자동 읽음 처리
- 스케줄 사전 알림 (예: 30분 전 자동 푸시) — pg_cron 기반
- @멘션 우선 푸시 (음소거 채널이라도 멘션은 알림)

## 10. 영향받는 파일/디렉토리

**신규**
- `supabase/migrations/054_push_subscriptions.sql`
- `supabase/functions/push-dispatch/index.ts`
- `supabase/functions/push-dispatch/deno.json`
- `src/lib/push/subscribe.ts`
- `src/lib/push/actions.ts`
- `src/lib/push/constants.ts`
- `src/components/dashboard/chat/PushPromptBanner.tsx`
- `docs/superpowers/specs/2026-04-08-web-push-notifications-design.md` (이 문서)

**수정**
- `public/sw.js` (push/notificationclick 핸들러 추가)
- `src/components/dashboard/settings/*` (알림 섹션에 push 토글들 추가)
- `src/lib/notifications/types.ts` (`chat_message` 타입 추가)
- `src/lib/notifications/constants.ts` (SETTING_TYPE_MAP에 chat_message 추가)
- `src/components/dashboard/chat/ChannelChatClient.tsx` (last_seen_at heartbeat)
- `.env.example` (VAPID 공개키 추가)
