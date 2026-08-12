# 2026 TMA 인플루언서 계약/협업 관리 — 설계

- 작성일: 2026-08-12
- 구현 계획: `docs/superpowers/plans/2026-08-12-influencer-contracts.md`
- 마이그레이션: `supabase/migrations/119_influencer_contracts.sql`

## 1) 문제

크리스마스 시즌(2026 TMA) 인플루언서 100명 협업을 운영해야 하는데, 계약 조건(협업 유형·금액·2차 활용·촬영 원본), 일정(발송/초안/게시), 상태(후보→정산 완료 10단계), 모두싸인 문서 링크를 한 화면에서 관리할 곳이 없다. 정산에는 개인정보(휴대폰·집주소·계좌·신분증 사진)도 필요해서, 아무나 볼 수 없게 보호 장치가 필요하다.

## 2) 목표

- 인플루언서 메뉴 안 세 번째 탭 "TMA 계약"(`/dashboard/influencer/contracts`)으로 계약 CRUD + 검색/필터/상태별 보기.
- 임박(3일 이내)·지난 날짜를 눈에 띄게, 취소/정산 완료 행은 조용하게.
- 정산 개인정보는 **보관함과 같은 2차 비밀번호**를 풀어야만 열람/수정.

비목표(YAGNI): 모두싸인 API 연동(수동 링크만), 엑셀 내보내기, 대시보드 위젯, 알림 연동, 시딩 리스트(`influencers`)와의 연결.

## 3) 핵심 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 테이블 | 신규 `influencer_contracts` (111 계열과 독립, FK 없음) | 시딩 리스트에 없는 인원도 계약만 먼저 등록. 111~116은 기록만 있고 미적용 상태라 의존 위험 |
| 시즌 구분 | `season` 컬럼(기본 `'2026-tma'`), UI 미노출 | 내년 재사용 시 스키마 변경 없음 |
| 삭제 | `is_deleted` 소프트 삭제 + DELETE 정책 자체를 안 만듦 | 실수/우회 삭제를 DB 차원 차단 |
| 게시 유지 종료일 | 저장하지 않고 앱 계산(실제 게시일+6개월, 월말 클램핑) | 파생값 동기화 버그 방지 |
| 허용 범위 3종 | boolean 3컬럼 | 고정 항목, 타입 안전 |
| 정산 개인정보 | 별도 테이블 `influencer_contract_settlements`, **암호문만 저장**(AES-256-GCM, `ACCOUNT_VAULT_KEY`) | 목록 전량 로드 시 개인정보가 브라우저로 내려가지 않게 분리. RLS로 승인 직원이 직접 select 해도 암호문뿐(106 vault_accounts 모델) |
| 2차 비밀번호 | 보관함(106) 게이트 재사용 — `verify_vault_gate` RPC + 잠금 쿠키(`vault_unlock`) | 새 RPC/비밀번호 불필요, 운영자는 이미 아는 비밀번호 하나 |
| 신분증 파일 | 비공개 버킷 `influencer-contract-docs`(10MB), 열람은 60초 signed URL, 잠금 해제 후 서버 액션으로만 발급 | vault-documents 패턴 |
| 데이터 로드 | 시즌당 100명 → 전량 로드 + 클라이언트 필터 | 즉각 반응, 페이지네이션 불필요 |

## 4) 데이터 변경 (마이그레이션 119)

- `influencer_contracts`: 기본 정보 / 제품·금액(부가세 포함 기본 TRUE) / 2차 활용 / 촬영 원본 / 일정 4종 / 상태 10단계 CHECK / 모두싸인 링크 / 메모 / `is_deleted`. RLS 3정책(view/create/update, is_approved_user), `set_updated_at()` 트리거, 부분 인덱스 2개.
- `influencer_contract_settlements`: `contract_id` UNIQUE FK CASCADE, `phone_enc` 등 암호문 5종, `id_card_path/name`. RLS 3정책, 트리거.
- Storage 버킷 `influencer-contract-docs`(비공개): 읽기/업로드 승인 직원, 삭제 관리자.

## 5) 화면

- `src/app/dashboard/influencer/contracts/page.tsx` — 서버 로드(계약 전량 + 정산 등록 id + 게이트 설정 여부 + 잠금 쿠키 상태).
- `src/components/dashboard/influencer/contracts/`
  - `ContractsPageClient` — 탭/제목/상태 칩/검색+필터 5종(상태·협업유형·제품·2차활용·게시월)/테이블/모달 조립
  - `ContractsTable` — 핵심 11컬럼, sticky 헤더, 임박(amber)/지남(red) 강조, 상태 인라인 드롭다운, 정산정보 등록 여부 표시
  - `ContractDetailPanel` — 전체 필드 6섹션 + **정산 정보 잠금 섹션**(해제 → 평문 표시 + 신분증 보기 + 수정 버튼) + 삭제(confirm→소프트)
  - `ContractFormModal` — 계약 필드 6섹션, 협업 유형/정산 구분/2차 활용/원본 선택에 따라 조건부 노출, 유지 종료일 자동 표시
  - `SettlementFormModal` — 정산 정보 입력(잠금 해제 상태에서 상세 패널을 통해서만)
- 날짜 강조 규칙: 발송/초안/게시 예정일 D-3 amber·지남 red(해당 단계 지난 상태면 억제), 취소/정산 완료 행은 전부 억제.
- 기존 파일 수정: `InfluencerTabs.tsx` 탭 1줄, `Header.tsx` 제목 맵 1줄. 대시보드 빠른 경로/사이드바는 해당 없음.

## 6) 검증

- `npm run lint` / `npm run build` / `npm run test:performance` / `npm run test:security`
- 신규 정적 테스트 `scripts/influencer-contracts.test.mjs`: RLS·소프트 삭제·개인정보 미노출·잠금 게이트·월말 클램핑 검증
- 수동: 추가→목록→상태 변경→상세→잠금 해제→정산 입력→신분증 보기→수정→삭제 (샘플은 가상 명칭만)

## 7) 남은 TODO

- 모두싸인 API 자동 연동(발송·서명 웹훅 → 상태 자동 전이)
- 엑셀 내보내기 / 대시보드 KPI 위젯 / 임박 알림 / 시딩 리스트→계약 전환 / 시즌 전환 UI
