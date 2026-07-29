# JDICOMPANY Portal

JDICOMPANY 사내 업무 포털입니다. 근태, 업무, 채팅, 일정, 리포트, 인플루언서, 업무 타임라인·검토, 지출관리, 프로젝트, 업무지시, 보관함 운영을 한 화면에서 관리합니다.

## 스택

- Next.js 16.2.11 App Router
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

검증(테스트):

```bash
npm run test:performance      # 성능·아키텍처 회귀 검사 — 코드 수정 후 필수
npm run test:security         # 보안 회귀
npm run test:expenses         # 지출관리
npm run test:search-privacy   # 검색 프라이버시
npm run perf:audit            # 라우트별 초기 JS 예산 (빌드 후)
```

Supabase:

```bash
npx supabase migration list --linked   # 새 마이그레이션 번호를 잡기 전 확인
npx supabase db push --linked
npx supabase functions deploy <name> --no-verify-jwt
```

## 주요 경로

| 경로 | 내용 |
|---|---|
| `src/app/` | Next.js App Router 페이지와 Route Handler |
| `src/proxy.ts` | 로그인 세션 갱신 진입점 (Next 16이라 `middleware.ts` 아님) |
| `src/instrumentation.ts` | 서버 시작 시 DB 풀 warm-up과 keepalive |
| `src/components/dashboard/` | 대시보드 UI |
| `src/lib/` | 도메인별 쿼리, 액션, 타입, 유틸 |
| `src/lib/supabase/` | Supabase SSR 클라이언트와 인증 헬퍼 |
| `supabase/migrations/` | DB 마이그레이션 |
| `supabase/functions/` | Supabase Edge Functions |
| `supabase/tests/` | RLS/RPC 점검용 SQL |
| `scripts/` | 회귀 테스트와 감사 스크립트 |
| `docs/claude/` | 프로젝트 작업 지침 |
| `docs/performance/` | 성능 기준선 |
| `docs/operations/` | 백업·복구 운영 절차 |
| `docs/superpowers/` | 기능 설계와 구현 계획 기록 |
| `../jdi-desktop/` | Windows 데스크톱 앱(껍데기, 별도 프로젝트) |

## 현재 기능

- 인증과 승인 기반 대시보드 접근
- 출퇴근, 휴가, 근무시간 변경, 관리자 승인
- 업무 목록/타임라인/캘린더, 상세, 첨부, 댓글, 체크리스트
- 채팅 채널과 DM, Realtime, 읽음, 멘션, 알림
- 일정 월/주/일/목록 뷰와 참여자 관리
- 리포트 작성과 상세 확인
- 인플루언서 캠페인, 시딩 일정, 등급/지표, 자동 분석
- 업무 타임라인 기록과 파일 첨부, 프로젝트별 필터
- 업무보고 검토(검토 요청 → 보완 제출 → 승인/반려, 대시보드 검토 인박스)
- 지출관리(고정/변동 지출, 분류·색상, 결제수단, 영수증, 캘린더, 엑셀 다운로드)
- 프로젝트 분류와 타임라인·업무 연동
- 업무지시(포털 내 지시·수락/거절, 미확인 배지, 재촉 알림)
- 보관함(서류 파일 + 계정 정보, 비밀번호 암호화·2차 비밀번호 게이트)
- 최근 활동 피드(대시보드 카드 + 전체 보기 `/dashboard/activity`)
- PWA와 웹 푸시 알림
- Windows 데스크톱 앱(트레이 상주, 자동 업데이트) — 설정 → 계정에서 내려받기

## 개발 메모

- 날짜와 시간은 Asia/Seoul 기준입니다.
- 사용자 데이터 접근은 Supabase RLS를 전제로 합니다.
- Next.js 16 관련 코드를 바꿀 때는 설치된 Next 문서를 확인합니다.
- 더 자세한 작업 지침은 `AGENTS.md`와 `docs/claude/project-guide.md`를 봅니다.
