// 계약관리(범용) 전자서명 제출 API — 로그인 없이 서명 토큰으로만 인가되는 공개 경로.
// (/api/sign/ 하위라 미들웨어의 로그인 리다이렉트 제외 목록에 자동 포함된다.)

import { NextResponse, type NextRequest } from "next/server";
import { getErrorMessage } from "@/lib/utils/errors";
import { extractClientIp } from "@/lib/utils/ip";
import {
  submitCompanySignature,
  type CompanySignSubmission,
} from "@/lib/contracts/signService";

export const runtime = "nodejs";
// PDF 생성(폰트 임베드 포함)이 무거워 기본 시간제한을 넉넉히 잡는다
export const maxDuration = 60;

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const form = await request.formData();

    // 상대방 입력값 — JSON 하나로 받는다(필드 구성이 문서마다 달라서).
    // 서버(signService)가 문서에 정의된 party 필드만 골라 다시 검증한다.
    let partyValues: Record<string, string> = {};
    try {
      const parsed = JSON.parse(str(form, "fields") || "{}") as Record<string, unknown>;
      partyValues = Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => typeof v === "string"),
      ) as Record<string, string>;
    } catch {
      partyValues = {};
    }

    let stampFile: CompanySignSubmission["stampFile"] = null;
    const file = form.get("stampFile");
    if (file instanceof File && file.size > 0) {
      stampFile = {
        bytes: Buffer.from(await file.arrayBuffer()),
        contentType: file.type,
      };
    }

    const signatureMode = str(form, "signatureMode") === "stamp" ? "stamp" : "draw";

    await submitCompanySignature(token, {
      signerName: str(form, "signerName"),
      partyValues,
      businessRegNo: str(form, "businessRegNo"),
      agreed: str(form, "agreed") === "true",
      signatureMode,
      signatureDataUrl: str(form, "signature") || null,
      stampFile,
      ip: extractClientIp(request),
      userAgent: request.headers.get("user-agent") ?? "",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[sign/c] 서명 제출 실패:", error);
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error, "제출에 실패했습니다. 잠시 후 다시 시도해주세요.") },
      { status: 400 },
    );
  }
}
