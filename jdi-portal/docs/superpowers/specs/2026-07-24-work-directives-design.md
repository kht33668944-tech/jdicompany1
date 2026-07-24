# 업무지시 기능 설계

- 날짜: 2026-07-24
- 도메인: `directives`(신규), `dashboard`(표시), `tasks`(연동), `notifications`/`push`(알림)
- 상태: 사용자 승인 대기

## 배경 / 목적

지금 대표님은 저녁에 **잔디(JANDI)** 메신저로 업무 지시를 남기고, 직원은 아침에 그 글을 보고
각자 포털 할일에 손으로 옮겨 적는다. 그래서 지시가 흘러가 버리고, 누가 무엇을 받았는지·
어디까지 했는지 한곳에서 볼 수 없다.

이 흐름을 포털 안으로 가져온다.

1. **지시 등록**: 대시보드 "오늘 업무 현황" 표에서 이름을 눌러, 그 사람이 지금 무슨 일을
   하고 있는지 보면서 그 자리에서 지시를 작성한다.
2. **아침 확인**: 받는 사람이 출근을 찍으면 대시보드 "오늘 할 일" **바로 위**에 지시 카드가 펼쳐진다.
3. **수락 = 할일 등록**: 수락 버튼 하나로 내 할일이 만들어지고, 그 할일의 진행 상태가
   보낸 사람에게 그대로 비친다.

잔디는 이 기능에서 완전히 빠진다. 메신저 글을 옮겨 오거나 파싱하지 않는다.

## 결정 사항 (사용자 승인)

| 항목 | 결정 |
|---|---|
| 데이터 방식 | 신규 테이블 2개 + `tasks` 연결 컬럼 1개 (A안) |
| 등록 권한 | 승인된 직원 **누구나** (수평 조직) |
| 종류 구분 | 보낸 사람이 admin이면 `지시`, 아니면 `요청` — **자동 결정**, 사용자가 고르지 않음 |
| 받는 사람 | 한 지시에 **여러 명** 가능 |
| 필수 입력 | 제목 + 내용. 마감일 · 중요도 · 프로젝트는 **선택** |
| 응답 버튼 | `지시` → 수락만 / `요청` → 수락 + 거절(사유) |
| 받는 쪽 표시 위치 | 대시보드 "오늘 할 일" **바로 위**. 출근 전 접힘, 출근 후 펼침 |
| 보내는 쪽 진입 | "오늘 업무 현황" 표의 **이름 클릭 → 팝업** (사이드바 새 메뉴 없음) |
| 미확인 표시 | 표의 이름 옆 배지 + 팝업 안 보낸 지시 목록 |
| 완료 기준 | 수락으로 생긴 할일이 완료되면 지시도 완료로 보인다 (별도 확인 단계 없음) |
| 알림 | 등록 시 인앱+웹푸시(밤 22:00~07:00 KST는 푸시 제외), 평일 11:00 미확인 재촉 1회, 응답 시 보낸 사람에게 알림 |

검토에 사용한 화면 시안: <https://claude.ai/code/artifact/6b9c6dfa-dcfb-4a17-b327-8772f21f447e>
(비공개 링크. 구현의 기준은 아래 4)·5)절 서술이며, 시안은 참고용이다.)

### 왜 A안(신규 테이블)인가

- **B안**(`tasks.status`에 `지시대기` 추가)은 할일 상태를 읽는 곳이 대시보드 위젯, 할일 목록,
  `get_dashboard_task_summaries` RPC, 088 부분 인덱스까지 흩어져 있어 한 곳만 놓쳐도
  미수락 지시가 남의 할일 목록에 섞인다. 현재 잘 도는 성능 최적화를 흔들 위험이 크다.
- **C안**(알림 확장)은 알림이 읽으면 사라지는 성격이라 "누가 수락했는지"를 오래 추적하지 못한다.
- A안은 지시와 할일이 분리돼 "3명 중 2명 수락"이 자연스럽고, 기존 할일 경로를 건드리지 않는다.

## 1) DB — 마이그레이션 `103_work_directives.sql`

### work_directives (지시 본문)

```sql
CREATE TABLE public.work_directives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  kind TEXT NOT NULL CHECK (kind IN ('지시', '요청')),
  priority TEXT CHECK (priority IS NULL OR priority IN ('긴급', '높음', '보통', '낮음')),
  due_date DATE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX work_directives_created_by ON public.work_directives (created_by, created_at DESC);
```

- `priority`는 NULL 허용(선택 입력). 수락 시 `COALESCE(priority, '보통')`으로 할일에 반영.
- 등록 후 수정은 지원하지 않으므로 `updated_at` 갱신 트리거는 두지 않는다
  (컬럼은 기존 테이블들과 형태를 맞추기 위해 남긴다).

### work_directive_recipients (받는 사람별 상태)

```sql
CREATE TABLE public.work_directive_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  directive_id UUID NOT NULL REFERENCES public.work_directives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT '미확인' CHECK (state IN ('미확인', '수락', '거절')),
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  decline_reason TEXT CHECK (
    decline_reason IS NULL OR char_length(btrim(decline_reason)) BETWEEN 1 AND 500
  ),
  responded_at TIMESTAMPTZ,
  reminded_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (directive_id, user_id)
);

-- 대시보드가 매 요청 읽는 경로: 미확인 건만 부분 인덱스
CREATE INDEX work_directive_recipients_pending
  ON public.work_directive_recipients (user_id, created_at DESC)
  WHERE state = '미확인';

CREATE INDEX work_directive_recipients_directive
  ON public.work_directive_recipients (directive_id);

CREATE INDEX work_directive_recipients_task
  ON public.work_directive_recipients (task_id)
  WHERE task_id IS NOT NULL;
```

- `reminded_on`은 재촉 알림 중복 방지용 (KST 날짜 1건/1일).
- **지시의 진행 상태는 따로 저장하지 않는다.** `state = '수락'`이면 화면에서 `task_id`로 이어진
  할일의 `status`를 그대로 보여준다. 상태를 두 곳에 저장하지 않으므로 동기화가 어긋날 수 없다.

### tasks 연결 컬럼

```sql
ALTER TABLE public.tasks
  ADD COLUMN directive_recipient_id UUID
    REFERENCES public.work_directive_recipients(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX tasks_directive_recipient_unique
  ON public.tasks (directive_recipient_id)
  WHERE directive_recipient_id IS NOT NULL;
```

유니크 인덱스로 **한 지시 수신 건에서 할일이 두 개 만들어지는 것(중복 수락)** 을 DB가 막는다.

### kind 위조 방지 트리거

`kind`는 클라이언트 입력이 아니라 보낸 사람의 권한에서 파생된다. 앱에서 계산해 넣으면
직접 REST 호출로 `지시`를 위조할 수 있으므로 DB에서 덮어쓴다.

```sql
CREATE OR REPLACE FUNCTION public.set_work_directive_kind()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
    NEW.kind := CASE
      WHEN EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
      ) THEN '지시' ELSE '요청'
    END;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER work_directives_set_kind
  BEFORE INSERT ON public.work_directives
  FOR EACH ROW EXECUTE FUNCTION public.set_work_directive_kind();
```

`auth.uid()`가 NULL인 경우(서비스 롤/마이그레이션 삽입)에는 덮어쓰지 않는다.

### RLS

두 테이블 모두 RLS 활성. 볼 수 있는 범위는 **보낸 사람 · 받는 사람 · 관리자**.

```sql
-- work_directives
SELECT : is_approved_user() AND (
           created_by = auth.uid()
           OR EXISTS (SELECT 1 FROM public.work_directive_recipients r
                      WHERE r.directive_id = id AND r.user_id = auth.uid())
           OR EXISTS (SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin')
         )
INSERT : is_approved_user() AND created_by = auth.uid()
UPDATE : 없음 (등록 후 수정 불가 — 범위 밖)
DELETE : created_by = auth.uid() OR admin

-- work_directive_recipients
SELECT : 위 directive를 볼 수 있으면 볼 수 있음 (EXISTS 조인)
INSERT : is_approved_user() AND 해당 directive.created_by = auth.uid()
UPDATE : 없음 (아래 RPC로만 상태 변경)
DELETE : 해당 directive.created_by = auth.uid() OR admin
```

받는 사람은 자기 행을 **직접 UPDATE 할 수 없다.** 수락/거절은 아래 RPC만 통과한다.
남이 대신 수락하는 일이 화면이 아니라 DB에서 차단된다.

### 수락 / 거절 RPC

한 트랜잭션 안에서 할일 생성까지 끝내야 하므로 `SECURITY DEFINER` 함수로 만든다.
함수 내부에서 `auth.uid()`와 승인 여부를 다시 검증한다 (`supabase/CLAUDE.md` 규칙).

```sql
public.accept_work_directive(p_recipient_id UUID) RETURNS UUID
public.decline_work_directive(p_recipient_id UUID, p_reason TEXT) RETURNS VOID
```

`accept_work_directive` 동작 순서:

1. `is_approved_user()` 확인, 대상 행의 `user_id = auth.uid()` 확인 — 아니면 예외.
2. `state = '미확인'` 확인 — 아니면 `이미 응답한 지시입니다` 예외.
3. `tasks` INSERT
   - `title` = 지시 제목, `description` = 지시 내용
   - `priority` = `COALESCE(directive.priority, '보통')`
   - `due_date`, `project_id` = 지시 값 (NULL이면 NULL)
   - `created_by` = **지시를 보낸 사람** (누가 시킨 일인지 할일에도 남는다)
   - `status` = `'대기'`, `position` = `대기` 상태의 마지막 `position` + 1
     (상태별 독립 순서 — `src/components/dashboard/tasks/CLAUDE.md` 규칙)
   - `directive_recipient_id` = `p_recipient_id`
4. `task_assignees` INSERT (담당자 = `auth.uid()`)
5. 수신 행 UPDATE — `state = '수락'`, `task_id`, `responded_at = NOW()`
6. 보낸 사람에게 `notifications` INSERT (`type = 'work_directive_answer'`)
7. 생성된 `task_id` 반환

`decline_work_directive`는 `kind = '요청'`일 때만 허용한다. `지시`에 대한 거절 요청은
`대표님 지시는 거절할 수 없습니다` 예외로 막는다 (화면에도 버튼이 없다).
사유는 필수, `state = '거절'`, 보낸 사람에게 알림.

## 2) DB — 마이그레이션 `104_work_directive_reminder.sql`

### 미확인 재촉

평일 11:00 KST(= 02:00 UTC)에 한 번 검사한다.

```sql
SELECT cron.schedule(
  'work_directive_reminder', '0 2 * * 1-5',
  $$ SELECT public.remind_pending_work_directives(); $$
);
```

`remind_pending_work_directives()` 대상 조건:

- `state = '미확인'`
- 지시 등록 후 12시간 경과
- 받는 사람이 **오늘 출근 기록이 있음** (`attendance_records.work_date = (NOW() AT TIME ZONE 'Asia/Seoul')::DATE`)
- `reminded_on IS NULL OR reminded_on < (NOW() AT TIME ZONE 'Asia/Seoul')::DATE`

동작: 받는 사람에게 알림 1건(`type = 'work_directive_reminder'`),
보낸 사람에게 알림 1건(`type = 'work_directive_pending'`), `reminded_on`을 KST 오늘로 기록.
날짜 계산은 전부 `(NOW() AT TIME ZONE 'Asia/Seoul')::DATE`를 쓴다.

### 웹푸시 배선

이 저장소는 `notifications` INSERT → Database Webhook → `push-dispatch` Edge Function 순으로
푸시가 나간다. 따라서 **알림을 넣으면 푸시는 자동**이고, 손볼 곳은 `push-dispatch` 쪽이다.

신규 알림 타입은 4종이다.

| 타입 | 받는 사람 | 언제 |
|---|---|---|
| `work_directive` | 지시를 받은 사람 | 지시 등록 직후 |
| `work_directive_answer` | 지시를 보낸 사람 | 상대가 수락 또는 거절했을 때 |
| `work_directive_reminder` | 지시를 받은 사람 | 평일 11:00, 12시간 넘게 미확인일 때 |
| `work_directive_pending` | 지시를 보낸 사람 | 위와 같은 시각, 아직 미확인이라고 알림 |

- `SETTING_KEY_BY_TYPE`에 이 4종을 추가해 사용자 알림 설정을 존중한다.
- `work_directive`(등록 알림) 타입에 한해 **조용한 시간** 규칙을 넣는다:
  KST 22:00~07:00 사이면 푸시를 보내지 않고 종료한다. 인앱 알림은 이미 저장돼 있으므로
  아침에 포털을 열면 그대로 보인다.

## 3) 서버 로직 — `src/lib/directives/`

기존 도메인 모듈 패턴을 따른다.

| 파일 | 내용 |
|---|---|
| `types.ts` | `WorkDirective`, `DirectiveRecipient`, `PendingDirective`(받는 쪽 카드용), `SentDirective`(보낸 쪽 목록용) |
| `constants.ts` | `DIRECTIVE_KIND`, `DIRECTIVE_STATE`, 배지 라벨/색상 |
| `queries.ts` | `getPendingDirectives(userId)`, `getSentDirectivesFor(targetUserId)`, `getPendingCountsByUser()` |
| `actions.ts` | `createDirective()`, `acceptDirective()`(RPC 호출), `declineDirective()`(RPC 호출) |

- `createDirective()`는 지시 INSERT → 수신자 INSERT → 수신자별 알림 INSERT 순으로 진행한다.
  **알림 INSERT 실패가 지시 등록을 되돌리지 않는다** (기존 업무 도메인 규칙).
- 모든 Supabase 호출에서 `error`를 확인한다. `data`만 보고 넘어가지 않는다.

## 4) 화면 — 받는 쪽

**위치**: 대시보드, `TodayWorkBoardWidget`(오늘 할 일) **바로 위**.
신규 컴포넌트 `src/components/dashboard/widgets/DirectiveInboxWidget.tsx`.

- **출근 전**: 한 줄로 접힌 상태 — `확인할 업무지시 2건`.
  출근 여부는 이미 위젯에 들어오는 `attendanceStatuses`로 판정한다 (추가 조회 없음).
- **출근 후**: 카드가 펼쳐진다.
  - `대표님 지시`(kind=지시) 배지 항목이 위, `업무 요청`(kind=요청) 배지 항목이 아래.
    같은 종류 안에서는 오래된 것부터.
  - 각 항목: 제목 · 내용 · 보낸 사람 · 등록 시각, 있으면 마감일 / 중요도 / 프로젝트 배지.
  - `지시` → `[수락]` 하나. `요청` → `[수락] [거절]`, 거절은 사유 한 줄 입력.
- **수락 직후**: 카드에서 해당 항목이 사라지고, 아래 오늘 할 일 목록에 새 할일이 나타난다.
  화면 이동 없이 `router.refresh()`로 두 위젯을 함께 갱신한다.
- 미확인이 0건이면 위젯 자체를 렌더링하지 않는다.

## 5) 화면 — 보내는 쪽

**진입점**: `TodayWorkBoardWidget`의 "직원별 오늘 현황" 표에서 이름을 클릭.
신규 컴포넌트 `src/components/dashboard/widgets/MemberWorkPanel.tsx`(팝업).

팝업 구성(위에서 아래):

1. **머리**: 아바타 · 이름 · 출근 상태 배지 · (있으면) `지시 N 미확인` 배지.
2. **오늘 업무** — 카드 하나에 가로줄 세 개. 위부터 `대기` / `진행중` / `완료`.
   각 줄은 `라벨 + 건수 + 업무 제목 미리보기(넘치면 말줄임)`. 숫자에만 색을 준다
   (대기 = 기본, 진행중 = 주황, 완료 = 초록 — 표의 색과 동일). 세로로 길어지지 않게 한 줄씩만.
3. **업무 지시하기** — 제목(필수) · 내용(필수) · 받는 사람(기본값 = 클릭한 사람, 추가 가능) ·
   선택 항목(마감일 / 중요도 / 프로젝트).
4. **이 사람에게 보낸 지시** — 최근 것부터, 상태 배지(`미확인` / 할일 상태 그대로 / `거절`).

표 자체의 변경은 두 가지뿐이다.

- 이름 셀이 버튼이 된다 (키보드 포커스 표시 포함).
- 미확인이 있는 사람의 이름 옆에 `지시 N 미확인` 배지가 붙는다.

모바일에서는 표가 카드 형태로 접히고, 팝업은 화면 폭에 맞춰 전체 폭을 쓴다.

## 6) 대시보드 데이터 경로 (성능 — 가장 조심할 곳)

`CLAUDE.md` 성능 불변조건 3번을 따른다. **빠른 경로와 폴백을 반드시 함께 고친다.**

| 경로 | 파일 | 할 일 |
|---|---|---|
| 빠른 경로 (직접 pg) | `src/lib/dashboard/fast-queries.ts` | `DASHBOARD_SNAPSHOT_QUERY`에 CTE 2개 추가 — ① 내 미확인 지시 목록 ② 사용자별 미확인 건수. **DB 왕복을 늘리지 않는다.** |
| 스냅샷 조립 | `src/lib/dashboard/dashboard-snapshot.ts` | 새 필드를 `DashboardData`에 반영 |
| 폴백 (Supabase) | `src/lib/dashboard/queries.ts` | 같은 데이터를 Supabase 경로로도 채운다 |

- 조회 대상은 **미확인 건만**이며 `work_directive_recipients_pending` 부분 인덱스를 탄다.
- 사용자별 미확인 건수는 배지용이므로 `COUNT(*) GROUP BY user_id`만 가져온다.
- 팝업 안의 "보낸 지시 목록"은 초기 로드에 넣지 않는다. **팝업을 열 때 별도로 조회**한다
  (대시보드 첫 화면 예산을 늘리지 않기 위해).

## 7) 검증

| 대상 | 방법 |
|---|---|
| 성능 회귀 | `npm run test:performance` (40개 검사) 전부 통과 |
| 이중 경로 누락 | `scripts/performance-architecture.test.mjs`에 정적 검사 추가 — `work_directive`가 `fast-queries.ts`와 `queries.ts` **양쪽**에 존재하는지 (`projects` 기능에서 쓴 것과 같은 방식) |
| 초기 JS 예산 | `npm run perf:audit` — 대시보드 라우트 예산 초과 없음 |
| 권한 | 받는 사람이 아닌 계정으로 `accept_work_directive` 호출 시 실패 / 비관리자가 만든 지시의 `kind`가 `요청`으로 저장되는지 |
| 날짜 | 밤 23시 등록 → 푸시 없음, 인앱 알림은 있음 / 재촉이 KST 기준 하루 1회인지 |
| 수동 | 두 계정으로 등록 → 출근 → 수락 → 할일 완료 → 보낸 쪽에 완료 표시까지 한 바퀴 |

## 8) 범위 밖 (YAGNI)

- 지시 **수정** — 잘못 보냈으면 삭제 후 다시 보낸다.
- 지시에 대한 **댓글/대화** — 논의는 기존 채팅이나 할일 댓글에서 한다.
- 지시 **첨부파일** — 수락 후 만들어진 할일에 첨부한다.
- 잔디 메시지 **붙여넣기 파싱** — 포털에서 직접 쓰기로 했으므로 불필요.
- 보낸 지시 **전체 목록 화면 / 사이드바 메뉴** — 사람이 4명 규모라 표 배지 + 팝업으로 충분.
  지시가 쌓여 찾기 어려워지면 그때 별도 설계한다.
- **반복 지시 / 예약 발송** — 조용한 시간 규칙으로 밤 알림 문제는 해결된다.
