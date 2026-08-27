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
