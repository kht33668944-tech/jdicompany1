# Supabase 작업 지침

DB, RLS, Storage, Edge Function 변경 전 이 문서를 확인합니다.

## 마이그레이션

- 파일명은 `NNN_설명.sql` 형식의 순차 번호를 사용합니다.
- 최신 번호를 확인한 뒤 다음 번호로 만듭니다. 현재 저장소는 `105_work_directive_reminder.sql`까지 있습니다.
- 기존 마이그레이션을 수정하기보다 새 마이그레이션을 추가합니다.
- 롤백이 필요한 변경은 되돌리는 SQL을 함께 생각합니다.

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

- Supabase Edge Function은 Deno 런타임입니다.
- Node 전용 패키지와 API를 그대로 사용하지 않습니다.
- Web Push는 Deno 호환 라이브러리를 사용합니다.
- 배포:

```bash
npx supabase functions deploy <name> --no-verify-jwt
```

Webhook에서 호출되는 함수는 JWT 없이 동작해야 할 수 있으므로 인증 방식과 호출자를 명확히 확인합니다.

## Storage

- 버킷 정책은 소유자, 채널 멤버십, 관리자 조건을 명확히 둡니다.
- 클라이언트 업로드는 `src/lib/utils/upload.ts`의 파일 검증을 거칩니다.
- 공개 URL이 필요한 파일과 비공개 파일을 섞지 않습니다.

## 검증 체크

- 일반 사용자와 관리자 접근이 분리되는가
- 승인되지 않은 사용자가 읽거나 쓸 수 없는가
- 익명 사용자가 접근할 수 없는가
- RLS recursion이 생기지 않는가
- KST 기준 날짜가 맞는가
- Supabase `error`가 호출부에서 처리되는가
