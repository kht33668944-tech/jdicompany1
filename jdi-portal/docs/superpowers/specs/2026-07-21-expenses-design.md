# 지출 관리(Expenses) 설계 문서

- 작성일: 2026-07-21
- 상태: 사용자 승인 대기 (설계 내용은 대화에서 합의 완료)
- 범위: "A. AI 없는 완성형" — AI/외부 유료 API 없이 구현, 추가 운영비 0원

## 1. 배경과 목표

현재 회사 지출은 JANDI 채널 2개("JDI 결제 내역", "JDI 법카 사용 내역")에
`26.07.14 / SKV1 6월 관리비 416,140원 결제(기업은행 법인계좌이체)` 형식의
채팅 메시지로만 기록된다. 검색·월별 합계·회계사 전달용 정리가 불가능하다.

목표:

1. 포털 안에 "지출 관리" 도메인을 추가해 JANDI 채널을 **완전히 대체**한다.
2. 매달 고정 지출(구독·월세·관리비)은 한 번 등록하면 **자동 기록 + 결제 전 웹푸시 알림**.
3. 월별 지출을 **엑셀로 다운로드**해 세무사무소에 전달한다.
4. 급여·세금 내역은 **지정된 사람(대표·회계담당)만** 조회 가능 — RLS로 DB 단 차단.
5. 올해 JANDI 과거 내역은 화면을 만들지 않고, 사용자가 텍스트를 복사해 주면
   Claude가 파싱 → 미리보기 표로 확인받고 → DB에 직접 일괄 삽입한다. (가져오기 UI 없음)

## 2. 사용자와 권한

- 입력·조회·수정: 승인된 직원 전체 (기존 `is_approved_user()` 기준)
- 민감 분류(급여, 세금·공과금 중 급여성 항목 등 `is_sensitive = true`인 분류)의 지출:
  "민감 지출 열람" 권한 보유자만 조회 가능. 권한은 설정 > 관리자 화면에서
  관리자가 사용자별로 켜고 끈다 (`profiles.can_view_sensitive_expenses`).
- 모든 기록에 입력자/수정자와 시각이 남는다.

## 3. 화면 구성 (`/dashboard/expenses`)

사이드바에 "지출 관리" 메뉴 추가. 탭 2개.

### 탭 1: 지출 내역 (기본)

- 상단 요약: 선택한 달의 총합, 결제수단별 합계, 분류별 합계, 전월 대비 증감
- 빠른 입력 한 줄 폼: 날짜(기본 오늘)·거래처·내용·금액·통화(KRW/USD)·결제수단·분류.
  USD 선택 시 외화 금액 + 원화 환산액 입력. 엔터로 저장
- 목록: 월 선택 → 날짜별 그룹핑(잔디와 유사한 시간순), 검색(내용/거래처),
  필터(결제수단, 분류)
- 각 건: 수정/삭제, 영수증·증빙 사진 첨부(선택, 보관용 — 자동 인식 없음)
- 월별 엑셀 다운로드 버튼 (민감 열람 권한자는 민감 건 포함, 아니면 제외)

### 탭 2: 고정 지출

- 목록: 이름, 거래처, 금액(통화 포함), 매달 결제일, 결제수단, 분류, 담당자, 상태(활성/중지)
- 등록/수정/중지. 중지하면 이후 자동 생성 중단(기존 기록은 유지)
- 상단에 "월 고정비 총액"(원화 환산 합계) 표시
- 자동화: 매일 아침(KST) 서버 예약 작업이
  (a) 오늘이 결제일인 활성 고정 지출 → 지출 내역 자동 생성(source='recurring')
  (b) 내일이 결제일인 건 → 담당자에게 "내일 OOO 결제 예정" 웹푸시 알림

## 4. 데이터 모델 (마이그레이션 090)

- `expense_categories`: id, name, is_sensitive, sort_order, is_active.
  기본 시드: 세금·공과금, 급여(민감), 임차료·관리비, 구독·소프트웨어, 광고비,
  물류·배송, 비품·소모품, 식비·복리후생, 기타. DB 권한상 관리자만 추가/수정
  (분류 관리 전용 UI는 1단계 범위 밖 — 필요 시 후속 추가)
- `expenses`: id, expense_date(date), vendor, description, amount_krw(원 단위 정수),
  currency('KRW'|'USD'), amount_foreign(nullable), payment_method(text),
  category_id, receipt_path(nullable), source('manual'|'recurring'|'import'),
  recurring_id(nullable), created_by, updated_by, created_at, updated_at
- `recurring_expenses`: id, name, vendor, amount_krw, currency, amount_foreign,
  billing_day(1~31, 말일 초과 시 그 달 말일로 처리), payment_method, category_id,
  owner_id(담당자), is_active, note, created_at, updated_at
- 결제수단은 자유 텍스트 + 자주 쓰는 값 제안(기업은행 법인계좌이체, 법인카드,
  신한 광고비카드 등은 constants로 제공)
- RLS: 전 테이블 RLS 활성. 민감 분류 지출은
  `can_view_sensitive_expenses()` 헬퍼(대표/권한자) 통과 시에만 SELECT 허용.
  쓰기는 승인 직원 전체(단, 민감 분류로의 쓰기는 열람 권한자만)
- Storage: `expense-receipts` 버킷(비공개), 업로드는 `utils/upload.ts` 검증 사용
- 날짜는 전부 KST 기준: SQL은 `(NOW() AT TIME ZONE 'Asia/Seoul')::DATE`

## 5. 엑셀 형식 (월별)

컬럼: 날짜 | 거래처 | 내용 | 분류 | 금액(원) | 통화 | 외화금액 | 결제수단 | 증빙 | 입력자
마지막에 합계 행. 라이브러리는 버튼 클릭 시에만 지연 로드(초기 JS 예산 준수).

## 6. 하지 않는 것 (YAGNI)

- AI 영수증 인식(OCR) — 추후 원하면 추가 (월 수백 원 수준 API 비용)
- 은행·카드 명세서 자동 대조
- 전자결재/승인 흐름
- JANDI 가져오기 UI (Claude 직접 이관으로 대체)
- 환율 자동 조회 (원화 환산액은 손입력 — 카드사 청구액과 정확히 일치시키기 위함)

## 7. 성능·안전 제약

- 기존 기능 파일은 Sidebar 메뉴 등록, 설정 관리자 화면 확장 외 수정하지 않는다
- CLAUDE.md의 성능 불변조건 준수, 작업 후 `npm run test:performance` 통과 필수
- 엑셀 라이브러리는 dynamic import로만 로드
- Supabase 응답의 `error`는 항상 처리
- 마이그레이션은 기존 파일 수정 없이 090 신규 추가
