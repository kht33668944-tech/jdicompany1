# JDICOMPANY Portal

JDICOMPANY 사내 업무 포털입니다. 근태, 업무, 채팅, 일정, 리포트, 인플루언서 운영을 한 화면에서 관리합니다.

## 스택

- Next.js 16.2.10 App Router
- React 19.2.4
- TypeScript strict
- Tailwind CSS 4
- Supabase Auth, Postgres, RLS, Realtime, Storage, Edge Functions
- Railway 배포

## 시작하기

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

루트 저장소에서는 다음 명령도 동작합니다.

```bash
cd ..
npm run dev
```

## 환경 변수

`jdi-portal/.env.local.example`을 기준으로 `jdi-portal/.env.local`을 만듭니다.

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
```

실제 키와 운영 값은 커밋하지 않습니다. Railway Variables와 Supabase Secrets에서 관리합니다.

## 주요 명령

```bash
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run start    # 빌드 결과 실행
npm run lint     # ESLint
```

Supabase:

```bash
npx supabase db push --linked
npx supabase functions deploy <name> --no-verify-jwt
```

## 주요 경로

| 경로 | 내용 |
|---|---|
| `src/app/` | Next.js App Router 페이지와 Route Handler |
| `src/components/dashboard/` | 대시보드 UI |
| `src/lib/` | 도메인별 쿼리, 액션, 타입, 유틸 |
| `src/lib/supabase/` | Supabase SSR 클라이언트와 인증 헬퍼 |
| `supabase/migrations/` | DB 마이그레이션 |
| `supabase/functions/` | Supabase Edge Functions |
| `docs/claude/` | 프로젝트 작업 지침 |
| `docs/superpowers/` | 기능 설계와 구현 계획 기록 |

## 현재 기능

- 인증과 승인 기반 대시보드 접근
- 출퇴근, 휴가, 근무시간 변경, 관리자 승인
- 업무 목록/타임라인/캘린더, 상세, 첨부, 댓글, 체크리스트
- 채팅 채널과 DM, Realtime, 읽음, 멘션, 알림
- 일정 월/주/일/목록 뷰와 참여자 관리
- 리포트 작성과 상세 확인
- 인플루언서 캠페인, 시딩 일정, 등급/지표, 자동 분석
- PWA와 웹 푸시 알림

## 개발 메모

- 날짜와 시간은 Asia/Seoul 기준입니다.
- 사용자 데이터 접근은 Supabase RLS를 전제로 합니다.
- Next.js 16 관련 코드를 바꿀 때는 설치된 Next 문서를 확인합니다.
- 더 자세한 작업 지침은 `AGENTS.md`와 `docs/claude/project-guide.md`를 봅니다.
