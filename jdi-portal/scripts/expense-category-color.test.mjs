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

test("pickNextColorKey 는 모두 쓰이면 처음부터 순환한다", () => {
  const next = pickNextColorKey([...COLOR_KEYS]);
  assert.equal(next, COLOR_KEYS[0]);
});
