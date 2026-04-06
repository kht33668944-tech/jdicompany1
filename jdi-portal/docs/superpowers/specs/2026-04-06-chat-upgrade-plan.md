# 채팅 기능 고도화 구현 계획

## 구현 순서 (의존성 + 난이도 기반)

DB 변경 없는 것 → DB 변경 필요한 것 순서.
각 단계는 독립적으로 빌드 검증 가능.

---

## Step 1: 날짜 구분선 개선
**난이도:** 쉬움 | **DB 변경:** 없음 | **파일:** utils.ts, MessageList.tsx

현재: "2026년 4월 6일 월요일" 고정 형식
변경:
- 오늘 → "오늘"
- 어제 → "어제"
- 올해 → "4월 6일 월요일"
- 작년 이전 → "2025년 12월 25일 목요일"

**수정 파일:**
- `src/lib/chat/utils.ts` — `formatDateDivider()` 함수 수정

---

## Step 2: 드래그앤드롭 파일 첨부
**난이도:** 쉬움 | **DB 변경:** 없음 | **파일:** MessageList.tsx 또는 ChatRoom.tsx

채팅 영역에 파일을 끌어다 놓으면 MessageInput의 pendingFile로 전달.

**수정 파일:**
- `src/components/dashboard/chat/ChatRoom.tsx` — drop zone 래퍼 추가
- `src/components/dashboard/chat/MessageInput.tsx` — 외부에서 pendingFile 설정 가능하도록 ref/prop 추가

---

## Step 3: 이미지 묶어보내기
**난이도:** 중간 | **DB 변경:** 없음 | **파일:** MessageInput, ChatRoom, MessageItem

여러 이미지를 한 번에 선택/붙여넣기 → 미리보기 → 전송 시 개별 메시지로 연속 전송.
MessageItem에서 연속 이미지 메시지를 감지하여 그리드 레이아웃으로 표시.

**수정 파일:**
- `src/components/dashboard/chat/MessageInput.tsx` — 다중 파일 선택 (pendingFiles: File[])
- `src/components/dashboard/chat/ChatRoom.tsx` — handleFileUpload를 배열 처리
- `src/components/dashboard/chat/MessageList.tsx` — 연속 이미지 감지 + 그리드 래핑
- `src/components/dashboard/chat/MessageItem.tsx` — 그리드 모드 prop 추가

---

## Step 4: 메시지 컨텍스트 메뉴
**난이도:** 중간 | **DB 변경:** 없음 | **파일:** MessageItem

현재: hover 시 수정/삭제 아이콘 (모바일 접근 불가)
변경: 우클릭 또는 롱프레스 → 컨텍스트 메뉴 (복사, 답장, 수정, 삭제)

**수정 파일:**
- `src/components/dashboard/chat/MessageItem.tsx` — 컨텍스트 메뉴 컴포넌트 추가
- 모바일: 롱프레스(500ms) 감지

---

## Step 5: 메시지 답장 (Reply)
**난이도:** 중간 | **DB 변경:** 없음 (parent_message_id 이미 존재!)

DB에 `messages.parent_message_id` 컬럼이 이미 있음. UI만 구현하면 됨.

**수정 파일:**
- `src/components/dashboard/chat/ChatRoom.tsx` — replyingTo 상태 추가
- `src/components/dashboard/chat/MessageInput.tsx` — 답장 배너 표시
- `src/components/dashboard/chat/MessageItem.tsx` — 인용 메시지 표시
- `src/lib/chat/actions.ts` — sendMessage에 parentMessageId 파라미터 추가
- `src/lib/chat/queries.ts` — getMessages에서 parent 메시지 정보 join

---

## Step 6: 타이핑 인디케이터
**난이도:** 중간 | **DB 변경:** 없음 | Supabase Presence 사용

Supabase Realtime Presence로 구현. DB 불필요.

**수정 파일:**
- `src/components/dashboard/chat/ChatRoom.tsx` — Presence 채널 구독 + 타이핑 상태 전송
- `src/components/dashboard/chat/MessageInput.tsx` — onTyping 콜백 prop
- `src/components/dashboard/chat/MessageList.tsx` — 하단에 "○○님이 입력 중..." 표시

---

## Step 7: 이모지 리액션
**난이도:** 높음 | **DB 변경:** 새 테이블 필요

**마이그레이션:** `038_chat_reactions.sql`
```sql
CREATE TABLE message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);
-- RLS + 인덱스
```

**수정 파일:**
- `src/lib/chat/types.ts` — MessageReaction 타입 추가
- `src/lib/chat/actions.ts` — toggleReaction(), getReactions()
- `src/components/dashboard/chat/MessageItem.tsx` — 리액션 표시 + 추가 UI
- Realtime 구독으로 리액션 실시간 반영

---

## Step 8: 채널 알림 음소거
**난이도:** 쉬움 | **DB 변경:** 컬럼 추가

**마이그레이션:** `039_chat_mute.sql`
```sql
ALTER TABLE channel_members ADD COLUMN is_muted BOOLEAN DEFAULT false;
```

**수정 파일:**
- `src/components/dashboard/chat/ChannelSettingsDrawer.tsx` — 음소거 토글 추가
- `src/lib/chat/actions.ts` — toggleMute()
- `src/components/dashboard/chat/ChatPageClient.tsx` — 음소거 채널 토스트 알림 스킵
- `src/components/dashboard/chat/ChatUnreadProvider.tsx` — 음소거 채널 뱃지 제외

---

## Step 9: 메시지 고정 (Pin)
**난이도:** 중간 | **DB 변경:** 컬럼 추가

**마이그레이션:** `040_chat_pin.sql`
```sql
ALTER TABLE messages ADD COLUMN is_pinned BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN pinned_by UUID;
ALTER TABLE messages ADD COLUMN pinned_at TIMESTAMPTZ;
```

**수정 파일:**
- `src/lib/chat/actions.ts` — pinMessage(), unpinMessage(), getPinnedMessages()
- `src/components/dashboard/chat/ChatHeader.tsx` — 고정 메시지 아이콘 + 목록
- `src/components/dashboard/chat/MessageItem.tsx` — 고정 표시 + 컨텍스트 메뉴에 "고정" 추가

---

## Step 10: 채널 즐겨찾기
**난이도:** 쉬움 | **DB 변경:** 컬럼 추가

**마이그레이션:** `041_chat_favorite.sql`
```sql
ALTER TABLE channel_members ADD COLUMN is_favorite BOOLEAN DEFAULT false;
```

**수정 파일:**
- `src/lib/chat/actions.ts` — toggleFavorite()
- `src/components/dashboard/chat/ChannelList.tsx` — 즐겨찾기 섹션 상단 표시
- `src/components/dashboard/chat/ChannelListItem.tsx` — 별표 아이콘
- `src/components/dashboard/chat/ChannelSettingsDrawer.tsx` — 즐겨찾기 토글

---

## Step 11: 멤버 온라인 상태
**난이도:** 중간 | **DB 변경:** 없음 | Supabase Presence 사용

Supabase Realtime Presence로 현재 접속 중인 사용자 추적.

**수정 파일:**
- `src/components/dashboard/chat/ChatPageClient.tsx` — 글로벌 Presence 채널 (온라인 상태 브로드캐스트)
- `src/components/dashboard/chat/ChannelSettingsDrawer.tsx` — 멤버 목록에 온라인 dot
- `src/components/dashboard/chat/ChatHeader.tsx` — 온라인 멤버 수 표시

---

## 파일 변경 요약

| 파일 | 관련 Step |
|------|----------|
| `src/lib/chat/utils.ts` | 1 |
| `src/lib/chat/types.ts` | 5, 7 |
| `src/lib/chat/actions.ts` | 5, 7, 8, 9, 10 |
| `src/lib/chat/queries.ts` | 5 |
| `ChatRoom.tsx` | 2, 3, 5, 6 |
| `MessageInput.tsx` | 2, 3, 5, 6 |
| `MessageList.tsx` | 3, 6 |
| `MessageItem.tsx` | 3, 4, 5, 7, 9 |
| `ChatHeader.tsx` | 9, 11 |
| `ChannelList.tsx` | 10 |
| `ChannelListItem.tsx` | 10 |
| `ChannelSettingsDrawer.tsx` | 8, 10, 11 |
| `ChatPageClient.tsx` | 8, 11 |
| `ChatUnreadProvider.tsx` | 8 |

## 마이그레이션

| 파일 | Step |
|------|------|
| `038_chat_reactions.sql` | 7 |
| `039_chat_mute.sql` | 8 |
| `040_chat_pin.sql` | 9 |
| `041_chat_favorite.sql` | 10 |

---

## 실행 방식

- Step 1~6: DB 변경 없이 프론트엔드만 수정
- Step 7~10: 마이그레이션 → 코드 구현 → 빌드 검증
- Step 11: Presence 기반 (DB 불필요)
- 각 Step 완료 후 `npm run build` 검증
- 연관 Step은 순서대로 진행 (특히 4→5: 컨텍스트 메뉴에 답장 포함)
