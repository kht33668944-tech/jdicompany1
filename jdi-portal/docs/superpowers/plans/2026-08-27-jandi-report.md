# 잔디 업무 자동 보고 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 평일 오후 1시·6시에 포털의 오늘 일정·업무 현황·업무보고·검토 대기를 잔디 채널로 자동 게시한다.

**Architecture:** Cloud Scheduler 작업 1개가 `/api/cron/jandi-report` 를 POST 로 부른다. 라우트는 공유 비밀을 검증하고, 팀 전체 데이터를 pg 한 번에 읽어(`queries.ts`), 순수 함수로 잔디 페이로드를 조립하고(`format.ts`), 웹훅으로 전송한다(`send.ts`). 네 파일은 서로 의존을 최소화해 각각 독립 테스트가 가능하다.

**Tech Stack:** Next.js 16 App Router Route Handler, TypeScript strict, `pg` 풀(`src/lib/db/postgres.ts`), `node:test`, GCP Cloud Scheduler + Secret Manager.

**설계 문서:** `docs/superpowers/specs/2026-08-27-jandi-report-design.md`

## Global Constraints

- **웹훅 URL·비밀키는 절대 커밋하지 않는다.** 코드·테스트·문서·커밋 메시지 어디에도 실제 값을 쓰지 않는다. 로컬은 `.env.local`, 운영은 GCP Secret Manager.
- `.gitignore` 에 `*jandi-webhook*` 규칙이 있다. **파일명에 `jandi-webhook` 을 쓰지 않는다.** (이 계획의 모든 경로는 `jandi` 또는 `jandi-report` 를 쓴다.)
- 환경변수 이름: `JANDI_WEBHOOK_URL`, `CRON_SECRET`. 운영은 **전부 Secret Manager** 로 주입한다(`docs/operations/cloud-run-seoul.md` 의 기존 규칙).
- **미들웨어의 인증 왕복 조기 생략 목록(`/api/health`, `/api/keepalive`)에 새 경로를 추가하지 않는다.** `/api/cron/` 은 로그인 리다이렉트 예외에만 넣는다.
- SQL 에서 날짜는 항상 `(now() at time zone 'Asia/Seoul')::date`. `current_date`/`now()` 를 KST 변환 없이 쓰지 않는다.
- 테스트는 `node:test` (jest/vitest 아님). `.ts` 소스를 테스트에서 로드할 때는 기존 방식(`typescript.transpileModule`, `scripts/dashboard-snapshot.test.mjs` 참고)을 따른다.
- 사용자가 요청하지 않는 한 `git push` 하지 않는다. **`master` 푸시 = 운영 자동 배포**임을 기억한다.
- 표기 상수(설계 §6): 블록당 최대 **5건**, 초과분은 `· 외 N건`. 제목 최대 **40자**, 초과 시 `…`. 담당자 2명 이상은 `이름 외 N명`, 0명은 `담당자 미지정`. 모든 블록이 0건이면 `오늘은 기록된 활동이 없습니다.` 한 줄.

---

## File Structure

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `src/lib/jandi/types.ts` | 보고 데이터 타입, 잔디 페이로드 타입, `ReportSlot` | 신규 |
| `src/lib/jandi/send.ts` | 웹훅 POST, 타임아웃, 재시도 | 신규 |
| `src/lib/jandi/format.ts` | 데이터 → 페이로드 (순수 함수) | 신규 |
| `src/lib/jandi/queries.ts` | 팀 전체 보고 데이터 1회 조회 | 신규 |
| `src/app/api/cron/jandi-report/route.ts` | 비밀키 검증 → 조회 → 조립 → 전송 | 신규 |
| `src/lib/supabase/middleware.ts` | `/api/cron/` 로그인 리다이렉트 예외 1줄 | 수정 |
| `scripts/jandi-report.test.mjs` | `format.ts` 표기 규칙 테스트 | 신규 |
| `scripts/jandi-cron-auth.test.mjs` | 라우트 인증·미들웨어 경계 테스트 | 신규 |
| `package.json` | `test:jandi` 스크립트 | 수정 |
| `docs/operations/cloud-run-seoul.md` | 스케줄러 표에 작업 추가 | 수정 |

**Task 순서 근거:** 잔디 웹훅의 실제 페이로드 규격이 문서와 다를 수 있고, 그 규격이 `format.ts` 의 출력 모양을 결정한다. 그래서 **Task 1 에서 실물 전송으로 규격을 먼저 확정**한 뒤 나머지를 쌓는다.

---

### Task 1: 잔디 전송 계층과 규격 확정

**Files:**
- Create: `src/lib/jandi/types.ts`
- Create: `src/lib/jandi/send.ts`
- Modify: `.env.local` (커밋 안 함)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `type ReportSlot = "noon" | "evening"`
  - `interface JandiConnectInfo { title: string; description: string }`
  - `interface JandiPayload { body: string; connectColor: string; connectInfo: JandiConnectInfo[] }`
  - `async function sendToJandi(payload: JandiPayload): Promise<void>` — 실패 시 throw

- [ ] **Step 1: 잔디에서 웹훅을 재발급한다 (사람이 하는 작업)**

기존 웹훅 주소는 채팅으로 공유된 이력이 있어 비밀이 아니다. 잔디 웹 → 해당 채널 →
잔디 커넥트 → 기존 incoming webhook **삭제** → 새로 생성 → 새 URL 복사.

이 단계 전에는 이후 스텝을 진행하지 않는다. 재발급 즉시 유출된 주소는 무효가 된다.

- [ ] **Step 2: 로컬 환경변수 설정**

`jdi-portal/.env.local` 에 두 줄을 추가한다. **이 파일은 이미 `.gitignore` 대상이다.**

```
JANDI_WEBHOOK_URL=<Step 1에서 받은 새 URL>
CRON_SECRET=<아래 명령으로 생성한 값>
```

`CRON_SECRET` 생성:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- [ ] **Step 3: 타입 파일 작성**

`src/lib/jandi/types.ts`:

```ts
/**
 * 잔디 자동 보고 도메인 타입.
 *
 * format.ts 를 순수 함수로 두기 위해, 조회 결과(ReportData)와 전송 페이로드
 * (JandiPayload)를 여기서 완전히 분리해 정의한다. format.ts 는 DB 도 네트워크도
 * 모르고 ReportData 하나만 받는다.
 */

/** 13시 보고(앞으로 할 일) / 18시 보고(오늘 한 일) */
export type ReportSlot = "noon" | "evening";

// ─── 잔디 incoming webhook 페이로드 ───

export interface JandiConnectInfo {
  title: string;
  description: string;
}

export interface JandiPayload {
  body: string;
  connectColor: string;
  connectInfo: JandiConnectInfo[];
}

// ─── 보고용 조회 결과 ───

export type ReportTaskStatus = "대기" | "진행중" | "완료";

export interface ReportTask {
  id: string;
  title: string;
  status: ReportTaskStatus;
  /** YYYY-MM-DD (KST) 또는 null */
  dueDate: string | null;
  /** ISO 문자열 또는 null */
  completedAt: string | null;
  assigneeNames: string[];
}

export interface ReportEntry {
  id: string;
  title: string;
  authorName: string | null;
}

export interface ReportReview {
  id: string;
  entryTitle: string;
  /** 업무보고 작성자 = 보완해야 할 사람 */
  authorName: string | null;
  /** 검토자 = 확인해야 할 사람 */
  reviewerName: string | null;
  /** ISO 문자열 */
  createdAt: string;
}

export interface ReportSchedule {
  id: string;
  title: string;
  /** ISO 문자열 */
  startTime: string;
  isAllDay: boolean;
}

export interface ReportData {
  /** YYYY-MM-DD (KST) */
  today: string;
  /** 보고 생성 시각 ISO */
  now: string;
  schedules: ReportSchedule[];
  tasks: ReportTask[];
  entries: ReportEntry[];
  reviews: ReportReview[];
}
```

- [ ] **Step 4: 전송 모듈 작성**

`src/lib/jandi/send.ts`:

```ts
/**
 * 잔디 incoming webhook 전송.
 *
 * 규격이 바뀌어도 이 파일 하나만 고치면 되도록 전송을 분리해 두었다.
 * 실패는 throw 한다 — 호출부(라우트)가 로깅과 상태코드를 책임진다.
 */

import type { JandiPayload } from "./types";

const TIMEOUT_MS = 10_000;
/** 재시도 대기(ms). 길이가 곧 재시도 횟수다. */
const RETRY_DELAYS_MS = [1_000, 3_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postOnce(url: string, payload: JandiPayload): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/vnd.tosslab.jandi-v2+json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      // 본문에 웹훅 URL 이 섞이지 않도록 상태코드만 남긴다.
      throw new Error(`잔디 응답 실패: HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function sendToJandi(payload: JandiPayload): Promise<void> {
  const url = process.env.JANDI_WEBHOOK_URL;
  if (!url) {
    throw new Error("JANDI_WEBHOOK_URL 환경변수가 없습니다.");
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await postOnce(url, payload);
      return;
    } catch (error) {
      lastError = error;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break;
      await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("잔디 전송 실패");
}
```

- [ ] **Step 5: 실물 스모크 테스트로 규격 확정**

임시 스크립트로 실제 잔디 채널에 1회 보낸다. **이 파일은 커밋하지 않는다.**

```bash
cd jdi-portal && cat > .tmp-jandi-smoke.mjs <<'EOF'
const url = process.env.JANDI_WEBHOOK_URL;
const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/vnd.tosslab.jandi-v2+json",
  },
  body: JSON.stringify({
    body: "📋 연결 테스트",
    connectColor: "#1F8CE6",
    connectInfo: [{ title: "블록 제목", description: "· 첫 줄\n· 둘째 줄" }],
  }),
});
console.log(res.status, await res.text());
EOF
node --env-file=.env.local .tmp-jandi-smoke.mjs```

기대 결과: `200 ...` 이 찍히고 **잔디 채널에 메시지가 실제로 보인다.**

- 200 이 아니면 응답 본문의 오류를 읽고 헤더/본문 키 이름을 맞춘 뒤 `send.ts` 를 수정한다.
- 줄바꿈(`\n`)이 잔디에서 제대로 보이는지 눈으로 확인한다. 안 보이면 `format.ts` 에서 줄바꿈 대신 `connectInfo` 항목을 더 잘게 쪼개는 방식으로 Task 2 에서 조정한다.
- 확인 후 임시 파일을 지운다: `rm .tmp-jandi-smoke.mjs`

- [ ] **Step 6: 커밋**

```bash
git add src/lib/jandi/types.ts src/lib/jandi/send.ts
git commit -m "기능: 잔디 웹훅 전송 계층과 보고 도메인 타입"
```

`.env.local` 과 `.tmp-jandi-smoke.mjs` 가 스테이징되지 않았는지 `git status` 로 확인한다.

---

### Task 2: 보고서 문장 조립 (순수 함수, TDD)

**Files:**
- Create: `src/lib/jandi/format.ts`
- Create: `scripts/jandi-report.test.mjs`
- Modify: `package.json` (scripts 에 `test:jandi` 추가)

**Interfaces:**
- Consumes: `ReportData`, `ReportSlot`, `JandiPayload` (Task 1 의 `types.ts`)
- Produces:
  - `function resolveSlot(now: Date): ReportSlot`
  - `function buildReport(data: ReportData, slot: ReportSlot): JandiPayload`

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/jandi-report.test.mjs`:

```js
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd jdi-portal && node --test scripts/jandi-report.test.mjs
```

기대: 모든 테스트 FAIL — `Cannot find module ... format.ts` 또는 `buildReport is not a function`.

- [ ] **Step 3: 최소 구현 작성**

`src/lib/jandi/format.ts`:

```ts
/**
 * 보고 데이터를 잔디 페이로드로 조립한다.
 *
 * activity 도메인의 format.ts 와 같은 발상: 조회는 사실만 가져오고, 한국어 문장은
 * 전부 여기서 만든다. 그래서 문구를 바꿀 때 DB 도 쿼리도 건드릴 필요가 없다.
 *
 * 이 파일은 순수 함수만 둔다 — 네트워크도 DB 도 Date.now() 도 쓰지 않는다.
 * 시각이 필요하면 인자로 받는다. 그래야 전부 테스트로 고정할 수 있다.
 */

import type {
  JandiConnectInfo,
  JandiPayload,
  ReportData,
  ReportSlot,
  ReportTask,
} from "./types";

const MAX_ITEMS = 5;
const MAX_TITLE = 40;
const COLOR_DEFAULT = "#1F8CE6";
const COLOR_WARNING = "#E8543F";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 이 시각(KST) 이전이면 점심 보고로 본다. */
const NOON_SLOT_UNTIL_HOUR = 15;

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function toKst(iso: string | Date): Date {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(date.getTime() + KST_OFFSET_MS);
}

export function resolveSlot(now: Date): ReportSlot {
  return toKst(now).getUTCHours() < NOON_SLOT_UNTIL_HOUR ? "noon" : "evening";
}

function truncate(title: string): string {
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE)}…` : title;
}

function assigneeLabel(names: string[]): string {
  if (names.length === 0) return "담당자 미지정";
  if (names.length === 1) return names[0];
  return `${names[0]} 외 ${names.length - 1}명`;
}

/** 목록을 최대 5줄로 자르고 초과분은 "· 외 N건" 한 줄로 요약한다. */
function bulletList(lines: string[]): string {
  const shown = lines.slice(0, MAX_ITEMS).map((line) => `· ${line}`);
  if (lines.length > MAX_ITEMS) {
    shown.push(`· 외 ${lines.length - MAX_ITEMS}건`);
  }
  return shown.join("\n");
}

/** YYYY-MM-DD 두 개의 날짜 차이(일). a - b */
function dayDiff(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

function isCompletedToday(task: ReportTask, today: string): boolean {
  if (!task.completedAt) return false;
  return toKst(task.completedAt).toISOString().slice(0, 10) === today;
}

function isOverdue(task: ReportTask, today: string): boolean {
  if (task.status === "완료" || !task.dueDate) return false;
  return dayDiff(today, task.dueDate) > 0;
}

function formatTime(iso: string, isAllDay: boolean): string {
  if (isAllDay) return "종일";
  const kst = toKst(iso);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatHeader(data: ReportData, slot: ReportSlot): string {
  const kst = toKst(data.now);
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const weekday = WEEKDAY_KO[kst.getUTCDay()];
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  const label = slot === "noon" ? "점심 현황" : "하루 마감";
  return `📋 JDI ${label} · ${month}월 ${day}일(${weekday}) ${hh}:${mm}`;
}

function buildBlocks(data: ReportData, slot: ReportSlot): JandiConnectInfo[] {
  const blocks: JandiConnectInfo[] = [];

  // 1) 오늘 일정 — noon 은 지금 이후 일정만
  //
  // 설계 §4 표에는 일정의 담당자를 "참석자"로 적었으나, schedules 테이블에는 참석자
  // 목록이 없고 created_by(등록자)만 있다. 등록자는 참석자가 아니므로 이름을 붙이면
  // 오히려 틀린 정보가 된다. 그래서 일정 블록은 시각 + 제목만 쓴다.
  const nowMs = Date.parse(data.now);
  const schedules =
    slot === "noon"
      ? data.schedules.filter((s) => s.isAllDay || Date.parse(s.startTime) >= nowMs)
      : data.schedules;
  if (schedules.length > 0) {
    blocks.push({
      title: `🗓 ${slot === "noon" ? "남은 일정" : "오늘 일정"} ${schedules.length}건`,
      description: bulletList(
        schedules.map((s) => `${formatTime(s.startTime, s.isAllDay)} ${truncate(s.title)}`),
      ),
    });
  }

  // 2) 오늘 완료 — evening 만
  const doneToday = data.tasks.filter((t) => isCompletedToday(t, data.today));
  if (slot === "evening" && doneToday.length > 0) {
    blocks.push({
      title: `✅ 오늘 완료 ${doneToday.length}건`,
      description: bulletList(
        doneToday.map((t) => `${truncate(t.title)} — ${assigneeLabel(t.assigneeNames)}`),
      ),
    });
  }

  // 3) 진행 중 — 사람별 건수만 (목록은 길어져서 싣지 않는다)
  const inProgress = data.tasks.filter((t) => t.status === "진행중");
  if (inProgress.length > 0) {
    const counts = new Map<string, number>();
    for (const t of inProgress) {
      const key = assigneeLabel(t.assigneeNames);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const breakdown = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name} ${count}`)
      .join(" · ");
    blocks.push({
      title: `🔄 진행 중 ${inProgress.length}건`,
      description: breakdown,
    });
  }

  // 4) 기한 지남
  const overdue = data.tasks.filter((t) => isOverdue(t, data.today));
  if (overdue.length > 0) {
    blocks.push({
      title: `⚠️ 기한 지남 ${overdue.length}건`,
      description: bulletList(
        overdue.map(
          (t) =>
            `${truncate(t.title)} — ${assigneeLabel(t.assigneeNames)} (${dayDiff(
              data.today,
              t.dueDate as string,
            )}일 지남)`,
        ),
      ),
    });
  }

  // 5) 오늘 올라온 업무보고 — evening 만
  if (slot === "evening" && data.entries.length > 0) {
    blocks.push({
      title: `📝 오늘 올라온 업무보고 ${data.entries.length}건`,
      description: bulletList(
        data.entries.map((e) => `${e.authorName ?? "작성자 미상"} — ${truncate(e.title)}`),
      ),
    });
  }

  // 6) 검토 대기
  if (data.reviews.length > 0) {
    blocks.push({
      title: `👀 검토 대기 ${data.reviews.length}건`,
      description: bulletList(
        data.reviews.map((r) => {
          const days = dayDiff(data.today, toKst(r.createdAt).toISOString().slice(0, 10));
          const age = days <= 0 ? "오늘" : `${days + 1}일째`;
          return `${r.authorName ?? "작성자 미상"} → ${r.reviewerName ?? "검토자 미상"} : ${truncate(
            r.entryTitle,
          )} (${age})`;
        }),
      ),
    });
  }

  return blocks;
}

export function buildReport(data: ReportData, slot: ReportSlot): JandiPayload {
  const connectInfo = buildBlocks(data, slot);
  const header = formatHeader(data, slot);
  const hasOverdue = data.tasks.some((t) => isOverdue(t, data.today));

  // 침묵하지 않는다 — 안 오는 것과 고장 난 것을 구분할 수 없기 때문이다.
  const body =
    connectInfo.length === 0 ? `${header}\n\n오늘은 기록된 활동이 없습니다.` : header;

  return {
    body,
    connectColor: hasOverdue ? COLOR_WARNING : COLOR_DEFAULT,
    connectInfo,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd jdi-portal && node --test scripts/jandi-report.test.mjs
```

기대: `pass 9`, `fail 0`.

- [ ] **Step 5: npm 스크립트 추가**

`package.json` 의 `scripts` 에 한 줄 추가한다 (`test:contracts` 다음 줄):

```json
    "test:jandi": "node --test scripts/jandi-report.test.mjs scripts/jandi-cron-auth.test.mjs",
```

`scripts/jandi-cron-auth.test.mjs` 는 Task 4 에서 만든다. Task 4 전까지 `npm run test:jandi` 는 실패하므로, 이 시점에는 `node --test scripts/jandi-report.test.mjs` 로만 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/jandi/format.ts scripts/jandi-report.test.mjs package.json
git commit -m "기능: 잔디 보고서 문장 조립과 표기 규칙 테스트"
```

---

### Task 3: 팀 전체 보고 데이터 조회

**Files:**
- Create: `src/lib/jandi/queries.ts`

**Interfaces:**
- Consumes: `ReportData` 등 (Task 1 의 `types.ts`), `getPool`/`markPostgresUnavailable` (`src/lib/db/postgres.ts`)
- Produces: `async function getReportData(): Promise<ReportData>`

**설계와 다르게 가는 지점 (의도적):** 설계 §4 는 pg 실패 시 Supabase service role 로
우회한다고 했다. 실제로는 **폴백을 두지 않는다.** 그 우회를 하려면 팀 전체를 읽는 RPC 를
새 마이그레이션으로 만들어야 하는데, 하루 두 번 도는 보고를 위해 운영 DB 에 함수를
추가하는 비용이 이득보다 크다. 이 경로는 실패해도 포털 본체에 영향이 없고 다음 회차에
자연히 복구된다.

- [ ] **Step 1: 조회 모듈 작성**

`src/lib/jandi/queries.ts`:

```ts
/**
 * 잔디 보고용 팀 전체 데이터 조회.
 *
 * 대시보드의 스냅샷 경로를 재사용하지 않는 이유: 그쪽은 로그인한 개인의 시야
 * (DashboardSnapshotContext)에 묶여 있다. 보고서는 팀 전체를 봐야 하므로 별도 조회를
 * 둔다. 덕분에 대시보드 초기 데이터(빠른 경로 + RPC 폴백 쌍)를 건드리지 않는다.
 *
 * 하루 두 번만 도는 경로라 성능 여유가 크다. 그래도 왕복 1회로 끝낸다.
 */

import { getPool, markPostgresUnavailable } from "@/lib/db/postgres";
import type { ReportData } from "./types";

const REPORT_SQL = `
with params as (
  select (now() at time zone 'Asia/Seoul')::date as today
),
report_tasks as (
  select
    t.id,
    t.title,
    t.status,
    t.due_date,
    t.completed_at,
    coalesce((
      select jsonb_agg(p.full_name order by p.full_name)
      from public.task_assignees ta
      join public.profiles p on p.id = ta.user_id and p.is_approved = true
      where ta.task_id = t.id
    ), '[]'::jsonb) as assignee_names
  from public.tasks t
  cross join params
  where t.status = '진행중'
     or (t.completed_at at time zone 'Asia/Seoul')::date = params.today
     or (t.due_date is not null and t.due_date < params.today and t.status <> '완료')
),
report_entries as (
  select e.id, e.title, p.full_name as author_name, e.created_at
  from public.work_timeline_entries e
  left join public.profiles p on p.id = e.user_id
  cross join params
  where (e.created_at at time zone 'Asia/Seoul')::date = params.today
),
report_reviews as (
  select
    r.id,
    e.title as entry_title,
    ap.full_name as author_name,
    rp.full_name as reviewer_name,
    r.created_at
  from public.work_timeline_reviews r
  join public.work_timeline_entries e on e.id = r.entry_id
  left join public.profiles ap on ap.id = r.author_id
  left join public.profiles rp on rp.id = r.reviewer_id
  where r.state in ('open', 'submitted')
),
report_schedules as (
  select s.id, s.title, s.start_time, s.is_all_day
  from public.schedules s
  cross join params
  where s.start_time <= ((params.today + 1)::text || 'T00:00:00+09:00')::timestamptz
    and s.end_time >= (params.today::text || 'T00:00:00+09:00')::timestamptz
)
select jsonb_build_object(
  'today', (select today::text from params),
  'now', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'tasks', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'title', t.title, 'status', t.status,
      'dueDate', t.due_date, 'completedAt', t.completed_at,
      'assigneeNames', t.assignee_names
    ) order by t.due_date asc nulls last, t.title asc)
    from report_tasks t
  ), '[]'::jsonb),
  'entries', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'title', e.title, 'authorName', e.author_name
    ) order by e.created_at asc)
    from report_entries e
  ), '[]'::jsonb),
  'reviews', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'entryTitle', r.entry_title,
      'authorName', r.author_name, 'reviewerName', r.reviewer_name,
      'createdAt', r.created_at
    ) order by r.created_at asc)
    from report_reviews r
  ), '[]'::jsonb),
  'schedules', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'title', s.title,
      'startTime', s.start_time, 'isAllDay', s.is_all_day
    ) order by s.start_time asc)
    from report_schedules s
  ), '[]'::jsonb)
) as report
`;

export async function getReportData(): Promise<ReportData> {
  // 폴백을 두지 않는다(위 "설계와 다르게 가는 지점" 참고).
  const pool = getPool();
  try {
    const result = await pool.query<{ report: ReportData }>(REPORT_SQL);
    return result.rows[0].report;
  } catch (error) {
    markPostgresUnavailable();
    throw error;
  }
}
```

- [ ] **Step 2: 실제 DB 에 붙여 SQL 을 검증한다**

`.env.local` 에 `DATABASE_URL` 이 있어야 한다. 임시 스크립트로 확인한다(커밋 안 함):

```bash
cd jdi-portal && cat > .tmp-jandi-query.mjs <<'EOF'
import { readFileSync } from "node:fs";
import pg from "pg";
const sql = readFileSync("src/lib/jandi/queries.ts", "utf8")
  .split("const REPORT_SQL = `")[1]
  .split("`;")[0];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query(sql);
console.log(JSON.stringify(rows[0].report, null, 2).slice(0, 3000));
await client.end();
EOF
node --env-file=.env.local .tmp-jandi-query.mjs```

확인할 것:

1. 오류 없이 JSON 이 출력된다.
2. `tasks` 의 `assigneeNames` 가 이름 배열로 나온다.
3. `today` 가 **한국 날짜**와 같다(UTC 날짜가 아니라).
4. `completed_at` 컬럼이 실제로 존재한다 (없다는 오류가 나면 마이그레이션에서 컬럼명을 확인해 SQL 을 고친다).

확인 후 임시 파일을 지운다: `rm .tmp-jandi-query.mjs`

- [ ] **Step 3: 타입 검사 통과 확인**

```bash
cd jdi-portal && npx tsc --noEmit
```

기대: 오류 0건.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/jandi/queries.ts
git commit -m "기능: 잔디 보고용 팀 전체 데이터 조회"
```

`.tmp-jandi-query.mjs` 가 스테이징되지 않았는지 `git status` 로 확인한다.

---

### Task 4: cron 라우트와 인증 경계

**Files:**
- Create: `src/app/api/cron/jandi-report/route.ts`
- Create: `scripts/jandi-cron-auth.test.mjs`
- Modify: `src/lib/supabase/middleware.ts` (로그인 리다이렉트 예외에 1줄)

**Interfaces:**
- Consumes: `getReportData()` (Task 3), `buildReport()`/`resolveSlot()` (Task 2), `sendToJandi()` (Task 1), `ReportSlot` (Task 1)
- Produces: `POST /api/cron/jandi-report` — 200 `{ ok: true, slot, blocks }` / 400 / 401 / 500

- [ ] **Step 1: 실패하는 테스트 작성**

이 테스트는 서버를 띄우지 않고 **소스 파일의 구조**를 검사한다. 기존
`scripts/contract-esign.test.mjs` 가 인증 경계를 고정하는 방식과 같다.

`scripts/jandi-cron-auth.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const appRoot = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return readFileSync(path.join(appRoot, relativePath), "utf8");
}

const routeSource = read("src/app/api/cron/jandi-report/route.ts");
const middlewareSource = read("src/lib/supabase/middleware.ts");

test("라우트는 CRON_SECRET 을 상수시간으로 비교한다", () => {
  assert.match(routeSource, /CRON_SECRET/);
  assert.match(routeSource, /timingSafeEqual/);
});

test("라우트는 비밀키 불일치 시 401 을 준다", () => {
  assert.match(routeSource, /status:\s*401/);
});

test("라우트는 오류 내용을 응답 본문에 담지 않는다", () => {
  // 내부 오류 메시지(스택, DB 오류)를 그대로 클라이언트에 흘리면 안 된다.
  assert.ok(
    !/JSON\.stringify\(\s*error/.test(routeSource),
    "오류 객체를 응답 본문에 직렬화하면 안 됩니다",
  );
  assert.ok(
    !/message:\s*(error|String\(error\))/.test(routeSource),
    "오류 메시지를 응답 본문에 담으면 안 됩니다",
  );
});

test("웹훅 주소와 비밀키가 소스에 하드코딩되어 있지 않다", () => {
  for (const source of [routeSource, read("src/lib/jandi/send.ts")]) {
    assert.ok(
      !/wh\.jandi\.com/.test(source),
      "잔디 웹훅 주소를 소스에 넣으면 안 됩니다 — 환경변수로만 씁니다",
    );
  }
});

test("미들웨어는 /api/cron/ 을 로그인 리다이렉트에서 제외한다", () => {
  assert.match(middlewareSource, /startsWith\("\/api\/cron\/"\)/);
});

test("미들웨어는 /api/cron/ 을 인증 조기 생략 목록에 넣지 않는다", () => {
  // 조기 생략 목록은 updateSession 맨 앞의 즉시 통과 블록이다.
  // 여기에 /api/cron/ 이 들어가면 성능 장치의 의미가 흐려지고 경계가 무너진다.
  const earlyExit = middlewareSource.split("let supabaseResponse")[0];
  assert.ok(
    earlyExit.includes('"/api/health"') && earlyExit.includes('"/api/keepalive"'),
    "조기 생략 목록의 위치를 찾지 못했습니다 — 테스트를 갱신하세요",
  );
  assert.ok(
    !earlyExit.includes("/api/cron"),
    "/api/cron/ 을 인증 조기 생략 목록에 넣으면 안 됩니다",
  );
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd jdi-portal && node --test scripts/jandi-cron-auth.test.mjs
```

기대: FAIL — `ENOENT ... src/app/api/cron/jandi-report/route.ts`.

- [ ] **Step 3: 미들웨어에 예외 1줄 추가**

`src/lib/supabase/middleware.ts` 의 로그인 리다이렉트 조건에서 마지막 줄
`!request.nextUrl.pathname.startsWith("/api/sign/")` 아래에 한 줄을 더한다.

수정 전:

```ts
    !request.nextUrl.pathname.startsWith("/sign/") &&
    !request.nextUrl.pathname.startsWith("/api/sign/")
  ) {
```

수정 후:

```ts
    !request.nextUrl.pathname.startsWith("/sign/") &&
    !request.nextUrl.pathname.startsWith("/api/sign/") &&
    !request.nextUrl.pathname.startsWith("/api/cron/")
  ) {
```

바로 위 주석에도 한 문장을 덧붙인다:

```ts
  // 로그인하지 않은 사용자가 보호된 경로에 접근하면 로그인 페이지로 리다이렉트
  // (/sign, /api/sign 은 인플루언서 전자서명 공개 경로 — 서명 토큰이 인가 수단이며,
  //  서버가 service role 로 토큰을 검증한다. 로그인 화면으로 보내면 안 된다.)
  // (/api/cron 은 Cloud Scheduler 전용 경로 — 인가는 CRON_SECRET 헤더이며 라우트가
  //  직접 검증한다. 여기서 리다이렉트하면 스케줄러가 로그인 HTML 을 받고 만다.
  //  단, 맨 앞의 "인증 조기 생략" 목록에는 넣지 않는다 — 그것은 1분마다 불리는
  //  데우기 경로만을 위한 성능 장치다. scripts/jandi-cron-auth.test.mjs 가 고정한다.)
```

- [ ] **Step 4: 라우트 구현**

`src/app/api/cron/jandi-report/route.ts`:

```ts
/**
 * Cloud Scheduler 가 평일 13시·18시(KST)에 부르는 잔디 자동 보고 경로.
 *
 * 인가는 X-Cron-Secret 헤더뿐이다(로그인 세션 없음). 미들웨어는 이 경로를 로그인
 * 리다이렉트에서만 빼 주고, 실제 검증은 여기서 한다.
 *
 * 실패해도 포털 본체에는 영향이 없다 — 독립된 라우트이고, 다음 회차에 복구된다.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { buildReport, resolveSlot } from "@/lib/jandi/format";
import { getReportData } from "@/lib/jandi/queries";
import { sendToJandi } from "@/lib/jandi/send";
import type { ReportSlot } from "@/lib/jandi/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 길이가 달라도 안전하게 비교하려고 먼저 해시로 길이를 고정한다. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function resolveRequestedSlot(url: URL, now: Date): ReportSlot | null {
  const requested = url.searchParams.get("slot");
  if (requested === null) return resolveSlot(now);
  if (requested === "noon" || requested === "evening") return requested;
  return null;
}

export async function POST(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const webhookUrl = process.env.JANDI_WEBHOOK_URL;

  const provided = request.headers.get("x-cron-secret");
  if (!expectedSecret || !provided || !secretMatches(provided, expectedSecret)) {
    console.warn("[jandi-report] 인증 실패");
    return new NextResponse(null, { status: 401 });
  }

  if (!webhookUrl) {
    console.error("[jandi-report] JANDI_WEBHOOK_URL 환경변수가 없습니다.");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const slot = resolveRequestedSlot(new URL(request.url), new Date());
  if (slot === null) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    const data = await getReportData();
    const payload = buildReport(data, slot);
    await sendToJandi(payload);
    return NextResponse.json({ ok: true, slot, blocks: payload.connectInfo.length });
  } catch (error) {
    // 오류 내용은 서버 로그에만 남긴다 — 응답 본문에 담으면 내부 구조가 새어 나간다.
    console.error("[jandi-report] 실패", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd jdi-portal && npm run test:jandi
```

기대: `pass 15`, `fail 0` (Task 2 의 9개 + 이번 6개).

- [ ] **Step 6: 개발 서버로 실제 동작 확인**

```bash
cd jdi-portal && npm run dev
```

다른 터미널에서 (`<비밀키>` 는 `.env.local` 의 `CRON_SECRET` 값):

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/cron/jandi-report
```

기대: `401` (헤더 없음).

```bash
curl -X POST -H "X-Cron-Secret: <비밀키>" "http://localhost:3000/api/cron/jandi-report?slot=evening"
```

기대: `{"ok":true,"slot":"evening","blocks":N}` 이고 **잔디 채널에 실제 보고서가 보인다.**
메시지를 눈으로 읽고 어색한 문구가 있으면 `format.ts` 를 고친 뒤 Task 2 의 테스트를 다시 돌린다.

- [ ] **Step 7: 성능·보안 회귀 검사**

```bash
cd jdi-portal && npm run test:performance && npm run test:security && npm run lint
```

기대: 전부 `fail 0`. 실패하면 미들웨어 수정이 조기 생략 목록을 건드렸는지 먼저 의심한다.

- [ ] **Step 8: 커밋**

```bash
git add src/app/api/cron/jandi-report/route.ts scripts/jandi-cron-auth.test.mjs src/lib/supabase/middleware.ts
git commit -m "기능: 잔디 보고 cron 라우트와 인증 경계"
```

---

### Task 5: 운영 배포와 스케줄러 등록

**Files:**
- Modify: `docs/operations/cloud-run-seoul.md`
- GCP 콘솔 작업 (코드 아님)

**Interfaces:**
- Consumes: 배포된 `/api/cron/jandi-report`
- Produces: Cloud Scheduler 작업 `jdi-portal-jandi-report`

- [ ] **Step 1: Secret Manager 에 비밀 2개 등록**

이 프로젝트의 Cloud Run 환경변수는 **전부 Secret Manager** 로 주입한다(기존 규칙).

```bash
printf '%s' '<새 웹훅 URL>' | gcloud secrets create JANDI_WEBHOOK_URL --project jdi-portal-seoul --data-file=-
printf '%s' '<CRON_SECRET 값>' | gcloud secrets create CRON_SECRET --project jdi-portal-seoul --data-file=-
```

런타임 서비스 계정에 읽기 권한을 준다:

```bash
for s in JANDI_WEBHOOK_URL CRON_SECRET; do gcloud secrets add-iam-policy-binding "$s" --project jdi-portal-seoul --member serviceAccount:jdi-run@jdi-portal-seoul.iam.gserviceaccount.com --role roles/secretmanager.secretAccessor; done
```

- [ ] **Step 2: Cloud Run 서비스에 시크릿 연결**

기존 `--set-secrets` 목록을 **덮어쓰지 말고 추가**한다. 현재 값을 먼저 확인한다:

```bash
gcloud run services describe jdi-portal --project jdi-portal-seoul --region asia-northeast3 --format="value(spec.template.spec.containers[0].env)"
```

`cloudbuild.yaml` 이 `--set-secrets` 를 들고 있으면 **거기에 두 항목을 더한 뒤 배포**하는 것이
맞다(그렇지 않으면 다음 자동 배포 때 되돌아간다). 파일을 열어 확인하고, 있는 쪽에 추가한다:

```
JANDI_WEBHOOK_URL=JANDI_WEBHOOK_URL:latest,CRON_SECRET=CRON_SECRET:latest
```

- [ ] **Step 3: master 병합으로 배포**

```bash
cd jdi-portal && git fetch origin master && git log --oneline HEAD..origin/master
```

기대: 출력 없음(뒤처진 커밋 없음). 그 뒤 사용자에게 푸시 여부를 확인받고 푸시한다.
`master` 푸시 = Cloud Build 트리거 `deploy-master-to-seoul` 자동 배포다.

빌드 상태 확인:

```bash
gcloud builds list --project jdi-portal-seoul --region=global --limit=3
```

- [ ] **Step 4: 운영 환경에서 1회 수동 호출**

```bash
curl -X POST -H "X-Cron-Secret: <CRON_SECRET 값>" https://jdiportal.com/api/cron/jandi-report
```

기대: `{"ok":true,...}` 이고 잔디에 보고서가 실제로 뜬다. 뜨지 않으면 Cloud Run 로그를
확인한다:

```bash
gcloud run services logs read jdi-portal --project jdi-portal-seoul --region asia-northeast3 --limit 50
```

- [ ] **Step 5: Cloud Scheduler 작업 생성**

```bash
gcloud scheduler jobs create http jdi-portal-jandi-report --project jdi-portal-seoul --location asia-northeast3 --schedule "0 13,18 * * 1-5" --time-zone "Asia/Seoul" --uri "https://jdiportal.com/api/cron/jandi-report" --http-method POST --update-headers "X-Cron-Secret=<CRON_SECRET 값>" --attempt-deadline 60s --max-retry-attempts 2
```

작업이 만들어졌는지, 총 개수가 **2개(무료 한도 3개 이내)** 인지 확인한다:

```bash
gcloud scheduler jobs list --project jdi-portal-seoul --location asia-northeast3
```

- [ ] **Step 6: 스케줄러 즉시 실행으로 최종 확인**

```bash
gcloud scheduler jobs run jdi-portal-jandi-report --project jdi-portal-seoul --location asia-northeast3
```

기대: 잔디에 보고서가 뜬다. **여기까지 성공해야 기능이 완성된 것이다.**

- [ ] **Step 7: 운영 문서 갱신**

`docs/operations/cloud-run-seoul.md` 의 구성 표(`| 데우기 | Cloud Scheduler ... |` 줄 아래)에
한 줄을 더한다:

```markdown
| 잔디 자동 보고 | Cloud Scheduler 작업 `jdi-portal-jandi-report` (평일 13시·18시 KST → `/api/cron/jandi-report`) |
```

같은 문서의 "환경변수" 항목 아래에도 한 줄을 남긴다:

```markdown
> 잔디 보고용 시크릿 2개: `JANDI_WEBHOOK_URL`, `CRON_SECRET`. 웹훅 URL 은 그 자체가
> 쓰기 권한이므로 유출되면 잔디에서 즉시 재발급하고 Secret Manager 에 새 버전을 올린다.
```

- [ ] **Step 8: 커밋**

```bash
git add docs/operations/cloud-run-seoul.md
git commit -m "문서: 잔디 자동 보고 스케줄러와 시크릿 운영 절차"
```

---

## 완료 조건

전부 만족해야 완료다.

- [ ] `npm run test:jandi` — pass 15, fail 0
- [ ] `npm run test:performance` — fail 0
- [ ] `npm run test:security` — fail 0
- [ ] `npm run lint` — 오류 0
- [ ] `npx tsc --noEmit` — 오류 0
- [ ] 잔디 채널에 스케줄러가 실제로 보낸 보고서가 1회 이상 게시됨
- [ ] `git log -p | grep -c "wh.jandi.com"` 결과가 `0` (웹훅 주소가 히스토리에 없음)
- [ ] 기존 웹훅이 잔디에서 삭제·재발급됨

## 하지 않는 것 (YAGNI)

- 근태·지출·인플루언서 블록 — 이번 범위 밖. 새 블록이 필요하면 `format.ts` 의
  `buildBlocks` 에 함수 하나를 더하고 `queries.ts` 의 CTE 를 하나 더하면 된다.
- 개인별 DM, 보고 이력 저장 테이블, 재전송 UI, 공휴일 판정.
- pg 실패 시 Supabase 폴백 (Task 3 의 근거 참고).
