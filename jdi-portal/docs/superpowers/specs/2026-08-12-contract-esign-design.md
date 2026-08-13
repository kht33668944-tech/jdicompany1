# TMA 계약서 자체 전자서명 시스템 — 설계

날짜: 2026-08-12 · 관련 기능: TMA 계약 관리(119~121) · 마이그레이션: 122

## 배경과 목표

모두싸인은 비용 문제로 영구 제외가 확정됐다(2026-08-12). 대신 계약서 생성부터
전자서명·보관까지 전부 포털 안에서 처리한다.

- 계약서 본문(양식)은 운영자가 **언제든 자유 편집** 가능해야 한다(사용자 명시 요구).
- 인플루언서는 **로그인 없이** 링크만 받아 휴대폰으로 열람 → 필수 정보 입력 → 손서명.
- 서명 완료본(PDF)과 증거 기록(열람/서명 시각, IP, UA, 문서 지문 SHA-256)을 보관한다.
- 서명 시 입력받은 정산 개인정보(주소·연락처·계좌)는 기존 정산 테이블에 **암호문으로
  자동 저장**(수작업 수집 제거).

법적 근거: 전자서명법(2020 개정) — 당사자가 합의한 전자서명은 서면 서명과 동일 효력.
기존 계약서 제15조가 이미 전자계약을 전제하며, 모두싸인 지칭 문구만 자체 시스템
표현으로 바꾼다. 갑 주소는 사업자등록증(2026-05-08 발급) 기준으로 갱신.

## 데이터 (마이그레이션 122)

- `influencer_contract_templates` — 계약 유형별(광고비형 `paid` / 순수협찬형 `seeding`)
  양식 1행. `content jsonb`. 기본 양식은 TS 상수(`documents/template.ts`)에 있고,
  DB 행이 있으면 그것을 우선한다(= 편집본).
- `influencer_contract_documents` — 계약서 1부 = 1행 (한 계약에 여러 부 가능: 취소 후
  재발송 이력 보존).
  - `content jsonb` (조항 + 조건표 값 스냅샷 — 생성 시점에 계약 데이터로 채움)
  - `status`: draft(편집 가능) → sent(잠금·서명 대기) → signed / canceled
  - `sign_token`(unique, 32바이트 랜덤) + `token_expires_at`(7일)
  - `sent_at/viewed_at/signed_at`, `signer_name`, `signature_path`, `signed_pdf_path`,
    `pdf_sha256`, `audit jsonb`(ip/ua)
- RLS: 두 테이블 모두 approved 사용자 SELECT/INSERT/UPDATE, **DELETE 정책 없음**,
  **anon 정책 없음** — 공개 서명 흐름은 서버의 service role 클라이언트만 사용.

## 핵심 흐름

1. **생성**: 상세 패널 → "계약서 만들기" → 계약 유형에 맞는 양식 + 계약 데이터로
   조건표(제2조) 자동 생성 → draft 저장.
2. **편집**: draft 상태에서만 조항·조건표 값·담당자 정보 수정 가능. sent 이후엔 잠금
   (수정하려면 발송 취소 후 새로 생성 — 서명 문서 무결성).
3. **발송**: 토큰 생성 → `/sign/{token}` 링크 복사 → DM/카톡으로 직접 전달(발송 비용 0).
   같은 계약의 기존 sent 문서는 자동 취소(동시 유효 링크 1개).
4. **서명(공개 페이지)**: 로그인 불필요. 본문 열람(viewed_at 기록) → 필수 입력
   (실명·주소·연락처·이메일·은행/계좌/예금주, 사업자면 등록번호, 신분증 사진 선택)
   → 캔버스 손서명 → 동의 체크 → 제출.
5. **완료 처리(서버, service role)**: 입력 검증 → PII 암호화 후
   `influencer_contract_settlements` upsert → 서명 PNG·신분증 업로드(비공개 버킷)
   → pdfmake 로 최종 PDF 생성(본문 + 조건표 + 서명란[회사 도장 + 손서명] + 전자서명
   확인서 페이지) → SHA-256 → 버킷 저장 → 문서 signed 전환 → 계약 상태가
   `contract_sent` 이하면 `signed` 로 자동 전진 + 시딩 캠페인 동기화(기존 linkSync).
6. **보관/열람**: 직원은 상세 패널에서 PDF 다운로드(승인 사용자, signed URL).
   인플루언서는 같은 토큰으로 서명 후 30일간 사본 다운로드 가능.

## 인증 경계

- `/sign/*`, `/api/sign/*` 는 미들웨어의 **로그인 리다이렉트 제외 목록**에 추가
  (login/signup 과 같은 층위). `/api/health`·`/api/keepalive` 의 "Supabase 클라이언트
  생성 전 조기 통과" 불변조건은 그대로 유지.
- 서버 전용 `SUPABASE_SERVICE_ROLE_KEY` 도입(`src/lib/supabase/admin.ts`).
  서명 흐름 서버 코드에서만 import 허용 — 회귀 테스트로 강제.
- 토큰은 유일 식별자이자 인가 수단: 256bit 랜덤, 만료 7일, 문서당 1개, 서명 완료 시
  쓰기 불가.

## PDF

- pdfmake 0.2(안정판) + Pretendard OTF(`public/fonts/`, OFL 라이선스) 서버 렌더.
- 클라이언트 번들에 절대 포함 금지(서버 route/action 에서만 dynamic import).
- 회사 도장 PNG 는 비공개 버킷 `influencer-contract-docs` 의 `company/stamp.png`.

## 편집 모델

- 템플릿/문서 공용 content 구조: `title / subtitle / intro / clauses[{heading, body}] /
  importantNote / closing / company{...}` + (문서만) `terms[{section,label,value}]`,
  서명자 입력 스냅샷.
- 제2조 자리는 body 가 `{{TERMS}}` 마커인 조항 — 렌더러가 조건표 표로 치환,
  편집 화면에서는 "자동 생성 표" 안내만 표시.
- 조건표 값은 문자열이라 건별로 자유 수정 가능(예: "협의 후 확정").

## 남길 TODO

- 서명 완료 시 직원 알림(웹 푸시) 연동
- 서명 페이지 다국어(영어) — 해외 인플루언서 대응
- 시즌 전환 시 템플릿 복제 UI
