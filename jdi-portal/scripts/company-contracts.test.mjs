// 계약관리(범용 계약서) 회귀 검사 (마이그레이션 123) — TMA 검사(contract-esign.test.mjs)의 미러.
// 공개 경로(/sign/c, /api/sign/c)와 service role 클라이언트가 얽히는 기능이라
// 아래 보안 불변조건을 정적으로 고정한다.
//  1) 마이그레이션: RLS + is_approved_user, DELETE 정책 없음, anon 정책 없음, 토큰 UNIQUE
//  2) 서명 토큰: 256bit 랜덤 생성, 만료·상태 검증, 이중 제출 차단
//  3) 개인정보: 상대방 입력값은 signer_fields_enc 로 통째 암호화, 평문 저장 없음,
//     서명 페이지 데이터에 암호문이 실리지 않음
//  4) 발송된 문서는 수정 불가(draft 에서만 편집), 서명 완료본은 취소·숨김 불가
//  5) 새 버킷은 직원 SELECT 정책만(쓰기는 전부 service role — INSERT 정책 자체가 없음)
//  6) 공개 페이지 robots 제외 + 서명 API 의 IP/기기 증거
// 실행: node --test scripts/company-contracts.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const migration = read("supabase/migrations/123_company_contracts.sql");
const signService = read("src/lib/contracts/signService.ts");
const actions = read("src/lib/contracts/actions.ts");

/** actions.ts 에서 특정 export 함수 본문만 잘라낸다 */
function fnBody(source, name) {
  const start = source.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `${name} 액션이 없습니다`);
  const next = source.indexOf("export async function", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

// ------------------------------------------------------------
// 1) 마이그레이션 불변조건
// ------------------------------------------------------------
test("마이그 123: 두 테이블 모두 RLS + is_approved_user 정책", () => {
  assert.match(migration, /ALTER TABLE public\.company_contract_templates ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE public\.company_contract_documents ENABLE ROW LEVEL SECURITY/);
  const count = (migration.match(/public\.is_approved_user\(\)/g) ?? []).length;
  assert.ok(count >= 7, `is_approved_user 사용이 ${count}회뿐입니다(정책 누락 의심)`);
});

test("마이그 123: DELETE 정책 없음(이력 보존) + anon 정책 없음(공개 접근은 service role 만)", () => {
  assert.doesNotMatch(migration, /FOR DELETE/i, "서명 이력은 증거라 DELETE 정책을 만들면 안 됩니다");
  assert.doesNotMatch(migration, /TO anon/i, "anon 정책이 생기면 토큰 검증 없는 직접 접근이 열립니다");
  assert.doesNotMatch(migration, /GRANT[\s\S]*?anon/i);
});

test("마이그 123: 서명 토큰 UNIQUE + 멱등 DDL + KST 규칙", () => {
  assert.match(migration, /sign_token text UNIQUE/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.company_contract_templates/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.company_contract_documents/);
  assert.match(migration, /DROP POLICY IF EXISTS/);
  assert.doesNotMatch(migration, /CURRENT_DATE/);
});

test("마이그 123: 새 버킷은 직원 SELECT 정책만 — INSERT/UPDATE 정책이 없어야 한다(쓰기는 service role)", () => {
  assert.match(migration, /'company-contract-docs'/);
  // storage.objects 에 붙는 정책 중 이 버킷용은 SELECT 하나뿐이어야 한다
  const storagePolicies =
    migration.match(/CREATE POLICY "[^"]+"\s*\n?\s*ON storage\.objects[\s\S]*?;/g) ?? [];
  assert.equal(storagePolicies.length, 1, "새 버킷 정책은 SELECT 1개만 있어야 합니다");
  assert.match(storagePolicies[0], /FOR SELECT/);
});

// ------------------------------------------------------------
// 2) 토큰 생성·검증·이중 제출 차단
// ------------------------------------------------------------
test("signService: service role 사용 전 반드시 토큰으로 문서를 찾는다", () => {
  assert.match(signService, /TOKEN_RE = \/\^\[A-Za-z0-9_-\]\{30,64\}\$\//);
  assert.match(signService, /\.eq\("sign_token", token\)/);
});

test("발송: 토큰은 256bit 랜덤 + 만료 시각 + draft 상태 가드", () => {
  const body = fnBody(actions, "sendCompanyDocument");
  assert.match(body, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(body, /token_expires_at/);
  assert.match(body, /\.eq\("status", "draft"\)/);
});

test("제출: sent 상태에서만, 만료 검사 후, status 조건으로 이중 제출을 막는다", () => {
  assert.match(signService, /doc\.status !== "sent"/);
  assert.match(signService, /isExpired\(doc\)/);
  assert.match(
    signService,
    /update\(\{\s*status: "signed"[\s\S]*?\.eq\("status", "sent"\)/,
    "signed 전환 UPDATE 에 .eq(status,'sent') 가드가 없습니다",
  );
});

// ------------------------------------------------------------
// 3) 개인정보 암호화 (통째 암호화 방식)
// ------------------------------------------------------------
test("서명 제출: 상대방 입력값은 signer_fields_enc 로 통째 암호화 저장", () => {
  assert.match(
    signService,
    /signer_fields_enc: encryptSecret\(/,
    "상대방 입력값이 암호화 없이 저장됩니다",
  );
  // 평문 저장 컬럼이 생기면 안 된다
  assert.doesNotMatch(signService, /signer_fields:\s/, "signer_fields 평문 컬럼 저장 금지");
});

test("서명 페이지 데이터: 암호문(signer_fields_enc)을 절대 select 하지 않는다", () => {
  // signService 안에서 signer_fields_enc 등장은 "암호화해서 저장" 한 곳뿐이어야 한다.
  // select 목록에 끼면 공개 페이지로 새어 나갈 수 있다.
  const total = (signService.match(/signer_fields_enc/g) ?? []).length;
  const encrypted = (signService.match(/signer_fields_enc: encryptSecret\(/g) ?? []).length;
  const inComment = (signService.match(/^\s*\/\/.*signer_fields_enc/gm) ?? []).length;
  assert.equal(
    total,
    encrypted + inComment,
    "signer_fields_enc 가 암호화 저장 외의 위치(select 등)에서 쓰였습니다",
  );
  // 목록/문서 조회(직원용)도 마찬가지 (주석 줄은 제외하고 코드만 검사)
  const actionsCode = actions
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.doesNotMatch(actionsCode, /signer_fields_enc/, "직원용 액션이 암호문 컬럼을 다룹니다");
});

// ------------------------------------------------------------
// 4) 발송 후 수정 잠금 · 증거 보존
// ------------------------------------------------------------
test("문서 편집은 draft 상태에서만 가능하다", () => {
  const body = fnBody(actions, "updateCompanyDocument");
  assert.match(body, /\.eq\("status", "draft"\)/, "발송된 문서 수정을 DB 조건으로 막아야 합니다");
});

test("서명 완료본은 취소 불가(증거 보존)", () => {
  const body = fnBody(actions, "cancelCompanyDocument");
  assert.match(body, /\.in\("status", \["draft", "sent"\]\)/);
});

test("서명 완료본은 목록 숨김도 불가(증거 보존)", () => {
  const body = fnBody(actions, "hideCompanyDocument");
  assert.match(body, /\.in\("status", \["draft", "canceled"\]\)/);
});

test("보관함 계약서 탭(일반) 목록은 2차 비밀번호 잠금을 지난다", () => {
  const body = fnBody(actions, "getSignedCompanyContractsForVault");
  assert.match(body, /requireVaultUnlock\(/, "보관함 계약서 목록이 잠금 확인 없이 열립니다");
});

// ------------------------------------------------------------
// 5) 공개 페이지·API 증거
// ------------------------------------------------------------
test("공개 서명 페이지: 검색엔진 제외 + 서명 API 가 IP/기기 증거를 남긴다", () => {
  const page = read("src/app/sign/c/[token]/page.tsx");
  assert.match(page, /robots.*index: false/s);
  const route = read("src/app/api/sign/c/[token]/route.ts");
  assert.match(route, /extractClientIp\(/);
  assert.match(route, /user-agent/);
});
