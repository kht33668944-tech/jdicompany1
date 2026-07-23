// 인플루언서 Edge Function 인증·권한 회귀 테스트
//
// 이 함수들은 Deno 런타임이라 node:test로 실제 실행할 수 없어, 저장소의 다른
// 아키텍처 테스트와 동일하게 "소스가 올바른 인증·권한 구조를 갖추고 있는지"를
// 정적으로 검증한다. 목적은 아래 회귀를 막는 것:
//   - Bearer 문자열만 확인하고 JWT를 실제 검증하지 않는 가짜 인증으로 되돌아가기
//   - 승인(is_approved) 확인 누락
//   - created_by를 요청 본문(브라우저 입력)에서 신뢰하기

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFileSync(path.join(appRoot, relativePath), "utf8");

test("influencer-analyze는 JWT를 실제 검증하고 승인 사용자만 통과시킨다", () => {
  const source = readSource("supabase/functions/influencer-analyze/index.ts");

  // Bearer 접두사 확인만으로 끝내지 않는다 → 실제 getUser(jwt) 호출
  assert.match(source, /auth\.getUser\(\s*jwt\s*\)/);
  // 인증 실패는 401로 거부
  assert.match(source, /authError\s*\|\|\s*!user/);
  assert.match(source, /status:\s*401/);
  // profiles.is_approved 확인 후 미승인은 403으로 거부
  assert.match(source, /\.from\("profiles"\)[\s\S]*?is_approved/);
  assert.match(source, /!approvedRow\?\.is_approved/);
  assert.match(source, /status:\s*403/);
});

test("influencer-extract는 JWT를 실제 검증하고 승인 사용자만 통과시킨다", () => {
  const source = readSource("supabase/functions/influencer-extract/index.ts");

  assert.match(source, /auth\.getUser\(\s*userJwt\s*\)/);
  assert.match(source, /authError\s*\|\|\s*!user/);
  assert.match(source, /\.from\("profiles"\)[\s\S]*?is_approved/);
  assert.match(source, /!approvedRow\?\.is_approved/);
  assert.match(source, /status:\s*403/);
});

test("influencer-extract는 created_by를 요청 본문에서 신뢰하지 않는다", () => {
  const source = readSource("supabase/functions/influencer-extract/index.ts");

  // 등록자는 검증된 user.id로만 결정
  assert.match(source, /const createdBy = user\.id;/);
  // body.created_by를 읽는 코드가 남아 있으면 안 됨
  assert.doesNotMatch(source, /body\.created_by/);
});

test("호출부는 created_by를 Edge Function 본문에 넘기지 않는다", () => {
  const source = readSource("src/lib/influencer/actions.ts");

  // 정상 경로는 세션 검증 후 호출
  assert.match(source, /getSessionUserId\(\)/);
  // Edge Function 호출 본문(profile_url이 담긴 body)에는 created_by를 실어 보내지 않음.
  //   (캠페인 DB insert의 정당한 created_by는 대상이 아니므로 범위를 좁힌다)
  assert.doesNotMatch(source, /profile_url:[^}]*created_by/);
});
