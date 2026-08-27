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
