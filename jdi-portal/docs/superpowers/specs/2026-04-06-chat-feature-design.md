# 사내 채팅 기능 설계서

> 작성일: 2026-04-06
> 상태: 설계 검토 중

## 1. 개요

JDICOMPANY 사내 포털에 실시간 채팅 기능을 추가한다.
4~10명 소규모 조직에 맞는 실용적인 채널 기반 메시징 시스템.

### 핵심 원칙

- 채널 기반 (1:1 DM 없음, 필요하면 2명 채널로 대체)
- 모든 직원이 채널 생성/삭제/멤버 관리 가능
- Supabase Realtime으로 실시간 메시지 전송
- 단계별 구현 (Phase 1 → 2 → 3)

---

## 2. Phase 구분

### Phase 1 — 핵심 채팅

- DB 설계 + RLS 정책
- 채널 CRUD (생성, 수정, 삭제)
- 채널 멤버 관리 (초대, 내보내기, 나가기)
- 실시간 메시지 송수신 (Supabase Realtime)
- 메시지 삭제, 수정 ("수정됨" 표시)
- 나만의 메모 채널 (개인 전용)
- 읽음 표시 (누가 읽었는지 목록 확인 가능)
- 읽지 않은 메시지 뱃지 (사이드바)
- 새 메시지 토스트 알림 (sonner)

### Phase 2 — 미디어 & 검색

- 파일/이미지 드래그앤드롭 첨부
- 이미지 인라인 미리보기 + 클릭 시 원본 확대
- 여러 이미지 묶어보내기 (그리드 레이아웃)
- 전체 다운로드 (묶음 파일)
- 채팅방 서랍 (사진/파일/링크 탭 분류)
- 대화 내역 검색

### Phase 3 — 업무 시스템 연동 (추후)

- 할일 배정/상태 변경 시 자동 메시지
- 오류 접수 시 자동 메시지
- 출퇴근 시 자동 메시지 (선택)
- 공지 전용 채널 기능

---

## 3. DB 설계

### 3.1 channels 테이블

채팅 채널 정보를 저장한다.

```sql
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'group' CHECK (type IN ('group', 'memo')),
  -- group: 일반 채널, memo: 나만의 메모
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

| 컬럼 | 설명 |
|------|------|
| `type = 'group'` | 일반 채널 (2명 이상) |
| `type = 'memo'` | 나만의 메모 (본인만 접근, 1인 채널) |
| `created_by` | 채널 생성자 |

### 3.2 channel_members 테이블

채널 참여 멤버를 관리한다.

```sql
CREATE TABLE channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);
```

| 컬럼 | 설명 |
|------|------|
| `role = 'owner'` | 채널 생성자 (삭제 권한) |
| `role = 'member'` | 일반 멤버 |
| `last_read_at` | 마지막으로 읽은 시점 (읽지 않은 메시지 수 계산용) |

### 3.3 messages 테이블

채팅 메시지를 저장한다.

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'file', 'image', 'system')),
  -- text: 일반 텍스트, file: 파일 첨부, image: 이미지, system: 시스템 메시지
  is_edited BOOLEAN NOT NULL DEFAULT false,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  parent_message_id UUID REFERENCES messages(id),
  -- 묶어보내기: 같은 parent_message_id를 공유하는 이미지들이 하나의 그룹
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

| 컬럼 | 설명 |
|------|------|
| `type = 'system'` | "○○님이 입장했습니다" 같은 시스템 메시지 |
| `is_edited` | 수정 여부 ("수정됨" 라벨 표시용) |
| `is_deleted` | 소프트 삭제 ("삭제된 메시지" 표시) |
| `parent_message_id` | 이미지 묶음 그룹핑용 (Phase 2) |

### 3.4 message_attachments 테이블

메시지에 첨부된 파일 정보를 저장한다. (Phase 2)

```sql
CREATE TABLE message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  -- Supabase Storage 경로: chat-attachments/{channel_id}/{message_id}/{file_name}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.5 message_reads 테이블

메시지별 읽음 기록을 저장한다.

```sql
CREATE TABLE message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);
```

> **읽음 처리 방식:** 사용자가 채팅방에 들어오면 해당 채널의 모든 메시지에 대해 `message_reads`를 bulk insert하고, `channel_members.last_read_at`을 갱신한다. 읽지 않은 메시지 수는 `last_read_at` 이후의 메시지를 COUNT하여 계산.

### 3.6 인덱스

```sql
-- 메시지 조회 (채널별 최신순)
CREATE INDEX idx_messages_channel_created ON messages(channel_id, created_at DESC);

-- 읽지 않은 메시지 수 계산
CREATE INDEX idx_messages_channel_created_asc ON messages(channel_id, created_at);

-- 읽음 확인
CREATE INDEX idx_message_reads_message ON message_reads(message_id);

-- 멤버 조회
CREATE INDEX idx_channel_members_user ON channel_members(user_id);
CREATE INDEX idx_channel_members_channel ON channel_members(channel_id);

-- 첨부파일 조회 (서랍 기능용, Phase 2)
CREATE INDEX idx_attachments_message ON message_attachments(message_id);
```

---

## 4. RLS 정책

모든 테이블에 RLS 활성화. 기본 원칙: `is_approved_user()` + 채널 멤버만 접근.

### channels

```sql
-- SELECT: 자신이 멤버인 채널만 조회
CREATE POLICY "channels_select" ON channels FOR SELECT USING (
  public.is_approved_user() AND (
    type = 'memo' AND created_by = auth.uid()
    OR
    EXISTS (SELECT 1 FROM channel_members WHERE channel_id = id AND user_id = auth.uid())
  )
);

-- INSERT: 승인된 사용자 누구나 생성 가능
CREATE POLICY "channels_insert" ON channels FOR INSERT WITH CHECK (
  public.is_approved_user() AND created_by = auth.uid()
);

-- UPDATE: 멤버만 수정 가능
CREATE POLICY "channels_update" ON channels FOR UPDATE USING (
  public.is_approved_user() AND
  EXISTS (SELECT 1 FROM channel_members WHERE channel_id = id AND user_id = auth.uid())
);

-- DELETE: 생성자만 삭제 가능
CREATE POLICY "channels_delete" ON channels FOR DELETE USING (
  public.is_approved_user() AND created_by = auth.uid()
);
```

### messages

```sql
-- SELECT: 채널 멤버만 메시지 조회
CREATE POLICY "messages_select" ON messages FOR SELECT USING (
  public.is_approved_user() AND
  EXISTS (SELECT 1 FROM channel_members WHERE channel_id = messages.channel_id AND user_id = auth.uid())
);

-- INSERT: 채널 멤버만 메시지 작성
CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (
  public.is_approved_user() AND
  user_id = auth.uid() AND
  EXISTS (SELECT 1 FROM channel_members WHERE channel_id = messages.channel_id AND user_id = auth.uid())
);

-- UPDATE: 본인 메시지만 수정 (is_edited, content, is_deleted만 변경)
CREATE POLICY "messages_update" ON messages FOR UPDATE USING (
  public.is_approved_user() AND user_id = auth.uid()
);
```

### channel_members, message_reads

같은 패턴: 채널 멤버 여부 확인 + `is_approved_user()`.

---

## 5. Supabase Storage

### 버킷

```
chat-attachments (private)
├── {channel_id}/
│   ├── {message_id}/
│   │   ├── image1.png
│   │   ├── document.pdf
│   │   └── ...
```

- 기존 `validateFile()` 유틸 재활용 (10MB, 허용 확장자)
- RLS: 채널 멤버만 해당 채널의 파일 접근 가능

---

## 6. 실시간 구조 (Supabase Realtime)

### 메시지 수신

```typescript
// 채팅방 입장 시 구독
const channel = supabase
  .channel(`chat:${channelId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `channel_id=eq.${channelId}`
  }, (payload) => {
    // 새 메시지를 상태에 추가
  })
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'messages',
    filter: `channel_id=eq.${channelId}`
  }, (payload) => {
    // 수정/삭제된 메시지 반영
  })
  .subscribe();
```

### 채널 목록 업데이트

```typescript
// 사이드바에서 전체 채널의 새 메시지 감지
const globalChannel = supabase
  .channel('chat:global')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages'
  }, (payload) => {
    // 읽지 않은 메시지 뱃지 갱신
    // 현재 보고 있지 않은 채널이면 토스트 알림
  })
  .subscribe();
```

### 구독 생명주기

- 채팅 페이지 진입 시 글로벌 구독 시작
- 특정 채널 열 때 해당 채널 구독 추가
- 채널 나가거나 페이지 이탈 시 구독 해제
- `useEffect` cleanup에서 `supabase.removeChannel()` 호출

---

## 7. 도메인 모듈 구조

기존 패턴을 따른다: `src/lib/chat/`

```
src/lib/chat/
├── types.ts        — Channel, Message, Attachment 등 타입 정의
├── constants.ts    — 메시지 타입 설정, UI 상수
├── queries.ts      — 채널 목록, 메시지 조회, 검색 (서버 컴포넌트용)
├── actions.ts      — 채널 CRUD, 메시지 전송/수정/삭제 (클라이언트용)
└── utils.ts        — 시간 포맷, 파일 타입 판별 등 헬퍼
```

### 주요 타입

```typescript
// types.ts
export type ChannelType = 'group' | 'memo';
export type MessageType = 'text' | 'file' | 'image' | 'system';

export interface Channel {
  id: string;
  name: string;
  description: string;
  type: ChannelType;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ChannelWithDetails extends Channel {
  members: ChannelMember[];
  last_message: Message | null;
  unread_count: number;
}

export interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  type: MessageType;
  is_edited: boolean;
  is_deleted: boolean;
  parent_message_id: string | null;
  created_at: string;
  updated_at: string;
  // joined
  user_profile?: { name: string; avatar_url: string };
  attachments?: MessageAttachment[];
  read_by?: { user_id: string; name: string; read_at: string }[];
}

export interface ChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  role: 'owner' | 'member';
  last_read_at: string;
  joined_at: string;
  // joined
  profile?: { name: string; avatar_url: string };
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
}
```

### 주요 actions

```typescript
// actions.ts (클라이언트에서 직접 호출, RLS가 보안 담당)
export async function createChannel(params: { name, description, type, memberIds[] })
export async function deleteChannel(channelId: string)
export async function updateChannel(channelId: string, params: { name?, description? })

export async function addMembers(channelId: string, userIds: string[])
export async function removeMember(channelId: string, userId: string)
export async function leaveChannel(channelId: string)

export async function sendMessage(params: { channelId, content, type })
export async function editMessage(messageId: string, content: string)
export async function deleteMessage(messageId: string)

export async function markAsRead(channelId: string)
export async function getReadReceipts(messageId: string)

// Phase 2
export async function uploadAttachments(channelId: string, messageId: string, files: File[])
export async function searchMessages(channelId: string, query: string)
export async function getDrawerItems(channelId: string, tab: 'images' | 'files' | 'links')
```

### 주요 queries

```typescript
// queries.ts (서버 컴포넌트용)
export async function getChannels(supabase: SupabaseClient, userId: string): Promise<ChannelWithDetails[]>
export async function getChannelById(supabase: SupabaseClient, channelId: string): Promise<ChannelWithDetails>
export async function getMessages(supabase: SupabaseClient, channelId: string, cursor?: string, limit?: number): Promise<Message[]>
export async function getMemoChannel(supabase: SupabaseClient, userId: string): Promise<Channel | null>
```

---

## 8. 라우팅

```
/dashboard/chat                 — 채널 목록 (채널 선택 전 기본 화면)
/dashboard/chat/[channelId]     — 특정 채널 대화방
```

사이드바에 추가:
```typescript
{ href: "/dashboard/chat", label: "채팅", icon: ChatCircle }
```

---

## 9. 컴포넌트 구조

```
src/components/dashboard/chat/
├── ChatPageClient.tsx          — 채팅 메인 레이아웃 (채널 목록 + 대화창)
├── ChannelList.tsx             — 채널 목록 사이드 패널
├── ChannelListItem.tsx         — 채널 항목 (이름, 마지막 메시지, 뱃지)
├── ChatRoom.tsx                — 대화방 메인 영역
├── ChatHeader.tsx              — 대화방 상단 (채널명, 멤버 수, 서랍 버튼)
├── MessageList.tsx             — 메시지 목록 (무한 스크롤)
├── MessageItem.tsx             — 개별 메시지 (프로필, 내용, 시간, 읽음)
├── MessageInput.tsx            — 메시지 입력창 (텍스트 + 파일 첨부)
├── ReadReceiptModal.tsx        — 읽은 사람 목록 모달
├── ChannelCreateModal.tsx      — 채널 생성 모달
├── ChannelSettingsDrawer.tsx   — 채널 설정 (멤버 관리, 채널 삭제)
├── ChatDrawer.tsx              — 채팅방 서랍 (사진/파일/링크 탭) (Phase 2)
├── ImageGroupMessage.tsx       — 이미지 묶어보내기 그리드 (Phase 2)
├── ImageViewer.tsx             — 이미지 원본 확대 뷰어 (Phase 2)
└── MessageSearch.tsx           — 대화 내역 검색 (Phase 2)
```

---

## 10. 주요 데이터 흐름

### 메시지 전송

```
사용자 입력 → sendMessage() → Supabase INSERT
                                    ↓
                              Realtime 감지
                                    ↓
                    다른 클라이언트 MessageList에 새 메시지 추가
                    + 채널 목록 뱃지 갱신
                    + 다른 채널에 있으면 토스트 알림
```

### 읽음 처리

```
채팅방 입장 → markAsRead() → channel_members.last_read_at 갱신
                           → message_reads에 bulk insert
                           → 사이드바 뱃지 갱신
```

### 채팅방 서랍 (Phase 2)

```
서랍 열기 → getDrawerItems(channelId, tab)
         → tab별 쿼리:
           - 'images': message_attachments WHERE file_type LIKE 'image/%'
           - 'files':  message_attachments WHERE file_type NOT LIKE 'image/%'
           - 'links':  messages에서 URL 패턴 추출
         → 월별 그룹핑하여 그리드/리스트로 표시
```

---

## 11. 나만의 메모 채널

- 사용자당 1개 자동 생성 (최초 채팅 페이지 진입 시)
- `type = 'memo'`, `created_by = 본인`
- 채널 목록 상단에 고정 표시
- 멤버는 본인 1명만
- 삭제 불가
- 일반 메시지와 동일하게 텍스트/파일/이미지 저장 가능

---

## 12. 채널 멤버 관리 규칙

| 상황 | 규칙 |
|------|------|
| 채널 생성 | 생성자 자동으로 owner, 선택한 멤버는 member |
| 멤버 초대 | 모든 멤버가 다른 직원을 초대 가능 |
| 멤버 내보내기 | 모든 멤버가 다른 멤버를 내보내기 가능 |
| 나가기 | 자유롭게 나갈 수 있음 |
| 2명 채널 (1:1 대체) | 내보내기/나가기 불가 (고정 멤버) |
| 채널 삭제 | 생성자만 가능 |
| 메모 채널 | 본인만 접근, 삭제 불가 |

---

## 13. 에러 처리

| 상황 | 처리 |
|------|------|
| 메시지 전송 실패 | 토스트 에러 + 재전송 버튼 표시 |
| Realtime 연결 끊김 | 자동 재연결 (Supabase SDK 내장) + 재연결 시 누락 메시지 fetch |
| 파일 업로드 실패 | 토스트 에러, 메시지는 텍스트만 전송 |
| 채널 삭제됨 | 채널 목록으로 리다이렉트 + 토스트 알림 |

---

## 14. 성능 고려사항

- 메시지 페이지네이션: 최초 50개 로드, 위로 스크롤 시 추가 로드 (커서 기반)
- 채널 목록: 마지막 메시지 + 읽지 않은 수를 서버에서 한 번에 조회
- 읽음 처리: 채널 입장 시 한 번만 실행 (개별 메시지마다 X)
- Realtime 구독: 현재 열린 채널만 상세 구독, 나머지는 글로벌 구독으로 뱃지만 갱신
- 이미지 썸네일: Supabase Storage transform 활용 (리사이즈)
