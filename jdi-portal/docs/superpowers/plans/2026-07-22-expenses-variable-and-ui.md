# 지출관리 변동성 고정지출 + 색상/레이아웃/팝업 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지출관리에 "변동성 고정지출"(매달 금액이 달라지는 항목)을 도입하고, 분류별 색상 자동화·캘린더 색 구분·레이아웃 정리·팝업 콤팩트화를 함께 적용한다.

**Architecture:** 기존 `expenses` 도메인(도메인 모듈 패턴: `src/lib/expenses/*` + `src/components/dashboard/expenses/*` + `supabase/migrations`)을 확장한다. 색상은 "분류 이름 하드코딩"에서 "분류별 `color_key` 저장 + 팔레트 조회"로 전환한다. 변동성은 `recurring_expenses.is_variable`와 `expenses.amount_pending` 두 플래그 + 자동화 함수(`process_recurring_expenses`) 수정으로 구현한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4, Supabase(Postgres + RLS + pg_cron), 테스트는 `node --test`(node:test) 정적/단위 검사.

## Global Constraints

- Node ≥ 22, TypeScript strict. `@/*` → `jdi-portal/src/*`.
- 마이그레이션은 순차 번호. **현재 최신은 `098`** 이므로 새 파일은 **`099`부터** 추가한다(기존 수정 금지).
- KST 기준: SQL에서 `NOW()`/`CURRENT_DATE` 직접 사용 금지 → `(NOW() AT TIME ZONE 'Asia/Seoul')::DATE`.
- RLS: 사용자 데이터 테이블은 RLS 유지 + `public.is_approved_user()` 반영. Supabase `error`는 항상 처리.
- Tailwind JIT: 색상 클래스는 **반드시 리터럴 문자열**로 존재해야 감지된다(동적 문자열 조합 `bg-${x}-50` 금지). 팔레트는 리터럴 객체로 둔다.
- 성능 불변조건 유지: 작업 후 `cd jdi-portal && npm run build`(타입) + `npm run test:performance`(회귀 40검사) 통과 필수.
- 사용자가 요청하지 않은 `git push` 금지. 각 Task 끝에서 로컬 커밋만 한다(배포는 사용자 확인 후 별도).

---

## 설계 요약 (브레인스토밍 확정본)

1. **변동성 고정지출**: 등록 시 "변동성" 체크 → 결제일에 지출내역에 **금액 0 + `amount_pending=true`(입력 필요)** 로 자동 생성 → **승인된 직원 누구나** 그 달 금액만 입력해 확정 → 지출내역에서 파랑 `고정`/주황 `변동`/빨강 `입력 필요` 배지로 구분 + 미입력 N건 상단 경고 + 결제일 담당자 알림.
2. **분류별 색 구분**: 캘린더가 지금 전부 파란색 → 분류색 적용(지출내역과 동일 팔레트).
3. **새 분류 자동 색상**: 분류 추가 시 안 쓰인 팔레트 색을 자동 배정(현재는 회색 fallback).
4. **레이아웃 정리**: "고정 지출 등록" 버튼을 "지출 관리" 제목·탭과 같은 줄로 올리고, 캘린더 날짜칸 세로 높이를 키운다.
5. **팝업 콤팩트**: 고정지출·지출수정·빠른입력 3폼을 2열 그리드로 통일.

**안 건드림**: 상단 요약(월 고정비 총액·활성 항목·이번 달 기록), 하단 "분류별 고정비".

---

## 파일 구조

**신규 생성**
- `supabase/migrations/099_expense_category_colors.sql` — `expense_categories.color_key` 컬럼 + 기존 분류 backfill.
- `supabase/migrations/100_recurring_variable.sql` — `recurring_expenses.is_variable`, `expenses.amount_pending` + `process_recurring_expenses` 수정.
- `src/lib/expenses/colors.ts` — 색 팔레트(리터럴) + `categoryStyle(colorKey)` + `pickNextColorKey(used)` 순수 로직.
- `scripts/expense-category-color.test.mjs` — 색 배정/팔레트 단위·정적 테스트.
- `scripts/expense-variable.test.mjs` — 변동성 정적 가드 테스트.

**수정**
- `src/lib/expenses/constants.ts` — `CATEGORY_STYLE`(이름 기반) 제거 대신 `colors.ts` 재노출/정리.
- `src/lib/expenses/types.ts` — `ExpenseCategory.color_key`, `Expense.amount_pending`, `RecurringExpense.is_variable`, `RecurringInput.is_variable`.
- `src/lib/expenses/queries.ts` — select에 `color_key`, `amount_pending` 포함.
- `src/lib/expenses/actions.ts` — `createExpenseCategory` 자동 색 배정, 변동성 검증, 신규 `confirmExpenseAmount`.
- `src/components/dashboard/expenses/CategoryField.tsx` — 색 조회를 `color_key` 기반으로.
- `src/components/dashboard/expenses/ExpenseList.tsx` — 색 `color_key` 기반 + 변동성/입력필요 배지 + 인라인 금액 입력 + 미입력 경고.
- `src/components/dashboard/expenses/RecurringCalendar.tsx` — 분류색 적용 + 칸 높이 확대.
- `src/components/dashboard/expenses/RecurringTab.tsx` — 등록 버튼 제거(부모 트리거) + 목록 분류색.
- `src/components/dashboard/expenses/RecurringFormModal.tsx` — 변동성 토글 + 2열 그리드.
- `src/components/dashboard/expenses/ExpenseEditModal.tsx` — 2열 그리드.
- `src/components/dashboard/expenses/ExpenseQuickInput.tsx` — 2열 그리드.
- `src/components/dashboard/expenses/ExpensesPageClient.tsx` — 헤더에 등록 버튼 + RecurringTab 오픈 신호.

---

## Phase 1 — 분류 색상 인프라 (② ③ 의 토대)

### Task 1.1: 색 팔레트 + 배정 로직 (순수 모듈)

**Files:**
- Create: `src/lib/expenses/colors.ts`
- Test: `scripts/expense-category-color.test.mjs`

**Interfaces:**
- Produces:
  - `COLOR_KEYS: readonly string[]` — 팔레트 색키 순서.
  - `categoryStyle(colorKey: string | null | undefined): { card: string; dot: string }` — 색키→Tailwind 클래스(없으면 slate fallback).
  - `pickNextColorKey(usedKeys: string[]): string` — 안 쓰인 첫 색키, 다 쓰였으면 `COLOR_KEYS[usedKeys.length % COLOR_KEYS.length]`.

- [ ] **Step 1: 실패 테스트 작성** — `scripts/expense-category-color.test.mjs`

```js
import assert from "node:assert/strict";
import test from "node:test";
import { COLOR_KEYS, categoryStyle, pickNextColorKey } from "../src/lib/expenses/colors.ts";

test("categoryStyle 은 알려진 색키에 리터럴 클래스를 준다", () => {
  const s = categoryStyle("violet");
  assert.equal(s.card, "bg-violet-50/70 border-violet-100");
  assert.equal(s.dot, "bg-violet-400");
});

test("categoryStyle 은 없는/빈 색키에 slate fallback 을 준다", () => {
  assert.equal(categoryStyle(null).dot, "bg-slate-300");
  assert.equal(categoryStyle("nope").dot, "bg-slate-300");
});

test("pickNextColorKey 는 안 쓰인 첫 색을 고른다", () => {
  const next = pickNextColorKey([COLOR_KEYS[0], COLOR_KEYS[1]]);
  assert.equal(next, COLOR_KEYS[2]);
});

test("pickNextColorKey 는 모두 쓰이면 순환한다", () => {
  const next = pickNextColorKey([...COLOR_KEYS]);
  assert.equal(next, COLOR_KEYS[COLOR_KEYS.length % COLOR_KEYS.length]);
});
```

> 참고: node:test 는 `--experimental-strip-types`(Node 22+) 로 `.ts` 를 직접 import 한다. 실행 시 플래그를 붙인다(아래 Step 2). 안 되면 `colors.ts` 로직을 `.mjs` 로 복제하지 말고, 테스트를 정적 문자열 검사로 대체(파일에 `bg-slate-300` fallback, `COLOR_KEYS` 배열 존재 확인)한다.

- [ ] **Step 2: 실패 확인**

Run: `cd jdi-portal && node --experimental-strip-types --test scripts/expense-category-color.test.mjs`
Expected: FAIL (`colors.ts` 없음 → import 에러)

- [ ] **Step 3: 구현** — `src/lib/expenses/colors.ts`

```ts
/**
 * 분류(카테고리) 색상 팔레트.
 * ⚠️ Tailwind JIT 감지를 위해 클래스는 반드시 리터럴 문자열로 둔다. (동적 조합 금지)
 * color_key 는 expense_categories.color_key 에 저장되며, UI 는 categoryStyle 로 조회한다.
 */
export interface CategoryStyle {
  /** 카드 배경 + 테두리 */
  card: string;
  /** 분류명 앞 점 색 */
  dot: string;
}

const PALETTE: Record<string, CategoryStyle> = {
  violet: { card: "bg-violet-50/70 border-violet-100", dot: "bg-violet-400" },
  blue: { card: "bg-blue-50/70 border-blue-100", dot: "bg-blue-400" },
  indigo: { card: "bg-indigo-50/70 border-indigo-100", dot: "bg-indigo-400" },
  sky: { card: "bg-sky-50/70 border-sky-100", dot: "bg-sky-400" },
  teal: { card: "bg-teal-50/70 border-teal-100", dot: "bg-teal-400" },
  emerald: { card: "bg-emerald-50/70 border-emerald-100", dot: "bg-emerald-400" },
  amber: { card: "bg-amber-50/70 border-amber-100", dot: "bg-amber-400" },
  orange: { card: "bg-orange-50/70 border-orange-100", dot: "bg-orange-400" },
  rose: { card: "bg-rose-50/70 border-rose-100", dot: "bg-rose-400" },
  pink: { card: "bg-pink-50/70 border-pink-100", dot: "bg-pink-400" },
  cyan: { card: "bg-cyan-50/70 border-cyan-100", dot: "bg-cyan-400" },
  lime: { card: "bg-lime-50/70 border-lime-100", dot: "bg-lime-400" },
  fuchsia: { card: "bg-fuchsia-50/70 border-fuchsia-100", dot: "bg-fuchsia-400" },
};

const FALLBACK: CategoryStyle = { card: "bg-slate-50/80 border-slate-200", dot: "bg-slate-300" };

/** 자동 배정 순서 (자주 쓰는 색을 앞쪽에) */
export const COLOR_KEYS: readonly string[] = [
  "violet", "blue", "indigo", "sky", "teal", "emerald",
  "amber", "orange", "rose", "pink", "cyan", "lime", "fuchsia",
];

export function categoryStyle(colorKey: string | null | undefined): CategoryStyle {
  if (!colorKey) return FALLBACK;
  return PALETTE[colorKey] ?? FALLBACK;
}

/** 아직 안 쓰인 첫 색키. 모두 쓰였으면 개수 기준으로 순환. */
export function pickNextColorKey(usedKeys: string[]): string {
  const used = new Set(usedKeys);
  for (const key of COLOR_KEYS) {
    if (!used.has(key)) return key;
  }
  return COLOR_KEYS[usedKeys.length % COLOR_KEYS.length];
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd jdi-portal && node --experimental-strip-types --test scripts/expense-category-color.test.mjs`
Expected: PASS (4 tests). 만약 `--experimental-strip-types` 미지원이면 테스트를 정적 문자열 검사로 바꾼 뒤 `node --test` 로 통과시킨다.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/expenses/colors.ts scripts/expense-category-color.test.mjs
git commit -m "기능: 지출 분류 색 팔레트 + 자동 배정 로직(colors.ts)"
```

---

### Task 1.2: `color_key` 컬럼 마이그레이션 + 기존 분류 backfill

**Files:**
- Create: `supabase/migrations/099_expense_category_colors.sql`

**Interfaces:**
- Produces: `expense_categories.color_key text` (nullable). 기존 9개 분류에 색키 채움.

- [ ] **Step 1: 마이그레이션 작성** — `supabase/migrations/099_expense_category_colors.sql`

```sql
-- 099_expense_category_colors.sql
-- 분류별 색상 저장(color_key) + 기존 분류 backfill (src/lib/expenses/colors.ts 팔레트와 일치)

ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS color_key text;

-- 기존 분류 → 색키 매핑 (092 이후 이름 기준: '세금','공과금' 분리 반영)
UPDATE public.expense_categories SET color_key = 'rose'    WHERE name = '세금'         AND color_key IS NULL;
UPDATE public.expense_categories SET color_key = 'amber'   WHERE name = '공과금'       AND color_key IS NULL;
UPDATE public.expense_categories SET color_key = 'pink'    WHERE name = '급여'         AND color_key IS NULL;
UPDATE public.expense_categories SET color_key = 'violet'  WHERE name = '임차료·관리비' AND color_key IS NULL;
UPDATE public.expense_categories SET color_key = 'blue'    WHERE name = '구독·소프트웨어' AND color_key IS NULL;
UPDATE public.expense_categories SET color_key = 'indigo'  WHERE name = '광고비'       AND color_key IS NULL;
UPDATE public.expense_categories SET color_key = 'sky'     WHERE name = '물류·배송'    AND color_key IS NULL;
UPDATE public.expense_categories SET color_key = 'teal'    WHERE name = '비품·소모품'  AND color_key IS NULL;
UPDATE public.expense_categories SET color_key = 'orange'  WHERE name = '식비·복리후생' AND color_key IS NULL;
-- '기타' 및 사용자가 이미 추가한 분류: 남은 팔레트 색을 순서대로 배정
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY sort_order, name) AS rn
  FROM public.expense_categories
  WHERE color_key IS NULL
),
palette AS (
  SELECT key, row_number() OVER () AS pn
  FROM unnest(ARRAY['emerald','cyan','lime','fuchsia','violet','blue','indigo','sky','teal','amber','orange','rose','pink']) AS key
)
UPDATE public.expense_categories c
SET color_key = p.key
FROM ordered o
JOIN palette p ON ((o.rn - 1) % (SELECT count(*) FROM palette)) + 1 = p.pn
WHERE c.id = o.id;
```

- [ ] **Step 2: 로컬/원격 적용** (사용자 확인 후)

Run: `cd jdi-portal && printf 'y\n' | npx supabase db push --linked`
Expected: `099_expense_category_colors.sql` applied. 에러 없이 완료.

> ⚠️ 운영 DB 변경이므로 **실행 전 사용자에게 알린다.** 적용 후 Supabase 대시보드에서 `expense_categories.color_key` 가 모든 행에 채워졌는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/099_expense_category_colors.sql
git commit -m "DB: expense_categories.color_key 추가 + 기존 분류 색 backfill (099)"
```

---

### Task 1.3: 타입·쿼리·상수 연결

**Files:**
- Modify: `src/lib/expenses/types.ts`
- Modify: `src/lib/expenses/queries.ts`
- Modify: `src/lib/expenses/constants.ts`

**Interfaces:**
- Consumes: `categoryStyle` (Task 1.1)
- Produces: `ExpenseCategory.color_key: string | null`; queries 가 `color_key` 를 select.

- [ ] **Step 1: 타입 추가** — `src/lib/expenses/types.ts`, `ExpenseCategory` 인터페이스에 필드 추가

```ts
export interface ExpenseCategory {
  id: string;
  name: string;
  is_sensitive: boolean;
  sort_order: number;
  is_active: boolean;
  color_key: string | null;
}
```

- [ ] **Step 2: 쿼리 select 확장** — `src/lib/expenses/queries.ts`

`getExpenseCategories` 의 select 를 교체:
```ts
    .select("id, name, is_sensitive, sort_order, is_active, color_key")
```
`getExpensesByRange`/`getRecurringExpenses` 의 category 조인도 `color_key` 포함하도록 교체:
```ts
  category:expense_categories(id, name, is_sensitive, sort_order, is_active, color_key),
```
(두 함수 모두 `EXPENSE_SELECT` 상수와 `getRecurringExpenses` 인라인 select 두 곳.)

- [ ] **Step 3: 상수 정리** — `src/lib/expenses/constants.ts`

`CategoryStyle` 인터페이스와 `CATEGORY_STYLE`/`CATEGORY_STYLE_FALLBACK`(이름 기반)을 **삭제**하고, 색은 `colors.ts` 로 일원화한다. `EXPENSE_SOURCE_LABEL`, `PAYMENT_METHOD_SUGGESTIONS` 는 유지. 파일 상단에서 `colors.ts` 재노출:
```ts
export { categoryStyle, COLOR_KEYS } from "./colors";
export type { CategoryStyle } from "./colors";
```

- [ ] **Step 4: 타입 빌드 확인**

Run: `cd jdi-portal && npm run build`
Expected: 이 시점엔 `CATEGORY_STYLE` 참조 파일(ExpenseList/CategoryField/RecurringTab)이 아직 안 고쳐져 **타입 에러가 남는다** → Task 1.4 에서 함께 해결하므로, Step 4 는 Task 1.4 완료 후 한 번에 통과시킨다. (여기서는 커밋만.)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/expenses/types.ts src/lib/expenses/queries.ts src/lib/expenses/constants.ts
git commit -m "기능: 분류 color_key 타입·쿼리 연결 + 색 상수 colors.ts 일원화"
```

---

### Task 1.4: 새 분류 추가 시 자동 색 배정 (③)

**Files:**
- Modify: `src/lib/expenses/actions.ts`
- Modify: `src/components/dashboard/expenses/CategoryField.tsx`

**Interfaces:**
- Consumes: `pickNextColorKey`, `categoryStyle` (Task 1.1)
- Produces: `createExpenseCategory` 가 `color_key` 를 자동 저장. CategoryField 가 `c.color_key` 로 점 색 표시.

- [ ] **Step 1: actions 수정** — `src/lib/expenses/actions.ts`

상단 import 추가:
```ts
import { pickNextColorKey } from "./colors";
```
`createExpenseCategory` 를 교체(자동 색 배정 + 재활성화 시에도 색 없으면 채움):
```ts
export async function createExpenseCategory(name: string) {
  const { supabase, userId } = await getSessionUserId();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("분류 이름을 입력해주세요.");

  // 현재 쓰이는 색키 조회 → 안 쓰인 색 배정
  const { data: all, error: listError } = await supabase
    .from("expense_categories")
    .select("id, name, is_active, is_sensitive, color_key");
  if (listError) throw new Error(`분류 확인에 실패했습니다: ${listError.message}`);

  const usedKeys = (all ?? []).map((c) => c.color_key).filter((k): k is string => !!k);
  const nextKey = pickNextColorKey(usedKeys);

  const existing = (all ?? []).find((c) => c.name === trimmed);
  if (existing) {
    if (existing.is_sensitive || existing.is_active) {
      throw new Error("이미 등록된 분류입니다.");
    }
    const { error } = await supabase
      .from("expense_categories")
      .update({ is_active: true, color_key: existing.color_key ?? nextKey })
      .eq("id", existing.id);
    if (error) throw new Error(`분류 추가에 실패했습니다: ${error.message}`);
    return;
  }

  const { error } = await supabase
    .from("expense_categories")
    .insert({ name: trimmed, is_sensitive: false, sort_order: 50, color_key: nextKey, created_by: userId });
  if (error) {
    if (error.code === "23505") throw new Error("이미 등록된 분류입니다.");
    throw new Error(`분류 추가에 실패했습니다: ${error.message}`);
  }
}
```

- [ ] **Step 2: CategoryField 색 조회 교체** — `src/components/dashboard/expenses/CategoryField.tsx`

import 교체: `import { CATEGORY_STYLE } from "@/lib/expenses/constants";` → `import { categoryStyle } from "@/lib/expenses/constants";`

options 의 dotClass 교체:
```ts
  const options: SelectOption[] = categories.map((c) => ({
    value: c.id,
    label: c.name,
    dotClass: categoryStyle(c.color_key).dot,
  }));
```
관리 목록의 점 교체(라인 126 부근):
```tsx
                    <span className={`inline-block w-2 h-2 rounded-full ${categoryStyle(c.color_key).dot}`} />
```

- [ ] **Step 3: ExpenseList / RecurringTab 색 조회 교체 (남은 CATEGORY_STYLE 참조 제거)**

`ExpenseList.tsx`:
- import: `EXPENSE_SOURCE_LABEL, CATEGORY_STYLE, CATEGORY_STYLE_FALLBACK` → `EXPENSE_SOURCE_LABEL` 만 두고 `import { categoryStyle } from "@/lib/expenses/constants";` 추가.
- categoryOptions dot: `dotClass: categoryStyle(c.color_key).dot`
- 카드 스타일(라인 109): `const style = categoryStyle(e.category?.color_key);`

`RecurringTab.tsx`:
- import: `import { CATEGORY_STYLE } from "@/lib/expenses/constants";` → `import { categoryStyle } from "@/lib/expenses/constants";`
- categoryOptions(라인 117): `dotClass: categoryStyle(c.color_key).dot`

- [ ] **Step 4: 전체 타입 빌드 통과**

Run: `cd jdi-portal && npm run build`
Expected: PASS (더 이상 `CATEGORY_STYLE` 미정의 참조 없음). 에러 시 남은 참조를 grep: `git grep -n CATEGORY_STYLE src/` → 모두 `categoryStyle(...)` 로 교체.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/expenses/actions.ts src/components/dashboard/expenses/CategoryField.tsx src/components/dashboard/expenses/ExpenseList.tsx src/components/dashboard/expenses/RecurringTab.tsx
git commit -m "기능: 새 분류 추가 시 팔레트 색 자동 배정 + 색 조회 color_key 기반 전환(③)"
```

---

## Phase 2 — 캘린더 분류색 적용 (②)

### Task 2.1: RecurringCalendar 분류색 + 칸 높이 확대 (② ④의 캘린더 부분)

**Files:**
- Modify: `src/components/dashboard/expenses/RecurringCalendar.tsx`

**Interfaces:**
- Consumes: `categoryStyle` (Task 1.1). `r.category?.color_key` (Task 1.3 쿼리).

- [ ] **Step 1: import 추가**

```ts
import { categoryStyle } from "@/lib/expenses/constants";
```

- [ ] **Step 2: 데스크톱 항목 칩에 분류색 적용** — 라인 136-147 의 항목 버튼 교체

기존 `bg-blue-50 hover:bg-blue-100` + `text-blue-700`/`text-blue-500` 하드코딩을 분류색으로:
```tsx
                {items.slice(0, 2).map((r) => {
                  const cs = categoryStyle(r.category?.color_key);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onSelectRow(r)}
                      className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-md border text-[13px] leading-tight transition-colors hover:brightness-95 ${cs.card}`}
                      title={`${r.name} · ${formatKrw(Number(r.amount_krw))}`}
                    >
                      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${cs.dot}`} />
                      <span className="font-bold text-slate-700 truncate flex-1 text-left">{r.name}</span>
                      <span className="text-slate-500 shrink-0 font-medium">{Number(r.amount_krw).toLocaleString("ko-KR")}</span>
                    </button>
                  );
                })}
```

- [ ] **Step 3: 칸 세로 높이 확대 (④)** — 빈 셀/날짜 셀의 `md:min-h-[104px]` 를 `md:min-h-[132px]` 로 (라인 98, 111 두 곳). 모바일 `aspect-square` 는 유지.

라인 98: `className="aspect-square md:aspect-auto md:min-h-[132px]"`
라인 111: `className={`aspect-square md:aspect-auto md:min-h-[132px] rounded-xl border overflow-hidden transition-all ${`

또한 데스크톱에서 항목을 2개→3개까지 보이게 여유가 생기므로 `items.slice(0, 2)` 를 `items.slice(0, 3)` 로, `items.length > 2` 를 `items.length > 3`, `+${items.length - 2}` 를 `+${items.length - 3}` 로 조정(라인 136·148·154).

- [ ] **Step 4: 모바일 요약 색(선택)** — 모바일 칸은 총액만 표시하므로 색 변경 없이 유지(가독성). 변경하지 않는다.

- [ ] **Step 5: 빌드 + 수동 확인**

Run: `cd jdi-portal && npm run build`
Expected: PASS.
수동: `npm run dev` → 고정 지출 탭 → 캘린더에서 항목이 **분류별 색**으로 보이고 칸이 더 커졌는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/components/dashboard/expenses/RecurringCalendar.tsx
git commit -m "기능: 고정지출 캘린더 분류색 적용 + 날짜칸 높이 확대(②④)"
```

---

## Phase 3 — 변동성 고정지출 (①, 가장 큼)

### Task 3.1: DB — 변동성/미확정 플래그 + 자동화 함수 수정

**Files:**
- Create: `supabase/migrations/100_recurring_variable.sql`

**Interfaces:**
- Produces: `recurring_expenses.is_variable boolean default false`, `expenses.amount_pending boolean default false`. `process_recurring_expenses()` 가 변동성이면 `amount_krw=0, amount_pending=true` 로 생성하고, 알림 문구를 분기한다.

- [ ] **Step 1: 마이그레이션 작성** — `supabase/migrations/100_recurring_variable.sql`

```sql
-- 100_recurring_variable.sql
-- 변동성 고정지출: 금액이 매달 달라지는 항목. 자동 기록 시 금액 미확정(0 + amount_pending)으로 생성.

ALTER TABLE public.recurring_expenses
  ADD COLUMN IF NOT EXISTS is_variable boolean NOT NULL DEFAULT FALSE;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS amount_pending boolean NOT NULL DEFAULT FALSE;

-- 미확정 지출을 빠르게 찾기 위한 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_expenses_amount_pending
  ON public.expenses (expense_date) WHERE amount_pending = TRUE;

-- 자동화 함수 갱신: 변동성 항목은 금액 0 + amount_pending=TRUE 로 생성, 알림 문구 분기
CREATE OR REPLACE FUNCTION public.process_recurring_expenses()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_today date := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_tomorrow date := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE + 1;
  r RECORD;
BEGIN
  -- (a) 오늘 결제분 생성 (말일 초과 billing_day 는 그 달 말일로 클램프)
  FOR r IN
    SELECT * FROM public.recurring_expenses re
    WHERE re.is_active
      AND EXTRACT(DAY FROM v_today)::int = LEAST(
        re.billing_day,
        EXTRACT(DAY FROM (date_trunc('month', v_today) + interval '1 month - 1 day'))::int
      )
  LOOP
    INSERT INTO public.expenses (
      expense_date, vendor, description, amount_krw, currency, amount_foreign,
      payment_method, category_id, source, recurring_id, created_by, amount_pending
    ) VALUES (
      v_today, r.vendor, r.name,
      CASE WHEN r.is_variable THEN 0 ELSE r.amount_krw END,
      r.currency,
      CASE WHEN r.is_variable THEN NULL ELSE r.amount_foreign END,
      r.payment_method, r.category_id, 'recurring', r.id, r.created_by,
      r.is_variable  -- 변동성이면 미확정(TRUE)
    )
    ON CONFLICT (recurring_id, expense_date) WHERE recurring_id IS NOT NULL DO NOTHING;
  END LOOP;

  -- (b) 내일 결제 예정 알림 (recurring_id + due_date 중복 스킵)
  FOR r IN
    SELECT * FROM public.recurring_expenses re
    WHERE re.is_active
      AND EXTRACT(DAY FROM v_tomorrow)::int = LEAST(
        re.billing_day,
        EXTRACT(DAY FROM (date_trunc('month', v_tomorrow) + interval '1 month - 1 day'))::int
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
    SELECT
      r.owner_id,
      'expense_due',
      CASE WHEN r.is_variable THEN '내일 결제 · 금액 입력 필요' ELSE '내일 결제 예정' END,
      CASE
        WHEN r.is_variable THEN r.name || ' 이번 달 금액을 입력해주세요.'
        WHEN r.currency = 'USD' AND r.amount_foreign IS NOT NULL
          THEN r.name || ' $' || trim(to_char(r.amount_foreign, 'FM999,999,990.00')) || ' 결제 예정입니다.'
        ELSE r.name || ' ' || trim(to_char(r.amount_krw, 'FM999,999,999,990')) || '원 결제 예정입니다.'
      END,
      '/dashboard/expenses',
      jsonb_build_object('recurring_id', r.id, 'due_date', v_tomorrow)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.type = 'expense_due'
        AND n.metadata->>'recurring_id' = r.id::text
        AND n.metadata->>'due_date' = v_tomorrow::text
    );
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.process_recurring_expenses() FROM PUBLIC;
```

- [ ] **Step 2: 적용** (사용자 확인 후)

Run: `cd jdi-portal && printf 'y\n' | npx supabase db push --linked`
Expected: `100_recurring_variable.sql` applied. Supabase 대시보드에서 두 컬럼 존재 확인.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/100_recurring_variable.sql
git commit -m "DB: 변동성 고정지출 컬럼 + 자동화 함수 미확정 생성/알림 분기 (100)"
```

---

### Task 3.2: 타입 + 액션 (변동성 저장 / 금액 확정)

**Files:**
- Modify: `src/lib/expenses/types.ts`
- Modify: `src/lib/expenses/actions.ts`

**Interfaces:**
- Produces:
  - `RecurringExpense.is_variable: boolean`, `RecurringInput.is_variable: boolean`, `Expense.amount_pending: boolean`.
  - `confirmExpenseAmount(id: string, amountKrw: number, amountForeign: number | null): Promise<void>` — 미확정 지출의 금액을 확정(`amount_pending=false`).

- [ ] **Step 1: 타입 추가** — `src/lib/expenses/types.ts`

`Expense` 에 `amount_pending: boolean;` 추가.
`RecurringExpense` 에 `is_variable: boolean;` 추가.
`RecurringInput` 에 `is_variable: boolean;` 추가.

- [ ] **Step 2: 변동성 검증 완화** — `src/lib/expenses/actions.ts` 의 `validateRecurringInput`

변동성이면 금액 미입력(0/빈값) 허용:
```ts
function validateRecurringInput(input: RecurringInput) {
  if (!input.name.trim()) throw new Error("이름을 입력해주세요.");
  if (!input.is_variable) {
    if (!Number.isFinite(input.amount_krw) || input.amount_krw <= 0 || !Number.isInteger(input.amount_krw))
      throw new Error("금액(원)을 올바르게 입력해주세요.");
  } else {
    // 변동성: 예상 금액은 선택(0 또는 양의 정수 허용)
    if (!Number.isFinite(input.amount_krw) || input.amount_krw < 0 || !Number.isInteger(input.amount_krw))
      throw new Error("예상 금액을 올바르게 입력해주세요.");
  }
  if (input.billing_day < 1 || input.billing_day > 31)
    throw new Error("결제일은 1~31 사이여야 합니다.");
  if (!input.payment_method.trim()) throw new Error("결제수단을 입력해주세요.");
  if (!input.category_id) throw new Error("분류를 선택해주세요.");
  if (!input.owner_id) throw new Error("담당자를 선택해주세요.");
}
```
`createRecurringExpense`/`updateRecurringExpense` 는 `{ ...input }` 로 `is_variable` 이 자동 포함되므로 그대로 둔다(insert/update 대상 컬럼 존재).

- [ ] **Step 3: 금액 확정 액션 추가** — `src/lib/expenses/actions.ts` 끝에

```ts
/** 변동성 자동 기록(미확정) 지출의 이번 달 실제 금액을 확정한다. 승인 직원 누구나 가능(RLS로 보호). */
export async function confirmExpenseAmount(id: string, amountKrw: number, amountForeign: number | null) {
  const { supabase, userId } = await getSessionUserId();
  if (!Number.isFinite(amountKrw) || amountKrw <= 0 || !Number.isInteger(amountKrw))
    throw new Error("금액(원)을 올바르게 입력해주세요.");
  const { error } = await supabase
    .from("expenses")
    .update({
      amount_krw: amountKrw,
      amount_foreign: amountForeign,
      amount_pending: false,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`금액 확정에 실패했습니다: ${error.message}`);
}
```

- [ ] **Step 4: 빌드 확인**

Run: `cd jdi-portal && npm run build`
Expected: 이 시점엔 UI(RecurringFormModal/ExpenseList)가 `is_variable`/`amount_pending` 를 아직 안 넘겨 타입 에러 가능 → Task 3.3~3.4 완료 후 통과. 여기선 커밋만.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/expenses/types.ts src/lib/expenses/actions.ts
git commit -m "기능: 변동성 타입 + 검증 완화 + 금액 확정 액션(confirmExpenseAmount)"
```

---

### Task 3.3: 등록 폼 변동성 토글

**Files:**
- Modify: `src/components/dashboard/expenses/RecurringFormModal.tsx`

**Interfaces:**
- Consumes: `RecurringInput.is_variable` (Task 3.2).

- [ ] **Step 1: 상태 추가** — `useState` 블록에

```ts
  const [isVariable, setIsVariable] = useState(initial?.is_variable ?? false);
```

- [ ] **Step 2: input 객체에 반영** — `handleSave` 의 `input` 에

```ts
        is_variable: isVariable,
```
그리고 변동성이면 금액 빈칸 허용을 위해 `amount_krw: parseKrwInput(amount)` 는 그대로 두되, 빈칸이면 `parseKrwInput("")` = NaN 이 되므로 변동성일 때 0으로 대체:
```ts
        amount_krw: isVariable ? (parseKrwInput(amount) || 0) : parseKrwInput(amount),
```

- [ ] **Step 3: 토글 UI 추가** — 금액 입력 `div` 바로 아래에

```tsx
        <label className="flex items-center gap-2 ml-1 text-sm font-medium text-slate-600 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={isVariable}
            onChange={(e) => setIsVariable(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          매달 금액이 달라져요 (변동성)
        </label>
```
그리고 금액 라벨을 변동성일 때 "예상 금액(선택)"으로:
```tsx
          <label className={labelCls}>{isVariable ? "예상 금액(선택)" : currency === "USD" ? "원화 환산액" : "금액(원)"}</label>
```
금액 input 의 `required` 는 변동성일 때 해제: `required={!isVariable}`.

- [ ] **Step 4: 빌드 확인** — `cd jdi-portal && npm run build` → PASS(폼은 완결). Task 3.4 후 지출목록까지 최종 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/components/dashboard/expenses/RecurringFormModal.tsx
git commit -m "기능: 고정지출 등록 폼에 변동성 토글 + 예상금액 선택 처리"
```

---

### Task 3.4: 지출내역 — 미확정 강조 + 인라인 금액 입력 + 배지 + 경고

**Files:**
- Modify: `src/components/dashboard/expenses/ExpenseList.tsx`

**Interfaces:**
- Consumes: `confirmExpenseAmount` (Task 3.2), `Expense.amount_pending`, `parseKrwInput` (기존 format.ts).

- [ ] **Step 1: import 추가**

```ts
import { useState } from "react"; // 이미 있음, useState 사용
import { toast } from "sonner";
import { confirmExpenseAmount } from "@/lib/expenses/actions";
import { parseKrwInput } from "@/lib/expenses/format";
```
그리고 `onChanged` 는 props 에 이미 있으나 현재 구조에서 미사용 → 사용하도록 서명 유지(`export default function ExpenseList({ expenses, categories, onChanged, loading, onSelect }`).

- [ ] **Step 2: 인라인 입력 상태 + 핸들러** — 컴포넌트 상단

```ts
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amtInput, setAmtInput] = useState("");
  const [savingAmt, setSavingAmt] = useState(false);

  const pendingCount = useMemo(() => expenses.filter((e) => e.amount_pending).length, [expenses]);

  const submitAmount = async (id: string) => {
    const val = parseKrwInput(amtInput);
    if (!Number.isFinite(val) || val <= 0) {
      toast.error("금액을 숫자로 입력해주세요.");
      return;
    }
    setSavingAmt(true);
    try {
      await confirmExpenseAmount(id, val, null);
      toast.success("금액이 확정되었습니다.");
      setEditingId(null);
      setAmtInput("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSavingAmt(false);
    }
  };
```

- [ ] **Step 3: 미입력 경고 배너** — 필터 `div` 아래(라인 95 이후)에

```tsx
      {pendingCount > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-700 font-medium flex items-center gap-2">
          ⚠️ 이번 달 금액을 아직 안 넣은 변동성 지출 {pendingCount}건이 있어요. 합계가 실제보다 적을 수 있습니다.
        </div>
      )}
```

- [ ] **Step 4: 카드 렌더 분기** — 라인 108-144 의 `rows.map` 내부를 교체. `amount_pending` 이면 클릭=편집 모드 + 빨강 강조, 아니면 기존 카드. 배지는 `고정`(파랑)·`변동`(주황) 구분.

```tsx
            {rows.map((e) => {
              const style = categoryStyle(e.category?.color_key);
              const isRecurring = e.source === "recurring";
              const isVariableRow = e.amount_pending || (isRecurring && e.source === "recurring" && e.amount_pending);
              const editing = editingId === e.id;

              // 미확정(변동성 자동생성, 금액 입력 전)
              if (e.amount_pending) {
                return (
                  <div
                    key={e.id}
                    className="w-full rounded-2xl border border-red-200 bg-red-50/70 px-5 py-3.5 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">
                          {e.vendor ? `${e.vendor} · ` : ""}{e.description}
                        </p>
                        <span className="inline-flex items-center rounded-full bg-red-100 text-red-600 text-[11px] font-bold px-2 py-0.5 shrink-0">입력 필요</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate flex items-center gap-1">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                        {e.category?.name ?? "미분류"} · {e.payment_method}
                      </p>
                    </div>
                    {editing ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          autoFocus
                          value={amtInput}
                          onChange={(ev) => setAmtInput(ev.target.value)}
                          onKeyDown={(ev) => { if (ev.key === "Enter") submitAmount(e.id); }}
                          inputMode="numeric"
                          placeholder="금액"
                          className="w-28 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button onClick={() => submitAmount(e.id)} disabled={savingAmt} className="px-3 py-1.5 rounded-lg bg-[#2563eb] text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50">저장</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingId(e.id); setAmtInput(""); }}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600"
                      >
                        금액 입력
                      </button>
                    )}
                  </div>
                );
              }

              // 확정/일반
              return (
                <button
                  key={e.id}
                  onClick={() => onSelect?.(e)}
                  className={`w-full text-left rounded-2xl backdrop-blur-sm border shadow-sm hover:shadow-md px-5 py-3.5 hover:bg-white transition-all flex items-center gap-3 ${style.card}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">
                        {e.vendor ? `${e.vendor} · ` : ""}{e.description}
                      </p>
                      {isRecurring && !e.recurring_id === false && (
                        <span className={`inline-flex items-center gap-0.5 rounded-full text-[11px] font-bold px-2 py-0.5 shrink-0 ${e.category ? "" : ""} bg-blue-100 text-blue-700`}>
                          <ArrowsClockwise size={11} weight="bold" />고정
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate flex items-center gap-1">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
                      {e.category?.name ?? "미분류"} · {e.payment_method}
                      {!isRecurring ? ` · ${EXPENSE_SOURCE_LABEL[e.source]}` : ""}
                      {e.author_profile ? ` · ${e.author_profile.full_name}` : ""}
                    </p>
                  </div>
                  {e.receipt_path && <Paperclip size={16} className="text-slate-400 shrink-0" />}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-800">{formatKrw(Number(e.amount_krw))}</p>
                    {e.currency === "USD" && e.amount_foreign != null && (
                      <p className="text-xs text-slate-400">{formatForeign(Number(e.amount_foreign), "USD")}</p>
                    )}
                  </div>
                </button>
              );
            })}
```

> 배지 규칙 단순화: "고정"(파랑)은 `source==='recurring'` 이고 `amount_pending===false` 일 때. "입력 필요"(빨강)는 `amount_pending===true`. "변동"(주황) 별도 배지는 이번 범위에선 생략하고, 미확정은 빨강 "입력 필요", 확정된 변동성 자동기록도 "고정" 배지로 통일한다(색 과잉 방지). 위 코드의 `isVariableRow` 변수는 제거하고 `e.amount_pending` 만으로 분기한다.

- [ ] **Step 5: 미사용 변수 정리** — Step 4 코드에서 `isVariableRow` 줄과 어색한 `!e.recurring_id === false` 조건은 삭제하고 배지 조건을 `{isRecurring && (<span ...>고정</span>)}` 로 되돌린다(원본과 동일). 즉 최종 배지 블록:
```tsx
                      {isRecurring && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold px-2 py-0.5 shrink-0">
                          <ArrowsClockwise size={11} weight="bold" />고정
                        </span>
                      )}
```

- [ ] **Step 6: 빌드 + 성능테스트**

Run: `cd jdi-portal && npm run build && npm run test:performance`
Expected: 둘 다 PASS.

- [ ] **Step 7: 커밋**

```bash
git add src/components/dashboard/expenses/ExpenseList.tsx
git commit -m "기능: 지출내역 변동성 미확정 인라인 금액 입력 + 입력필요 배지 + 미입력 경고(①)"
```

---

### Task 3.5: 변동성 정적 가드 테스트

**Files:**
- Create: `scripts/expense-variable.test.mjs`

- [ ] **Step 1: 테스트 작성**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(appRoot, p), "utf8");

test("자동화 함수는 변동성 항목을 미확정(amount_pending)으로 생성한다", () => {
  const mig = read("supabase/migrations/100_recurring_variable.sql");
  assert.match(mig, /amount_pending boolean NOT NULL DEFAULT FALSE/);
  assert.match(mig, /is_variable boolean NOT NULL DEFAULT FALSE/);
  assert.match(mig, /CASE WHEN r\.is_variable THEN 0 ELSE r\.amount_krw END/);
});

test("확정 액션은 amount_pending 을 false 로 되돌린다", () => {
  const actions = read("src/lib/expenses/actions.ts");
  assert.match(actions, /export async function confirmExpenseAmount/);
  assert.match(actions, /amount_pending: false/);
});

test("지출목록은 미입력 경고와 금액 입력 버튼을 렌더한다", () => {
  const list = read("src/components/dashboard/expenses/ExpenseList.tsx");
  assert.match(list, /amount_pending/);
  assert.match(list, /금액 입력/);
  assert.match(list, /confirmExpenseAmount/);
});
```

- [ ] **Step 2: 실행**

Run: `cd jdi-portal && node --test scripts/expense-variable.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 3: 커밋**

```bash
git add scripts/expense-variable.test.mjs
git commit -m "테스트: 변동성 고정지출 정적 가드"
```

---

## Phase 4 — 레이아웃 정리 (④ 버튼 이동)

### Task 4.1: 고정 지출 등록 버튼을 헤더로 이동

**Files:**
- Modify: `src/components/dashboard/expenses/ExpensesPageClient.tsx`
- Modify: `src/components/dashboard/expenses/RecurringTab.tsx`

**Interfaces:**
- Produces: `RecurringTab` 에 `openCreateSignal: number` prop 추가 — 값이 바뀌면 등록 모달을 연다.

- [ ] **Step 1: RecurringTab 에 오픈 신호 prop** — `RecurringTabProps` 에 추가

```ts
  openCreateSignal: number;
```
컴포넌트 본문에 useEffect 추가(초기 마운트 제외):
```ts
  const createSignalMounted = useRef(false);
  useEffect(() => {
    if (!createSignalMounted.current) { createSignalMounted.current = true; return; }
    setCreating(true);
  }, [openCreateSignal]);
```
(상단 import 에 `useRef` 추가: `import { useEffect, useMemo, useRef, useState } from "react";`)

- [ ] **Step 2: RecurringTab 내부 등록 버튼 제거** — 라인 165-170(PC 버튼)과 라인 296-299(모바일 버튼)를 삭제. (등록은 헤더 버튼이 담당. 모바일도 헤더 버튼이 보이도록 Step 3 에서 처리.)

- [ ] **Step 3: ExpensesPageClient 헤더에 버튼 추가** — 상태와 헤더 수정

상태 추가:
```ts
  const [recurringCreateSignal, setRecurringCreateSignal] = useState(0);
```
import 에 Plus 추가: `import Plus from "phosphor-react/dist/icons/Plus.esm.js";`

헤더(라인 139-152)의 `{tab === "list" && (...)}` 옆에, 고정지출 탭일 때 등록 버튼을 오른쪽에 배치:
```tsx
        {tab === "recurring" && (
          <button
            onClick={() => setRecurringCreateSignal((n) => n + 1)}
            className="flex items-center gap-1.5 rounded-xl bg-[#2563eb] text-white text-sm font-bold px-4 py-2 hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
          >
            <Plus size={16} weight="bold" /> 고정 지출 등록
          </button>
        )}
```

RecurringTab 렌더에 prop 전달:
```tsx
        <RecurringTab
          recurring={recurring}
          categories={inputCategories}
          profiles={profiles}
          userId={userId}
          userRole={userRole}
          paymentMethods={paymentMethods}
          onMethodsChanged={refreshPaymentMethods}
          onCategoriesChanged={refreshCategories}
          openCreateSignal={recurringCreateSignal}
        />
```

- [ ] **Step 4: 빌드 + 수동 확인**

Run: `cd jdi-portal && npm run build`
Expected: PASS.
수동: 고정 지출 탭에서 "고정 지출 등록" 버튼이 **제목/탭과 같은 줄 오른쪽**에 있고, 클릭 시 등록 모달이 열리는지. 아래 별도 줄 버튼이 사라졌는지.

- [ ] **Step 5: 커밋**

```bash
git add src/components/dashboard/expenses/ExpensesPageClient.tsx src/components/dashboard/expenses/RecurringTab.tsx
git commit -m "기능: 고정 지출 등록 버튼을 헤더 줄로 이동(④ 레이아웃)"
```

---

## Phase 5 — 팝업 2열 콤팩트 (⑤, 3폼 통일)

### Task 5.1: RecurringFormModal 2열 그리드

**Files:**
- Modify: `src/components/dashboard/expenses/RecurringFormModal.tsx`

- [ ] **Step 1: 컨테이너 폭/그리드** — 바깥 카드 `div`(라인 125 부근) 클래스에서 `max-w-lg` → `max-w-md`, `space-y-3` → `space-y-4`. 내부 필드들을 감싸는 그리드 래퍼 도입: 필드 묶음을 `<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">` 로 감싸고, 전체폭 항목(메모)은 `sm:col-span-2` 를 준다.

구체 배치(위→아래): `[이름 | 거래처]` `[통화 | 금액]` `(변동성 토글: col-span-2)` `[결제일 | 결제수단]` `[분류 | 담당자]` `[메모: col-span-2]`. USD 원화환산 필드는 금액 아래 `col-span-2` 로 조건부.

각 필드 블록의 `space-y-1.5` 는 유지하고, 바깥을 그리드 셀로 만든다. 예:
```tsx
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" className={inputCls} required />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>거래처(선택)</label>
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="거래처(선택)" className={inputCls} />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>통화</label>
            <Select options={CURRENCY_OPTIONS} value={currency} onChange={(v) => setCurrency(v as ExpenseCurrency)} ariaLabel="통화" className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>{isVariable ? "예상 금액(선택)" : currency === "USD" ? "원화 환산액" : "금액(원)"}</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={isVariable ? "예상 금액(선택)" : "금액(원)"} inputMode="numeric" className={inputCls} required={!isVariable} />
          </div>

          {currency === "USD" && (
            <div className="space-y-1.5 sm:col-span-2">
              <label className={labelCls}>달러 금액</label>
              <input value={foreignAmount} onChange={(e) => setForeignAmount(e.target.value)} placeholder="달러 금액" inputMode="decimal" className={inputCls} required />
            </div>
          )}

          <label className="sm:col-span-2 flex items-center gap-2 ml-1 text-sm font-medium text-slate-600 select-none cursor-pointer">
            <input type="checkbox" checked={isVariable} onChange={(e) => setIsVariable(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            매달 금액이 달라져요 (변동성)
          </label>

          <div className="space-y-1.5">
            <label className={labelCls}>매달 결제일</label>
            <input type="number" min={1} max={31} value={billingDay} onChange={(e) => setBillingDay(e.target.value)} placeholder="매달 결제일" className={inputCls} required />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>결제수단</label>
            <PaymentMethodField methods={paymentMethods} value={method} onChange={setMethod} onMethodsChanged={onMethodsChanged} className={inputCls} required />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>분류</label>
            <CategoryField categories={categories} value={categoryId} onChange={setCategoryId} onCategoriesChanged={onCategoriesChanged} className={inputCls} required />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>담당자</label>
            <Select options={profiles.map((p) => ({ value: p.id, label: p.full_name }))} value={ownerId} onChange={setOwnerId} placeholder="담당자 선택" ariaLabel="담당자" className={inputCls} required />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className={labelCls}>메모(선택)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모(선택)" className={inputCls} />
          </div>
        </div>
```
(기존 개별 필드 블록들을 이 그리드로 대체. `최근 자동 기록`(initial 수정 시) 섹션은 그리드 밖 그대로 아래에 둔다.)

- [ ] **Step 2: 빌드 + 수동 확인**

Run: `cd jdi-portal && npm run build`
Expected: PASS. 수동: 팝업이 2열로 짧아지고 모바일(좁은 화면)에서 1열로 접히는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add src/components/dashboard/expenses/RecurringFormModal.tsx
git commit -m "UI: 고정지출 등록 팝업 2열 콤팩트(⑤)"
```

---

### Task 5.2: ExpenseEditModal 2열 그리드

**Files:**
- Modify: `src/components/dashboard/expenses/ExpenseEditModal.tsx`

- [ ] **Step 1: 동일 패턴 적용** — 바깥 카드 `max-w-lg`→`max-w-md`. 필드(날짜·거래처·내용·통화·금액·결제수단·분류)를 `grid grid-cols-1 sm:grid-cols-2 gap-3` 로 감싼다. 배치: `[날짜 | 거래처]` `[내용(col-span-2)]` `[통화 | 금액]` `(USD 달러금액 col-span-2)` `[결제수단 | 분류]` `영수증 영역(col-span-2)`. `내용`·`영수증`·`달러금액`은 `sm:col-span-2`.

(ExpenseEditModal 의 실제 필드 순서/이름에 맞춰 각 블록을 그리드 셀로 감싼다. Task 5.1 과 동일한 셀 구조 `"space-y-1.5"` 유지, 전체폭 항목만 `sm:col-span-2`.)

- [ ] **Step 2: 빌드 + 수동 확인** — `npm run build` PASS, 지출 수정 팝업 2열 확인.

- [ ] **Step 3: 커밋**

```bash
git add src/components/dashboard/expenses/ExpenseEditModal.tsx
git commit -m "UI: 지출 수정 팝업 2열 콤팩트(⑤)"
```

---

### Task 5.3: ExpenseQuickInput 2열 그리드

**Files:**
- Modify: `src/components/dashboard/expenses/ExpenseQuickInput.tsx`

- [ ] **Step 1: 동일 패턴 적용** — PC 폼과 모바일 시트 내부의 필드 묶음을 `grid grid-cols-1 sm:grid-cols-2 gap-3` 로. 배치: `[날짜 | 거래처]` `[내용(col-span-2)]` `[통화 | 금액]` `(USD col-span-2)` `[결제수단 | 분류]`. 저장 버튼 줄은 `col-span-2` 로 하단 유지. 시트/모달 컨테이너 폭도 과하지 않게 정리.

- [ ] **Step 2: 빌드 + 성능테스트** — `cd jdi-portal && npm run build && npm run test:performance` 모두 PASS.

- [ ] **Step 3: 커밋**

```bash
git add src/components/dashboard/expenses/ExpenseQuickInput.tsx
git commit -m "UI: 지출 빠른입력 팝업 2열 콤팩트(⑤)"
```

---

## 최종 검증 (모든 Phase 완료 후)

- [ ] `cd jdi-portal && npm run build` → PASS (타입/빌드)
- [ ] `cd jdi-portal && npm run lint` → 0 errors
- [ ] `cd jdi-portal && npm run test:performance` → 40검사 PASS
- [ ] `cd jdi-portal && node --test scripts/expense-category-color.test.mjs scripts/expense-variable.test.mjs scripts/expense-amount-parse.test.mjs` → 전부 PASS
- [ ] 수동 스모크(dev): ① 변동성 등록→다음날/백필 시 미확정 생성 흐름(또는 SQL 수동 호출 `SELECT public.process_recurring_expenses();`), 지출내역에서 금액 입력→확정. ② 캘린더 분류색. ③ 새 분류 추가 시 자동 색. ④ 등록 버튼 헤더. ⑤ 세 팝업 2열.
- [ ] 커밋 로그 정리 후, **사용자 확인을 받아** `git push`(Railway 자동 배포).

---

## Self-Review 체크 결과

- **스펙 커버리지**: ①=Phase3, ②=Phase2+1.4, ③=Phase1(1.1/1.2/1.4), ④=Task2.1(칸)+Task4.1(버튼), ⑤=Phase5. 상단 요약/분류별 고정비는 "안 건드림"으로 유지 — 해당 파일 미수정.
- **마이그레이션 번호**: 099, 100 (현재 최신 098 다음). 순차 준수.
- **타입 일관성**: `color_key`(ExpenseCategory), `amount_pending`(Expense), `is_variable`(RecurringExpense/RecurringInput), `confirmExpenseAmount(id, amountKrw, amountForeign)`, `categoryStyle(colorKey)`, `pickNextColorKey(usedKeys)` — 태스크 간 이름 일치 확인.
- **KST/RLS/Tailwind 리터럴**: 자동화 SQL KST 사용, 팔레트 리터럴, 기존 RLS(승인자) 정책 재사용(변동성 금액 확정은 기존 expenses UPDATE 정책으로 승인 직원 허용).
- **주의(실행 시 확인 필요)**: `node --experimental-strip-types` 로 `.ts` 직접 테스트가 이 Node 버전에서 되는지 Task1.1 Step2에서 즉시 확인, 안 되면 정적 문자열 검사로 대체.
