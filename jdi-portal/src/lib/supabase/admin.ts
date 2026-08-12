// ⚠️ 서버 전용 관리자 클라이언트 — RLS 를 우회한다.
//
// 용도: 로그인 없이 접근하는 "계약서 전자서명" 공개 흐름(/sign, /api/sign)에서만 쓴다.
// 인플루언서는 포털 계정이 없으므로 anon RLS 정책 대신, 서버가 서명 토큰(256bit 랜덤)을
// 검증한 뒤 이 클라이언트로 필요한 최소 작업만 수행한다.
//
// 규칙 (회귀 테스트 scripts/contract-esign.test.mjs 가 강제):
//  - 이 모듈은 서명 흐름 서버 코드에서만 import 한다. 일반 화면/액션에서 쓰지 않는다.
//  - SUPABASE_SERVICE_ROLE_KEY 는 서버 전용 환경변수다. 클라이언트 노출 금지.
//  - 토큰 검증 없이 이 클라이언트로 데이터를 읽거나 쓰지 않는다.

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다. 전자서명 기능에 필요한 서버 전용 키입니다.",
    );
  }
  cached = createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
