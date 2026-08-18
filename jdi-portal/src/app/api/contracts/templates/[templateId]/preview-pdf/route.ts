// 양식 PDF 미리보기 — "이 양식으로 계약서를 만들면 어떤 종이가 나오는지" 미리 본다.
//
// 계약서 미리보기(../../[docId]/preview-pdf)와 같은 규칙을 따른다.
//   · 로그인한 직원 전용, RLS 클라이언트로만 읽는다(service role 금지)
//   · preview: true — 모든 쪽에 워터마크, 서명란은 "(서명 전)", 전자서명 확인서 없음
// 다른 점: 양식에는 상대방이 없어 "(상대방)" 자리표시자를 쓴다
// (화면 미리보기 ContractEditorScreen 의 partyB 와 같은 문구).

import { NextResponse, type NextRequest } from "next/server";
import { getCompanyTemplate } from "@/lib/contracts/actions";
import { renderCompanySignedPdf } from "@/lib/contracts/pdf";
import { getAuthUser } from "@/lib/supabase/auth";
import { getErrorMessage } from "@/lib/utils/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 양식에는 아직 상대방이 없다 — 편집 화면 미리보기와 같은 문구를 쓴다 */
const PLACEHOLDER_PARTY_B = "(상대방)";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { templateId } = await params;
  try {
    const template = await getCompanyTemplate(templateId);

    const pdf = await renderCompanySignedPdf({
      content: template.content,
      partyValues: {},
      counterpartyName: PLACEHOLDER_PARTY_B,
      counterpartyCompany: null,
      counterpartyKind: "individual",
      businessRegNo: "",
      signerName: "",
      signatureDataUrl: null,
      signatureIsStamp: false,
      stampDataUrl: null,
      signedAtKst: "",
      sentAtKst: "",
      viewedAtKst: "",
      docId: template.id,
      contentSha256: "",
      ip: "",
      userAgent: "",
      preview: true,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        // 파일 이름은 ASCII 로 고정한다(한글 파일명은 브라우저마다 인코딩이 갈린다)
        "content-disposition": 'inline; filename="template-preview.pdf"',
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
