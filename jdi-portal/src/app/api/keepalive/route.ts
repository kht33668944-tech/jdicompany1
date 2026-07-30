import { NextResponse } from "next/server";
import { warmUpstreams } from "@/lib/warmup";

/**
 * 외부 스케줄러(Cloud Scheduler `jdi-portal-keepalive`, 1분 주기)가 부르는 데우기 경로.
 *
 * Cloud Run 은 요청을 처리할 때만 CPU 를 준다(요청기반 과금). 그래서
 * `instrumentation.ts` 의 타이머가 fetch 를 시작해도 응답이 오기 전에 CPU 가
 * 끊겨 데우기가 끝나지 않는다 — 실측에서 유휴 뒤 첫 요청의 `middleware.getUser` 가
 * 720ms 로 부풀었다. 여기서는 요청 안에서 `await` 하므로 반드시 완료된다.
 *
 * `/api/health` 와 나누어 둔 이유: health 는 순수한 생존 확인이어야 하고(외부
 * 헬스체크가 DB 상태에 끌려가면 안 된다), 회귀 테스트도 그렇게 고정하고 있다.
 *
 * 인증 없이 열려 있지만 `warmUpstreams` 안의 간격 제한이 있어 연타해도 실제 작업은
 * 그 간격으로만 일어난다.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  const warmed = await warmUpstreams();
  return NextResponse.json({ ok: true, warmed, ms: Date.now() - startedAt });
}
