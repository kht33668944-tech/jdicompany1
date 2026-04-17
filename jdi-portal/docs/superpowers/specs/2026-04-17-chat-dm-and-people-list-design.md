# 채팅 DM + 직원 리스트 + 참여자 아바타 개편

작성일: 2026-04-17
작성: 김효태 + Claude

## 배경

현재 채팅은 그룹 채널(`group`)과 나만의 메모(`memo`) 두 타입만 존재하며, 1:1 DM을 하려면 "그룹 채널에 상대 한 명만 초대"해야 한다. 다음 문제를 해결한다.

- DM 접근이 번거롭다 (채널 만들기 모달 필요).
- 직원 누가 있는지 채팅에서 바로 안 보인다.
- 그룹 채널의 참여자가 누구인지 리스트에서 알 수 없다.
- 누가 지금 접속해 있는지 모른다.
- 메시지 멘션/답장/읽음수 UX 개선 필요.

## 목표

채팅 사이드바를 **"채널 / 직원"** 두 섹션으로 재구성한다. 직원 클릭 한 번으로 DM이 열리며, 그룹 채널에는 참여자 아바타가 겹쳐 표시되고, 온라인 상태가 실시간으로 보인다. 채널 만들기 버튼은 **그룹 전용**으로만 남는다.

## 비목표 (이번 범위 아님)

- 이모지 빠른 반응 바(호버/롱프레스 퀵 피커)
- 직원 화면 외부에서의 `💬` DM 단축 버튼(근태/할일/프로필 카드)
- 그룹 DM(3인 이상 사적 대화). 필요 시 기존 그룹 채널 기능으로 대체.
- 음성/영상 통화, 화상 회의.

---

## 최종 사이드바 구조

```
채팅                                    [＋]   ← 그룹 만들기 전용
🔍 검색
─────────────
📌 나만의 메모
─────────────
채널  (스크롤, 마지막 메시지 시간 내림차순, 즐겨찾기 상단)
  # 회사전체          🟡🔵🟣+5   화
  # 프로젝트A         🟡🔵🟣     4/10
─────────────
직원  (스크롤, 가나다순 고정, 본인 제외)
  🟢 김효태
  ⚪ 표민근  🔴2           ← 안읽은 DM 2개
  🟢 이지호
  ⚪ 이용준
─────────────
```

### 표시 규칙

- **채널 섹션에는 DM이 보이지 않는다.** DM은 직원 섹션에서만 접근.
- **직원 섹션은 항상 전체 직원 고정 (가나다순).** 최근 대화와 중복 없음.
- **직원 아바타 좌측에 🟢/⚪ 온라인 점**. 오프라인은 아바타 opacity 70%.
- **직원 이름 우측에 안읽은 DM 수 배지** (빨강 `N`).
- **그룹 채널 우측에 참여자 아바타 최대 3명 + `+N`** (본인 제외).

---

## 1. DB 변경 (마이그레이션 `053_chat_dm.sql` 예정)

### 1.1 `channels.type`에 `'dm'` 추가

```sql
ALTER TABLE channels DROP CONSTRAINT channels_type_check;
ALTER TABLE channels ADD CONSTRAINT channels_type_check
  CHECK (type IN ('group', 'memo', 'dm'));
```

### 1.2 DM 유일성 (두 user당 채널 1개)

```sql
-- 정렬된 UUID 쌍 → 결정적 키
ALTER TABLE channels ADD COLUMN dm_pair_key TEXT;
CREATE UNIQUE INDEX idx_dm_pair_key ON channels(dm_pair_key)
  WHERE type = 'dm' AND dm_pair_key IS NOT NULL;
```

### 1.3 RPC: `open_or_create_dm(target_user_id UUID) RETURNS UUID`

- `SECURITY DEFINER`, `auth.uid()` 필수 검증.
- `target_user_id = auth.uid()` 차단 (본인 DM은 메모 채널로 유도).
- `is_approved_user()` 체크로 승인 사용자만 허용.
- `dm_pair_key = least(a,b) || '_' || greatest(a,b)`로 결정.
- 기존 채널 있으면 id 반환, 없으면 채널 + 양쪽 멤버 원자적으로 INSERT.

### 1.4 RLS 정책

기존 `channels`, `channel_members`, `messages` RLS가 이미 멤버십 기반이라 추가 정책 불필요. `channels` SELECT 정책은 `type = 'dm'`도 그대로 커버됨.

### 1.5 채널 목록 RPC 확장

`get_user_channels`(또는 현행 쿼리) 반환 컬럼에 추가:
- `members_preview`: 본인 제외 최대 3명의 `{id, full_name, avatar_url}` JSON 배열
- `member_count_excluding_self`: `+N` 계산용
- `dm_partner_id`: DM일 때 상대방 id (클라이언트에서 상대 프로필 매핑)

LATERAL JOIN + `profiles` 조인. 프로필 URL 서명은 클라이언트에서 기존 `getChatFileUrls()` 패턴으로 배치.

---

## 2. 사이드바 재구성 (`ChannelList.tsx`)

### 2.1 섹션

1. **나만의 메모** — 기존대로 상단 고정.
2. **채널** — `type = 'group'`인 채널만. 즐겨찾기 상단, 그 외 마지막 메시지 시간 내림차순. 검색어에 매칭되는 것만 필터.
3. **직원** — `useAllApprovedMembers()` 훅으로 전체 직원 가나다순. 본인 제외. 각 행 클릭 시 `open_or_create_dm` → 채널 진입.

### 2.2 컴포넌트 분리

- `ChannelList.tsx` → 섹션 래퍼
- `ChannelListItem.tsx` → 기존대로 그룹/메모용. 참여자 아바타 슬롯 추가.
- `PersonListItem.tsx` 신규 → 직원 한 명 행. 온라인 점, 아바타, 이름, 안읽은 배지, 클릭 핸들러.

### 2.3 안읽은 DM 배지

- DM 채널별 `unread_count`를 이미 계산하는 `chat:unread-badge` 로직을 `dm_partner_id`로 맵핑.
- `Map<partner_id, unread>`로 `PersonListItem`에 전달.
- 현재 창이 해당 DM이면 자동 읽음 처리(기존 포커스 로직 재사용).

### 2.4 ＋ 버튼

- 기존 `ChannelCreateModal`에서 **인원 선택 UI 유지, 단 type은 항상 `'group'`**.
- 상단 타이틀 "새 그룹 만들기"로 변경. DM은 안내 문구로 대체: "1:1 대화는 왼쪽 직원 목록에서 바로 시작할 수 있어요."

---

## 3. 참여자 아바타 스택 (`AvatarStack.tsx`)

- Props: `members: {id, full_name, avatar_url}[]`, `max?: number = 3`, `size?: number = 20`.
- 20px 원형, 2px 흰 테두리, `-6px` 겹침.
- 사진 없으면 이니셜 + 파스텔 컬러(기존 `AVATAR_COLORS`).
- `members.length > max`면 마지막에 `+N` 배지.
- 재사용 위치: 채널 리스트, 채널 설정 Drawer 상단.

---

## 4. 온라인 Presence

### 4.1 전역 채널

- `presence:online` 단일 채널 (채팅 탭 진입 시 `track`, 이탈 시 `untrack`).
- 페이로드: `{ user_id, online_at }`.
- 이미 `typing:${channelId}` presence 쓰고 있음 — 동일 패턴, 다른 채널명.

### 4.2 클라이언트 훅

- `useOnlineUsers()` → `Set<user_id>` 반환. `ChatPageClient` 또는 상위에서 한 번 구독, Context로 하위 배포.
- `PersonListItem`은 `Set.has(id)`로 🟢/⚪.

### 4.3 주의

- 창 여러 개 열어도 `user_id` 중복이 곧 온라인. 닫힌 창은 자동 `untrack`.
- 모바일 백그라운드는 Supabase presence가 자동 처리.

---

## 5. @멘션

### 5.1 입력 UX

- `MessageInput`에서 `@` 입력 감지 → 현 채널 멤버 필터 드롭다운 (이름/부서 검색).
- 선택 시 입력값에 `@[김효태|uuid]` 토큰 삽입 (화면엔 `@김효태`로 보이지만 실제 저장은 토큰).

### 5.2 저장/렌더

- `messages.content`에 토큰 그대로 저장 (스키마 변경 없음).
- `MessageItem`에서 정규식 파싱 후 파란색 배지 컴포넌트로 렌더.
- 토큰이 없는 일반 `@text`는 평문 처리.

### 5.3 알림

- 메시지 INSERT 후 서버 액션(또는 trigger)에서 토큰 파싱 → 멘션된 user에게 `notifications` 레코드 생성.
- 멘션된 사용자가 **뮤트한 채널이어도** 멘션은 알림 가게 (카톡 "키워드 알림"과 동일).

---

## 6. 답장(스레드) UI

- 기존 `parent_message_id` 컬럼 활용 (스키마 변경 없음).
- 메시지 호버 메뉴에 "↩ 답장" 추가.
- 클릭 시 `MessageInput` 위에 인용 박스: "↩ {이름}: {내용 앞 30자}…  [×]".
- 전송 시 `parent_message_id` 포함.
- `MessageItem`: 부모 있는 메시지 상단에 작은 인용 박스 (클릭 시 해당 원본 메시지로 스크롤 + 하이라이트).

---

## 오류/예외 처리

- `open_or_create_dm` 실패: 토스트 "대화방을 열 수 없습니다" + 기존 리스트 유지.
- 온라인 presence 구독 끊김: 재연결까지 마지막 상태 유지, 30초 후 모두 ⚪로 폴백.
- 멘션 드롭다운에서 네트워크 실패: 드롭다운 닫고 평문 입력 허용.
- 답장 원본 메시지가 삭제된 경우: 인용 박스에 "삭제된 메시지" 표시.

## 테스트 전략

- DB: `open_or_create_dm` 멱등성 (동시 호출 2회 → 채널 1개).
- RLS: 비멤버가 DM 채널 접근 차단.
- 사이드바: 직원 리스트 클릭 → 첫 진입 시 DM 생성, 재진입 시 기존 채널.
- Presence: 탭 2개 열어 한쪽만 닫아도 🟢 유지, 둘 다 닫으면 ⚪.
- 멘션: 토큰 저장/렌더 왕복, 멘션된 사용자에게 알림 생성 확인.
- 답장: 원본 삭제 시 UI fallback.

## 구현 순서 (커밋 단위)

1. DB 마이그레이션 053 (dm 타입 + 유일성 + RPC + 채널 목록 RPC 확장)
2. 사이드바 재구성: 채널/직원 섹션 분리 + 직원 클릭 → DM 진입
3. `AvatarStack` 컴포넌트 + 그룹 채널에 참여자 아바타
4. 전역 `presence:online` + 직원 온라인 점
5. `@멘션` 입력/렌더/알림
6. 답장 UI 개선 (호버 메뉴 + 인용 박스 + 스크롤 이동)

각 단계마다 커밋 분리, `git push`는 효태님 명시 요청 시에만.
