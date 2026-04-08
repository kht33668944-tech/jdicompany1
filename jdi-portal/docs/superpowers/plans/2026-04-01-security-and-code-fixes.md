# Security & Code Quality Fixes Implementation Plan

**Goal:** Fix all 10 identified issues (3 Critical, 7 Important) from the code review — security vulnerabilities, routing bugs, and code quality improvements.

**Architecture:** Patch existing files in-place. No new dependencies. Keep the existing Server/Client Component split pattern from login page.

**Tech Stack:** Next.js 16, Supabase SSR, TypeScript, Tailwind CSS 4

---

### Task 1: Fix Open Redirect Vulnerability in Auth Callback

**Files:**
- Modify: `src/app/auth/callback/route.ts`

- [ ] **Step 1: Fix the redirect validation**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Prevent open redirect — only allow relative paths on same origin
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
```

---

### Task 2: Fix Root Route Redirect Loop

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace unconditional redirect with auth-aware routing**

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
```

---

### Task 3: Add Environment Variable Runtime Validation

**Files:**
- Modify: `src/lib/supabase/client.ts`
- Modify: `src/lib/supabase/server.ts`
- Modify: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Add validation to all three Supabase client files**

client.ts:
```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set"
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
```

server.ts — same pattern with validated variables.

middleware.ts — same pattern with validated variables.

---

### Task 4: Add Error Handling to Sign Out Route

**Files:**
- Modify: `src/app/auth/signout/route.ts`

- [ ] **Step 1: Add try/catch for signOut**

```typescript
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function POST() {
  const supabase = await createClient();

  try {
    await supabase.auth.signOut();
  } catch {
    // Sign out failed, but still redirect to login
  }

  redirect("/login");
}
```

---

### Task 5: Improve Login Validation Logic

**Files:**
- Modify: `src/components/LoginCard.tsx:24`

- [ ] **Step 1: Fix validateUsername to properly check email or employee ID**

```typescript
const validateUsername = (value: string) => {
  // Email format
  if (value.includes("@")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
  // Employee ID: 3+ chars
  return value.length >= 3;
};
```

---

### Task 6: Convert Dashboard Logout to Server Action

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Replace native form POST with Server Action**

Add a server action inline using `"use server"` directive:

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    // ... existing JSX with form action={signOut} instead of action="/auth/signout" method="post"
  );
}
```

---

### Task 7: Remove Unused phosphor-react Dependency

- [ ] **Step 1: Run `npm uninstall phosphor-react`**

---

### Task 8: Refactor Signup Page to Server/Client Component Split

**Files:**
- Create: `src/components/SignupCard.tsx` (Client Component, extracted from signup page)
- Modify: `src/app/(auth)/signup/page.tsx` (Server Component wrapper with metadata)

- [ ] **Step 1: Extract SignupCard client component and make signup page a Server Component with metadata**

---

### Task 9: Optimize Font Loading with next/font

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Replace CDN links with next/font**

```typescript
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/static/woff2/Pretendard-Regular.woff2",
  variable: "--font-pretendard",
  // fallback if local font not available — keep CDN as fallback
});
```

Note: Pretendard is loaded via CDN, not as an npm package. We'll keep the CDN link but fix the `as="style"` preload hint issue, and use next/font for Inter only.

---

### Task 10: Verify .env.local is gitignored

- [ ] **Step 1: Confirm `.env*` pattern in `.gitignore` covers `.env.local`**

Already confirmed: `.gitignore` has `.env*` pattern. Not a git repo currently, so no history leak.
