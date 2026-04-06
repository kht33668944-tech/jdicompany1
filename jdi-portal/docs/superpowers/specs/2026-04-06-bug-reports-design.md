# 오류 접수 기능 설계 스펙

## 개요

사내 포털에 "오류 접수" 기능을 추가하여 직원들이 사용 중 발견한 오류, 불편사항, 개선 요청을 접수할 수 있게 한다. 관리자는 접수된 내용의 상태를 변경하여 처리 현황을 관리한다.

## 라우트

`/dashboard/reports`

## 사이드바 메뉴

"설정" 위에 "오류 접수" 항목 추가.

| 순서 | 메뉴 | 아이콘 (phosphor-react) | 라우트 |
|------|------|------------------------|--------|
| 1 | 대시보드 | SquaresFour | /dashboard |
| 2 | 근태관리 | Clock | /dashboard/attendance |
| 3 | 할일 | ListChecks | /dashboard/tasks |
| 4 | 스케줄 | CalendarBlank | /dashboard/schedule |
| 5 | **오류 접수** | **WarningCircle** | **/dashboard/reports** |
| 6 | 설정 | GearSix | /dashboard/settings |

## 화면 구성

### 1. 목록 화면

**상단**
- 제목: "오류 접수"
- 부제: "시스템 이용 중 발생하는 문제나 불편사항을 알려주세요."
- 우측: "새 접수" 버튼 (브랜드 파란색)

**필터 영역**
- 좌측: 유형 필터 탭 — 전체 / 오류 / 불편사항 / 개선요청
- 우측: "내 접수만 보기" 토글 + 상태 드롭다운 (전체/접수됨/처리중/완료)

**목록 카드 (각 항목)**
- 좌측: 유형 뱃지
  - 오류: 빨강 (red-50/red-600)
  - 불편사항: 주황 (orange-50/orange-600)
  - 개선요청: 파랑 (blue-50/blue-600)
- 중앙: 제목 + 발생 페이지 아이콘/텍스트 + 접수일
- 우측: 작성자 아바타 + 이름 + 상태 뱃지
  - 접수됨: 회색 (slate-100/slate-600)
  - 처리중: 파랑 (blue-100/blue-600)
  - 완료: 초록 (green-100/green-600)

**하단**
- "더 보기" 버튼 (페이지네이션 대신 더보기 방식, 10개씩 추가 로드)

**항목 클릭 시**
- 상세 모달 열림
- 본인 글 + 상태 "접수됨": 수정/삭제 버튼 표시
- 관리자(admin): 상태 변경 드롭다운 표시

### 2. 새 접수 모달

**헤더**: "새 접수 작성" + X 닫기 버튼

**폼 항목 (위→아래)**

| 항목 | 형태 | 필수 | 설명 |
|------|------|------|------|
| 문의 유형 | 3칸 라디오 버튼 | O | 오류 / 불편사항 / 개선요청 |
| 발생 페이지 | 드롭다운 | O | 대시보드, 근태관리, 할일, 스케줄, 설정 |
| 제목 | 텍스트 입력 | O | placeholder: "예: 버튼 클릭 시 반응이 없습니다." |
| 상세 내용 | 텍스트 영역 | O | placeholder: "오류 발생 시점, 재현 방법 등을 자세히 적어주시면 빠른 해결에 도움이 됩니다." |
| 첨부파일 | 드래그앤드롭 업로드 | X | PNG, JPG, PDF (최대 10MB) |

**하단 버튼**: 취소 / 접수하기

**자동 저장 정보**: 작성자 (로그인 사용자), 접수일 (현재 시각), 상태 "접수됨"

## 데이터베이스

### reports 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK, default gen_random_uuid()) | 고유 ID |
| user_id | uuid (FK → auth.users) | 작성자 |
| type | text (CHECK: bug, inconvenience, improvement) | 유형 |
| page | text (CHECK: dashboard, attendance, tasks, schedule, settings) | 발생 페이지 |
| title | text (NOT NULL) | 제목 |
| content | text (NOT NULL) | 상세 내용 |
| status | text (CHECK: submitted, in_progress, completed, default: submitted) | 상태 |
| created_at | timestamptz (default now()) | 접수일 |
| updated_at | timestamptz (default now()) | 수정일 |

### report_attachments 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK, default gen_random_uuid()) | 고유 ID |
| report_id | uuid (FK → reports, ON DELETE CASCADE) | 연결된 접수 ID |
| file_name | text (NOT NULL) | 파일 이름 |
| file_path | text (NOT NULL) | Storage 경로 |
| file_size | integer | 파일 크기 (bytes) |
| created_at | timestamptz (default now()) | 업로드일 |

### Supabase Storage

- 버킷: `reports`
- 파일 경로: `reports/{report_id}/{파일명}`

### RLS 정책

- **SELECT**: 인증된 사용자 모두 조회 가능 (`auth.uid() IS NOT NULL`)
- **INSERT**: 인증된 사용자 모두 작성 가능 (`user_id = auth.uid()`)
- **UPDATE**: 작성자 본인 (상태가 `submitted`일 때만) + 관리자 (상태 변경)
- **DELETE**: 작성자 본인 (상태가 `submitted`일 때만)

## 권한 정리

| 동작 | 일반 직원 | 관리자 |
|------|----------|--------|
| 전체 목록 조회 | O | O |
| 새 접수 작성 | O | O |
| 본인 글 수정 (접수됨 상태) | O | O |
| 본인 글 삭제 (접수됨 상태) | O | O |
| 상태 변경 | X | O |

## 구현 패턴

기존 프로젝트 패턴을 따른다:

- **서버**: `src/app/dashboard/reports/page.tsx` — `getAuthUser()` → `queries.ts` → props 전달
- **클라이언트**: `src/components/dashboard/reports/` — 상태 관리, `actions.ts` 호출, `router.refresh()`
- **데이터**: `src/lib/reports/` — `queries.ts` (SELECT), `actions.ts` (INSERT/UPDATE/DELETE), `types.ts`, `constants.ts`
- **마이그레이션**: `supabase/migrations/025_reports.sql`

## UI 참고

참고 UI HTML 코드가 제공되었으며, glass morphism 스타일과 기존 디자인 시스템을 따른다. 모바일 반응형 필수.
