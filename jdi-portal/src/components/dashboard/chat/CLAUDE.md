# Chat — Realtime 아키텍처 규칙

## Realtime 구독

6개 병렬 Supabase 채널 운영:
- `chat:${channelId}` — 메시지 INSERT/UPDATE (postgres_changes)
- `typing:${channelId}` — 타이핑 표시 (presence, 3초 디바운스)
- `chat:unread-badge` — 전체 새 메시지 감시 (sidebar 뱃지)
- `chat:memberships:${userId}` — 채널 멤버 변경 감시
- `chat:channels-meta` — 채널 메타데이터 업데이트
- `chat:member-count-sync` — 멤버 수 변경 추적

## 캐싱

- **IndexedDB** (`messageCache.ts`): 채널당 최대 200개, `[channel_id, created_at]` 인덱스
- 전략: 캐시 히트 → 즉시 표시 → 백그라운드 fetch → 최신으로 교체
- 프로필: 기존 메시지에서 발신자 프로필 재사용 (N+1 방지)

## 읽음 처리

- `ChatUnreadProvider`: 전체 unread RPC + sidebar 동기화
- `mark_channel_read` RPC: `last_read_at` + 읽음확인 원자적 업데이트
- 창 포커스 시 자동 읽음 처리
- 뮤트된 채널은 알림/토스트 미표시

## 주의사항

- Realtime 때문에 대부분 `"use client"` 필수 — 코드 스멜 아님
- 파일 URL: `getChatFileUrls()` 배치 서명 (개별 호출 금지)
- 연속 이미지: MessageList에서 같은 유저 2+ 이미지를 그리드로 그룹핑
