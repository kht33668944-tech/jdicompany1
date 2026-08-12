// 전자서명 제출 API — 로그인 없이 서명 토큰으로만 인가되는 공개 경로.
// (미들웨어의 로그인 리다이렉트 제외 목록에 /api/sign 이 등록되어 있다.)

import { NextResponse, type NextRequest } from "next/server";
import { getErrorMessage } from "@/lib/utils/errors";
import { extractClientIp } from "@/lib/utils/ip";
import {
  submitSignature,
  type SignSubmission,
} from "@/lib/influencer/contracts/documents/signService";

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

    let idCard: SignSubmission["idCard"] = null;
    const file = form.get("idCard");
    if (file instanceof File && file.size > 0) {
      idCard = {
        bytes: Buffer.from(await file.arrayBuffer()),
        contentType: file.type,
        fileName: file.name,
      };
    }

    await submitSignature(token, {
      signer: {
        name: str(form, "name"),
        channel: str(form, "channel"),
        address: str(form, "address"),
        phone: str(form, "phone"),
        email: str(form, "email"),
        businessRegNo: str(form, "businessRegNo"),
        bankName: str(form, "bankName"),
        bankAccount: str(form, "bankAccount"),
        accountHolder: str(form, "accountHolder"),
      },
      signatureDataUrl: str(form, "signature"),
      agreed: str(form, "agreed") === "true",
      idCard,
      ip: extractClientIp(request),
      userAgent: request.headers.get("user-agent") ?? "",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[sign] 서명 제출 실패:", error);
    return NextResponse.json(
      { ok: false, error: getErrorMessage(error, "제출에 실패했습니다. 잠시 후 다시 시도해주세요.") },
      { status: 400 },
    );
  }
}
