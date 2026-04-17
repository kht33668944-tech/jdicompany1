# 채팅 DM + 직원 리스트 + 참여자 아바타 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 채팅 사이드바를 "채널 / 직원" 2섹션으로 재구성해 DM을 직원 클릭 한 번으로 열고, 그룹 채널엔 참여자 아바타를 귀엽게 표시하며, 전역 온라인 상태·@멘션·답장 UI를 추가한다.

**Architecture:** `channels.type`에 `'dm'`을 추가하고 `dm_pair_key` 유일 인덱스로 두 사람당 채널 1개를 보장한다. `open_or_create_dm` RPC가 원자적 upsert를 담당한다. 사이드바는 채널(그룹/메모만)과 직원(전체, 가나다순) 두 섹션으로 분리되며, 기존 `usePresence` 훅(`presence:online` 전역 채널)을 재사용해 🟢/⚪ 를 표시한다. @멘션은 메시지 INSERT 트리거에서 본문 토큰을 파싱해 `notifications`를 생성한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5 strict, Supabase (RLS + RPC + Presence), Tailwind CSS 4, Phosphor Icons.

**Spec:** `docs/superpowers/specs/2026-04-17-chat-dm-and-people-list-design.md`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| 생성 | `supabase/migrations/069_chat_dm.sql` | `dm` 타입 + `dm_pair_key` + `open_or_create_dm` RPC + `get_user_channels` 확장 + 멘션 알림 트리거 |
| 수정 | `src/lib/chat/types.ts` | `ChannelType`에 `'dm'` 추가, `ChannelWithDetails`에 `members_preview`·`dm_partner_id` 확장 |
| 수정 | `src/lib/chat/queries.ts` | `getChannels` 반환 필드 유지, `getAllProfiles`는 `actions.ts` 그대로 재사용 |
| 생성 | `src/lib/chat/dm.ts` | `openOrCreateDm(targetUserId)` 클라이언트 래퍼 |
| 생성 | `src/lib/chat/mentions.ts` | 멘션 토큰 `@[이름\|uuid]` 파싱·직렬화·렌더 유틸 |
| 수정 | `src/lib/chat/actions.ts` | `sendMessage`는 변경 없음(트리거가 알림 담당), 필요 시 `searchChannelMembers` 추가 |
| 생성 | `src/components/dashboard/chat/AvatarStack.tsx` | 참여자 아바타 겹침 스택 (재사용 컴포넌트) |
| 생성 | `src/components/dashboard/chat/PersonListItem.tsx` | 직원 리스트 행 (🟢/⚪ + 이름 + 안읽은 DM 배지) |
| 수정 | `src/components/dashboard/chat/ChannelList.tsx` | 메모 / 채널 / 직원 3섹션 구조, 직원 클릭 핸들러 prop 추가 |
| 수정 | `src/components/dashboard/chat/ChannelListItem.tsx` | 그룹/DM 채널에 `AvatarStack` 통합, DM이면 상대 이름/아바타 표시 |
| 수정 | `src/components/dashboard/chat/ChannelCreateModal.tsx` | 타이틀·안내 문구 "새 그룹 만들기"로 변경, `type='group'`만 생성 |
| 수정 | `src/components/dashboard/chat/ChatPageClient.tsx` | 직원 프로필 로드, `onSelectPerson` 핸들러, 안읽은 DM Map 계산, `ChannelList`에 props 주입 |
| 수정 | `src/components/dashboard/chat/MessageInput.tsx` | `@` 트리거 멤버 드롭다운, 토큰 삽입 로직 |
| 생성 | `src/components/dashboard/chat/MentionPicker.tsx` | 멘션 드롭다운 UI (멤버 필터링) |
| 수정 | `src/components/dashboard/chat/MessageItem.tsx` | 멘션 토큰 파싱 후 파란 배지 렌더, 부모 메시지 인용 미리보기(클릭 시 스크롤) |
| 수정 | `src/components/dashboard/chat/MessageList.tsx` | 메시지 `id`에 `data-message-id` 부여 (답장 스크롤 타깃용), `scrollToMessage` 메서드 노출 |

---

## Task 1: DB 마이그레이션 069 — DM 타입 + RPC + 채널 RPC 확장

**Files:**
- Create: `supabase/migrations/069_chat_dm.sql`

**Context:**
- 최신 마이그레이션은 `068_remove_projects.sql` (번호만 확인, 내용 무관).
- 기존 `channels.type` CHECK: `('group', 'memo')` → `('group', 'memo', 'dm')` 로 확장.
- 기존 `get_user_channels` 는 `047_security_hardening.sql` 에서 `SECURITY DEFINER` 로 정의됨. 반환 JSON에 `members_preview` / `dm_partner_id` 를 추가해야 사이드바 한 번의 왕복으로 모든 데이터 확보.
- `create_chat_channel` RPC는 그대로 두고, 별도 `open_or_create_dm` RPC 신규.

- [ ] **Step 1: 마이그레이션 파일 생성**

파일: `supabase/migrations/069_chat_dm.sql`

```sql
-- ============================================
-- 069_chat_dm.sql — 1:1 DM 채널 타입 + 직원 리스트 사이드바 지원
-- ============================================

-- 1. channels.type 에 'dm' 추가 ---------------------------------
ALTER TABLE public.channels DROP CONSTRAINT IF EXISTS channels_type_check;
ALTER TABLE public.channels
  ADD CONSTRAINT channels_type_check
  CHECK (type IN ('group', 'memo', 'dm'));

-- 2. dm_pair_key 컬럼 + 유일 인덱스 ------------------------------
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS dm_pair_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_pair_key
  ON public.channels(dm_pair_key)
  WHERE type = 'dm' AND dm_pair_key IS NOT NULL;

-- 3. open_or_create_dm RPC -------------------------------------
CREATE OR REPLACE FUNCTION public.open_or_create_dm(p_target_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_pair_key TEXT;
  v_channel_id UUID;
  v_target_name TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.is_approved_user() THEN
    RAISE EXCEPTION 'User not approved';
  END IF;
  IF p_target_user_id IS NULL OR p_target_user_id = v_user_id THEN
    RAISE EXCEPTION 'Invalid target user';
  END IF;

  -- 상대가 승인된 사용자인지 확인
  SELECT full_name INTO v_target_name
    FROM public.profiles
   WHERE id = p_target_user_id AND is_approved = true;
  IF v_target_name IS NULL THEN
    RAISE EXCEPTION 'Target user not approved';
  END IF;

  -- 정렬된 UUID 쌍 → 결정적 키
  v_pair_key := CASE
    WHEN v_user_id < p_target_user_id
      THEN v_user_id::text || '_' || p_target_user_id::text
    ELSE p_target_user_id::text || '_' || v_user_id::text
  END;

  -- 기존 DM 채널 있으면 반환
  SELECT id INTO v_channel_id
    FROM public.channels
   WHERE type = 'dm' AND dm_pair_key = v_pair_key;

  IF v_channel_id IS NOT NULL THEN
    RETURN v_channel_id;
  END IF;

  -- 채널 생성 (이름은 빈 문자열 — 클라이언트에서 상대 이름으로 렌더)
  INSERT INTO public.channels (name, description, type, created_by, dm_pair_key)
    VALUES ('', '', 'dm', v_user_id, v_pair_key)
    RETURNING id INTO v_channel_id;

  -- 두 멤버 추가
  INSERT INTO public.channel_members (channel_id, user_id, role)
    VALUES
      (v_channel_id, v_user_id, 'owner'),
      (v_channel_id, p_target_user_id, 'member');

  RETURN v_channel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_or_create_dm(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_or_create_dm(UUID) TO authenticated;

-- 4. get_user_channels 확장: members_preview + dm_partner_id ----
CREATE OR REPLACE FUNCTION public.get_user_channels(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_user_id IS NOT NULL AND p_user_id <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden: cannot query channels for other users';
  END IF;

  WITH my_channels AS (
    SELECT cm.channel_id, cm.last_read_at, cm.is_muted, cm.is_favorite
      FROM public.channel_members cm
     WHERE cm.user_id = v_user_id
  ),
  member_counts AS (
    SELECT channel_id, COUNT(*)::INT AS member_count
      FROM public.channel_members
     WHERE channel_id IN (SELECT channel_id FROM my_channels)
     GROUP BY channel_id
  ),
  unread AS (
    SELECT m.channel_id, COUNT(*)::INT AS unread_count
      FROM public.messages m
      JOIN my_channels mc ON mc.channel_id = m.channel_id
     WHERE m.is_deleted = false
       AND m.user_id <> v_user_id
       AND m.created_at > mc.last_read_at
     GROUP BY m.channel_id
  ),
  last_msg AS (
    SELECT DISTINCT ON (m.channel_id)
           m.channel_id, m.content, m.created_at, m.type, m.user_id
      FROM public.messages m
     WHERE m.channel_id IN (SELECT channel_id FROM my_channels)
       AND m.is_deleted = false
     ORDER BY m.channel_id, m.created_at DESC
  ),
  members_preview AS (
    SELECT cm.channel_id,
           jsonb_agg(
             jsonb_build_object(
               'id', p.id,
               'full_name', p.full_name,
               'avatar_url', p.avatar_url
             )
             ORDER BY cm.joined_at
           ) FILTER (WHERE p.id IS NOT NULL AND cm.user_id <> v_user_id) AS items
      FROM public.channel_members cm
      JOIN public.profiles p ON p.id = cm.user_id
     WHERE cm.channel_id IN (SELECT channel_id FROM my_channels)
     GROUP BY cm.channel_id
  ),
  dm_partner AS (
    SELECT cm.channel_id, cm.user_id AS partner_id
      FROM public.channel_members cm
      JOIN public.channels c ON c.id = cm.channel_id
     WHERE c.type = 'dm'
       AND cm.user_id <> v_user_id
       AND cm.channel_id IN (SELECT channel_id FROM my_channels)
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.updated_at DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        c.id,
        c.name,
        c.description,
        c.type,
        c.created_by,
        c.created_at,
        c.updated_at,
        COALESCE(mc.member_count, 0) AS member_count,
        COALESCE(u.unread_count, 0) AS unread_count,
        CASE
          WHEN lm.channel_id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'content', lm.content,
            'created_at', lm.created_at,
            'type', lm.type,
            'user_name', COALESCE((SELECT full_name FROM public.profiles WHERE id = lm.user_id), '')
          )
        END AS last_message,
        COALESCE(mp.items, '[]'::jsonb) AS members_preview,
        dp.partner_id AS dm_partner_id
      FROM public.channels c
      JOIN my_channels mch ON mch.channel_id = c.id
      LEFT JOIN member_counts mc ON mc.channel_id = c.id
      LEFT JOIN unread u ON u.channel_id = c.id
      LEFT JOIN last_msg lm ON lm.channel_id = c.id
      LEFT JOIN members_preview mp ON mp.channel_id = c.id
      LEFT JOIN dm_partner dp ON dp.channel_id = c.id
    ) t;

  RETURN v_result;
END;
$$;

-- 5. 멘션 알림 트리거 -----------------------------------------
-- messages INSERT 시 content 에서 @[이름|uuid] 패턴 파싱 후
-- 멘션된 사용자(본인 제외)에게 notifications 생성
CREATE OR REPLACE FUNCTION public.handle_message_mention_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token RECORD;
  v_sender_name TEXT;
  v_channel_name TEXT;
  v_channel_type TEXT;
BEGIN
  IF NEW.type <> 'text' OR NEW.is_deleted THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_sender_name FROM public.profiles WHERE id = NEW.user_id;
  SELECT name, type INTO v_channel_name, v_channel_type FROM public.channels WHERE id = NEW.channel_id;

  -- @[이름|uuid] 토큰들을 정규식으로 추출
  FOR v_token IN
    SELECT DISTINCT (regexp_matches(NEW.content, '@\[[^|\]]+\|([0-9a-f-]{36})\]', 'g'))[1]::uuid AS mentioned_user
  LOOP
    -- 발신자 자신은 제외
    IF v_token.mentioned_user = NEW.user_id THEN
      CONTINUE;
    END IF;
    -- 해당 채널 멤버인지 확인
    IF NOT EXISTS (
      SELECT 1 FROM public.channel_members
       WHERE channel_id = NEW.channel_id AND user_id = v_token.mentioned_user
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
    VALUES (
      v_token.mentioned_user,
      'chat_mention',
      COALESCE(v_sender_name, '누군가') || '님이 회원님을 언급했습니다',
      substring(NEW.content from 1 for 200),
      '/dashboard/chat/' || NEW.channel_id::text,
      jsonb_build_object('channel_id', NEW.channel_id, 'message_id', NEW.id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_mention_notify ON public.messages;
CREATE TRIGGER trg_message_mention_notify
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_message_mention_notify();
```

- [ ] **Step 2: 마이그레이션 적용 (로컬)**

Run: `npx supabase db push`
Expected: `069_chat_dm.sql` 적용됨, 에러 없음.

- [ ] **Step 3: 수동 검증 — 제약 및 유일성**

다음을 `supabase/queries.sql` 또는 SQL Editor에서 실행하거나 `psql` 로 검증:

```sql
-- 새 타입 허용되는지
INSERT INTO channels (name, type, created_by, dm_pair_key)
  VALUES ('', 'dm', '00000000-0000-0000-0000-000000000000',
          'aaaa_bbbb') RETURNING id;
-- 같은 dm_pair_key 로 두 번째 INSERT → 실패해야 함
INSERT INTO channels (name, type, created_by, dm_pair_key)
  VALUES ('', 'dm', '00000000-0000-0000-0000-000000000000',
          'aaaa_bbbb');
-- 롤백
DELETE FROM channels WHERE dm_pair_key = 'aaaa_bbbb';
```

Expected: 두 번째 INSERT가 `duplicate key value violates unique constraint "idx_dm_pair_key"` 로 실패.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/069_chat_dm.sql
git commit -m "$(cat <<'EOF'
DB: DM 채널 타입 + open_or_create_dm RPC + 멘션 알림 트리거

- channels.type 에 'dm' 추가, dm_pair_key 유일 인덱스
- open_or_create_dm(target_user_id): 멱등 채널 열기
- get_user_channels 에 members_preview + dm_partner_id 포함
- messages INSERT 트리거로 @멘션 notifications 자동 생성
EOF
)"
```

---

## Task 2: TypeScript 타입 확장

**Files:**
- Modify: `src/lib/chat/types.ts`

- [ ] **Step 1: `ChannelType`에 `'dm'` 추가, 관련 필드 확장**

파일: `src/lib/chat/types.ts` 전체 교체:

```typescript
export type ChannelType = "group" | "memo" | "dm";
export type MessageType = "text" | "file" | "image" | "system";
export type ChannelMemberRole = "owner" | "member";

export interface Channel {
  id: string;
  name: string;
  description: string;
  type: ChannelType;
  created_by: string;
  created_at: string;
  updated_at: string;
  dm_pair_key?: string | null;
}

export interface ChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  role: ChannelMemberRole;
  last_read_at: string;
  joined_at: string;
  profile?: { full_name: string; avatar_url: string | null };
}

export interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  type: MessageType;
  is_edited: boolean;
  is_deleted: boolean;
  is_pinned?: boolean;
  pinned_by?: string | null;
  pinned_at?: string | null;
  parent_message_id: string | null;
  created_at: string;
  updated_at: string;
  user_profile?: { full_name: string; avatar_url: string | null };
  attachments?: MessageAttachment[];
  read_by?: MessageReadReceipt[];
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  created_at: string;
}

export interface MessageReadReceipt {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  read_at: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  reacted: boolean;
}

export interface MemberPreview {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export interface ChannelWithDetails extends Channel {
  members: ChannelMember[];
  member_count: number;
  last_message: {
    content: string;
    created_at: string;
    user_name: string;
    type: MessageType;
  } | null;
  unread_count: number;
  members_preview?: MemberPreview[];
  dm_partner_id?: string | null;
}

export interface ApprovedProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  department: string | null;
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run lint`
Expected: 기존 호출부에서 깨지는 타입 없음 (`members_preview`·`dm_partner_id`는 옵셔널이라 기존 코드 호환).

- [ ] **Step 3: 커밋**

```bash
git add src/lib/chat/types.ts
git commit -m "타입: ChannelType에 dm 추가, members_preview·dm_partner_id 옵셔널 필드"
```

---

## Task 3: DM 열기 클라이언트 래퍼

**Files:**
- Create: `src/lib/chat/dm.ts`

- [ ] **Step 1: 구현**

파일: `src/lib/chat/dm.ts`:

```typescript
import { createClient } from "@/lib/supabase/client";

export async function openOrCreateDm(targetUserId: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("open_or_create_dm", {
    p_target_user_id: targetUserId,
  });
  if (error) throw error;
  if (!data || typeof data !== "string") {
    throw new Error("대화방을 열지 못했습니다.");
  }
  return data;
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/lib/chat/dm.ts
git commit -m "chat: openOrCreateDm 클라이언트 래퍼 (RPC 호출)"
```

---

## Task 4: `AvatarStack` 재사용 컴포넌트

**Files:**
- Create: `src/components/dashboard/chat/AvatarStack.tsx`

- [ ] **Step 1: 구현**

파일: `src/components/dashboard/chat/AvatarStack.tsx`:

```tsx
"use client";

import type { MemberPreview } from "@/lib/chat/types";

const AVATAR_BG = [
  "bg-blue-400", "bg-rose-400", "bg-amber-400", "bg-teal-400",
  "bg-violet-400", "bg-emerald-400", "bg-indigo-400", "bg-orange-400",
];

function hashColorIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % AVATAR_BG.length;
}

interface AvatarStackProps {
  members: MemberPreview[];
  max?: number;
  size?: number;
  totalCount?: number;
}

export default function AvatarStack({
  members,
  max = 3,
  size = 20,
  totalCount,
}: AvatarStackProps) {
  if (members.length === 0) return null;
  const visible = members.slice(0, max);
  const total = totalCount ?? members.length;
  const extra = total - visible.length;

  return (
    <div className="flex items-center" style={{ paddingLeft: 0 }}>
      {visible.map((m, i) => (
        <div
          key={m.id}
          style={{ width: size, height: size, marginLeft: i === 0 ? 0 : -6, zIndex: visible.length - i }}
          className="relative rounded-full overflow-hidden ring-2 ring-white flex-shrink-0"
          title={m.full_name}
        >
          {m.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.avatar_url} alt={m.full_name} className="w-full h-full object-cover" />
          ) : (
            <div
              className={`w-full h-full ${AVATAR_BG[hashColorIndex(m.id)]} flex items-center justify-center text-[10px] font-bold text-white`}
            >
              {m.full_name.charAt(0)}
            </div>
          )}
        </div>
      ))}
      {extra > 0 && (
        <div
          style={{ width: size, height: size, marginLeft: -6 }}
          className="relative rounded-full bg-slate-200 ring-2 ring-white flex items-center justify-center text-[9px] font-bold text-slate-600 flex-shrink-0"
        >
          +{extra}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `ChannelListItem.tsx` 에 통합 (그룹/DM만)**

파일: `src/components/dashboard/chat/ChannelListItem.tsx` — `isMemo` 가 아닌 분기 상단에 `AvatarStack` 추가. 기존 이니셜 아이콘은 DM일 때 상대 1명 아바타로 교체.

현재 분기 (파일 70~108행 부근):

```tsx
const initial = channel.name.charAt(0).toUpperCase();

return (
  <button
    onClick={onClick}
    className={`w-full text-left flex items-center gap-3 p-4 rounded-2xl transition-colors relative ${
      isSelected ? "bg-slate-100" : "hover:bg-slate-50"
    }`}
  >
```

위 블록을 다음으로 교체:

```tsx
const isDm = channel.type === "dm";
const dmPartner = isDm
  ? channel.members_preview?.[0] ?? null
  : null;
const displayName = isDm
  ? dmPartner?.full_name ?? "(알 수 없음)"
  : channel.name;
const initial = displayName.charAt(0).toUpperCase();

// 그룹: 최대 3명 + 전체 수 기반으로 +N 계산
// DM: members_preview 는 상대 1명이므로 스택 대신 단일 아바타 렌더
const groupMembers = !isDm ? channel.members_preview ?? [] : [];
const groupTotalOthers = !isDm
  ? Math.max(0, (channel.member_count ?? 0) - 1) // 본인 제외
  : 0;

return (
  <button
    onClick={onClick}
    className={`w-full text-left flex items-center gap-3 p-4 rounded-2xl transition-colors relative ${
      isSelected ? "bg-slate-100" : "hover:bg-slate-50"
    }`}
  >
```

그리고 이니셜 블록(파일 82~84행):

```tsx
<div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0 text-sm font-bold text-slate-600">
  {initial}
</div>
```

을 다음으로 교체:

```tsx
<div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0 text-sm font-bold text-slate-600 overflow-hidden">
  {isDm && dmPartner?.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={dmPartner.avatar_url} alt={dmPartner.full_name} className="w-full h-full object-cover" />
  ) : (
    initial
  )}
</div>
```

그리고 채널 이름 줄의 오른쪽, `lastMsgTime` 아래 영역에 참여자 스택 추가 — 파일 93~103행의 `<div className="flex flex-col items-end gap-1 flex-shrink-0">` 블록 바로 위 `<div className="flex items-center gap-1 min-w-0">` 블록 다음에 삽입:

```tsx
{!isDm && groupMembers.length > 0 && (
  <div className="mt-1">
    <AvatarStack members={groupMembers} totalCount={groupTotalOthers} max={3} size={18} />
  </div>
)}
```

파일 상단 import 추가:

```tsx
import AvatarStack from "./AvatarStack";
```

- [ ] **Step 3: `name` 렌더 부분 `displayName` 로 교체**

현재 파일 88~89행:

```tsx
<p className={`text-sm truncate ${isSelected ? "font-bold text-slate-800" : "font-semibold text-slate-700"}`}>
  {channel.name}
</p>
```

다음으로:

```tsx
<p className={`text-sm truncate ${isSelected ? "font-bold text-slate-800" : "font-semibold text-slate-700"}`}>
  {displayName}
</p>
```

- [ ] **Step 4: 브라우저 수동 검증**

Run: `npm run dev` (이미 떠있으면 그대로 새로고침)
Expected:
- 기존 그룹 채널 이름 그대로 보이고, 우측에 참여자 아바타 겹침.
- 아직 DM은 생성되지 않았지만 기존 메모/그룹 채널 정상.

- [ ] **Step 5: 커밋**

```bash
git add src/components/dashboard/chat/AvatarStack.tsx src/components/dashboard/chat/ChannelListItem.tsx
git commit -m "UI: 채널 리스트에 참여자 AvatarStack + DM 렌더 분기"
```

---

## Task 5: `PersonListItem` + 직원 섹션 스켈레톤

**Files:**
- Create: `src/components/dashboard/chat/PersonListItem.tsx`
- Modify: `src/components/dashboard/chat/ChannelList.tsx`

- [ ] **Step 1: `PersonListItem` 구현**

파일: `src/components/dashboard/chat/PersonListItem.tsx`:

```tsx
"use client";

import type { ApprovedProfile } from "@/lib/chat/types";

interface PersonListItemProps {
  person: ApprovedProfile;
  isOnline: boolean;
  unreadCount: number;
  isSelected: boolean;
  onClick: () => void;
}

export default function PersonListItem({
  person,
  isOnline,
  unreadCount,
  isSelected,
  onClick,
}: PersonListItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors relative ${
        isSelected ? "bg-slate-100" : "hover:bg-slate-50"
      }`}
    >
      {isSelected && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 rounded-r-full" />
      )}
      <div className="relative flex-shrink-0">
        <div className={`w-8 h-8 rounded-full overflow-hidden bg-slate-200 ${isOnline ? "" : "opacity-70"}`}>
          {person.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={person.avatar_url} alt={person.full_name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-500">
              {person.full_name.charAt(0)}
            </div>
          )}
        </div>
        <span
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
            isOnline ? "bg-emerald-500" : "bg-slate-300"
          }`}
          aria-label={isOnline ? "온라인" : "오프라인"}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">{person.full_name}</p>
        {person.department && (
          <p className="text-[11px] text-slate-400 truncate">{person.department}</p>
        )}
      </div>
      {unreadCount > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center flex-shrink-0">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: `ChannelList.tsx` props 및 섹션 확장**

파일: `src/components/dashboard/chat/ChannelList.tsx` 전체 교체:

```tsx
"use client";

import { useState, useMemo } from "react";
import { Plus, MagnifyingGlass, Star } from "phosphor-react";
import type { ChannelWithDetails, ApprovedProfile } from "@/lib/chat/types";
import ChannelListItem from "./ChannelListItem";
import PersonListItem from "./PersonListItem";

interface ChannelListProps {
  channels: ChannelWithDetails[];
  people: ApprovedProfile[];
  onlineUserIds: Set<string>;
  dmUnreadByPartner: Map<string, number>;
  selectedChannelId?: string;
  selectedPartnerId?: string;
  mutedChannels?: Set<string>;
  favoriteChannels?: Set<string>;
  onSelectChannel: (channel: ChannelWithDetails) => void;
  onSelectPerson: (person: ApprovedProfile) => void;
  onCreateClick: () => void;
}

export default function ChannelList({
  channels,
  people,
  onlineUserIds,
  dmUnreadByPartner,
  selectedChannelId,
  selectedPartnerId,
  mutedChannels = new Set(),
  favoriteChannels = new Set(),
  onSelectChannel,
  onSelectPerson,
  onCreateClick,
}: ChannelListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const q = searchQuery.trim().toLowerCase();

  const memoChannel = channels.find((ch) => ch.type === "memo");
  // DM 은 채널 섹션에 안 보임 — 직원 섹션에서만 접근
  const groupChannels = channels.filter((ch) => ch.type === "group");

  const filteredGroupChannels = groupChannels.filter((ch) => {
    if (!q) return true;
    return (
      ch.name.toLowerCase().includes(q) ||
      ch.last_message?.content.toLowerCase().includes(q)
    );
  });

  const filteredMemo =
    memoChannel &&
    (!q ||
      "나만의 메모".includes(q) ||
      memoChannel.last_message?.content.toLowerCase().includes(q))
      ? memoChannel
      : null;

  const sortedGroupChannels = useMemo(
    () =>
      [...filteredGroupChannels].sort((a, b) => {
        const aTime = a.last_message?.created_at ?? a.updated_at;
        const bTime = b.last_message?.created_at ?? b.updated_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      }),
    [filteredGroupChannels]
  );
  const favoriteGroupChannels = sortedGroupChannels.filter((ch) => favoriteChannels.has(ch.id));
  const nonFavoriteGroupChannels = sortedGroupChannels.filter((ch) => !favoriteChannels.has(ch.id));

  const filteredPeople = useMemo(
    () =>
      people.filter((p) => {
        if (!q) return true;
        return (
          p.full_name.toLowerCase().includes(q) ||
          (p.department ?? "").toLowerCase().includes(q)
        );
      }),
    [people, q]
  );

  const nothingMatches =
    q && sortedGroupChannels.length === 0 && !filteredMemo && filteredPeople.length === 0;

  return (
    <aside className="w-full sm:w-80 flex-shrink-0 border-r border-slate-100 flex flex-col bg-white">
      <div className="px-4 pt-5 pb-3 flex items-center justify-between flex-shrink-0">
        <h1 className="text-2xl font-bold text-slate-800">채팅</h1>
        <button
          onClick={onCreateClick}
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
          title="새 그룹 만들기"
          aria-label="새 그룹 만들기"
        >
          <Plus size={18} weight="bold" className="text-slate-600" />
        </button>
      </div>

      <div className="px-4 pb-3 flex-shrink-0">
        <div className="relative group">
          <MagnifyingGlass
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="채널·직원·메시지 검색"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
        {filteredMemo && (
          <div className="mb-3">
            <ChannelListItem
              channel={filteredMemo}
              isSelected={selectedChannelId === filteredMemo.id}
              isMemo
              onClick={() => onSelectChannel(filteredMemo)}
            />
          </div>
        )}

        {favoriteGroupChannels.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1 py-1 flex items-center gap-1">
              <Star size={11} weight="fill" className="text-amber-400" />
              즐겨찾기
            </p>
            {favoriteGroupChannels.map((ch) => (
              <ChannelListItem
                key={ch.id}
                channel={ch}
                isSelected={selectedChannelId === ch.id}
                isMemo={false}
                isMuted={mutedChannels.has(ch.id)}
                isFavorite
                onClick={() => onSelectChannel(ch)}
              />
            ))}
          </>
        )}

        {nonFavoriteGroupChannels.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1 py-1">
              채널
            </p>
            {nonFavoriteGroupChannels.map((ch) => (
              <ChannelListItem
                key={ch.id}
                channel={ch}
                isSelected={selectedChannelId === ch.id}
                isMemo={false}
                isMuted={mutedChannels.has(ch.id)}
                onClick={() => onSelectChannel(ch)}
              />
            ))}
          </>
        )}

        {filteredPeople.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1 py-1 mt-2">
              직원
            </p>
            {filteredPeople.map((p) => (
              <PersonListItem
                key={p.id}
                person={p}
                isOnline={onlineUserIds.has(p.id)}
                unreadCount={dmUnreadByPartner.get(p.id) ?? 0}
                isSelected={selectedPartnerId === p.id}
                onClick={() => onSelectPerson(p)}
              />
            ))}
          </>
        )}

        {nothingMatches && (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <MagnifyingGlass size={24} className="mb-2" />
            <p className="text-sm">검색 결과가 없습니다</p>
          </div>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: 커밋 (아직 상위에서 props 안 넘김, 다음 태스크에서 통합)**

```bash
git add src/components/dashboard/chat/PersonListItem.tsx src/components/dashboard/chat/ChannelList.tsx
git commit -m "UI: ChannelList에 직원 섹션 + PersonListItem 추가 (props 배선은 다음 단계)"
```

참고: 이 시점에 `ChatPageClient` 가 아직 신규 props 를 넘기지 않아 TS 에러가 발생한다. 다음 태스크에서 즉시 해소됨 — 중간 커밋 상태가 빌드되지 않는 것은 의도적이며, 이어서 Task 6 를 바로 실행할 것.

---

## Task 6: `ChatPageClient` 통합 — 직원 데이터 + DM 진입 + 안읽은 Map

**Files:**
- Modify: `src/components/dashboard/chat/ChatPageClient.tsx`

- [ ] **Step 1: import 추가**

파일 상단 import 섹션에 추가:

```tsx
import { getAllProfiles } from "@/lib/chat/actions";
import { openOrCreateDm } from "@/lib/chat/dm";
import type { ApprovedProfile } from "@/lib/chat/types";
```

- [ ] **Step 2: state 추가**

`ChatPageClientInner` 함수 내부, 기존 `const [favoriteChannels, ...]` 바로 아래에 추가:

```tsx
const [people, setPeople] = useState<ApprovedProfile[]>([]);
const [pendingDmForPartner, setPendingDmForPartner] = useState<string | null>(null);
```

- [ ] **Step 3: 직원 리스트 로드 effect 추가**

기존 `useEffect(() => { ensureMemoChannel() ... })` 바로 아래에 추가:

```tsx
useEffect(() => {
  getAllProfiles()
    .then((list) => {
      setPeople(list.filter((p) => p.id !== userId));
    })
    .catch(() => {
      // silent — 직원 리스트 없으면 채널 섹션만 보임
    });
}, [userId]);
```

- [ ] **Step 4: 안읽은 DM Map 계산 (useMemo)**

기존 `const channelOnlineCount = useMemo(...)` 아래에 추가:

```tsx
const dmUnreadByPartner = useMemo(() => {
  const map = new Map<string, number>();
  for (const ch of channels) {
    if (ch.type !== "dm") continue;
    if (!ch.dm_partner_id) continue;
    if (ch.unread_count > 0) map.set(ch.dm_partner_id, ch.unread_count);
  }
  return map;
}, [channels]);

const selectedDmPartnerId = selectedChannel?.type === "dm"
  ? selectedChannel.dm_partner_id ?? null
  : null;
```

- [ ] **Step 5: 직원 클릭 핸들러 추가**

`handleSelectChannel` 정의 아래에 추가:

```tsx
const handleSelectPerson = useCallback(
  async (person: ApprovedProfile) => {
    // 이미 채널이 있으면 즉시 선택 (RPC 왕복 없이)
    const existing = channelsRef.current.find(
      (ch) => ch.type === "dm" && ch.dm_partner_id === person.id
    );
    if (existing) {
      handleSelectChannel(existing);
      return;
    }

    if (pendingDmForPartner === person.id) return;
    setPendingDmForPartner(person.id);

    try {
      const channelId = await openOrCreateDm(person.id);
      // RPC 생성 직후에는 get_user_channels 가 아직 새 채널을 반영 못했을 수 있으므로
      // channel row 를 조회해 details 생성
      const supabase = createClient();
      const { data: ch } = await supabase
        .from("channels")
        .select("*")
        .eq("id", channelId)
        .single();

      if (!ch) throw new Error("채널을 찾을 수 없습니다.");

      const withDetails: ChannelWithDetails = {
        ...(ch as Channel),
        members: [],
        member_count: 2,
        last_message: null,
        unread_count: 0,
        dm_partner_id: person.id,
        members_preview: [
          { id: person.id, full_name: person.full_name, avatar_url: person.avatar_url },
        ],
      };

      setChannels((prev) => {
        if (prev.some((c) => c.id === withDetails.id)) return prev;
        return [withDetails, ...prev];
      });
      handleSelectChannel(withDetails);
    } catch (err) {
      console.error("DM 열기 실패:", err);
      toast.error("대화방을 열지 못했습니다.");
    } finally {
      setPendingDmForPartner(null);
    }
  },
  [handleSelectChannel, pendingDmForPartner]
);
```

- [ ] **Step 6: `<ChannelList />` props 업데이트**

기존 (파일 442~450행 부근):

```tsx
<ChannelList
  channels={channels}
  selectedChannelId={selectedChannel?.id}
  mutedChannels={mutedChannels}
  favoriteChannels={favoriteChannels}
  onSelectChannel={handleSelectChannel}
  onCreateClick={handleCreateChannel}
/>
```

다음으로 교체:

```tsx
<ChannelList
  channels={channels}
  people={people}
  onlineUserIds={onlineUsers}
  dmUnreadByPartner={dmUnreadByPartner}
  selectedChannelId={selectedChannel?.id}
  selectedPartnerId={selectedDmPartnerId ?? undefined}
  mutedChannels={mutedChannels}
  favoriteChannels={favoriteChannels}
  onSelectChannel={handleSelectChannel}
  onSelectPerson={handleSelectPerson}
  onCreateClick={handleCreateChannel}
/>
```

- [ ] **Step 7: `hasChannels` 분기 조정**

기존:

```tsx
const hasChannels = channels.length > 0;
```

다음으로:

```tsx
// 사이드바에 보여줄 게 있는지 (채널 or 직원 중 하나라도)
const hasSidebarContent = channels.length > 0 || people.length > 0;
```

그리고 아래 렌더 부분 `hasChannels` → `hasSidebarContent` 로 교체 (변수 한 군데 정도).

- [ ] **Step 8: 타입체크 + 수동 검증**

Run: `npm run lint`
Expected: 타입 에러 없음.

Run: `npm run dev` (이미 떠있으면 새로고침)
수동 테스트:
1. 좌측 사이드바 아래쪽에 "직원" 섹션이 나타나고, 본인 제외한 모든 승인 사용자가 가나다순으로 보임.
2. 직원 한 명 클릭 → 새 DM 채널 열리고 메시지 전송 가능.
3. 같은 직원 다시 클릭 → 같은 채널 재사용(새 채널 안 만들어짐).
4. DB 직접 확인: `SELECT * FROM channels WHERE type='dm'` → 1개만.
5. 상대방 접속해서 DM 보내면 직원 목록의 상대 이름 옆에 빨간 안읽은 배지.

- [ ] **Step 9: 커밋**

```bash
git add src/components/dashboard/chat/ChatPageClient.tsx
git commit -m "기능: 직원 클릭으로 DM 열기 + 안읽은 DM 배지 + props 배선"
```

---

## Task 7: `ChannelCreateModal` 을 그룹 전용으로 전환

**Files:**
- Modify: `src/components/dashboard/chat/ChannelCreateModal.tsx`

- [ ] **Step 1: 타이틀·설명 변경**

`ChannelCreateModal.tsx` 에서 모달 헤더/설명을 검색해서 (파일 전체 중 `"새 채널"`, `"채널을 만들"` 같은 문자열):

- 헤더 텍스트 `"새 채널"` → `"새 그룹 만들기"`
- 설명 (있다면) 에 `"1:1 대화는 왼쪽 직원 목록에서 바로 시작할 수 있어요."` 한 줄 추가 (없으면 생략 — 기존 UX 복잡하게 만들지 말 것).

Grep으로 위치 확인:

Run: `grep -n "새 채널\|새 그룹\|채널을 만들" src/components/dashboard/chat/ChannelCreateModal.tsx`

해당 라인만 교체.

- [ ] **Step 2: createChannel 호출에 `type: 'group'` 명시**

`createChannel({ ... })` 호출부에 `type: "group"` 가 명시돼 있지 않다면 추가:

```tsx
await createChannel({
  name: name.trim(),
  description: description.trim(),
  type: "group",
  memberIds: Array.from(selectedIds),
  userId,
});
```

- [ ] **Step 3: 수동 검증**

Run: `npm run dev`
- `+` 버튼 → 모달 타이틀 "새 그룹 만들기" 로 변경됨.
- 그룹 생성 정상 동작.

- [ ] **Step 4: 커밋**

```bash
git add src/components/dashboard/chat/ChannelCreateModal.tsx
git commit -m "UI: 채널 만들기를 그룹 전용으로 명시 (타이틀·type 고정)"
```

---

## Task 8: 멘션 토큰 유틸 + 입력 드롭다운

**Files:**
- Create: `src/lib/chat/mentions.ts`
- Create: `src/components/dashboard/chat/MentionPicker.tsx`
- Modify: `src/components/dashboard/chat/MessageInput.tsx`

- [ ] **Step 1: 토큰 유틸**

파일: `src/lib/chat/mentions.ts`:

```typescript
// 멘션 토큰 형식: @[이름|uuid]
// - 이름은 `]` 와 `|` 를 제외한 임의 문자열 (공백 허용)
// - uuid 는 36자 표준 형식

const MENTION_TOKEN_RE = /@\[([^|\]]+)\|([0-9a-f-]{36})\]/g;

export interface MentionSegment {
  type: "mention";
  displayName: string;
  userId: string;
}
export interface TextSegment {
  type: "text";
  text: string;
}
export type MessageSegment = MentionSegment | TextSegment;

export function serializeMention(displayName: string, userId: string): string {
  const safe = displayName.replace(/[\]|]/g, "");
  return `@[${safe}|${userId}]`;
}

export function parseMessageContent(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;
  for (const m of content.matchAll(MENTION_TOKEN_RE)) {
    const start = m.index ?? 0;
    if (start > lastIndex) {
      segments.push({ type: "text", text: content.slice(lastIndex, start) });
    }
    segments.push({ type: "mention", displayName: m[1], userId: m[2] });
    lastIndex = start + m[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: "text", text: content.slice(lastIndex) });
  }
  return segments;
}

/** 렌더 시점의 평문 미리보기 (멘션은 `@이름` 으로 축소) */
export function mentionPreview(content: string): string {
  return content.replace(MENTION_TOKEN_RE, (_, name) => `@${name}`);
}
```

- [ ] **Step 2: MentionPicker 컴포넌트**

파일: `src/components/dashboard/chat/MentionPicker.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { MemberPreview } from "@/lib/chat/types";

interface MentionPickerProps {
  candidates: MemberPreview[];
  activeIndex: number;
  onSelect: (member: MemberPreview) => void;
  onClose: () => void;
}

export default function MentionPicker({
  candidates,
  activeIndex,
  onSelect,
  onClose,
}: MentionPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  if (candidates.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto z-20"
    >
      {candidates.map((m, i) => (
        <button
          key={m.id}
          onClick={() => onSelect(m)}
          className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
            i === activeIndex ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-700"
          }`}
        >
          <div className="w-6 h-6 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
            {m.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.avatar_url} alt={m.full_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-500">
                {m.full_name.charAt(0)}
              </div>
            )}
          </div>
          <span className="truncate">{m.full_name}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `MessageInput` 에 멘션 트리거 통합**

파일: `src/components/dashboard/chat/MessageInput.tsx`

먼저 props에 채널 멤버 목록 추가 — `interface MessageInputProps` 에:

```tsx
channelMembers?: MemberPreview[];
```

상단 import 섹션에:

```tsx
import type { MemberPreview } from "@/lib/chat/types";
import { serializeMention } from "@/lib/chat/mentions";
import MentionPicker from "./MentionPicker";
```

함수 시그니처에 `channelMembers = []` 추가:

```tsx
export default function MessageInput({
  onSend,
  onFileUpload,
  editingMessage,
  onCancelEdit,
  replyingTo,
  onCancelReply,
  externalFiles,
  onExternalFilesConsumed,
  onTyping,
  channelMembers = [],
}: MessageInputProps) {
```

state 추가 (기존 `const [pendingFiles, ...]` 근처):

```tsx
const [mentionOpen, setMentionOpen] = useState(false);
const [mentionQuery, setMentionQuery] = useState("");
const [mentionStart, setMentionStart] = useState<number | null>(null);
const [mentionActive, setMentionActive] = useState(0);
```

`handleChange` 교체:

```tsx
function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
  const value = e.target.value;
  setContent(value);
  const el = textareaRef.current;
  if (el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }
  onTyping?.();

  // 멘션 감지: 커서 바로 앞의 @... (공백 전까지)
  const caret = e.target.selectionStart ?? value.length;
  const upto = value.slice(0, caret);
  const atIdx = upto.lastIndexOf("@");
  if (atIdx >= 0) {
    const tail = upto.slice(atIdx + 1);
    if (!/\s/.test(tail) && tail.length <= 20) {
      setMentionOpen(true);
      setMentionQuery(tail.toLowerCase());
      setMentionStart(atIdx);
      setMentionActive(0);
      return;
    }
  }
  setMentionOpen(false);
  setMentionStart(null);
}
```

`handleKeyDown` 교체:

```tsx
function handleKeyDown(e: React.KeyboardEvent) {
  if (mentionOpen && filteredMentionCandidates.length > 0) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionActive((i) => (i + 1) % filteredMentionCandidates.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionActive((i) =>
        (i - 1 + filteredMentionCandidates.length) % filteredMentionCandidates.length
      );
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleInsertMention(filteredMentionCandidates[mentionActive]);
      return;
    }
    if (e.key === "Escape") {
      setMentionOpen(false);
      return;
    }
  }

  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}
```

`filteredMentionCandidates` 및 `handleInsertMention` 을 `handleChange` 위에 추가:

```tsx
const filteredMentionCandidates = mentionOpen
  ? channelMembers
      .filter((m) => m.full_name.toLowerCase().includes(mentionQuery))
      .slice(0, 8)
  : [];

function handleInsertMention(member: MemberPreview) {
  if (mentionStart === null) return;
  const token = serializeMention(member.full_name, member.id) + " ";
  const before = content.slice(0, mentionStart);
  const after = content.slice(mentionStart + 1 + mentionQuery.length);
  const next = before + token + after;
  setContent(next);
  setMentionOpen(false);
  setMentionStart(null);
  requestAnimationFrame(() => {
    const el = textareaRef.current;
    if (el) {
      const caret = (before + token).length;
      el.focus();
      el.setSelectionRange(caret, caret);
    }
  });
}
```

렌더 부분의 textarea 감싸는 `<div className="flex items-center gap-2 bg-slate-50 ...">` 를 `relative` 추가로 감싸고, 그 내부 첫 줄에 MentionPicker 삽입:

```tsx
<div className="relative flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-1.5">
  {mentionOpen && filteredMentionCandidates.length > 0 && (
    <MentionPicker
      candidates={filteredMentionCandidates}
      activeIndex={mentionActive}
      onSelect={handleInsertMention}
      onClose={() => setMentionOpen(false)}
    />
  )}
  {/* 기존 input/textarea/buttons */}
```

- [ ] **Step 4: `ChatRoom` 에서 `channelMembers` 주입**

Grep: `grep -n "<MessageInput" src/components/dashboard/chat/ChatRoom.tsx`

찾은 호출부에 `channelMembers={members_preview or fetched}` 추가.

`ChatRoom` 이 이미 `channel` prop 을 받으므로 `channel.members_preview` 를 활용:

```tsx
<MessageInput
  {/* 기존 props */}
  channelMembers={channel.members_preview ?? []}
/>
```

(채널에 본인 제외 멤버만 담겨 있음. 멘션 대상은 본인 제외가 맞음.)

- [ ] **Step 5: 수동 검증**

Run: `npm run dev`
테스트:
1. 그룹 채널에서 `@` 입력 → 드롭다운이 나타남.
2. 이름 일부 입력 → 필터링.
3. 화살표로 선택 / Enter 로 삽입.
4. 전송 후 DB 확인 — `messages.content` 에 `@[이름|uuid]` 토큰 저장됨.
5. 멘션된 사용자 로그인 → `notifications` 에 `type='chat_mention'` 레코드 있음.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/chat/mentions.ts src/components/dashboard/chat/MentionPicker.tsx src/components/dashboard/chat/MessageInput.tsx src/components/dashboard/chat/ChatRoom.tsx
git commit -m "기능: @멘션 입력 드롭다운 + 토큰 직렬화 + 알림 연동"
```

---

## Task 9: 멘션 렌더링 (MessageItem) + 답장 스크롤 이동

**Files:**
- Modify: `src/components/dashboard/chat/MessageItem.tsx`
- Modify: `src/components/dashboard/chat/MessageList.tsx`

- [ ] **Step 1: MessageItem 에 멘션 파싱 렌더**

파일: `src/components/dashboard/chat/MessageItem.tsx`

상단 import 추가:

```tsx
import { parseMessageContent } from "@/lib/chat/mentions";
```

`MessageContent` 함수(파일 344~383행 부근) 내부, 텍스트 메시지 렌더 박스:

```tsx
<div className={`inline-block px-3 py-2 sm:px-4 sm:py-2.5 ${isOwn ? "bg-blue-600 text-white rounded-2xl rounded-tr-md" : "bg-white border border-slate-100 rounded-2xl rounded-tl-md text-slate-700 shadow-sm"} text-[13px] sm:text-sm leading-relaxed`}>
  {message.content}
  {message.is_edited && ( ... )}
</div>
```

를 다음으로 교체:

```tsx
<div className={`inline-block whitespace-pre-wrap px-3 py-2 sm:px-4 sm:py-2.5 ${isOwn ? "bg-blue-600 text-white rounded-2xl rounded-tr-md" : "bg-white border border-slate-100 rounded-2xl rounded-tl-md text-slate-700 shadow-sm"} text-[13px] sm:text-sm leading-relaxed`}>
  {parseMessageContent(message.content).map((seg, i) =>
    seg.type === "text" ? (
      <span key={i}>{seg.text}</span>
    ) : (
      <span
        key={i}
        className={`inline-flex items-center px-1 rounded font-medium ${
          isOwn ? "bg-blue-500/40 text-white" : "bg-blue-100 text-blue-700"
        }`}
      >
        @{seg.displayName}
      </span>
    )
  )}
  {message.is_edited && (
    <span className={`text-[10px] ml-1 ${isOwn ? "text-blue-200" : "text-slate-400"}`}>(수정됨)</span>
  )}
</div>
```

- [ ] **Step 2: 답장 인용 미리보기 (부모 메시지 있는 경우)**

현재 텍스트 메시지 렌더 위에 `isReply` 배지만 있음(파일 369~373행). 이를 실제 부모 내용 미리보기로 확장:

`MessageContent` 내부 텍스트 분기에서 `isReply` 블록:

```tsx
{isReply && (
  <div className={`flex items-center gap-1 mb-1 text-[10px] ${isOwn ? "justify-end text-blue-300" : "text-slate-400"}`}>
    <ArrowBendUpLeft size={10} />
    <span>답장됨</span>
  </div>
)}
```

를 다음으로 교체:

```tsx
{isReply && message.parent_message_id && (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      const target = document.querySelector<HTMLElement>(`[data-message-id="${message.parent_message_id}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("ring-2", "ring-blue-400");
        setTimeout(() => target.classList.remove("ring-2", "ring-blue-400"), 1500);
      }
    }}
    className={`flex items-start gap-1 mb-1 max-w-full text-left text-[11px] px-2 py-1 rounded-lg border-l-2 ${
      isOwn ? "border-blue-200 bg-blue-500/20 text-blue-100" : "border-blue-400 bg-slate-50 text-slate-500"
    } hover:opacity-80 transition-opacity`}
  >
    <ArrowBendUpLeft size={10} className="mt-0.5 flex-shrink-0" />
    <span className="truncate">원본 메시지로 이동</span>
  </button>
)}
```

- [ ] **Step 3: MessageList 에 `data-message-id` 부여**

파일: `src/components/dashboard/chat/MessageList.tsx`

Grep: `grep -n "MessageItem\|key=" src/components/dashboard/chat/MessageList.tsx` 로 각 메시지를 감싼 wrapper 찾기. 그 wrapper 요소의 `data-message-id` 속성 추가:

```tsx
<div key={msg.id} data-message-id={msg.id}>
  <MessageItem ... />
</div>
```

wrapper가 이미 존재하면 속성만 추가, 없으면 `<div>` 로 감싸기.

- [ ] **Step 4: 수동 검증**

Run: `npm run dev`
테스트:
1. 그룹 채널에서 `@이름` 으로 메시지 전송 → 상대에게는 파란 배지로, 본인에게는 파란 테두리로 렌더.
2. 다른 메시지에 답장 → 답장 메시지 상단에 "원본 메시지로 이동" 버튼.
3. 버튼 클릭 → 원본 메시지로 부드럽게 스크롤, 1.5초간 파란 테두리 하이라이트.
4. 원본이 삭제된 상태: `document.querySelector` 가 null → 아무 동작 안 함(정상).

- [ ] **Step 5: 커밋**

```bash
git add src/components/dashboard/chat/MessageItem.tsx src/components/dashboard/chat/MessageList.tsx
git commit -m "UI: 멘션 배지 렌더 + 답장 원본으로 스크롤 이동 버튼"
```

---

## Task 10: 전체 통합 검증

**Files:** (no changes — 검증 전용)

- [ ] **Step 1: 마이그레이션 재확인**

Run: `npx supabase db diff` 또는 로컬 DB 상태 확인
Expected: 069 가 이미 반영되어 diff 가 비어 있음.

- [ ] **Step 2: 빌드**

Run: `npm run build` (background 권장)
Expected: 성공.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 4: 기능 체크리스트 (수동)**

아래 항목을 실제 브라우저에서 확인:

- [ ] 사이드바에 나만의 메모 / 채널 / 직원 세 섹션이 정확히 보인다.
- [ ] 직원 섹션은 본인 제외, 가나다순 고정.
- [ ] 직원 이름 옆에 🟢/⚪ 점, 오프라인인 아바타는 흐리게.
- [ ] 안읽은 DM 있는 직원 이름 우측에 빨간 배지.
- [ ] 직원 클릭 → 새 DM 열림, 같은 직원 재클릭 → 기존 DM.
- [ ] 그룹 채널 우측에 참여자 아바타 겹침, 3명 초과 시 `+N`.
- [ ] `+` 버튼 누르면 "새 그룹 만들기" 모달 (DM 생성 UI 없음).
- [ ] `@` 입력으로 멘션 드롭다운, 선택 후 전송 시 상대에게 알림.
- [ ] 답장 메시지의 원본 이동 버튼 정상 작동.

- [ ] **Step 5: 최종 커밋 (변경 없으면 스킵)**

문제가 발견되면 해당 태스크로 돌아가 수정 후 별도 커밋. 모든 체크리스트 통과 시 커밋 없음.

---

## Self-Review Notes

- 스펙 커버리지: 스펙의 섹션 1–8 모두 태스크에 매핑됨 (섹션 9 "읽음 수 표시"는 기존 `ReadCountButton`이 이미 구현되어 작업 불필요, 섹션 10 정렬·중복 규칙은 Task 5의 `ChannelList` 에서 처리).
- 타입 일관성: `MemberPreview`, `ApprovedProfile` 는 Task 2에서 정의되어 Task 5/6/8에서 동일 이름으로 사용.
- 플레이스홀더 없음: 모든 코드 블록에 실제 내용 채움.
- 파일 경로·라인 번호 정확도: 라인 번호는 "근처" 로 표기했으며, 구현자는 직접 grep 으로 위치 확인하도록 명시.
