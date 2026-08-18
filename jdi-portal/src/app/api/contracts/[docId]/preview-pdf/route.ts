// 발송 전 PDF 미리보기 — 직원이 "보내기 전에" 상대방이 받을 문서 모양을 그대로 확인한다.
//
// ⚠️ 공개 서명 링크(/api/sign/c/[token]/pdf)와 달리 이 경로는 **로그인한 직원 전용**이다.
//    문서는 RLS 클라이언트(getCompanyDocument)로 읽는다 — service role 을 쓰지 않는다.
// ⚠️ 아직 보내지 않은 초안(draft)만 허용한다. 발송본·서명본을 여기서 뽑으면
//    서명 안 된 PDF 가 진짜 계약서처럼 돌아다닐 수 있다.
//    (서명 전 문서라는 표시는 pdf.ts 의 preview 모드가 워터마크로 넣는다.)

import { NextResponse, type NextRequest } from "next/server";
import { getCompanyDocument } from "@/lib/contracts/actions";
import { renderCompanySignedPdf } from "@/lib/contracts/pdf";
import { getAuthUser } from "@/lib/supabase/auth";
import { getErrorMessage } from "@/lib/utils/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { docId } = await params;
  try {
    const doc = await getCompanyDocument(docId);
    if (doc.status !== "draft") {
      return NextResponse.json(
        { error: "아직 보내지 않은 계약서만 미리볼 수 있습니다." },
        { status: 400 },
      );
    }

    const pdf = await renderCompanySignedPdf({
      content: doc.content,
      // 상대방 칸은 비워 둔다 — 발송 직후 상대방이 보게 될 모습 그대로
      partyValues: {},
      counterpartyName: doc.counterparty_name,
      counterpartyCompany: doc.counterparty_company,
      counterpartyKind: doc.counterparty_kind,
      businessRegNo: "",
      signerName: "",
      signatureDataUrl: null,
      signatureIsStamp: false,
      stampDataUrl: null,
      signedAtKst: "",
      sentAtKst: "",
      viewedAtKst: "",
      docId: doc.id,
      contentSha256: "",
      ip: "",
      userAgent: "",
      preview: true,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        // 파일 이름은 ASCII 로 고정한다(한글 파일명은 브라우저마다 인코딩이 갈린다)
        "content-disposition": 'inline; filename="preview.pdf"',
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: getErrorMessage(err, "미리보기를 만들지 못했습니다.") },
      { status: 400 },
    );
  }
}
