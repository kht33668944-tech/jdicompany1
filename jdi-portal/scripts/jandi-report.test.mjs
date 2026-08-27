import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";

const appRoot = path.resolve(import.meta.dirname, "..");

// .ts 소스를 그대로 로드한다 (scripts/dashboard-snapshot.test.mjs 와 같은 방식).
function loadModule(relativePath) {
  const require = createRequire(import.meta.url);
  const typescript = require(path.join(appRoot, "node_modules", "typescript"));
  const source = readFileSync(path.join(appRoot, relativePath), "utf8");
  const compiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("exports", "module", "require", compiled)(
    compiledModule.exports,
    compiledModule,
    require,
  );
  return compiledModule.exports;
}

const { buildReport, resolveSlot } = loadModule("src/lib/jandi/format.ts");

const TODAY = "2026-08-27";
const NOW_EVENING = "2026-08-27T09:00:00.000Z"; // KST 18:00

function emptyData(overrides = {}) {
  return {
    today: TODAY,
    now: NOW_EVENING,
    schedules: [],
    tasks: [],
    entries: [],
    reviews: [],
    ...overrides,
  };
}

function task(id, overrides = {}) {
  return {
    id,
    title: `업무 ${id}`,
    status: "진행중",
    dueDate: null,
    completedAt: null,
    assigneeNames: ["김효태"],
    ...overrides,
  };
}

function doneTask(id, overrides = {}) {
  return task(id, {
    status: "완료",
    completedAt: `${TODAY}T05:00:00.000Z`,
    ...overrides,
  });
}

test("모든 블록이 비면 활동 없음 한 줄만 보낸다", () => {
  const payload = buildReport(emptyData(), "evening");
  assert.equal(payload.connectInfo.length, 0);
  assert.match(payload.body, /오늘은 기록된 활동이 없습니다\./);
});

test("빈 블록은 통째로 생략한다", () => {
  const payload = buildReport(
    emptyData({
      reviews: [
        {
          id: "r1",
          entryTitle: "계약서 문구 확인",
          authorName: "김효태",
          reviewerName: "이영희",
          createdAt: `${TODAY}T01:00:00.000Z`,
        },
      ],
    }),
    "evening",
  );
  const titles = payload.connectInfo.map((info) => info.title);
  assert.equal(titles.length, 1);
  assert.match(titles[0], /검토 대기/);
});

test("블록당 5건까지만 쓰고 나머지는 외 N건으로 줄인다", () => {
  const tasks = Array.from({ length: 7 }, (_, index) => doneTask(`t${index}`));
  const payload = buildReport(emptyData({ tasks }), "evening");
  const done = payload.connectInfo.find((info) => info.title.includes("오늘 완료"));
  assert.ok(done);
  assert.equal(done.description.split("\n").filter((line) => line.startsWith("·")).length, 6);
  assert.match(done.description, /· 외 2건/);
});

test("담당자가 여럿이면 외 N명, 없으면 담당자 미지정", () => {
  const payload = buildReport(
    emptyData({
      tasks: [
        doneTask("t1", { assigneeNames: ["김효태", "이영희"] }),
        doneTask("t2", { assigneeNames: [] }),
      ],
    }),
    "evening",
  );
  const done = payload.connectInfo.find((info) => info.title.includes("오늘 완료"));
  assert.match(done.description, /김효태 외 1명/);
  assert.match(done.description, /담당자 미지정/);
});

test("40자를 넘는 제목은 잘라내고 말줄임표를 붙인다", () => {
  const longTitle = "가".repeat(50);
  const payload = buildReport(emptyData({ tasks: [doneTask("t1", { title: longTitle })] }), "evening");
  const done = payload.connectInfo.find((info) => info.title.includes("오늘 완료"));
  assert.match(done.description, /가{40}…/);
  assert.ok(!done.description.includes("가".repeat(41)));
});

test("noon 에는 업무보고 블록이 없고 evening 에는 있다", () => {
  const data = emptyData({
    entries: [{ id: "e1", title: "인플루언서 1차 컨택 결과", authorName: "김효태" }],
  });
  const noon = buildReport(data, "noon");
  const evening = buildReport(data, "evening");
  assert.ok(!noon.connectInfo.some((info) => info.title.includes("업무보고")));
  assert.ok(evening.connectInfo.some((info) => info.title.includes("업무보고")));
});

test("noon 에는 오늘 완료 블록이 없다", () => {
  const data = emptyData({ tasks: [doneTask("t1")] });
  const noon = buildReport(data, "noon");
  assert.ok(!noon.connectInfo.some((info) => info.title.includes("오늘 완료")));
});

test("기한 지난 업무가 있으면 경고색을 쓴다", () => {
  const clean = buildReport(emptyData({ tasks: [doneTask("t1")] }), "evening");
  const late = buildReport(
    emptyData({ tasks: [task("t2", { dueDate: "2026-08-25", status: "진행중" })] }),
    "evening",
  );
  assert.notEqual(late.connectColor, clean.connectColor);
  const overdue = late.connectInfo.find((info) => info.title.includes("기한 지남"));
  assert.match(overdue.description, /2일 지남/);
});

test("KST 시각으로 슬롯을 판정한다", () => {
  assert.equal(resolveSlot(new Date("2026-08-27T04:00:00.000Z")), "noon"); // KST 13:00
  assert.equal(resolveSlot(new Date("2026-08-27T09:00:00.000Z")), "evening"); // KST 18:00
});
