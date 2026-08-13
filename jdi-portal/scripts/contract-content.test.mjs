// 계약관리 순수 코어(붙여넣기 파서 + 필드 토크나이저) 단위 테스트
// 실행: npm run test:contracts (node --experimental-strip-types --test)

import assert from "node:assert/strict";
import test from "node:test";
import { parseContractText } from "../src/lib/contracts/parse.ts";
import {
  tokenizeParagraph,
  tokenizeBody,
  collectFieldKeys,
  resolveParagraphs,
  buildValueMap,
  nextFieldKey,
} from "../src/lib/contracts/tokens.ts";
import {
  contentToDoc,
  docToContent,
  docHasTermsBlock,
  renumberHeading,
} from "../src/lib/contracts/richdoc.ts";
import { TERMS_MARKER } from "../src/lib/contracts/constants.ts";

// ---------- 붙여넣기 파서 ----------

test("파서: 여러 조항을 제N조 제목 줄로 나눈다", () => {
  const raw = [
    "용역 계약서",
    "갑과 을은 다음과 같이 계약한다.",
    "제1조 (목적)",
    "이 계약은 용역의 내용을 정한다.",
    "둘째 줄.",
    "제2조 (대금)",
    "갑은 을에게 대금을 지급한다.",
  ].join("\n");
  const parsed = parseContractText(raw);
  assert.equal(parsed.intro, "용역 계약서\n갑과 을은 다음과 같이 계약한다.");
  assert.equal(parsed.clauses.length, 2);
  assert.equal(parsed.clauses[0].heading, "제1조 (목적)");
  assert.equal(parsed.clauses[0].body, "이 계약은 용역의 내용을 정한다.\n둘째 줄.");
  assert.equal(parsed.clauses[1].heading, "제2조 (대금)");
  assert.equal(parsed.clauses[1].body, "갑은 을에게 대금을 지급한다.");
});

test("파서: '제 1 조' 공백 변형과 CRLF 도 인식한다", () => {
  const parsed = parseContractText("제 1 조 (목적)\r\n본문 첫 줄\r\n제  2  조\r\n둘째 조 본문");
  assert.equal(parsed.clauses.length, 2);
  assert.equal(parsed.clauses[0].heading, "제 1 조 (목적)");
  assert.equal(parsed.clauses[1].body, "둘째 조 본문");
});

test("파서: 제목 줄이 없으면 전체를 조항 1개로 폴백", () => {
  const parsed = parseContractText("자유 형식 합의문\n서로 협력한다.");
  assert.equal(parsed.intro, "");
  assert.equal(parsed.clauses.length, 1);
  assert.equal(parsed.clauses[0].heading, "");
  assert.equal(parsed.clauses[0].body, "자유 형식 합의문\n서로 협력한다.");
});

test("파서: 빈 입력은 빈 결과", () => {
  assert.deepEqual(parseContractText("   \n  "), { intro: "", clauses: [] });
});

// ---------- 토크나이저 ----------

test("토크나이저: 토큰 없는 문단은 text 런 하나", () => {
  assert.deepEqual(tokenizeParagraph("그냥 글"), [{ type: "text", text: "그냥 글" }]);
});

test("토크나이저: 여러·인접 토큰을 분해한다", () => {
  assert.deepEqual(tokenizeParagraph("금 {{f1}}원({{f2}}{{f3}})"), [
    { type: "text", text: "금 " },
    { type: "field", key: "f1" },
    { type: "text", text: "원(" },
    { type: "field", key: "f2" },
    { type: "field", key: "f3" },
    { type: "text", text: ")" },
  ]);
});

test("토크나이저: {{TERMS}} 나 {{이름}} 같은 비필드 표기는 텍스트로 남긴다", () => {
  assert.deepEqual(tokenizeParagraph("{{TERMS}} 와 {{이름}}"), [
    { type: "text", text: "{{TERMS}} 와 {{이름}}" },
  ]);
});

test("토크나이저: 본문을 문단별로 나누고 공백 문단은 버린다", () => {
  const runs = tokenizeBody("첫 문단 {{f1}}\n\n  \n둘째 문단");
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[1], [{ type: "text", text: "둘째 문단" }]);
});

const CONTENT = {
  version: 2,
  title: "테스트",
  intro: "서문 {{f1}}",
  clauses: [
    { heading: "제1조", body: "본문 {{f2}} 와 {{f9}}" },
    { heading: "제2조", body: "{{TERMS}}" },
  ],
  fields: [
    { key: "f1", kind: "staff", label: "금액", type: "text", required: true, value: "100" },
    { key: "f2", kind: "party", label: "주소", type: "text", required: true },
  ],
  company: { name: "", ceo: "", address: "", manager: "", managerContact: "" },
  closing: "맺음 {{f2}}",
  footnote: "",
};

test("collectFieldKeys: 서문·조항·맺음말의 토큰을 모두 수집한다", () => {
  assert.deepEqual([...collectFieldKeys(CONTENT)].sort(), ["f1", "f2", "f9"]);
});

test("resolveParagraphs: 값 치환, 값 없는 키는 리터럴 유지", () => {
  const values = new Map([["f2", "서울시"]]);
  assert.deepEqual(resolveParagraphs("본문 {{f2}} 와 {{f9}}", values), [
    "본문 서울시 와 {{f9}}",
  ]);
});

test("buildValueMap: staff value + party 입력 병합, 공백 값 제외", () => {
  const map = buildValueMap(CONTENT, { f2: " 부산시 ", f9: "  " });
  assert.equal(map.get("f1"), "100");
  assert.equal(map.get("f2"), "부산시");
  assert.equal(map.has("f9"), false);
});

test("nextFieldKey: 최댓값 + 1 (삭제 번호 재사용 없음)", () => {
  assert.equal(nextFieldKey(CONTENT), "f3");
  assert.equal(
    nextFieldKey({ ...CONTENT, fields: [{ key: "f7", kind: "staff", label: "", type: "text", required: false }] }),
    "f8",
  );
  assert.equal(nextFieldKey({ ...CONTENT, fields: [] }), "f1");
});

// ---------- 굵게 표기 ----------

test("토크나이저: **굵게** 표기를 bold 런으로 분해한다", () => {
  assert.deepEqual(tokenizeParagraph("보통 **강조** 끝"), [
    { type: "text", text: "보통 " },
    { type: "text", text: "강조", bold: true },
    { type: "text", text: " 끝" },
  ]);
});

test("토크나이저: 굵게가 없으면 bold 키를 아예 넣지 않는다", () => {
  // 기존 deepEqual 테스트들이 여분 키에 엄격하므로 bold:false 를 내보내면 안 된다
  const runs = tokenizeParagraph("그냥 글 {{f1}}");
  assert.deepEqual(runs[0], { type: "text", text: "그냥 글 " });
});

test("토크나이저: 굵게와 필드 토큰이 섞여도 순서대로 분해된다", () => {
  assert.deepEqual(tokenizeParagraph("금 {{f1}}원은 **부가세 별도**"), [
    { type: "text", text: "금 " },
    { type: "field", key: "f1" },
    { type: "text", text: "원은 " },
    { type: "text", text: "부가세 별도", bold: true },
  ]);
});

// ---------- 편집기 문서 ↔ ContentV2 왕복 ----------

const BASE = {
  version: 2,
  title: "",
  intro: "",
  clauses: [],
  fields: [],
  company: { name: "회사", ceo: "대표", address: "주소", manager: "", managerContact: "" },
  closing: "맺음말",
  footnote: "",
};

test("왕복: 제목·서문·조항·칩·굵게가 보존된다", () => {
  const original = {
    ...BASE,
    title: "용역 계약서",
    intro: "갑과 을은 다음과 같이 합의한다.",
    clauses: [
      { heading: "제1조 (목적)", body: "이 계약은 **중요한** 목적을 가진다." },
      { heading: "제2조 (대금)", body: "금 {{f1}}원을 지급한다.\n계좌는 {{f2}} 로 한다." },
    ],
    fields: [
      { key: "f1", kind: "staff", label: "금액", type: "text", required: true, value: "100" },
      { key: "f2", kind: "party", label: "계좌", type: "account", required: true },
    ],
  };
  const roundTripped = docToContent(contentToDoc(original), BASE);
  assert.equal(roundTripped.title, original.title);
  assert.equal(roundTripped.intro, original.intro);
  assert.deepEqual(roundTripped.clauses, original.clauses);
});

test("왕복: 조건표 조항({{TERMS}})이 블록으로 갔다가 그대로 돌아온다", () => {
  const original = {
    ...BASE,
    title: "계약서",
    clauses: [
      { heading: "제1조 (목적)", body: "본문." },
      { heading: "제2조 (조건)", body: TERMS_MARKER },
    ],
    terms: [{ section: "기본", label: "금액", value: "100" }],
  };
  const doc = contentToDoc(original);
  assert.equal(docHasTermsBlock(doc), true);
  const back = docToContent(doc, BASE);
  assert.equal(back.clauses.length, 2);
  assert.equal(back.clauses[1].body, TERMS_MARKER);
});

test("왕복: 제목만 있고 조항이 없으면 서문이 조항으로 옮겨진다(검증 통과용)", () => {
  const back = docToContent(contentToDoc({ ...BASE, title: "제목", intro: "본문만 있음" }), BASE);
  assert.equal(back.clauses.length, 1);
  assert.equal(back.clauses[0].body, "본문만 있음");
  assert.equal(back.intro, "");
});

// ---------- 조항 번호 다시 매기기 ----------

test("renumberHeading: 제N조로 시작하는 제목만 번호를 바꾼다", () => {
  assert.equal(renumberHeading("제5조 (목적)", 1), "제1조 (목적)");
  assert.equal(renumberHeading("제 7 조 (대금)", 2), "제2조 (대금)");
  assert.equal(renumberHeading("부칙", 3), "부칙");
  assert.equal(renumberHeading("", 4), "");
});
