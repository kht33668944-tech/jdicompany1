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
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

/** 디렉터리 하위 전체 파일 나열 (재귀) */
function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

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

test("서명 화면: 상대방 입력을 계약서 본문 안에서 받는다", () => {
  const client = read("src/components/sign/CompanySignPageClient.tsx");
  // 칸을 눌러 그 자리에서 입력하는 구조. 아래 폼으로 되돌리면 어느 칸을 채우는지 알 수 없어진다.
  assert.match(
    client,
    /<ContractDocViewV2[\s\S]*?onFieldClick=/,
    "서명 페이지가 계약서 본문의 칸을 눌러 입력받지 않습니다(입력을 아래 폼으로 되돌린 듯)",
  );
  assert.match(client, /SignFieldPrompt/, "칸 입력창(SignFieldPrompt)이 연결되어 있지 않습니다");
});

test("서명 화면 개편이 서버 검증을 대체하지 않는다", () => {
  // 화면에서 필수 칸을 막더라도 최종 판단은 서버여야 한다.
  const service = read("src/lib/contracts/signService.ts");
  assert.match(service, /fieldDef\.required/, "signService 의 필수 입력 검증이 사라졌습니다");
  assert.match(service, /계약 내용 동의에 체크해주세요/);
  assert.match(service, /서명자 성명을 입력해주세요/);
});

// ------------------------------------------------------------
// 6) 고르는 칸(체크박스·드롭다운) — 값이 조용히 사라지거나 되돌아가지 않게
// ------------------------------------------------------------
test("새 칸 종류가 저장 시 text 로 강등되지 않는다", () => {
  // actions.ts 의 FIELD_TYPES 화이트리스트에 없으면 저장할 때마다 조용히 "text" 가 된다.
  const list = actions.slice(actions.indexOf("const FIELD_TYPES"), actions.indexOf("FIELD_KEY_RE"));
  for (const t of ["checkbox", "select"]) {
    assert.match(list, new RegExp(`"${t}"`), `FIELD_TYPES 에 ${t} 가 없어 저장 시 text 로 바뀝니다`);
  }
});

test("드롭다운 보기 목록(options)이 저장에서 사라지지 않는다", () => {
  // validateContentV2 는 필드를 새로 조립한다 — 여기 빠지면 저장할 때 소리 없이 없어진다.
  const body = actions.slice(actions.indexOf("const validFields"), actions.indexOf("const validated"));
  assert.match(body, /options:\s*validateOptions\(/, "저장 시 options 가 버려집니다");
  assert.match(actions, /function validateOptions/, "보기 목록 검증이 없습니다");
});

test("고르는 칸도 서버가 값을 다시 검증한다", () => {
  // 화면에서 목록으로만 고르게 해도, 사람이 요청을 직접 만들면 아무 값이나 보낼 수 있다.
  assert.match(
    signService,
    /fieldDef\.options\s*\?\?\s*\[\]\)\.includes\(/,
    "드롭다운 값이 목록 안에 있는지 서버가 확인하지 않습니다",
  );
  assert.match(signService, /CHECKBOX_ON/, "체크박스 값 검증이 없습니다");
});

test("PDF 체크 표시는 Pretendard 에 있는 글자만 쓴다", () => {
  // ☑(U+2611)·☐(U+2610)는 Pretendard 에 없어 PDF 에 빈칸으로 찍힌다(fontkit 으로 확인).
  // 화면(HTML)은 시스템 글꼴을 쓰므로 상관없다 — PDF 로 가는 코드만 본다.
  // 주석에는 이 글자들이 설명으로 등장하므로 주석 줄을 걷어내고 검사한다.
  const stripComments = (src) =>
    src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");

  assert.match(read("src/lib/contracts/constants.ts"), /PDF_CHECK_ON\s*=\s*"\[✓\]"/);
  for (const rel of ["src/lib/contracts/pdf.ts", "src/lib/contracts/constants.ts"]) {
    assert.doesNotMatch(
      stripComments(read(rel)),
      /[☐☑]/,
      `${rel} 이 PDF 에 폰트에 없는 체크 글자를 씁니다`,
    );
  }
});

// ------------------------------------------------------------
// 7) 발송 전 PDF 미리보기 — 서명 안 된 PDF 가 진짜 계약서로 오해되지 않게
// ------------------------------------------------------------
test("PDF 미리보기 라우트: 로그인 직원 전용 + service role 금지", () => {
  const route = read("src/app/api/contracts/[docId]/preview-pdf/route.ts");
  assert.match(route, /getAuthUser\(\)/, "미리보기 라우트에 로그인 확인이 없습니다");
  assert.match(route, /status:\s*401/, "로그인하지 않은 요청을 401 로 막지 않습니다");
  assert.doesNotMatch(
    route,
    /createAdminClient|SERVICE_ROLE/,
    "미리보기는 RLS 클라이언트로만 읽어야 합니다(service role 금지)",
  );
});

test("PDF 미리보기 라우트: 초안만 허용 + 미리보기 표시를 반드시 켠다", () => {
  const route = read("src/app/api/contracts/[docId]/preview-pdf/route.ts");
  assert.match(route, /status\s*!==\s*"draft"/, "발송본·서명본까지 미리보기가 열립니다");
  assert.match(route, /preview:\s*true/, "워터마크 없는 PDF 가 나갑니다");
  assert.match(route, /signatureDataUrl:\s*null/, "미리보기에 서명 이미지가 들어갑니다");
});

test("양식 PDF 미리보기 라우트: 로그인 직원 전용 + service role 금지 + 미리보기 표시", () => {
  const route = read("src/app/api/contracts/templates/[templateId]/preview-pdf/route.ts");
  assert.match(route, /getAuthUser\(\)/, "양식 미리보기 라우트에 로그인 확인이 없습니다");
  assert.match(route, /status:\s*401/, "로그인하지 않은 요청을 401 로 막지 않습니다");
  assert.doesNotMatch(
    route,
    /createAdminClient|SERVICE_ROLE/,
    "미리보기는 RLS 클라이언트로만 읽어야 합니다(service role 금지)",
  );
  assert.match(route, /preview:\s*true/, "워터마크 없는 PDF 가 나갑니다");
  assert.match(route, /signatureDataUrl:\s*null/, "미리보기에 서명 이미지가 들어갑니다");
});

test("저장은 대상 id 를 돌려준다 — 새 양식도 곧바로 미리볼 수 있게", () => {
  const screen = read("src/components/dashboard/contracts/ContractEditorScreen.tsx");
  assert.match(
    screen,
    /const save = async \(\): Promise<string \| null>/,
    "save() 가 id 를 돌려주지 않으면 새 양식 미리보기가 방금 만든 양식을 못 찾습니다",
  );
  assert.match(
    screen,
    /templates\/\$\{savedId\}\/preview-pdf/,
    "양식 미리보기가 저장 직후의 id 를 쓰지 않습니다",
  );
});

test("진짜 서명 완료본에는 미리보기 표시가 붙지 않는다", () => {
  assert.doesNotMatch(
    signService,
    /preview:\s*true/,
    "서명 완료본 PDF 에 미리보기 워터마크가 찍힙니다",
  );
  const pdf = read("src/lib/contracts/pdf.ts");
  // 전자서명 확인서는 체결 증명이라 미리보기에는 붙이면 안 된다
  assert.match(
    pdf,
    /input\.preview\s*\?\s*\[\]\s*:\s*auditSection\(input\)/,
    "미리보기에도 전자서명 확인서가 붙습니다",
  );
});

// ------------------------------------------------------------
// 8) 조항 제목 줄의 채움 칸 — 화면·PDF 가 본문과 똑같이 그린다
//    (한 곳이라도 통글자로 되돌리면 "{{f1}}" 이 계약서에 그대로 인쇄된다)
// ------------------------------------------------------------
test("화면: 조항 제목 줄도 토큰을 분해해 그린다", () => {
  const view = read("src/components/shared/ContractDocViewV2.tsx");
  assert.match(
    view,
    /<h2[^>]*>\s*<Runs runs=\{tokenizeParagraph\(clause\.heading\)\}/,
    "조항 제목을 {clause.heading} 통글자로 그리면 채움 칸이 글자로 보입니다",
  );
});

test("PDF: 조항 제목 줄도 토큰을 분해해 인쇄한다", () => {
  const pdf = read("src/lib/contracts/pdf.ts");
  assert.match(
    pdf,
    /text:\s*runsToText\(tokenizeParagraph\(clause\.heading\)/,
    "조항 제목을 통글자로 인쇄하면 PDF 에 {{fN}} 이 그대로 찍힙니다",
  );
});

// ------------------------------------------------------------
// 9) 문서형 편집기(TipTap) 격리 — 초기 JS 예산 보호
//    /dashboard 예산 여유가 1KB 미만이라 에디터가 공용 청크로 새면 즉시 실패한다.
// ------------------------------------------------------------
test("계약관리 lib 은 TipTap 을 import 하지 않는다(순수 모듈 유지)", () => {
  const libFiles = listFiles(path.join(root, "src", "lib", "contracts")).filter((f) =>
    /\.tsx?$/.test(f),
  );
  const offenders = libFiles.filter((f) => /@tiptap/.test(readFileSync(f, "utf8")));
  assert.deepEqual(
    offenders.map((f) => path.relative(root, f)),
    [],
    "src/lib/contracts/* 가 TipTap 을 끌어오면 서버·공용 번들로 새어 초기 JS 예산이 깨집니다",
  );
});

test("편집기 컴포넌트는 dynamic 지연 로드로만 불린다(정적 import 금지)", () => {
  const srcFiles = listFiles(path.join(root, "src")).filter((f) => /\.tsx?$/.test(f));
  const editorFile = path.join("contracts", "ContractRichEditor.tsx");

  const staticImporters = srcFiles.filter((f) => {
    if (f.endsWith(editorFile)) return false;
    const source = readFileSync(f, "utf8");
    // import ... from "./ContractRichEditor" 형태(정적)만 잡는다. dynamic(() => import(...)) 는 허용.
    return /^\s*import\s+[^;]*?from\s+["'][^"']*ContractRichEditor["']/m.test(source);
  });
  assert.deepEqual(
    staticImporters.map((f) => path.relative(root, f)),
    [],
    "ContractRichEditor 는 next/dynamic(ssr:false) 로만 불러야 합니다",
  );

  // 실제 사용처는 dynamic 으로 부르고 있어야 한다
  const screen = read("src/components/dashboard/contracts/ContractEditorScreen.tsx");
  assert.match(screen, /dynamic\(\(\) => import\("\.\/ContractRichEditor"\)/);
  assert.match(screen, /ssr:\s*false/);
});
