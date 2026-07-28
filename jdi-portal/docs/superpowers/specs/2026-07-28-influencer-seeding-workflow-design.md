# 인플루언서 시딩 업무 흐름 완성 — 설계서

- 작성일: 2026-07-28
- 대상 도메인: `influencer` (일부 `expenses` 연동)
- 마이그레이션: `111`, `112`

## 1. 배경

JDI는 **자사 제품**을 인플루언서에게 보내 게시물을 얻는 시딩을 한다. 상대는 광고주가 아니라 **인플루언서 본인**이다. 직원은 4명이므로 조직 관리 기능이 아니라 본업 처리 속도가 중요하다.

현재 사이트는 인플루언서 **발굴·분석**(자동 수집, 등급, 게시물 저장)은 잘 갖췄지만, 그 뒤 단계가 비어 있어 실무가 카카오톡과 엑셀로 빠져나간다.

| 실제 업무 순서 | 현재 지원 |
|---|---|
| 1. 인플루언서 찾기·판단 | 충분함 (`influencer-extract`, `influencer-analyze`, 등급) |
| 2. 제안 DM 발송 | 상태값 `dm_sent`만. 발송 내용·답장 기록 없음 |
| 3. 단가·조건 협의 | `cost` 한 칸. 협의 이력 없음 |
| 4. 주소·연락처 수령 | **저장 위치 없음** |
| 5. 제품 발송 | `ship_date`만. 택배사·송장번호 없음 |
| 6. 게시물 확인 | `post_url` 문자열만 저장 |
| 7. 성과 수집 | **캠페인에 수치가 없음.** KPI는 인원수·건수·비용뿐 |
| 8. 정산·지급 | `cost`만 존재. 지급 여부 없음. `expenses`와 단절 |
| 9. 재섭외 판단 | 등급이 팔로워·참여율 기준이라 자사 실적과 무관 |

### 핵심 발견

`influencer-extract`는 프로필 단위로 최근 게시물을 수집하면서 `influencer_posts`에 `likes` / `comments` / `view_count`를 이미 저장한다. **성과 수치는 이미 사이트 안에 있고, 캠페인과 연결되어 있지 않을 뿐이다.** 따라서 성과 집계에 새로운 외부 수집이 필요하지 않다.

## 2. 목표와 비목표

### 목표

1. 시딩 1건을 처리하는 데 필요한 정보(연락처·주소·정산·협의 이력·배송 추적)를 모두 사이트 안에 둔다.
2. 캠페인에 연결된 게시물의 성과 수치를 캠페인에 복사·보관하고 집계한다.
3. 인플루언서별 **자사 실적**(원가 대비 성과)을 재섭외 판단 근거로 제공한다.
4. 지급 완료 시 지출관리에 자동 반영한다.

### 비목표 (YAGNI)

- 광고주·클라이언트 개념 도입 — 자사 제품이므로 불필요
- 캠페인 상위 묶음(프로젝트) 계층 — 현재 규모에서 과함
- 제안 DM 자동 발송 — 인스타그램 정책·계정 위험. 초안 생성도 이번 범위 밖
- 계좌 정보 암호화·권한 분리 — 사용자 결정에 따라 일반 컬럼으로 둔다 (§7 참고)
- 성과 수치 자동 정기 갱신 — 사용자 결정에 따라 수동 버튼만

## 3. 데이터 설계

### 3.1 마이그레이션 `111_influencer_seeding_workflow.sql`

#### 새 테이블: `influencer_contacts`

인플루언서 1명당 1행. 배송 정보와 정산 정보를 함께 둔다.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `influencer_id` | uuid NOT NULL UNIQUE | `influencers(id)` ON DELETE CASCADE |
| `recipient_name` | text | 받는사람 |
| `phone` | text | |
| `postcode` | text | |
| `address1` | text | 기본 주소 |
| `address2` | text | 상세 주소 |
| `email` | text | |
| `bank_name` | text | 정산 |
| `account_number` | text | 정산 |
| `account_holder` | text | 정산 |
| `note` | text | |
| `created_by` | uuid | `profiles(id)` |
| `created_at` / `updated_at` | timestamptz | `updated_at` 트리거 |

RLS: `is_approved_user()` 기준 SELECT / INSERT / UPDATE / DELETE 허용. INSERT 시 `created_by = auth.uid()`.

#### 새 테이블: `influencer_campaign_events`

캠페인 1건의 협의·진행 이력. 수정 불가 기록으로 취급한다.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `campaign_id` | uuid NOT NULL | `influencer_campaigns(id)` ON DELETE CASCADE |
| `kind` | text NOT NULL | CHECK `('note','status_change')`, 기본 `'note'` |
| `body` | text | 사용자가 쓴 메모 |
| `from_status` | text | `status_change`일 때만 |
| `to_status` | text | `status_change`일 때만 |
| `created_by` | uuid | `profiles(id)` |
| `created_at` | timestamptz DEFAULT now() | |

- 인덱스: `(campaign_id, created_at DESC)`
- RLS: SELECT / INSERT 는 `is_approved_user()`. UPDATE 는 정책 없음(전면 차단). DELETE 는 `kind = 'note' AND created_by = auth.uid()` 인 경우만.

#### 자동 기록 트리거

`influencer_campaigns.status` 가 바뀌면 `AFTER UPDATE` 트리거가 `kind='status_change'` 행을 넣는다. `created_by` 는 `auth.uid()`. `auth.uid()` 가 NULL이면(배치 등) 기록을 건너뛴다.

#### `influencer_campaigns` 컬럼 추가

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `courier` | text | 택배사 |
| `tracking_number` | text | 송장번호 |
| `payout_status` | text NOT NULL DEFAULT `'none'` | CHECK `('none','pending','paid')` |
| `paid_at` | date | 지급일 |
| `expense_id` | uuid | `expenses(id)` ON DELETE SET NULL |

#### 지출 연동 준비

- `expense_categories` 에 `'인플루언서 시딩'` 카테고리를 `is_sensitive = FALSE` 로 시드 삽입한다 (`ON CONFLICT (name) DO NOTHING`). 민감 카테고리가 아니어야 `expense_category_visible()` 게이트를 4명 전원이 통과한다.
- `expenses.source` 의 CHECK 제약에 `'seeding'` 을 추가한다. 기존 값 `('manual','recurring','import')` 은 유지.

### 3.2 마이그레이션 `112_influencer_campaign_results.sql`

#### `influencer_campaigns` 성과 컬럼 추가

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `result_likes` | int | |
| `result_comments` | int | |
| `result_views` | int | |
| `result_captured_at` | timestamptz | 마지막 갱신 시각 (KST 표시는 클라이언트에서) |

게시물이 최근 목록에서 밀려나면 `influencer_posts` 에서 사라질 수 있으므로, 수치를 캠페인 행에 **복사해 보관**한다. 이것이 이 설계의 핵심이다.

#### KPI RPC 확장

기존 `082_influencer_kpi_rpc.sql` 의 `public.get_influencer_kpi_cards()` 를 `CREATE OR REPLACE` 로 갱신해 반환 JSON에 다음을 더한다. 이 함수는 현재 `SECURITY DEFINER` 가 아니므로 그대로 `SECURITY INVOKER` 를 유지한다(RLS가 그대로 적용된다).

- `total_result_views`, `total_result_likes`, `total_result_comments`
- `cost_per_10k_views` — `SUM(cost) / (SUM(result_views) / 10000.0)`, 분모 0이면 NULL

기존 필드는 그대로 두어 화면 호환을 유지한다. 단일 왕복 구조도 유지한다.

#### 새 RPC: `get_influencer_seeding_history(p_influencer_id uuid)`

해당 인플루언서와 진행한 시딩의 실적을 반환한다.

- `campaign_count`, `done_count`
- `total_cost`, `total_views`, `total_likes`, `total_comments`
- `avg_views` — 성과가 기록된 건 기준 평균
- `cost_per_10k_views`

권한 상승이 필요 없으므로 `SECURITY INVOKER` 로 만들고 접근 제어는 `influencer_campaigns` 의 RLS에 맡긴다.

#### 인덱스

- `idx_influencer_campaigns_influencer` on `(influencer_id)` — 인플루언서별 이력 조회용. 없으면 추가.
- 성과 집계는 `influencer_campaigns` 전체 SUM이며 이 테이블은 소규모라 전체 스캔이 허용된다. `tasks` 사전 필터 불변조건(§088)과는 무관한 별개 테이블이다.

## 4. 서버 액션 설계

기존 `src/lib/influencer/actions.ts` 는 이미 400줄대이므로 여기에 더하지 않고, 새 액션은 다음 두 파일에 나눠 넣는다.

- `src/lib/influencer/contact-actions.ts` — 연락처·정산·배송·지급
- `src/lib/influencer/result-actions.ts` — 성과 복사·갱신

기존 `linkPostToCampaign()` 만 예외적으로 `actions.ts` 에 남긴 채 확장한다(호출부가 이미 그 경로를 쓰고 있다).

### 4.1 연락처

```
upsertInfluencerContact(influencerId: string, input: InfluencerContactInput): Promise<void>
```

`influencer_id` UNIQUE 를 이용한 upsert. Supabase `error` 를 반드시 확인하고 실패 시 `errors.ts` 규약대로 처리한다.

### 4.2 협의 이력

```
addCampaignEvent(campaignId: string, body: string): Promise<InfluencerCampaignEvent>
deleteCampaignEvent(eventId: string): Promise<void>
```

`body` 는 공백 제거 후 비어 있으면 거부. 상태 변경 기록은 트리거가 넣으므로 액션이 따로 만들지 않는다.

### 4.3 배송

```
updateCampaignShipping(campaignId: string, input: { courier: string | null; tracking_number: string | null }): Promise<void>
```

### 4.4 지급 → 지출 자동 생성

```
markCampaignPaid(campaignId: string, input: { paidAt: string; paymentMethod: string }): Promise<void>
unmarkCampaignPaid(campaignId: string, deleteExpense: boolean): Promise<void>
```

`markCampaignPaid` 동작:

1. 캠페인의 `cost` 가 NULL 이거나 0이면 지출을 만들지 않고 `payout_status = 'paid'` 만 기록한다 (무상 시딩 대응).
2. `cost` 가 있으면 `expenses` 에 1건 생성한다.
   - `expense_date` = `paidAt` (KST 기준 날짜 문자열, 클라이언트에서 `date.ts` 로 생성)
   - `description` = `인플루언서 시딩 - {username}` + 제품명이 있으면 ` ({product_name})`
   - `vendor` = 인플루언서 `username`
   - `amount_krw` = `cost`
   - `payment_method` = 사용자가 고른 값
   - `category_id` = `'인플루언서 시딩'` 카테고리
   - `source` = `'seeding'`
   - `created_by` = `auth.uid()`
3. 생성된 지출 id를 `influencer_campaigns.expense_id` 에 기록하고 `payout_status = 'paid'`, `paid_at = paidAt` 로 갱신한다.
4. 이미 `expense_id` 가 있으면 중복 생성하지 않고 기존 건을 갱신한다.

`unmarkCampaignPaid` 는 `deleteExpense` 가 참이면 연결된 지출을 삭제하고, 거짓이면 `expense_id` 만 끊는다. 화면에서 어느 쪽인지 사용자에게 묻는다.

지출 생성이 실패하면 캠페인 상태도 바꾸지 않는다. 두 작업을 하나의 RPC(`SECURITY INVOKER`)로 묶어 부분 성공을 막는다.

### 4.5 성과 복사·갱신

```
refreshCampaignResult(campaignId: string): Promise<CampaignResult | null>
```

1. 캠페인의 `post_url` 을 읽는다. 없으면 `null` 반환.
2. `influencer_posts` 에서 같은 인플루언서의 게시물 중 `post_url` 이 일치하는 행을 찾는다.
   - URL 끝 슬래시·쿼리스트링 차이로 어긋나지 않도록 **정규화 함수**를 쓴다. `src/lib/influencer/url.ts` 에 `normalizePostUrl()` 을 추가하고, SQL 비교도 같은 규칙으로 맞춘다.
3. 찾으면 `likes` / `comments` / `view_count` 를 캠페인의 `result_*` 로 복사하고 `result_captured_at = now()` 를 기록한다.
4. 못 찾으면 기존 값을 **지우지 않고** 그대로 둔다. 사용자에게 "최근 게시물 목록에 없어 갱신하지 못했습니다. 먼저 인플루언서를 재동기화해 보세요"라고 안내한다.

`linkPostToCampaign()`(기존 함수)도 확장해, 게시물을 연결하는 순간 위 복사를 함께 수행한다.

### 4.6 정규화 규칙

`normalizePostUrl()` 은 다음을 적용한다.

- 앞뒤 공백 제거, 소문자화(호스트만)
- 쿼리스트링과 해시 제거
- 끝 슬래시 제거
- `www.` 접두어 제거

SQL 쪽은 동일 규칙을 표현하는 불변 함수 `public.normalize_post_url(text)` 로 만들고, `influencer_posts (influencer_id, normalize_post_url(post_url))` 표현식 인덱스를 둔다. TypeScript와 SQL 두 곳에 같은 규칙이 존재하므로, `post-utils.ts` 의 `SPONSORED_RE` 처럼 **동기 유지 주석**을 양쪽에 남긴다.

## 5. 화면 설계

### 5.1 인플루언서 상세 패널 (`InfluencerDetailPanel.tsx`)

현재 이 파일은 1000줄에 육박한다. 새 UI를 이 파일에 더하지 않고 아래 컴포넌트로 분리해 삽입한다.

```
[인플루언서 상세]
  프로필 / 지표 / AI 분석 / 게시물          ← 기존 유지
  ───────────────────────────────
  배송·정산 정보                            ← InfluencerContactSection (신규)
    받는사람 · 전화 · 주소 · 이메일
    은행 · 계좌번호 · 예금주
    [수정] → 인라인 편집
  ───────────────────────────────
  자사 시딩 실적                            ← SeedingHistoryCard (신규)
    3회 · 총 원가 90,000원 · 총 조회 114,000
    평균 조회 38,000 · 1만 조회당 7,900원
  ───────────────────────────────
  시딩 진행                                 ← 기존 캠페인 목록 + 확장
    └ 성과 배지        ← CampaignResultBadge (신규)
    └ 배송·지급 필드   ← CampaignFulfillmentFields (신규)
    └ 협의 이력        ← CampaignEventTimeline (신규)
```

신규 컴포넌트 목록:

| 파일 | 책임 |
|---|---|
| `influencer/contact/InfluencerContactSection.tsx` | 연락처·정산 표시와 편집 |
| `influencer/contact/CampaignFulfillmentFields.tsx` | 택배사·송장·지급 체크 |
| `influencer/contact/PayoutConfirmDialog.tsx` | 지급일·결제수단 확인 후 지출 생성 |
| `influencer/events/CampaignEventTimeline.tsx` | 협의 이력 목록 + 메모 입력 |
| `influencer/result/CampaignResultBadge.tsx` | 조회·좋아요·댓글 배지, 갱신 버튼 |
| `influencer/result/SeedingHistoryCard.tsx` | 인플루언서별 자사 실적 |

각 컴포넌트는 props로 데이터를 받고 서버 액션만 호출한다. 상세 패널은 배치와 데이터 전달만 담당한다.

### 5.2 KPI 카드 (`KpiCards.tsx`)

기존 4장(인플루언서 수 / 진행 / 완료 / 총 시딩 비용)에 2장을 더한다.

- **총 성과**: 조회 · 좋아요 · 댓글 합계
- **1만 조회당 비용**: 원가 효율

카드가 6장이 되므로 좁은 화면에서 2열로 접히도록 그리드를 조정한다.

### 5.3 시딩 스케줄 화면

`SeedingCampaignBoard.tsx` 카드에 성과 배지와 지급 상태 점을 추가한다. 배송·협의 이력은 상세 패널에서만 다룬다(보드가 무거워지지 않게).

## 6. 검증

### 6.1 새 테스트 — `scripts/influencer-seeding-workflow.test.mjs`

`node --test` 정적 검사. 기존 `work-directives.test.mjs` 형식을 따른다.

1. `111` / `112` 마이그레이션에 새 테이블 3종의 `ENABLE ROW LEVEL SECURITY` 가 있는지
2. `influencer_campaign_events` 에 UPDATE 정책이 **없는지**(기록 불변)
3. `expenses.source` CHECK 에 `'seeding'` 이 포함되는지
4. `'인플루언서 시딩'` 카테고리가 `is_sensitive = FALSE` 로 시드되는지
5. SQL에 KST 변환 없는 `CURRENT_DATE` / `NOW()::date` 가 없는지
6. `normalizePostUrl()`(TS)과 `normalize_post_url()`(SQL)이 양쪽에 모두 존재하고 동기 유지 주석이 있는지
7. `markCampaignPaid` 경로가 지출 생성 실패 시 캠페인을 갱신하지 않는지(단일 RPC 사용 여부 정적 확인)

### 6.2 단위 테스트 — `scripts/influencer-post-url.test.mjs`

`normalizePostUrl()` 의 케이스: 끝 슬래시, 쿼리스트링, `www.`, 대소문자, 공백, 빈 값.

### 6.3 기존 스위트

- `npm run test:performance` — 64개 검사 전부 통과해야 한다. KPI RPC를 건드리므로 필수.
- `npm run test:security`
- `npm run lint`, `npm run build`

### 6.4 성능 불변조건 확인

- KPI는 **단일 RPC 왕복**을 유지한다. 화면에서 성과를 따로 조회하지 않는다.
- 인플루언서 목록에 성과 컬럼을 넣지 않는다. 목록은 이미 지연 로딩 예산 안에서 동작하고 있고, 성과는 상세에서만 필요하다. (N+1 방지)
- 상세 패널은 열 때만 데이터를 부르는 기존 방식을 유지하고, 신규 섹션도 같은 호출에 합쳐 왕복 수를 늘리지 않는다.
- 무거운 라이브러리를 새로 넣지 않는다.

## 7. 결정 사항과 근거

| 결정 | 선택 | 근거 |
|---|---|---|
| 정산 정보 보관 | 일반 컬럼, 승인 사용자 전원 조회 | 사용자 결정. 직원 4명 전원이 정산에 관여함. 필요해지면 `is_sensitive` 카테고리처럼 나중에 권한을 분리할 수 있게 `influencer_contacts` 를 별도 테이블로 두었다 |
| 성과 갱신 시점 | 수동 버튼만 | 사용자 결정. 외부 수집 비용이 발생하지 않고 동작이 예측 가능하다 |
| 지급 → 지출 | 자동 생성(확인 창 1회) | 사용자 결정. 결제수단은 NOT NULL이라 물어봐야 하므로 확인 창에서 지급일과 함께 받는다 |
| 성과 수치 보관 방식 | 캠페인 행에 복사 | 게시물이 최근 목록에서 밀려나면 원본이 사라진다 |
| 광고주 계층 | 만들지 않음 | 자사 제품이므로 대상이 없다 |

## 8. 구현 순서

| 단계 | 내용 | 사용자가 체감하는 것 |
|---|---|---|
| 1 | 마이그 `111` 작성·적용 | — |
| 2 | 연락처 액션 + `InfluencerContactSection` | 주소를 카톡에서 찾지 않아도 됨 |
| 3 | 협의 이력 액션 + `CampaignEventTimeline` + 상태 변경 트리거 | 협의 내용이 남음 |
| 4 | 배송 필드 + 지급 체크 + 지출 자동 생성 | 송장·지급 관리가 사이트 안에서 끝남 |
| 5 | 마이그 `112` + `normalize_post_url` + 성과 복사·갱신 | 성과 숫자가 자동으로 붙음 |
| 6 | KPI 확장 + `SeedingHistoryCard` | 엑셀 정리가 사라지고 재섭외 판단 근거가 생김 |

각 단계는 독립적으로 배포 가능하다. 1~4는 `111` 한 번으로, 5~6은 `112` 한 번으로 커버된다.

## 9. 위험과 대응

| 위험 | 대응 |
|---|---|
| 게시물 URL이 어긋나 성과 매칭 실패 | 정규화 함수를 TS·SQL 양쪽에 두고 단위 테스트로 고정. 실패 시 기존 값을 지우지 않고 안내만 함 |
| 지급 체크 후 지출이 중복 생성 | `expense_id` 존재 시 갱신만. 해제 시 삭제 여부를 사용자에게 확인 |
| KPI RPC 변경이 대시보드 속도에 영향 | `test:performance` 로 검증. 반환 필드만 추가하고 왕복 수는 유지 |
| `InfluencerDetailPanel.tsx` 가 더 비대해짐 | 신규 UI를 전부 하위 컴포넌트로 분리. 패널은 배치만 담당 |
| 상태 변경 트리거가 배치·마이그레이션에서 오작동 | `auth.uid()` 가 NULL이면 기록을 건너뜀 |
