# 업무 타임라인 일반 파일 첨부 설계

- 날짜: 2026-07-22
- 도메인: `work-timeline`
- 상태: 승인됨 (사용자 위임)

## 배경 / 목적

업무 타임라인은 이미 **이미지 전용** 첨부 시스템을 갖추고 있다. 실무에서 엑셀·PDF·한글 등
업무 파일을 함께 남기고 싶다는 요구가 있어, **기존 이미지 첨부 시스템을 일반 파일까지 확장**한다.

핵심 원칙: 새 시스템을 만들지 않는다. 이미 검증된 업로드/저장/RLS/서명 URL/정리 큐 구조를 유지한 채,
"이미지만" 잠금(3곳)을 풀어 일반 파일을 허용한다.

## 현재 구조 (재사용 대상)

- DB: `work_timeline_attachments` (파일명·경로·mime·용량·position을 이미 일반적으로 저장, `thumbnail_path` nullable)
- 스토리지: 비공개 버킷 `work-timeline`, 경로 `{userId}/{entryId}/{uuid}.{ext}`
- 서버 액션: `finalizeWorkTimelineAttachments`, `deleteWorkTimelineAttachment`, `getWorkTimelineSignedUrls`, 정리 큐(`...cleanup_queue`)
- 클라이언트 업로드: `clientUploads.ts`의 `uploadWorkTimelineImagesDirect` (직접 스토리지 업로드 + 롤백)
- 검증: `utils.ts`의 `validateWorkTimelineImage`, 상수 `constants.ts`

## "이미지만" 잠금이 걸린 3곳 (해제 대상)

1. **DB CHECK** `work_timeline_attachments_mime_type_check` → mime을 이미지 4종으로 제한
2. **스토리지 버킷** `allowed_mime_types` → 이미지 4종으로 제한
3. **앱 코드/문구** → `validateWorkTimelineImage`, `WORK_TIMELINE_IMAGE_MIME_TYPES`, "이미지" 문구, position/용량 상수

추가 제약:
- `work_timeline_attachments_file_size_check`: 1..10MB → 50MB로 확대
- `work_timeline_attachments_position_check`: 0..4 → 0..9로 확대

## 결정 사항 (사용자 승인)

### 허용 정책: 화이트리스트가 아니라 "위험 파일 차단(블록리스트)"
- 기본적으로 모든 파일 허용 (엑셀·PDF·워드·PPT·한글 hwp/hwpx·CSV·zip·이미지·txt 등).
- **차단 확장자(실행/스크립트류)**:
  `exe, bat, cmd, com, msi, scr, pif, cpl, jar, js, jse, vbs, vbe, ws, wsf, wsh,
   ps1, psm1, sh, app, deb, rpm, dll, sys, hta, reg, lnk, gadget, apk, vb`
- 확장자 없는 파일, 위 목록에 걸리는 파일은 거부. 그 외는 허용.
- mime_type이 비어 있는 파일(예: 일부 hwp)은 `application/octet-stream`으로 저장.

### 한도
- 개당 최대 **50MB**
- 한 항목당 이미지+파일 합산 최대 **10개**

### 표시
- 이미지: 기존 썸네일 미리보기 + 클릭 확대 유지.
- 비이미지: **파일 카드**(확장자 아이콘 + 파일명 + 용량 + 다운로드). 다운로드는 서명 URL.
- 업로드: 파일 선택 + **드래그&드롭** 지원.

## 변경 상세

### 1) 마이그레이션 `098_work_timeline_file_attachments.sql` (운영 DB 변경 — 적용 전 재확인)
- `work_timeline_attachments_mime_type_check` DROP (mime 자유화, NOT NULL은 유지)
- `work_timeline_attachments_file_size_check`: `BETWEEN 1 AND 52428800`(50MB)로 교체
- `work_timeline_attachments_position_check`: `BETWEEN 0 AND 9`로 교체
- 스토리지 버킷 `work-timeline`: `file_size_limit = 52428800`, `allowed_mime_types = NULL`(전체 허용)로 UPDATE
- 위험 확장자 차단은 **앱 코드에서** 강제 (스토리지/DB는 mime을 신뢰하지 않으므로 확장자 기반 차단은 앱 계층 책임)
- 롤백 노트: 되돌릴 경우 기존 CHECK/`allowed_mime_types`를 복원하는 역마이그레이션 필요.

### 2) `constants.ts`
- `WORK_TIMELINE_MAX_IMAGES` → `WORK_TIMELINE_MAX_ATTACHMENTS = 10` (기존 이름은 호환 위해 정리)
- `WORK_TIMELINE_MAX_IMAGE_SIZE` → `WORK_TIMELINE_MAX_FILE_SIZE = 50 * 1024 * 1024`
- `WORK_TIMELINE_MAX_FILE_SIZE`와 별개로 이미지 썸네일 대상은 `WORK_TIMELINE_IMAGE_MIME_TYPES` 유지(썸네일 생성 분기용)
- `WORK_TIMELINE_BLOCKED_EXTENSIONS` 신설(위 차단 목록)

### 3) `utils.ts`
- `validateWorkTimelineFile(file)` 신설: 용량(≤50MB), size>0, 확장자 블록리스트 검사. 이미지 전용 검증은 썸네일 경로에서만 사용.
- `getFileExtension`: 비이미지는 파일명 확장자 fallback (이미 동작). `isWorkTimelineImage(file|mime)` 헬퍼 추가.

### 4) `types.ts`
- `WorkTimelineImageUpload` → `WorkTimelineFileUpload { file: File; thumbnail?: File | null }`
  (썸네일은 이미지에만 존재). 관련 타입 명칭 정리.

### 5) `clientUploads.ts`
- `uploadWorkTimelineImagesDirect` → `uploadWorkTimelineFilesDirect`
- 이미지면 썸네일 생성/업로드, 비이미지면 썸네일 없이 업로드. `validateWorkTimelineFile` 사용.
- mime 비어 있으면 `application/octet-stream` 대체.

### 6) `actions.ts`
- `finalizeWorkTimelineAttachments`: 개수 상한 `WORK_TIMELINE_MAX_ATTACHMENTS`, `validateAttachmentInput`에서
  mime 화이트리스트 검사 제거(대신 확장자 블록리스트 + 용량·경로 검증), position 0..9, 용량 ≤50MB.
- 문구 "이미지" → "파일".

### 7) UI 컴포넌트
- `WorkTimelineCreateModal.tsx`: 파일 선택 accept 확대(이미지 외 문서), 드래그&드롭, 이미지 프리뷰 + 비이미지 파일 칩.
  이미지에만 클라이언트 썸네일 생성.
- `WorkTimelineDetailClient.tsx` / `WorkTimelineSection.tsx`: 첨부 렌더링을 이미지(썸네일/확대) + 파일 카드(아이콘·이름·용량·다운로드)로 분기.
- 확장자 아이콘 매핑(엑셀/워드/PPT/PDF/한글/압축/기타) 유틸 1개. (채팅에 유사 표시가 있으면 스타일 참고)

## 성능/보안 불변조건 유지
- 서명 URL(1시간) 다운로드, 비공개 버킷, RLS(`is_approved_user()` + 소유자/관리자) 그대로.
- 대시보드/타임라인 빠른 경로·keepalive 등 성능 장치는 건드리지 않음.
- 작업 후 `cd jdi-portal && npm run test:performance` 및 `npm run lint` 검증.

## 테스트/검증
- 업로드: 이미지(썸네일 O), 엑셀/PDF/한글(썸네일 X, 파일 카드) 각각 확인.
- 차단: `.exe` 등 업로드 거부 메시지 확인.
- 한도: 50MB 초과 거부, 11개째 거부.
- 삭제/정리 큐: 파일 삭제 시 스토리지 경로 정리 동작.
- 서명 URL 다운로드 정상.

## 범위 밖 (YAGNI)
- 서버 사이드 바이러스 검사, 문서 미리보기(오피스 뷰어), 파일 버전관리, 대용량(>50MB) 분할 업로드.
