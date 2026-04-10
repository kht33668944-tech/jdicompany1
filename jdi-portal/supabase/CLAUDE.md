# Supabase — 마이그레이션 · RLS · Edge Function 규칙

> 배경/사례는 `docs/claude/archive/past-lessons.md` 참조.

## 마이그레이션

- 파일명: `NNN_설명.sql` (순차 번호)
- 모든 새 테이블에 **RLS 활성화 + `is_approved_user()` 체크** 필수
- **SELECT / INSERT / UPDATE / DELETE** 4개 정책 모두 작성 (upsert = INSERT + UPDATE)
- `CURRENT_DATE` / `NOW()` 직접 사용 금지 → `(NOW() AT TIME ZONE 'Asia/Seoul')::DATE`

## SECURITY DEFINER 함수

- 내부에서 반드시 `auth.uid()` 검증
- 관리자 전용 함수는 `admin_only` 체크 포함

## Edge Function

- **Deno 네이티브만** 사용 — npm 패키지 금지 (`web-push` → `jsr:@negrel/webpush`)
- 배포: `npx supabase functions deploy <name> --no-verify-jwt`
- Webhook 호출이라 JWT 없이 동작해야 함

## RLS 주의

- `upsert()` 호출 시 INSERT + UPDATE 정책 둘 다 필요 (하나만 있으면 RLS 에러)
- 재귀 SELECT 정책 주의 (schedule_participants 사례: migration 048, 052)
