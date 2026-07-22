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

test("등록 폼은 변동성 토글을 렌더한다", () => {
  const form = read("src/components/dashboard/expenses/RecurringFormModal.tsx");
  assert.match(form, /is_variable/);
  assert.match(form, /변동성/);
});
