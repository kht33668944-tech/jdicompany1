import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
// 실제 배포 코드를 그대로 검증한다 (Node strip-types 로 .ts 직접 import)
import { parseKrwInput } from "../src/lib/expenses/format.ts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFileSync(path.join(appRoot, relativePath), "utf8");

const FORMS = [
  "src/components/dashboard/expenses/RecurringFormModal.tsx",
  "src/components/dashboard/expenses/ExpenseEditModal.tsx",
  "src/components/dashboard/expenses/ExpenseQuickInput.tsx",
];

test("금액 입력에 '원'·쉼표·공백이 섞여도 숫자로 파싱된다", () => {
  assert.equal(parseKrwInput("33,000원"), 33000); // 이 버그의 실제 재현 케이스
  assert.equal(parseKrwInput("33000원"), 33000);
  assert.equal(parseKrwInput("33,000"), 33000);
  assert.equal(parseKrwInput(" 33000 "), 33000);
  assert.equal(parseKrwInput("3,300,000원"), 3300000);
  assert.equal(parseKrwInput("33000"), 33000);
});

test("금액이 비어있거나 숫자가 없으면 NaN(검증에서 걸러짐)", () => {
  assert.ok(Number.isNaN(parseKrwInput("")));
  assert.ok(Number.isNaN(parseKrwInput("원")));
  assert.ok(Number.isNaN(parseKrwInput("abc")));
});

test("지출 입력 폼 3종은 취약한 Number(...replaceAll) 파싱을 쓰지 않는다", () => {
  for (const rel of FORMS) {
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

test("모달 오버레이는 공용 useOverlayDismiss 가드를 쓴다(드래그 닫힘 방지)", () => {
  for (const rel of FORMS) {
    const src = readSource(rel);
    assert.match(src, /useOverlayDismiss/, `${rel} 이 useOverlayDismiss 훅을 써야 합니다`);
  }
});
