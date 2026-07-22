import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFileSync(path.join(appRoot, relativePath), "utf8");

// parseKrwInput 과 동일한 정제 규칙을 재현한다.
// (format.ts 의 순수 로직을 TS import 없이 회귀 검증하기 위함)
const parseKrw = (value) => {
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned === ".") return NaN;
  return Math.round(Number(cleaned));
};

test("금액 입력에 '원'·쉼표·공백이 섞여도 숫자로 파싱된다", () => {
  assert.equal(parseKrw("33,000원"), 33000); // 이 버그의 실제 재현 케이스
  assert.equal(parseKrw("33000원"), 33000);
  assert.equal(parseKrw("33,000"), 33000);
  assert.equal(parseKrw(" 33000 "), 33000);
  assert.equal(parseKrw("3,300,000원"), 3300000);
  assert.equal(parseKrw("33000"), 33000);
});

test("금액이 비어있거나 숫자가 없으면 NaN(검증에서 걸러짐)", () => {
  assert.ok(Number.isNaN(parseKrw("")));
  assert.ok(Number.isNaN(parseKrw("원")));
  assert.ok(Number.isNaN(parseKrw("abc")));
});

test("format.ts 는 parseKrwInput / parseForeignInput 을 내보낸다", () => {
  const format = readSource("src/lib/expenses/format.ts");
  assert.match(format, /export function parseKrwInput/);
  assert.match(format, /export function parseForeignInput/);
});

test("지출 입력 폼 3종은 취약한 Number(...replaceAll) 파싱을 쓰지 않는다", () => {
  const forms = [
    "src/components/dashboard/expenses/RecurringFormModal.tsx",
    "src/components/dashboard/expenses/ExpenseEditModal.tsx",
    "src/components/dashboard/expenses/ExpenseQuickInput.tsx",
  ];
  for (const rel of forms) {
    const src = readSource(rel);
    // 회귀 가드: "원" 등이 섞이면 NaN 이 되던 옛 파싱 패턴 금지
    assert.doesNotMatch(
      src,
      /Number\(\s*amount\.replaceAll/,
      `${rel} 이 옛 금액 파싱 패턴을 다시 쓰고 있습니다`
    );
    assert.match(src, /parseKrwInput\(/, `${rel} 이 parseKrwInput 을 써야 합니다`);
  }
});

test("모달 오버레이는 배경에서 눌러 시작한 클릭만 닫는다(드래그 닫힘 방지)", () => {
  const forms = [
    "src/components/dashboard/expenses/RecurringFormModal.tsx",
    "src/components/dashboard/expenses/ExpenseEditModal.tsx",
    "src/components/dashboard/expenses/ExpenseQuickInput.tsx",
  ];
  for (const rel of forms) {
    const src = readSource(rel);
    assert.match(src, /overlayMouseDown/, `${rel} 이 overlayMouseDown 가드를 써야 합니다`);
    assert.match(src, /onMouseDown=/, `${rel} 이 onMouseDown 판정을 써야 합니다`);
  }
});
