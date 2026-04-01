# JDICOMPANY Internal Portal

JDICOMPANY 내부 시스템 포털 (jdi-portal)

## Tech Stack

- **Framework**: Next.js 16.2.2 (App Router)
- **Language**: TypeScript 5 (strict mode)
- **React**: 19.2.4
- **Styling**: Tailwind CSS 4 (PostCSS)
- **Auth/DB**: Supabase (@supabase/ssr + @supabase/supabase-js)
- **Icons**: phosphor-react
- **Fonts**: Pretendard (Korean), Inter (Latin)
- **Lint**: ESLint 9 (eslint-config-next core-web-vitals + typescript)

## Project Structure

```
src/
  app/
    (auth)/login/     # 로그인 페이지
    (auth)/signup/    # 회원가입 페이지
    auth/callback/    # Supabase OAuth callback
    auth/signout/     # 로그아웃 route
    dashboard/        # 대시보드
    layout.tsx        # Root layout (lang="ko")
    page.tsx          # 랜딩 페이지
  components/         # UI 컴포넌트 (Aurora, DotBackground, HeroSection, LoginCard)
  lib/supabase/       # Supabase 클라이언트 (client.ts, server.ts, middleware.ts)
  middleware.ts       # Next.js middleware (Supabase session 갱신)
```

## Commands

```bash
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run start    # 프로덕션 서버
npm run lint     # ESLint 실행
```

## Conventions

- Path alias: `@/*` -> `./src/*`
- 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- 서버 컴포넌트에서 Supabase 사용 시 `createClient()` from `@/lib/supabase/server`
- 클라이언트 컴포넌트에서 Supabase 사용 시 `createClient()` from `@/lib/supabase/client`
- Route group `(auth)`로 인증 관련 페이지 묶음
- 한국어 UI (`lang="ko"`)

## Important Notes

- Next.js 16은 최신 버전으로, 기존 버전과 API가 다를 수 있음. 코드 작성 전 `node_modules/next/dist/docs/`의 가이드를 확인할 것.
- `.env.local` 파일은 커밋하지 않음
