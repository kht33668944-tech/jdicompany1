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

- 파일 URL은 일괄 서명 흐름을 우선 사용합니다.
- 메시지마다 개별 signed URL 요청을 반복하지 않습니다.
- 연속 이미지 그룹 표시를 바꿀 때는 모바일 레이아웃을 확인합니다.

## 권한

- 채널 메시지와 파일은 멤버십 기준 접근이 기본입니다.
- DM은 참여자만 볼 수 있어야 합니다.
- 관리자 권한으로도 불필요한 노출이 생기지 않는지 확인합니다.
