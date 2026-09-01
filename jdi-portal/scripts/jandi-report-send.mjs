#!/usr/bin/env node
/**
 * 잔디 업무보고 토픽으로 메시지 전송.
 *
 * 명령줄 인자로 긴 한국어 본문을 넘기면 따옴표·줄바꿈이 깨지므로 **파일로만** 받는다.
 * 파일 첫 줄이 제목, 빈 줄 다음부터 본문이다.
 *
 * 웹훅 주소는 .env.local 의 JANDI_WEBHOOK_URL 에서만 읽는다. 소스에 넣지 않는다.
 *
 * 사용:
 *   node --env-file=.env.local scripts/jandi-report-send.mjs <메시지파일>
 *   node --env-file=.env.local scripts/jandi-report-send.mjs <메시지파일> --dry-run
 */

import { readFileSync } from "node:fs";

const [, , filePath, ...rest] = process.argv;
const dryRun = rest.includes("--dry-run");

if (!filePath) {
  console.error("사용법: node --env-file=.env.local scripts/jandi-report-send.mjs <메시지파일> [--dry-run]");
  process.exit(1);
}

const raw = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n").trim();
if (!raw) {
  console.error("메시지 파일이 비어 있습니다.");
  process.exit(1);
}

const newlineIndex = raw.indexOf("\n");
const title = (newlineIndex === -1 ? raw : raw.slice(0, newlineIndex)).trim();
const body = (newlineIndex === -1 ? "" : raw.slice(newlineIndex + 1)).trim();

const payload = {
  body: title,
  connectColor: "#1F8CE6",
  connectInfo: body ? [{ title: "", description: body }] : [],
};

if (dryRun) {
  console.log("=== 보낼 내용 (전송 안 함) ===");
  console.log(payload.body);
  console.log(body);
  process.exit(0);
}

const url = process.env.JANDI_WEBHOOK_URL;
if (!url) {
  console.error("JANDI_WEBHOOK_URL 환경변수가 없습니다. --env-file=.env.local 을 붙였는지 확인하세요.");
  process.exit(1);
}

const res = await fetch(url, {
  method: "POST",
  headers: {
    Accept: "application/vnd.tosslab.jandi-v2+json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

if (!res.ok) {
  // 웹훅 주소가 로그에 남지 않도록 상태코드만 남긴다.
  console.error(`잔디 전송 실패: HTTP ${res.status}`);
  process.exit(1);
}

console.log(`전송 완료 (제목 ${title.length}자, 본문 ${body.length}자)`);
