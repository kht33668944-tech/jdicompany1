# 로그인 유지 개선 — 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Android 홈화면 PWA에서 로그인이 7일간 유지되고, 알림 딥링크가 어떤 상황에서도 해당 화면으로 복귀하며, 재로그인 시 이메일이 자동 채워지고, 비밀번호 변경 시에만 재인증을 요구하도록 개선한다.

**Architecture:** 기존 Supabase Auth(@supabase/ssr) 구조 유지. 쿠키 `maxAge` 주입, refresh 재시도, `?next=` 쿼리 파라미터 보존, localStorage 이메일 기억, Service Worker postMessage 수신, sessionStorage 5분 재인증 유예의 6가지 핀셋 수정.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, @supabase/ssr, Service Worker (vanilla JS).

**Safety tag:** `before-login-rework` (커밋 `28d2733`) — 문제 발생 시 `git reset --hard before-login-rework`로 즉시 복구.

**No test framework:** 이 프로젝트는 Jest/Vitest 등 자동 테스트 환경이 없다. 각 task의 검증은 **수동 확인 단계**로 진행한다.

**배포 전략 (3 Phase):** Phase 1 배포 후 3~5일 안정 확인 → Phase 2 → Phase 3. 각 Phase는 독립 커밋·독립 배포·독립 롤백 가능.

---

## Phase 1 — 쿠키 7일 수명 + refresh 재시도

### Task 1.1: 미들웨어 쿠키에 `maxAge` 주입

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

**배경:** 현재 `supabaseResponse.cookies.set(name, value, options)`는 Supabase가 넘겨준 options를 그대로 쓴다. 일부 Android Chrome WebView 환경에서 `maxAge`가 누락돼 쿠키가 세션 쿠키로 저장되는 것이 의심 원인이다. Supabase가 이미 `maxAge`를 넣어주면 그대로 두고, 없으면 7일로 주입한다. 도메인 쿠키(`sb-*`)에만 적용한다.

- [ ] **Step 1.1.1: 상수 선언 및 cookieOptions 헬퍼 추가**

`src/lib/supabase/middleware.ts` 상단(import 아래)에 추가:

```ts
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7일 (초 단위)

function withPersistentMaxAge(
  name: string,
  options: Parameters<
    Parameters<typeof createServerClient>[2]["cookies"]["setAll"]
  >[0][number]["options"]
) {
  // Supabase 인증 쿠키(sb-*)에만 적용. 그 외 쿠키는 원본 옵션 유지.
  if (!name.startsWith("sb-")) return options;
  // 이미 maxAge가 지정돼 있으면 존중
  if (options && "maxAge" in options && typeof options.maxAge === "number") {
    return options;
  }
  return { ...(options ?? {}), maxAge: SESSION_MAX_AGE };
}
```

- [ ] **Step 1.1.2: `setAll` 콜백 수정**

`middleware.ts`의 두 번째 forEach (응답 쿠키 쓰는 부분)를 다음과 같이 교체:

```ts
setAll(cookiesToSet) {
  cookiesToSet.forEach(({ name, value }) =>
    request.cookies.set(name, value)
  );
  supabaseResponse = NextResponse.next({ request });
  cookiesToSet.forEach(({ name, value, options }) =>
    supabaseResponse.cookies.set(name, value, withPersistentMaxAge(name, options))
  );
},
```

- [ ] **Step 1.1.3: 로컬 수동 검증**

1. `npm run dev` 실행
2. Chrome DevTools → Application → Cookies → `http://localhost:3000`
3. 로그인 수행
4. `sb-*` 로 시작하는 쿠키의 `Expires / Max-Age` 칸 확인
5. **기대값:** "Session"이 아니라 "2026-04-15T..." 같은 **7일 후 날짜**여야 함
6. 실패 시: `withPersistentMaxAge` 호출 위치/조건 재확인

- [ ] **Step 1.1.4: 타입 체크 통과 확인**

```bash
npx tsc --noEmit
```

기대: 에러 0. 만약 `Parameters<...>` 추론이 실패하면 options 타입을 `{ maxAge?: number; [key: string]: unknown } | undefined` 로 완화:

```ts
function withPersistentMaxAge(
  name: string,
  options: { maxAge?: number; [key: string]: unknown } | undefined
) {
  if (!name.startsWith("sb-")) return options;
  if (options && typeof options.maxAge === "number") return options;
  return { ...(options ?? {}), maxAge: SESSION_MAX_AGE };
}
```

- [ ] **Step 1.1.5: 커밋**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "인증: Supabase 쿠키 maxAge 7일 명시 (PWA 로그인 유지)"
```

---

### Task 1.2: refresh 실패 일시적 vs 영구 구분 로직

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

**배경:** 미들웨어의 `supabase.auth.getUser()`는 access token이 만료되면 refresh token으로 자동 재발급을 시도한다. 네트워크 일시 오류로 실패하면 `error`가 반환되는데, 현재 코드는 `user` 존재만 보고 없으면 `/login`으로 보낸다. 네트워크 오류까지 로그아웃으로 처리하는 것이 원인 중 하나다.

Supabase `getUser()`의 반환 형태는 `{ data: { user }, error }`. `error?.name === "AuthRetryableFetchError"` 또는 `error?.status` 가 없는 경우(fetch 자체 실패)는 **네트워크 일시 오류**로 간주하고 기존 쿠키를 유지한 채 요청을 통과시킨다.

- [ ] **Step 1.2.1: `updateSession` 내부에서 error 분기**

현재 코드:
```ts
const {
  data: { user },
} = await supabase.auth.getUser();

if (
  !user &&
  !request.nextUrl.pathname.startsWith("/login") &&
  ...
```

다음으로 교체:
```ts
const { data: { user }, error: authError } = await supabase.auth.getUser();

// 네트워크 일시 오류는 "로그아웃"으로 취급하지 않음 — 기존 쿠키/세션 그대로 통과
const isTransientAuthError =
  !!authError &&
  (authError.name === "AuthRetryableFetchError" ||
    authError.message?.toLowerCase().includes("fetch") ||
    (typeof authError.status === "number" && authError.status >= 500));

if (
  !user &&
  !isTransientAuthError &&
  !request.nextUrl.pathname.startsWith("/login") &&
  !request.nextUrl.pathname.startsWith("/signup") &&
  !request.nextUrl.pathname.startsWith("/forgot-password") &&
  !request.nextUrl.pathname.startsWith("/reset-password") &&
  !request.nextUrl.pathname.startsWith("/auth") &&
  !request.nextUrl.pathname.startsWith("/api/keep-warm")
) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}
```

- [ ] **Step 1.2.2: 타입 체크**

```bash
npx tsc --noEmit
```

기대: 에러 0. `authError.status`나 `authError.name` 접근이 안 되면 `(authError as { name?: string; status?: number; message?: string })` 로 명시 캐스팅.

- [ ] **Step 1.2.3: 로컬 수동 검증 (네트워크 차단 시뮬레이션)**

자동화가 어려우므로 **눈으로 확인**만:
1. `npm run dev`
2. 로그인 성공
3. DevTools → Network → "Offline" 체크
4. 페이지 새로고침 → 기존처럼 페이지가 열려야 함 (온라인 때와 달리 느리게라도)
5. Offline 해제 → 다시 정상 동작
6. 쿠키가 삭제되지 않았는지 확인

- [ ] **Step 1.2.4: 커밋**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "인증: 미들웨어에서 refresh 일시 실패 시 세션 유지"
```

---

### Task 1.3: Phase 1 배포 전 최종 점검 + 직원 공지

**Files:**
- 변경 없음 (검토만)

- [ ] **Step 1.3.1: 빌드 성공 확인**

```bash
npm run build
```

기대: 에러 0, 경고 허용. 실패 시 어느 파일에서 발생했는지 확인하고 Task 1.1/1.2 재검토.

- [ ] **Step 1.3.2: git log 확인 (Phase 1 커밋 2개 보여야 함)**

```bash
git log --oneline before-login-rework..HEAD
```

기대 출력 (순서):
```
<hash> 인증: 미들웨어에서 refresh 일시 실패 시 세션 유지
<hash> 인증: Supabase 쿠키 maxAge 7일 명시 (PWA 로그인 유지)
```

- [ ] **Step 1.3.3: 직원 공지 초안 준비**

Phase 1 배포 직후 기존 쿠키 포맷이 달라 **전 직원 1회 자동 로그아웃** 발생. 다음 문구로 공지:

> 📢 JDI 포털 로그인 개선 1단계 배포 안내
>
> 앞으로 한 번 로그인하면 **7일 동안 자동 로그인** 유지됩니다. 오늘 배포 직후 **한 번만** 다시 로그인 부탁드립니다. 문제가 있으면 바로 알려주세요.

- [ ] **Step 1.3.4: Phase 1 배포 & 관찰 (사람이 판단)**

- 배포 수행 (Vercel push)
- **3일 이상** 관찰
- 직원 2명 이상이 "또 로그아웃됨" 호소 시: `git reset --hard before-login-rework` 후 강제 push로 롤백
- 안정 확인되면 Phase 2 진행

---

## Phase 2 — 딥링크 복귀 + 이메일 기억 + SW 메시지 수신

### Task 2.1: 미들웨어 `?next=` 쿼리 파라미터 전달

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

**배경:** 미인증 사용자가 `/dashboard/tasks/123` 같은 보호 경로에 진입 시 현재는 `/login`으로만 리다이렉트한다. 로그인 후 원래 경로로 돌아가려면 원래 pathname을 쿼리에 실어 넘겨야 한다.

- [ ] **Step 2.1.1: 리다이렉트 시 `next` 파라미터 추가**

Task 1.2에서 교체한 리다이렉트 블록을 한 번 더 교체:

```ts
if (
  !user &&
  !isTransientAuthError &&
  !request.nextUrl.pathname.startsWith("/login") &&
  !request.nextUrl.pathname.startsWith("/signup") &&
  !request.nextUrl.pathname.startsWith("/forgot-password") &&
  !request.nextUrl.pathname.startsWith("/reset-password") &&
  !request.nextUrl.pathname.startsWith("/auth") &&
  !request.nextUrl.pathname.startsWith("/api/keep-warm")
) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  // 원래 가려던 경로 보존 (pathname + search)
  const originalPath = request.nextUrl.pathname + request.nextUrl.search;
  if (originalPath && originalPath !== "/") {
    url.searchParams.set("next", originalPath);
  }
  return NextResponse.redirect(url);
}
```

- [ ] **Step 2.1.2: 수동 검증**

1. `npm run dev`
2. 로그아웃 상태에서 주소창에 `http://localhost:3000/dashboard/settings` 입력
3. `/login?next=%2Fdashboard%2Fsettings` 로 리다이렉트되어야 함
4. 브라우저 주소창 확인

- [ ] **Step 2.1.3: 커밋**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "인증: 미인증 리다이렉트에 ?next= 원래 경로 보존"
```

---

### Task 2.2: 로그인 페이지에서 `next` 읽고 안전 검증 후 이동

**Files:**
- Modify: `src/components/LoginCard.tsx`

**배경:** `LoginCard`는 이미 `useSearchParams`를 사용 중. 로그인 성공 시 현재 `router.push("/dashboard")` 하드코딩. `next` 값이 있으면 검증 후 그쪽으로 이동. 외부 URL/스키마는 오픈 리다이렉트 방지를 위해 폴백.

- [ ] **Step 2.2.1: 안전 검증 헬퍼 + 리다이렉트 로직 변경**

`src/components/LoginCard.tsx` 컴포넌트 안에 헬퍼 함수 추가 (return 문 위, handleSubmit 위):

```ts
// next 파라미터 안전 검증: 동일 origin 내부 경로만 허용
const sanitizeNext = (raw: string | null): string => {
  if (!raw) return "/dashboard";
  // `/` 로 시작하고, `//` (스키마리스 URL) 이나 `/\` 로 시작하지 않아야 함
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  // 로그인/인증 경로 자체로 되돌아가지 않도록
  if (raw.startsWith("/login") || raw.startsWith("/signup") || raw.startsWith("/auth")) {
    return "/dashboard";
  }
  return raw;
};
```

`handleSubmit` 안에서 `router.push("/dashboard")` 부분을 교체:

```ts
// 기존:
// router.push("/dashboard");
// router.refresh();

// 교체:
const nextPath = sanitizeNext(searchParams.get("next"));
router.push(nextPath);
router.refresh();
```

- [ ] **Step 2.2.2: 수동 검증 4가지 케이스**

`npm run dev` 후:

1. **정상 경로**: `/login?next=/dashboard/settings` → 로그인 → `/dashboard/settings` 도달 ✅
2. **next 없음**: `/login` → 로그인 → `/dashboard` 도달 ✅
3. **외부 URL (오픈 리다이렉트 시도)**: `/login?next=https://evil.com` → 로그인 → `/dashboard` 폴백 ✅
4. **스키마리스 URL**: `/login?next=//evil.com` → 로그인 → `/dashboard` 폴백 ✅

- [ ] **Step 2.2.3: 타입 체크**

```bash
npx tsc --noEmit
```

기대: 에러 0.

- [ ] **Step 2.2.4: 커밋**

```bash
git add src/components/LoginCard.tsx
git commit -m "인증: 로그인 성공 시 ?next= 경로로 안전 이동"
```

---

### Task 2.3: 로그인 이메일 localStorage 기억

**Files:**
- Modify: `src/components/LoginCard.tsx`

**배경:** 7일 후 재로그인할 때도 이메일은 이미 채워져 있고 비밀번호만 치면 되도록. 키: `jdi:last-email`. 로그인 **성공 시**에만 저장. 비밀번호는 **절대 저장 금지**.

- [ ] **Step 2.3.1: 마운트 시 localStorage에서 이메일 읽기**

`LoginCard.tsx` 상단 import에 `useEffect`, `useRef` 추가 확인 (이미 있음):

```ts
import { useState, useRef, useCallback, useEffect } from "react";
```

컴포넌트 안에 password input에 대한 ref 추가 (cardRef 선언 아래):

```ts
const passwordInputRef = useRef<HTMLInputElement>(null);
```

컴포넌트 상태 선언 아래(`const cardRef ...` 뒤)에 추가:

```ts
// 마지막 로그인 이메일 자동 채움
useEffect(() => {
  if (typeof window === "undefined") return;
  try {
    const lastEmail = window.localStorage.getItem("jdi:last-email");
    if (lastEmail) {
      setUsername(lastEmail);
      setUsernameState(validateUsername(lastEmail) ? "success" : "");
      // 이메일이 있으면 비밀번호 칸으로 포커스 이동
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 50);
    }
  } catch {
    /* localStorage 접근 실패 (프라이빗 모드 등) — 무시 */
  }
}, []);
```

`<input ... id="password" />`에 ref 연결:

```tsx
<input
  ref={passwordInputRef}
  type={showPassword ? "text" : "password"}
  id="password"
  ...
/>
```

- [ ] **Step 2.3.2: 로그인 성공 시 저장**

`handleSubmit` 안, `router.push(nextPath)` **직전**에 추가:

```ts
// 마지막 로그인 이메일 기억 (비밀번호는 저장하지 않음)
try {
  window.localStorage.setItem("jdi:last-email", username);
} catch {
  /* 무시 */
}

const nextPath = sanitizeNext(searchParams.get("next"));
router.push(nextPath);
router.refresh();
```

- [ ] **Step 2.3.3: 수동 검증**

1. `npm run dev`
2. 로그아웃 상태에서 `/login` 진입 → 이메일 칸 비어있음 확인
3. 로그인 성공
4. 로그아웃
5. 다시 `/login` → 이메일 칸에 **직전 이메일이 채워져 있어야** 함
6. 포커스가 비밀번호 칸에 있는지 확인 (커서 위치)
7. DevTools → Application → Local Storage → `jdi:last-email` 키 존재 확인

- [ ] **Step 2.3.4: 커밋**

```bash
git add src/components/LoginCard.tsx
git commit -m "UX: 로그인 이메일 기억 + 비밀번호 칸 자동 포커스"
```

---

### Task 2.4: 명시적 로그아웃 시 localStorage 정리

**Files:**
- Create: `src/components/LogoutButton.tsx`
- 주: 기존 로그아웃 트리거 위치(헤더/사이드바)는 Phase 2 작업 직전에 찾아서 이 컴포넌트로 교체해야 함. 아래 Step 2.4.2 참조.

**배경:** 서버 POST만으로는 localStorage를 지울 수 없음. 클라이언트 컴포넌트 버튼이 localStorage를 먼저 정리한 뒤 `/auth/signout` 으로 POST 하는 wrapper를 만든다. **자동 만료(7일)로 인한 로그아웃은 미들웨어 경로라 localStorage를 건드리지 않으므로 이메일은 그대로 남는다** — 의도대로 동작.

- [ ] **Step 2.4.1: LogoutButton 컴포넌트 생성**

`src/components/LogoutButton.tsx` 신규 파일:

```tsx
"use client";

import { useState, type ReactNode } from "react";

interface LogoutButtonProps {
  children: ReactNode;
  className?: string;
}

/**
 * 로그아웃 버튼.
 * - 명시적 로그아웃 시에만 사용 (사용자 버튼 클릭)
 * - localStorage 의 "jdi:last-email" 을 지워서 다음 로그인 시 이메일 비어있게 함
 * - 자동 쿠키 만료로 인한 로그아웃은 이 경로를 거치지 않으므로 이메일 유지됨 (의도)
 */
export default function LogoutButton({ children, className }: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      window.localStorage.removeItem("jdi:last-email");
    } catch {
      /* 무시 */
    }
    try {
      await fetch("/auth/signout", { method: "POST" });
    } catch {
      /* 무시 */
    }
    // 서버가 /login 으로 redirect 하지만 fetch는 따라가지 않으므로 명시 이동
    window.location.href = "/login";
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={className}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2.4.2: 기존 로그아웃 트리거 위치 찾아 교체**

현재 로그아웃은 `<form action="/auth/signout" method="POST">` 패턴일 가능성 높음. 전수 검색:

```bash
grep -rn "/auth/signout" src/
```

각 매치 위치에서 `<form action="/auth/signout" method="POST"><button...>로그아웃</button></form>` 형태를 찾아 다음으로 교체:

```tsx
import LogoutButton from "@/components/LogoutButton";
// ...
<LogoutButton className="원래_button_className_그대로_복사">
  로그아웃
</LogoutButton>
```

> **중요:** 기존 버튼의 className/아이콘/텍스트를 **그대로 보존**. 스타일이 안 맞으면 UX가 깨짐.

- [ ] **Step 2.4.3: 수동 검증**

1. `npm run dev` → 로그인
2. 로그아웃 버튼 클릭
3. `/login` 으로 이동 확인
4. DevTools → Application → Local Storage → `jdi:last-email` **삭제**되었는지 확인
5. 로그인 페이지의 이메일 칸이 **비어있는지** 확인
6. 다시 로그인 → 로그아웃 → 이메일 비움 재확인 (cycle)

- [ ] **Step 2.4.4: 타입 체크 + 빌드**

```bash
npx tsc --noEmit
npm run build
```

기대: 에러 0.

- [ ] **Step 2.4.5: 커밋**

```bash
git add src/components/LogoutButton.tsx <교체한_파일들>
git commit -m "UX: 명시적 로그아웃 시 저장된 이메일도 정리"
```

---

### Task 2.5: Service Worker 메시지 수신 컴포넌트

**Files:**
- Create: `src/components/NavigationListener.tsx`
- Modify: `src/app/layout.tsx`

**배경:** `public/sw.js`의 `notificationclick`에서 `client.navigate()` 실패 시 `postMessage({ type: "NAVIGATE", link })` 로 폴백하지만, 수신자가 없음. 앱 루트에 리스너 1개 마운트. 경로 검증으로 외부 URL 주입 방지.

- [ ] **Step 2.5.1: NavigationListener 생성**

`src/components/NavigationListener.tsx` 신규 파일:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Service Worker 의 notificationclick 핸들러가 보내는 postMessage 수신.
 * sw.js 에서 `client.navigate()` 가 차단되는 환경(WebAPK 등)을 위한 폴백.
 */
export default function NavigationListener() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== "NAVIGATE") return;
      const link = data.link;
      if (typeof link !== "string") return;
      // 내부 경로만 허용
      if (!link.startsWith("/")) return;
      if (link.startsWith("//") || link.startsWith("/\\")) return;
      router.push(link);
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handler);
    };
  }, [router]);

  return null;
}
```

- [ ] **Step 2.5.2: 레이아웃에 마운트**

`src/app/layout.tsx` 수정. import 추가:

```ts
import NavigationListener from "@/components/NavigationListener";
```

`<body>` 내부에서 `<PWAInit />` 바로 아래 추가:

```tsx
<body className="min-h-full flex flex-col font-sans">
  <PWAInit />
  <NavigationListener />
  {children}
</body>
```

- [ ] **Step 2.5.3: 수동 검증 (개발 모드 SW 미등록 주의)**

SW는 `PWAInit`에서 `NODE_ENV === "production"` 일 때만 등록된다. 로컬 검증은 프로덕션 빌드로:

```bash
npm run build
npm run start
```

1. `http://localhost:3000` 에서 로그인
2. DevTools → Application → Service Workers → `sw.js` 가 activated 상태
3. Console 에 붙여넣기 (테스트용 메시지 강제 발사):
   ```js
   navigator.serviceWorker.controller?.postMessage({ type: "NAVIGATE", link: "/dashboard/settings" })
   ```
   ⚠️ 이 방법은 **자기 자신**에게 보내므로 수신되지 않음. 실제 동작 검증은 **실기기 + 푸시 알림**에서만 가능.
4. 대신 다음을 Console 에 붙여서 리스너 등록 여부만 확인:
   ```js
   // handler 가 등록돼 있는지 직접 확인은 어려움 — 외부 URL 주입 테스트만:
   window.dispatchEvent(new MessageEvent("message", { data: { type: "NAVIGATE", link: "https://evil.com" }}))
   ```
   → 외부 URL 무시, 페이지 이동 없음 확인 (이건 SW 이벤트가 아닌 window 이벤트라 handler가 받지 않음이 정상. 코드 리뷰로 검증)
5. **최종 검증은 Phase 2 전체 배포 후 실기기에서 실제 푸시 알림으로.**

- [ ] **Step 2.5.4: 타입 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 2.5.5: 커밋**

```bash
git add src/components/NavigationListener.tsx src/app/layout.tsx
git commit -m "알림: Service Worker postMessage 수신해 딥링크 이동"
```

---

### Task 2.6: Phase 2 배포 전 최종 점검 + 실기기 테스트 계획

**Files:**
- 변경 없음

- [ ] **Step 2.6.1: 빌드 성공 확인**

```bash
npm run build
```

- [ ] **Step 2.6.2: Phase 2 커밋 리스트 확인**

```bash
git log --oneline before-login-rework..HEAD
```

기대: Phase 1 커밋 2개 + Phase 2 커밋 5개 = 7개

- [ ] **Step 2.6.3: 실기기 테스트 체크리스트 (배포 후 Android 실기기)**

- [ ] 로그인 상태에서 알림 누름 → 해당 화면으로 바로 이동
- [ ] 알림 누름 후 Back 버튼 → 의도한 뒤로 가기 (다른 화면으로 튀지 않음)
- [ ] 로그아웃 상태에서 알림 누름 → 로그인 후 **원래 링크**로 이동
- [ ] 앱 완전 종료 상태에서 알림 누름 → 앱 열리며 해당 화면
- [ ] 로그인 페이지 진입 시 이메일 자동 채움, 포커스 비밀번호 칸
- [ ] 로그아웃 버튼 누름 → 이메일도 같이 비워짐
- [ ] 홈화면 PWA 재실행 시 7일간 로그인 유지 (Phase 1 검증과 동일)

- [ ] **Step 2.6.4: Phase 2 배포 & 관찰 (사람이 판단)**

- Vercel 배포
- 2~3일 관찰. "알림 누르면 빈 화면" 호소 시 롤백.
- 안정 확인 후 Phase 3 진행.

---

## Phase 3 — 비밀번호 변경 재인증 (5분 유예)

### Task 3.1: 재인증 모달 컴포넌트

**Files:**
- Create: `src/components/ReauthModal.tsx`

**배경:** 독립 컴포넌트. props로 `email`(현재 사용자 이메일), `onSuccess`, `onCancel`. Supabase `signInWithPassword`로 현재 비밀번호 검증. 성공 시 `sessionStorage["jdi:reauth-at"]`에 현재 시각 기록 후 `onSuccess` 호출.

- [ ] **Step 3.1.1: 컴포넌트 생성**

`src/components/ReauthModal.tsx` 신규 파일:

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ReauthModalProps {
  email: string;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * 민감 작업(비밀번호 변경 등) 진입 전 현재 비밀번호 재확인.
 * 성공 시 sessionStorage 에 타임스탬프 기록 → 5분 유예는 호출 측에서 처리.
 */
export default function ReauthModal({ email, onSuccess, onCancel }: ReauthModalProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError(
          authError.message === "Invalid login credentials"
            ? "비밀번호가 올바르지 않습니다."
            : authError.message
        );
        return;
      }
      try {
        window.sessionStorage.setItem("jdi:reauth-at", String(Date.now()));
      } catch {
        /* 무시 */
      }
      onSuccess();
    } catch {
      setError("본인 확인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-base font-bold text-slate-800 mb-1">본인 확인</h3>
        <p className="text-xs text-slate-500 mb-4">
          보안을 위해 현재 비밀번호를 한 번만 확인할게요.
        </p>
        <form onSubmit={handleConfirm} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            placeholder="현재 비밀번호"
            autoFocus
            className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-indigo-400 text-sm"
          />
          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors disabled:opacity-40"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              className="flex-1 py-2.5 rounded-xl bg-indigo-500 text-white font-bold text-sm hover:bg-indigo-600 transition-colors disabled:opacity-40"
            >
              {loading ? "확인 중..." : "확인"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.1.2: 타입 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 3.1.3: 커밋**

```bash
git add src/components/ReauthModal.tsx
git commit -m "보안: 재인증 모달 컴포넌트"
```

---

### Task 3.2: 비밀번호 변경 폼에 재인증 게이트 삽입

**Files:**
- Modify: `src/components/dashboard/settings/AccountSection.tsx`

**배경:** 비번 변경은 `AccountSection` 안의 인라인 `<form onSubmit={handlePasswordChange}>`. submit 시점에 sessionStorage `jdi:reauth-at` 확인. 5분(300초) 이내면 바로 통과, 아니면 모달 띄우고 통과 시 실제 변경 수행.

- [ ] **Step 3.2.1: import + state 추가**

`AccountSection.tsx` 상단 import에 추가:

```ts
import ReauthModal from "@/components/ReauthModal";
```

컴포넌트 함수 초입 state 선언부에 추가:

```ts
const [reauthOpen, setReauthOpen] = useState(false);
const REAUTH_WINDOW_MS = 5 * 60 * 1000; // 5분
```

- [ ] **Step 3.2.2: 재인증 여부 판단 헬퍼**

`handlePasswordChange` 바로 위에 추가:

```ts
const needsReauth = (): boolean => {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.sessionStorage.getItem("jdi:reauth-at");
    if (!raw) return true;
    const at = Number(raw);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at > REAUTH_WINDOW_MS;
  } catch {
    return true;
  }
};

const actuallyChangePassword = async () => {
  setLoading(true);
  setFeedback(null);
  try {
    await updatePassword(newPassword);
    setNewPassword("");
    setConfirmPassword("");
    setFeedback({ type: "success", message: "비밀번호가 변경되었습니다." });
  } catch {
    setFeedback({ type: "error", message: "비밀번호 변경에 실패했습니다." });
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 3.2.3: `handlePasswordChange` 수정**

기존 함수에서 실제 변경 호출 부분만 떼어내고 게이트 추가:

```ts
const handlePasswordChange = async (e: React.FormEvent) => {
  e.preventDefault();
  if (newPassword.length < 8) {
    setFeedback({ type: "error", message: "비밀번호는 8자 이상이어야 합니다." });
    return;
  }
  if (newPassword !== confirmPassword) {
    setFeedback({ type: "error", message: "새 비밀번호가 일치하지 않습니다." });
    return;
  }

  if (needsReauth()) {
    setReauthOpen(true);
    return;
  }
  await actuallyChangePassword();
};
```

- [ ] **Step 3.2.4: 모달 렌더링 추가**

`return (` 바로 다음 `<section ...>` 내부 최상단(혹은 최하단)에 추가:

```tsx
{reauthOpen && (
  <ReauthModal
    email={profile.email}
    onSuccess={async () => {
      setReauthOpen(false);
      await actuallyChangePassword();
    }}
    onCancel={() => setReauthOpen(false)}
  />
)}
```

- [ ] **Step 3.2.5: 수동 검증**

1. `npm run dev` → 로그인 → `/dashboard/settings`
2. 새 비밀번호 2칸 입력 → "비밀번호 업데이트" 클릭
3. **모달 등장** 확인 (첫 시도)
4. 틀린 비번 → 빨간 에러 → 진행 차단 확인
5. 맞는 비번 → 모달 닫힘 → "비밀번호가 변경되었습니다" 토스트 확인
6. **1분 내 재시도**: 새 비밀번호 입력 후 업데이트 → **모달 생략**, 바로 성공 확인 (5분 유예)
7. 탭 닫고 다시 열어 재시도 → **모달 다시 등장** 확인 (sessionStorage 초기화)

- [ ] **Step 3.2.6: 타입 체크 + 빌드**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 3.2.7: 커밋**

```bash
git add src/components/dashboard/settings/AccountSection.tsx
git commit -m "보안: 비밀번호 변경 시 재인증 요구 (5분 유예)"
```

---

### Task 3.3: Phase 3 배포 최종 점검

**Files:**
- 변경 없음

- [ ] **Step 3.3.1: 전체 커밋 확인**

```bash
git log --oneline before-login-rework..HEAD
```

기대: Phase 1(2) + Phase 2(5) + Phase 3(3) = 10개 커밋.

- [ ] **Step 3.3.2: Phase 3 배포 (사람이 판단)**

- Vercel 배포
- 실기기에서 본인 비밀번호를 테스트용으로 1회 변경 → 정상 동작 확인 후 원래 비번으로 되돌림
- "비밀번호 변경 자체가 막힘" 호소 시 롤백

---

## 전체 완료 체크리스트

- [ ] Phase 1 배포 후 3일 이상 안정, "로그아웃됨" 호소 없음
- [ ] Phase 2 배포 후 실기기에서 알림 딥링크 4가지 케이스 전부 성공
- [ ] Phase 2 배포 후 이메일 자동 채움 + 로그아웃 시 이메일 삭제 양쪽 동작
- [ ] Phase 3 배포 후 비밀번호 변경 가능 + 5분 유예 동작
- [ ] 7일차 실기기에서 자동 로그인 여전히 유지됨 확인 (최종 관찰)

완료 후 `before-login-rework` 태그는 1주일 뒤까지 보존 후 삭제 가능:

```bash
# 1주일 안정 확인 후에만
git tag -d before-login-rework
git push origin :refs/tags/before-login-rework  # 원격에 푸시했었다면
```

---

## 비-목표 재확인

이 플랜에서 **하지 않는 것**:
- Supabase Auth 교체 / 자체 JWT 구조
- 생체 인증 (WebAuthn)
- OAuth 소셜 로그인
- 관리자/급여/입사일 등 비-비밀번호 민감 기능 재인증 (스펙 섹션 9 참조)
- 자동 테스트 인프라 구축 (프로젝트 방침상 수동 검증 유지)
