import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * 리다이렉트 주소를 요청 URL 의 origin 으로 만들면 안 된다.
 *
 * 이 앱은 프록시(Cloudflare) 뒤에서 돌고, 서버는 컨테이너 안에서 내부 주소로 listen
 * 한다. 그래서 `new URL(request.url).origin` 이 실제 서비스 도메인이 아니라
 * 내부 바인드 주소로 잡힌다(운영에서 `https://localhost:8080`, 컨테이너에서
 * `https://0.0.0.0:8080` 으로 확인됨). 그 주소로 리다이렉트되면 비밀번호 재설정
 * 메일의 링크를 눌러도 열리지 않는다.
 *
 * Location 을 상대 경로로 내보내면 브라우저가 "자기가 접속한 도메인" 기준으로
 * 해석하므로, 호스팅·프록시 구성이 바뀌어도 항상 올바른 주소로 이동한다.
 * (미들웨어와 signout 도 이미 상대 경로로 리다이렉트한다.)
 */
function redirectTo(path: string) {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Prevent open redirect — only allow relative paths on same origin
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectTo(safeNext);
    }
  }

  return redirectTo("/login");
}
