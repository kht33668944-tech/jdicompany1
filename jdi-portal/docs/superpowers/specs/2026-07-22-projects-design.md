# 프로젝트(프로젝트별 타임라인) 기능 설계

- 날짜: 2026-07-22
- 도메인: `work-timeline` (주), `tasks` (연동), 사이드바 공통 UI
- 상태: 승인됨

## 배경 / 목적

업무 타임라인 글이 실제로는 "코스피랩 - 회원 등급 업데이트", "TMA - 오너먼트 박스 디자인 설계"처럼
**큰 프로젝트 아래의 할 일들**로 묶이는데, 지금은 제목에 프로젝트 이름을 손으로 붙여 구분하고 있다.

이를 시스템화한다:

1. **프로젝트 등록**: 코스피랩, TMA, JDI 포탈 같은 프로젝트를 정식 데이터로 관리
2. **작성 시 선택**: 타임라인 글·할일을 만들 때 소속 프로젝트를 선택
3. **사이드바 하위 메뉴**: "업무 타임라인" 아래에 전체/프로젝트별/미분류 타임라인을 나눠 보기

## 결정 사항 (사용자 승인)

| 항목 | 결정 |
|---|---|
| 적용 범위 | 타임라인 + 할일(tasks) 공통 |
| 데이터 방식 | 정식 `projects` 테이블 + FK (방법 A) |
| 만들기/수정 권한 | 모든 승인 직원 |
| 삭제 권한 | 관리자(admin)만 |
| 작성 시 프로젝트 선택 | 선택사항 (미선택 = 미분류) |
| 기존 글 분류 | 제목 접두어로 자동 분류, 애매한 것은 미분류 유지 |
| 초기 프로젝트 | 코스피랩, TMA(크리스마스 트리 브랜드), JDI 포탈 |
| 추가 기능 | 프로젝트 색상, 제목 접두어 자동 정리, 보관(숨김), 대시보드 미리보기 배지 |

참고: 과거 `067_projects.sql`로 프로젝트 테이블을 만들었다가 `068_remove_projects.sql`에서
전부 롤백한 이력이 있다. 이번 설계는 그와 무관하게 새로 만들며, 067의 `project_members`
(프로젝트별 멤버 관리) 같은 복잡한 구조는 넣지 않는다 (YAGNI — 전 직원 공용).

## 1) DB — 마이그레이션 `101_projects.sql`

### projects 테이블

```sql
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 50),
  color TEXT NOT NULL DEFAULT '#6366f1' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 이름 중복 방지(공백 정리 + 대소문자 무시)
CREATE UNIQUE INDEX projects_name_unique ON public.projects (lower(btrim(name)));
```

- `updated_at` 자동 갱신 트리거 (기존 패턴 재사용)
- RLS:
  - SELECT: `is_approved_user()`
  - INSERT: 승인 사용자, `created_by = auth.uid()`
  - UPDATE: 승인 사용자 (이름/색상/보관 수정 — 전 직원 공용 도구)
  - DELETE: admin만 (`profiles.role = 'admin'` 검증)

### 연결 컬럼

```sql
ALTER TABLE public.work_timeline_entries
  ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.tasks
  ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
CREATE INDEX work_timeline_entries_project_id_idx
  ON public.work_timeline_entries (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX tasks_project_id_idx
  ON public.tasks (project_id) WHERE project_id IS NOT NULL;
```

- 프로젝트 삭제 시 글/할일은 보존되고 미분류로 복귀 (`ON DELETE SET NULL`)
- `work_timeline_entries`의 "user_id/task_id 변경 금지 트리거"(083)는 그대로 두고,
  `project_id`는 변경 허용 대상으로 유지 (수동 재분류 가능해야 함)
- RLS 주의: 타임라인 UPDATE 정책은 "본인 글만"이므로 프로젝트 재분류도 본인 글만 가능.
  admin이 남의 글을 재분류할 필요가 생기면 추후 확장 (이번 범위 아님)

### 초기 데이터 + 기존 글 자동 분류 (같은 마이그레이션에서 1회 실행)

1. 프로젝트 3개 INSERT: 코스피랩, TMA, JDI 포탈 (각각 다른 기본 색상, `created_by = NULL`)
2. 자동 분류 UPDATE — 제목 접두어 매칭 + 접두어 제거:
   - `title ~ '^코스피랩\s*[-–]\s*'` → 코스피랩, 제목에서 접두어 제거
   - `title ~ '^TMA\s*[-–]\s*'` → TMA, 접두어 제거
   - `title ~ '^JDI\s*포탈\s*[-–]\s*'` → JDI 포탈, 접두어 제거
   - 트리 오너먼트 관련: `title ILIKE '%오너먼트%' OR title ILIKE '%트리%'`이면서
     아직 미분류인 글 → TMA (접두어 형식이 아니므로 제목은 그대로 둠)
   - 접두어 제거 후 제목이 비면(길이 0) 제거하지 않고 원래 제목 유지 (CHECK 1~120자 보호)
   - `tasks.title`에도 동일한 접두어 규칙 적용
3. 애매한 글(위 규칙에 안 걸리는 글)은 `project_id = NULL` 유지

롤백 노트: 접두어 제거는 되돌릴 수 없으므로, 적용 전 운영 DB 백업 시점을 확인하고 진행한다.
자동 분류 UPDATE는 마이그레이션 안에서 트랜잭션으로 실행된다.

## 2) lib — 새 도메인 모듈 `src/lib/projects/`

기존 도메인 3계층 패턴을 따른다.

- `types.ts`: `Project { id, name, color, is_archived, created_by, created_at, updated_at }`
- `queries.ts`: `getProjects(client, { includeArchived })` — 이름순 정렬
- `actions.ts` ("use server"):
  - `createProject(name, color)` — 이름 트림·중복(23505) 시 친절한 오류 반환
  - `updateProject(id, { name?, color?, is_archived? })`
  - `deleteProject(id)` — admin 검증(서버에서 role 재확인), RLS가 최종 방어
  - 변경 시 관련 경로 revalidate (`/dashboard`, `/dashboard/work-timeline`, `/dashboard/tasks`)
- `constants.ts`: 색상 팔레트(8~10색 고정 선택지), 이름 최대 길이 50

타임라인/할일 쪽 수정:

- `work-timeline/types.ts`: `WorkTimelineEntry`에 `project_id`, 조회 시 `project` 조인(이름·색상)
- `work-timeline/queries.ts`: `ENTRY_SELECT`에 `project:projects(id,name,color)` 추가,
  `getWorkTimelineEntries`에 `projectId` 필터 추가 — 값이 `"none"`이면 `IS NULL`(미분류), UUID면 `eq`
- `work-timeline/actions.ts`: create/update에 `projectId`(nullable) 추가 + 존재 검증
- `tasks`: types/queries/actions에 `project_id` 동일 반영, `TaskGroupBy`에 `"project"` 추가,
  `utils.ts` 그룹핑 로직에 프로젝트별 분기 추가 (미배정 → "미분류")

## 3) 사이드바 하위 메뉴 (`Sidebar.tsx`)

현재 `navItems`는 평면 배열이므로, "업무 타임라인" 항목에만 하위 메뉴를 지원하는
펼침(아코디언) 구조를 추가한다.

- 동작:
  - 현재 경로가 `/dashboard/work-timeline`이면 자동으로 펼침
  - 하위 항목: **전체** → 프로젝트들(색 점 + 이름, 보관 제외) → **미분류**
  - 클릭 시 `/dashboard/work-timeline?project=<id>` (전체는 쿼리 없음, 미분류는 `project=none`)
  - 활성 표시: `project` 쿼리 값 기준
- 데이터: 서버 레이아웃에서 프로젝트 목록을 이미 내려주는 구조가 아니므로,
  Sidebar(클라이언트)에서 브라우저 Supabase 클라이언트로 1회 조회 + 가벼운 캐시.
  실패해도 사이드바 자체는 정상 동작(하위 메뉴만 숨김).
- 사이드바가 접힌 상태(72px)에서는 하위 메뉴를 렌더하지 않음 (기존 접힘 UX 유지)
- 모바일 오버레이 메뉴에서도 동일하게 펼침 지원

## 4) 타임라인 화면 (`WorkTimelineSection`, 상세, 작성 모달)

- **필터**: 기존 직원/날짜/검색 필터 옆에 프로젝트 필터 추가. URL `?project=` 동기화
  (사이드바 하위 메뉴와 같은 파라미터를 공유 → 상태 일원화)
- **카드 표시**: 제목 위/옆에 색 점 + 프로젝트명 배지. 미분류는 배지 없음
- **작성 모달**: "프로젝트" 선택 필드(네이티브 select, 기본 "미분류") +
  "+ 새 프로젝트" 선택 시 인라인으로 이름 입력·색상 선택 후 즉시 생성.
  초안 자동저장(draftStore)에 projectId 포함
- **상세/수정 화면**: 프로젝트 인라인 변경 가능 (본인 글만 — 기존 권한 규칙 동일)
- **프로젝트 관리**: 타임라인 헤더에 "프로젝트 관리" 버튼 → 모달에서
  목록/이름·색상 수정/보관·보관해제/(admin만) 삭제. 삭제 시 "글은 미분류로 남습니다" 안내

## 5) 할일(tasks) 화면

- 할일 추가/수정 폼에 프로젝트 선택(네이티브 select, 선택사항) 추가
- (변경) 그룹 보기 UI는 현재 화면에서 사용되지 않는 구버전 잔재로 확인되어,
  대신 **할 일 기록에 프로젝트 필터**(전체/프로젝트/미분류)를 추가한다.
- 할일 카드에 프로젝트 배지 표시 (있을 때만)

## 6) 대시보드 홈 미리보기

- `DashboardTimelineClient` → compact 모드 `WorkTimelineSection`에서도 프로젝트 배지 표시
- 타임라인 로컬 캐시(`timelineCache.ts`) 스키마에 project 필드 포함 (캐시 버전 키 올려 구버전 무효화)

## 성능/안전 불변조건 체크

- 타임라인은 빠른 경로(fast-queries) 대상이 아니므로 영향 없음.
- 할일 카드에 프로젝트 배지를 표시하려면 할일 초기 데이터에 project 정보가 필요하다.
  할일 초기 데이터는 이중 경로이므로 **`src/lib/tasks/fast-queries.ts`(직접 Postgres)와
  Supabase 폴백 쿼리 양쪽에 project 필드를 함께 추가**한다 (CLAUDE.md 불변조건 3).
  대시보드 홈의 업무 요약(088 RPC)은 project를 표시하지 않으므로 건드리지 않는다.
- 새 select는 **네이티브 select** 사용 (성능 테스트가 커스텀 드랍다운을 감지하는 파일 주의)
- 미들웨어 인증 캐시, keepalive, 초기 JS 예산에 영향 주는 변경 없음
- 작업 후 `cd jdi-portal && npm run test:performance` (40개) + `npm run lint` + `npm run build` 필수

## 테스트 / 검증

- 정적 테스트(`node --test`): 접두어 파싱 규칙(자동 분류 로직과 동일 규칙의 앱 유틸이 있다면),
  그룹핑 유틸(`tasks/utils.ts` 프로젝트별 분기)
- 수동 검증 시나리오:
  1. 프로젝트 생성 → 사이드바 하위 메뉴에 즉시 반영
  2. 글 작성 시 프로젝트 선택 → 카드 배지 + 프로젝트별 타임라인에 표시
  3. 미분류 글 → "미분류" 메뉴에서만 조회
  4. 프로젝트 보관 → 사이드바에서 사라지고 전체 타임라인에는 글 유지
  5. admin 아닌 계정으로 삭제 시도 → 거부
  6. 기존 글 자동 분류 결과 확인 (접두어 제거 + 배지)
- 마이그레이션은 운영 DB 변경이므로 **적용 전 사용자 재확인** 후 `npx supabase db push --linked`

## 범위 제외 (이번에 안 함)

- 프로젝트별 멤버/권한 (전 직원 공용)
- 프로젝트별 통계/리포트
- 일정(schedule)·지출 등 다른 도메인 연동
- admin의 남의 글 프로젝트 재분류
