# 채팅 도메인 지침

채팅은 Realtime, 캐시, 읽음 상태, 파일 URL, 권한이 얽혀 있습니다. 변경 전 구독과 캐시 흐름을 먼저 확인합니다.

## 주요 파일

- UI: `src/components/dashboard/chat/`
- 페이지: `src/app/dashboard/chat/`
- 로직: `src/lib/chat/`
- 알림: `src/lib/notifications/`, `src/lib/push/`

## Realtime

사용 중인 구독 예:

- 채널 메시지 INSERT/UPDATE
- typing presence
- unread badge
- 멤버십 변경
- 채널 메타 변경
- 멤버 수 동기화

구독을 추가하거나 바꾸면 cleanup과 중복 이벤트 방지를 확인합니다.

## 캐시

- 메시지는 IndexedDB 기반 캐시를 사용합니다.
- 캐시 데이터는 빠른 첫 화면용이고, 서버 fetch 결과가 최종 상태입니다.
- 서버 최신 데이터가 stale 캐시에 덮이지 않게 로드 순서를 확인합니다.

## 읽음 상태

- 전체 unread는 RPC 기반입니다.
- 채널 읽음은 `mark_channel_read` 흐름을 확인합니다.
- 음소거 채널과 DM은 알림/읽음 표시 조건이 다를 수 있습니다.

## 파일과 이미지

버킷 이름과 TTL은 `src/lib/chat/constants.ts`의 `CHAT_BUCKET`(`chat-attachments`, 비공개)과 `CHAT_FILE_URL_TTL_SECONDS`가 **단일 출처**입니다. 다른 파일에 문자열이나 숫자를 하드코딩하면 캐시 만료 계산과 실제 서명 만료가 어긋나고, 회귀 테스트도 실패합니다.

서명 URL은 3단으로 동작합니다. 순서를 흐트러뜨리면 "메시지 먼저 → 사진 나중" 으로 되돌아갑니다.

1. **SSR 선발급** — 채널 페이지가 `getMessageFileUrls()`로 첫 화면 첨부 URL을 미리 발급해 `initialFileUrls`로 내려주고, `ChatFileUrlsContext`가 그걸 초기값으로 써서 첫 렌더부터 이미지가 뜹니다. 이미 받은 경로는 재요청하지 않습니다.
2. **일괄 발급** — 서버·클라이언트 모두 `src/lib/chat/fileUrlBatch.ts`의 `signChatFilePaths()` 하나만 씁니다(발급 로직 복제 금지).
3. **로컬 캐시** — `src/lib/chat/fileUrlCache.ts`가 만료 전까지 재사용해 채널을 오갈 때 왕복이 0이 됩니다.

- 선발급이 실패해도 **throw하지 않고 빈 값을 돌려** 클라이언트 배치로 폴백합니다. 여기서 던지면 채팅방 전체가 오류 화면이 됩니다.
- 삭제된 메시지(`is_deleted`)의 첨부는 서명하지 않습니다.

- 메시지마다 개별 signed URL 요청을 반복하지 않습니다.
- 연속 이미지 그룹 표시를 바꿀 때는 모바일 레이아웃을 확인합니다.
- 이 흐름을 고쳤으면 `npm run test:performance`(`scripts/chat-file-url-prefetch.test.mjs` 포함)로 확인합니다.

## 권한

- 채널 메시지와 파일은 멤버십 기준 접근이 기본입니다.
- DM은 참여자만 볼 수 있어야 합니다.
- 관리자 권한으로도 불필요한 노출이 생기지 않는지 확인합니다.
