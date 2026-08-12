# 2026 TMA 인플루언서 계약 관리 — 구현 계획

설계: `docs/superpowers/specs/2026-08-12-influencer-contracts-design.md`

## 1. 마이그레이션

> 번호는 `npx supabase migration list --linked`의 Remote 최댓값+1로 확정(실제 적용: 119).

`supabase/migrations/119_influencer_contracts.sql` — 멱등 DDL, `influencer_contracts` + `influencer_contract_settlements`(암호문 컬럼) + 버킷 `influencer-contract-docs`. push 후 `migration list --linked`로 Remote 반영 확인.

## 2. lib — `src/lib/influencer/contracts/` (기존 파일 미수정)

- `constants.ts` — 버킷/시즌/유지 개월/임박 기준
- `types.ts` — 유니언 7종 + `InfluencerContract`/`ContractInput`/`ContractSettlement`
- `labels.ts` — LABEL/ORDER/OPTIONS 3종 세트 + 상태 배지·점 색 맵
- `dates.ts` — `addMonthsClamped`(월말 클램핑)/`getRetentionEnd`/`getDateUrgency`/`getPostMonth` (순수 함수, 테스트 대상)
- `queries.ts` — `getContracts()`(암호문 미포함 컬럼 명시, `is_deleted=false`), `getSettlementContractIds()`
- `actions.ts` — `createContract`/`updateContract`/`updateContractStatus`/`deleteContract`(소프트) + `getSettlement`/`upsertSettlement`/`getIdCardSignedUrl`(전부 `requireUnlock` 게이트, vault crypto 재사용)
- `storage.ts` — 신분증 클라이언트 업로드(`validateFile` 경유)

## 3. UI

- `src/app/dashboard/influencer/contracts/page.tsx` + `InfluencerTabs`/`Header` 각 1줄
- `src/components/dashboard/influencer/contracts/` — PageClient / Table / StatusBadge / StatusDropdown / DetailPanel / FormModal / SettlementFormModal (폼 모달 2종은 dynamic import)

## 4. 테스트·검증

- `scripts/influencer-contracts.test.mjs` 신규(정적 + `addMonthsClamped` 실행 검증)
- `npm run lint` → `npm run build` → `node --test scripts/influencer-contracts.test.mjs` → `npm run test:performance` → `npm run test:security`
