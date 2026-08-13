// TMA 계약서 자체 전자서명 회귀 검사 (마이그레이션 122)
// 공개 경로(/sign, /api/sign)와 service role 클라이언트가 얽히는 기능이라
// 아래 보안 불변조건을 정적으로 고정한다.
//  1) 마이그레이션: RLS + is_approved_user, DELETE 정책 없음, anon 정책 없음, 토큰 UNIQUE
//  2) service role(admin) 클라이언트는 서명 흐름 서버 코드에서만 import 된다
//  3) 서명 토큰: 256bit 랜덤 생성, 만료·상태 검증, 이중 제출 차단
//  4) 개인정보: 서명 제출 시 전부 암호화(encryptSecret) 저장, 평문 저장 없음
//  5) 발송된 문서는 수정 불가(draft 에서만 편집)
//  6) 미들웨어: /sign, /api/sign 이 로그인 리다이렉트에서 제외되되,
//     인증 왕복 조기 생략(early return)은 여전히 health/keepalive 둘뿐이다
//  7) pdfmake(서버 전용)가 클라이언트 컴포넌트에 새지 않는다
// 실행: node --test scripts/contract-esign.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const migration = read("supabase/migrations/122_contract_esign.sql");
const middleware = read("src/lib/supabase/middleware.ts");
const signService = read("src/lib/influencer/contracts/documents/signService.ts");
const docActions = read("src/lib/influencer/contracts/documents/actions.ts");

/** src 하위 전체 파일 나열 (재귀) */
function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}
const srcFiles = listFiles(path.join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f));

// ------------------------------------------------------------
// 1) 마이그레이션 불변조건
// ------------------------------------------------------------
test("마이그 122: 두 테이블 모두 RLS + is_approved_user 정책", () => {
  assert.match(migration, /ALTER TABLE public\.influencer_contract_templates ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE public\.influencer_contract_documents ENABLE ROW LEVEL SECURITY/);
  const count = (migration.match(/public\.is_approved_user\(\)/g) ?? []).length;
  assert.ok(count >= 6, `is_approved_user 사용이 ${count}회뿐입니다(정책 누락 의심)`);
});

test("마이그 122: DELETE 정책 없음(이력 보존) + anon 정책 없음(공개 접근은 service role 만)", () => {
  assert.doesNotMatch(migration, /FOR DELETE/i, "서명 이력은 증거라 DELETE 정책을 만들면 안 됩니다");
  assert.doesNotMatch(migration, /TO anon/i, "anon 정책이 생기면 토큰 검증 없는 직접 접근이 열립니다");
  assert.doesNotMatch(migration, /GRANT[\s\S]*?anon/i);
});

test("마이그 122: 서명 토큰 UNIQUE + 멱등 DDL + KST 규칙", () => {
  assert.match(migration, /sign_token text UNIQUE/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.influencer_contract_templates/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.influencer_contract_documents/);
  assert.match(migration, /DROP POLICY IF EXISTS/);
  assert.doesNotMatch(migration, /CURRENT_DATE/);
});

// ------------------------------------------------------------
// 2) service role 클라이언트 격리
// ------------------------------------------------------------
test("admin 클라이언트는 서명 흐름 서버 코드에서만 import 된다", () => {
  const allowed = [
    path.join("lib", "supabase", "admin.ts"), // 정의 자체
    path.join("lib", "influencer", "contracts", "documents", "signService.ts"),
    path.join("lib", "contracts", "signService.ts"), // 계약관리(범용) 서명 흐름 — 마이그 123
  ];
  const offenders = srcFiles.filter((f) => {
    const source = readFileSync(f, "utf8");
    if (!/from ["']@\/lib\/supabase\/admin["']/.test(source)) return false;
    return !allowed.some((a) => f.endsWith(a));
  });
  assert.deepEqual(
    offenders.map((f) => path.relative(root, f)),
    [],
    "admin(service role) 클라이언트가 서명 흐름 밖에서 쓰였습니다 — RLS 우회 확산 금지",
  );
});

test("signService: service role 사용 전 반드시 토큰으로 문서를 찾는다", () => {
  assert.match(signService, /TOKEN_RE = \/\^\[A-Za-z0-9_-\]\{30,64\}\$\//);
  assert.match(signService, /\.eq\("sign_token", token\)/);
});

// ------------------------------------------------------------
// 3) 토큰 생성·검증·이중 제출 차단
// ------------------------------------------------------------
test("발송: 토큰은 256bit 랜덤 + 만료 시각이 함께 저장된다", () => {
  assert.match(docActions, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(docActions, /token_expires_at/);
});

test("제출: sent 상태에서만, 만료 검사 후, status 조건으로 이중 제출을 막는다", () => {
  assert.match(signService, /doc\.status !== "sent"/);
  assert.match(signService, /isExpired\(doc\)/);
  // 최종 확정 UPDATE 는 status='sent' 조건이 있어야 동시 제출 경쟁을 막는다
  assert.match(
    signService,
    /update\(\{\s*status: "signed"[\s\S]*?\.eq\("status", "sent"\)/,
    "signed 전환 UPDATE 에 .eq(status,'sent') 가드가 없습니다",
  );
});

// ------------------------------------------------------------
// 4) 개인정보 암호화
// ------------------------------------------------------------
test("서명 제출: 정산 개인정보 5종 전부 encryptSecret 으로 저장", () => {
  for (const col of ["phone_enc", "address_enc", "bank_name_enc", "bank_account_enc", "account_holder_enc"]) {
    assert.match(
      signService,
      new RegExp(`${col}: encryptSecret\\(`),
      `${col} 이 암호화 없이 저장됩니다`,
    );
  }
  // 평문 컬럼(phone:, address: 등)으로 직접 넣는 코드가 없어야 한다
  assert.doesNotMatch(signService, /^\s*(phone|address|bank_name|bank_account|account_holder):\s/m);
});

// ------------------------------------------------------------
// 5) 발송 후 수정 잠금
// ------------------------------------------------------------
test("보관함 계약서 탭 목록은 2차 비밀번호 잠금을 지난다", () => {
  const start = docActions.indexOf("export async function getSignedContractsForVault");
  assert.ok(start >= 0, "getSignedContractsForVault 액션이 없습니다");
  const body = docActions.slice(start, docActions.indexOf("export async function", start + 1));
  assert.match(body, /requireVaultUnlock\(/, "보관함 계약서 목록이 잠금 확인 없이 열립니다");
});

test("문서 편집은 draft 상태에서만 가능하다", () => {
  const start = docActions.indexOf("export async function updateDocumentContent");
  assert.ok(start >= 0);
  const body = docActions.slice(start, docActions.indexOf("export async function", start + 1));
  assert.match(body, /\.eq\("status", "draft"\)/, "발송된 문서 수정을 DB 조건으로 막아야 합니다");
});

test("서명 완료본은 취소 불가(증거 보존)", () => {
  const start = docActions.indexOf("export async function cancelDocument");
  assert.ok(start >= 0);
  const body = docActions.slice(start, docActions.indexOf("export async function", start + 1));
  assert.match(body, /\.in\("status", \["draft", "sent"\]\)/);
});

// ------------------------------------------------------------
// 6) 미들웨어 공개 경로
// ------------------------------------------------------------
test("미들웨어: /sign, /api/sign 은 로그인 리다이렉트 제외 목록에 있다", () => {
  assert.match(middleware, /startsWith\("\/sign\/"\)/);
  assert.match(middleware, /startsWith\("\/api\/sign\/"\)/);
});

test("미들웨어: 인증 왕복 조기 생략은 여전히 health/keepalive 둘뿐이다", () => {
  // createServerClient 생성 "이전"의 조기 return 블록에 /sign 이 끼어들면 안 된다
  const beforeClient = middleware.slice(0, middleware.indexOf("createServerClient("));
  const earlyPaths = [...beforeClient.matchAll(/pathname === "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(earlyPaths, ["/api/health", "/api/keepalive"]);
});

// ------------------------------------------------------------
// 7) 서버 전용 PDF 모듈 격리
// ------------------------------------------------------------
test("pdfmake/pdf.ts 는 클라이언트 컴포넌트로 새지 않는다", () => {
  const offenders = srcFiles.filter((f) => {
    const source = readFileSync(f, "utf8");
    const importsPdf =
      /from ["'](pdfmake|@\/lib\/influencer\/contracts\/documents\/pdf|\.\/pdf)["']/.test(source);
    if (!importsPdf) return false;
    // 서버 전용 허용: pdf.ts 자신 + signService.ts (TMA + 계약관리 범용, 각 도메인별)
    if (f.endsWith(path.join("documents", "pdf.ts"))) return false;
    if (f.endsWith(path.join("documents", "signService.ts"))) return false;
    if (f.endsWith(path.join("contracts", "pdf.ts"))) return false;
    if (f.endsWith(path.join("contracts", "signService.ts"))) return false;
    return true;
  });
  assert.deepEqual(offenders.map((f) => path.relative(root, f)), []);
});

test("공개 서명 페이지: 검색엔진 제외 + 서명 API 가 IP/기기 증거를 남긴다", () => {
  const page = read("src/app/sign/[token]/page.tsx");
  assert.match(page, /robots.*index: false/s);
  const route = read("src/app/api/sign/[token]/route.ts");
  assert.match(route, /extractClientIp\(/);
  assert.match(route, /user-agent/);
});
