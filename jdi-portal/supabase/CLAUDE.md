# Supabase 작업 지침

DB, RLS, Storage, Edge Function 변경 전 이 문서를 확인합니다.

## 마이그레이션

- 파일명은 `NNN_설명.sql` 형식의 순차 번호를 사용합니다.
- 기존 마이그레이션을 수정하기보다 새 마이그레이션을 추가합니다.
- 롤백이 필요한 변경은 되돌리는 SQL을 함께 생각합니다.

### 번호를 정하기 전에 반드시 확인

**최신 번호는 이 문서에 적지 않습니다**(적는 순간 낡습니다). 새로 만들 때마다 아래 명령으로 직접 확인합니다.

```bash
npx supabase migration list --linked   # Local / Remote 열을 비교해 실제 적용 번호 확인
npx supabase db push --linked
npx supabase migration list --linked   # push 후 새 번호가 Remote 에 찍혔는지 재확인
```

- 파일 목록에 **번호 공백이 있는 것은 정상**입니다. 병합되지 않은 다른 작업 브랜치가 그 번호를 이미 운영 DB에 적용했기 때문입니다.
- 모든 worktree/브랜치가 같은 운영 Supabase를 공유하므로, 원격에 이미 기록된 번호를 다시 쓰면 `db push`가 그 파일을 **조용히 건너뜁니다**(오류 없이 아무 일도 안 일어남).
- 그래서 새 번호는 **로컬 파일 최댓값이 아니라 위 명령의 Remote 열 최댓값 다음**으로 잡습니다.
- 마이그레이션은 **멱등하게**(`IF NOT EXISTS`, `DROP POLICY IF EXISTS` 후 `CREATE`) 작성합니다. 재적용 사고가 실제로 있었습니다(107).

### 파일이 사라졌을 때 복구하는 법

`migration list --linked` 에서 **Local 은 비었는데 Remote 에만 번호가 있으면**, 그 마이그레이션 파일이 유실된 것입니다(병합 없이 삭제된 브랜치/worktree 등). 운영 DB의 `supabase_migrations.schema_migrations` 테이블이 **적용했던 SQL 원문을 `statements` 컬럼에 그대로 보관**하므로 되살릴 수 있습니다.

```sql
SELECT version, name, array_to_string(statements, E';\n') AS sql
  FROM supabase_migrations.schema_migrations
 WHERE version BETWEEN '111' AND '116'   -- 유실된 번호 범위
 ORDER BY version;
```

- 접속은 아래처럼 하면 `DATABASE_URL` 이 환경변수로만 들어가 비밀번호를 파일·로그에 남기지 않습니다(운영 값은 GCP Secret Manager 에 있습니다). 예전에 쓰던 `railway run` 은 **Railway 배포를 중지해서 더 이상 동작하지 않습니다.**
  ```bash
  DATABASE_URL="$(gcloud secrets versions access latest --secret=DATABASE_URL --project jdi-portal-seoul)" node <스크립트>
  ```
- `supabase db dump` 는 Docker Desktop 이 필요하고, 로컬 `.env.local` 의 `DATABASE_URL` 은 비밀번호가 만료돼 있을 수 있습니다.
- 복구 후 `migration list --linked` 로 Local/Remote 가 모두 채워졌는지 확인합니다.
- **실제 사례**: `111`~`116`(인플루언서 시딩·후보 발굴 계열)이 이 방법으로 복구되었습니다. 단, 이 6개가 만든 테이블을 쓰는 **앱 코드는 master 에 없습니다**(병합되지 않은 작업). DB 구조만 운영에 남아 있는 상태이므로, 관련 작업을 할 때 이미 존재하는 테이블을 다시 만들지 않도록 주의합니다.

## RLS

- 사용자 데이터 테이블은 RLS를 켭니다.
- 승인된 사용자 조건은 `public.is_approved_user()`를 기준으로 둡니다.
- `SELECT`, `INSERT`, `UPDATE`, `DELETE` 정책을 각각 검토합니다.
- `upsert()`는 INSERT와 UPDATE 정책이 모두 필요합니다.
- 관리자 정책은 role만 믿지 말고 필요한 경우 RPC 내부에서도 검증합니다.

## SECURITY DEFINER

- 함수 안에서 `auth.uid()`를 확인합니다.
- 관리자 전용 함수는 `admin_only` 또는 동등한 권한 체크를 포함합니다.
- 검색 경로 문제가 생기지 않도록 schema를 명시합니다.
- 사용자가 넘긴 ID를 그대로 신뢰하지 않습니다.

## 날짜

- 서비스 기준은 Asia/Seoul입니다.
- `CURRENT_DATE`, `NOW()`를 그대로 사용하지 않습니다.
- 예:

```sql
(NOW() AT TIME ZONE 'Asia/Seoul')::DATE
```

## Edge Function

현재 함수는 3개입니다.

| 함수 | 역할 |
|---|---|
| `influencer-analyze` | 인플루언서 계정 자동 분석 |
| `influencer-extract` | 게시물/미디어 추출 (`influencer-media` 버킷에 저장) |
| `push-dispatch` | 웹 푸시 발송 (알림 타입 분기 + 밤 시간 푸시 차단) |

- Supabase Edge Function은 Deno 런타임입니다.
- Node 전용 패키지와 API를 그대로 사용하지 않습니다.
- Web Push는 Deno 호환 라이브러리를 사용합니다.
- 새 알림 타입을 추가하면 `push-dispatch`에도 등록해야 푸시가 나갑니다(회귀 테스트가 이를 검사합니다).
- 배포:

```bash
npx supabase functions deploy <name> --no-verify-jwt
```

Webhook에서 호출되는 함수는 JWT 없이 동작해야 할 수 있으므로 인증 방식과 호출자를 명확히 확인합니다.

## Storage

현재 버킷 8개입니다. **`avatars`만 공개(public)이고 나머지는 전부 비공개**이므로 signed URL로 읽습니다.

| 버킷 | 공개 | 용도 | 도입 |
|---|---|---|---|
| `avatars` | 공개 | 프로필 사진 | 015 |
| `task-attachments` | 비공개 | 업무 첨부 | 023 |
| `reports` | 비공개 | 리포트 파일 | 025 |
| `chat-attachments` | 비공개 | 채팅 첨부 | 035 |
| `influencer-media` | 비공개 | 인플루언서 미디어 | 080 |
| `work-timeline` | 비공개 | 업무 타임라인·검토 첨부 | 083 / 098 |
| `expense-receipts` | 비공개 | 영수증 | 090 |
| `vault-documents` | 비공개 | 보관함 서류 (10MB 제한) | 106 / 107 |

- 버킷 정책은 소유자, 채널 멤버십, 관리자 조건을 명확히 둡니다.
- 클라이언트 업로드는 `src/lib/utils/upload.ts`의 파일 검증을 거칩니다.
- 공개 URL이 필요한 파일과 비공개 파일을 섞지 않습니다.
- signed URL은 화면당 개별 요청을 반복하지 말고 일괄 발급/캐시 흐름을 씁니다(채팅: `src/lib/chat/fileUrlBatch.ts`, `fileUrlCache.ts`).

## pg_cron 작업

`cron.schedule`로 등록된 정기 작업입니다(시각은 **UTC** 기준 — KST는 +9시간). 관련 기능을 고칠 때 함께 확인합니다.

| 작업 이름 | 주기(UTC) | 하는 일 | 정의 위치 |
|---|---|---|---|
| `weekly_kpi_snapshot` | `55 14 * * 0` (일 23:55 KST) | 인플루언서 KPI 스냅샷 | `075_influencer_automation.sql` |
| `daily_recurring_expenses` | `0 0 * * *` (09:00 KST) | 고정지출 생성·결제일 알림 | `090_expenses.sql` |
| `work_directive_reminder` | `0 2 * * 1-5` (평일 11:00 KST) | 업무지시 미확인 재촉 | `105_work_directive_reminder.sql` |
| `timeline_review_reminder` | `30 2 * * 1-5` (평일 11:30 KST) | 업무보고 검토 재촉 | `108_work_timeline_reviews.sql` |
| `activity_log_cleanup` | `0 19 * * *` (04:00 KST) | 최근 활동 로그 7일 초과분 삭제 | `117_activity_log.sql` |

`021_notifications.sql`의 오래된 알림 정리는 **주석 처리되어 있어 실제로는 돌지 않습니다.** 알림 테이블이 커지면 이 작업을 살릴지 먼저 검토합니다.

## SQL 점검 스크립트

`supabase/tests/`에 RLS/RPC를 직접 검증하는 SQL이 있습니다. DB 정책을 고쳤다면 해당 파일도 함께 갱신합니다.

- `dashboard_task_summary_rpc.sql`
- `work_timeline_rls.sql`
- `work_timeline_reviews_rls.sql`

## 검증 체크

- 일반 사용자와 관리자 접근이 분리되는가
- 승인되지 않은 사용자가 읽거나 쓸 수 없는가
- 익명 사용자가 접근할 수 없는가
- RLS recursion이 생기지 않는가
- KST 기준 날짜가 맞는가
- Supabase `error`가 호출부에서 처리되는가
