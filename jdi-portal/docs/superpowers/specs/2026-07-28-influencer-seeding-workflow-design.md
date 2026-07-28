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
| 4-2. 계약서 작성·보관, 신분증·통장 사본 수령 | **저장 위치 없음.** 인플루언서에 파일을 붙이는 구조가 전혀 없다 (보관함은 법인 전용) |
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
2. **정산에 필요한 서류(계약서·신분증 사본·통장 사본)를 인플루언서별로 올리고 보관한다.**
3. 캠페인에 연결된 게시물의 성과 수치를 캠페인에 복사·보관하고 집계한다.
4. 인플루언서별 **자사 실적**(원가 대비 성과)을 재섭외 판단 근거로 제공한다.
5. 지급 완료 시 지출관리에 자동 반영한다.

### 비목표 (YAGNI)

- 광고주·클라이언트 개념 도입 — 자사 제품이므로 불필요
- 캠페인 상위 묶음(프로젝트) 계층 — 현재 규모에서 과함
- 제안 DM 자동 발송 — 인스타그램 정책·계정 위험. 초안 생성도 이번 범위 밖
- 계좌 정보 암호화·권한 분리 — 사용자 결정에 따라 일반 컬럼으로 둔다 (§7 참고)
- 성과 수치 자동 정기 갱신 — 사용자 결정에 따라 수동 버튼만
- **계약서 자동 작성(양식에 정보를 채워 PDF 생성)** — 사용자 결정에 따라 이번엔 업로드·보관까지만. 나중에 붙이기 쉽도록 문서 종류에 `contract` 를 두고 `influencer_documents` 를 확장 가능한 형태로 만든다
- **전자서명** — 계약서 자동 작성이 들어간 뒤에 검토할 사항
- **서류 보유기간·파기 관리** — 사용자 결정에 따라 이번 범위 밖. 다만 §9 에 남는 위험으로 기록한다

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

#### 새 테이블: `influencer_documents` / `influencer_document_versions`

정산에 필요한 서류를 인플루언서별로 보관한다. 구조는 보관함(`106_vault.sql`)의 `vault_documents` / `vault_document_versions` 를 그대로 따른다. 보관함 쪽은 `corporation_id` 가 NOT NULL 이라 인플루언서에 붙일 수 없어 같은 모양의 표를 새로 만든다.

`influencer_documents`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `influencer_id` | uuid NOT NULL | `influencers(id)` ON DELETE CASCADE |
| `kind` | text NOT NULL | CHECK `('contract','id_card','bankbook','etc')` |
| `title` | text NOT NULL | |
| `note` | text | |
| `is_sensitive` | boolean NOT NULL | `kind IN ('id_card','bankbook')` 이면 TRUE. 트리거로 강제해 클라이언트가 낮출 수 없게 한다 |
| `created_by` | uuid | `profiles(id)` |
| `created_at` / `updated_at` | timestamptz | |

`influencer_document_versions`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `document_id` | uuid NOT NULL | `influencer_documents(id)` ON DELETE CASCADE |
| `storage_path` | text NOT NULL | |
| `file_name` | text | |
| `file_size` | bigint | |
| `mime_type` | text | |
| `version_no` | int NOT NULL | |
| `is_current` | boolean NOT NULL DEFAULT TRUE | |
| `uploaded_by` | uuid | `profiles(id)` |
| `uploaded_at` | timestamptz DEFAULT now() | |

- 인덱스: `influencer_documents (influencer_id, kind)`, `influencer_document_versions (document_id, version_no DESC)`
- 재계약 시 같은 문서에 버전을 올리면 이전 계약서가 남는다. 이것이 별도 표를 두는 이유다.
- RLS: SELECT / INSERT / UPDATE 는 `is_approved_user()`. DELETE 는 관리자만(`vault_documents` 와 동일 기준).
- **민감 서류 열람 제한은 Storage RLS가 강제한다.** 잠금 상태를 쿠키가 아니라 DB(`vault_unlock_sessions`)에 두고, Storage 정책이 그 표를 보게 만들었다 (§4.6). 서버 액션의 쿠키 확인은 1차 방어일 뿐이고, 쿠키를 우회해도 파일에 닿을 수 없다.

#### 새 테이블: `vault_unlock_sessions`

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `user_id` | uuid PK | `auth.users(id)` ON DELETE CASCADE |
| `unlocked_at` | timestamptz | |
| `expires_at` | timestamptz NOT NULL | 잠금 해제 후 20분 |

- RLS: **SELECT 정책만 둔다(본인 것).** INSERT / UPDATE / DELETE 정책을 두지 않는 것이 핵심이다. 정책을 열면 사용자가 스스로 행을 넣어 비밀번호 없이 잠금을 풀 수 있다.
- 기록은 `SECURITY DEFINER` 함수로만 이뤄진다.
  - `public.vault_unlock(p_password TEXT)` — 기존 `verify_vault_gate()` 로 검증한 뒤 세션 생성. 비밀번호 해시 방식은 건드리지 않는다(기존 2차 비밀번호가 그대로 동작)
  - `public.vault_lock()` — 본인 세션 삭제
  - `public.has_vault_unlock()` — Storage 정책이 호출하는 유효성 확인

#### Storage 버킷: `influencer-documents`

```
('influencer-documents', 'influencer-documents', FALSE, 10485760)
```

비공개, 10MB 제한. `vault-documents` 와 같은 설정이다.

**경로 규칙: `{influencer_id}/{general|sensitive}/{uuid}.{ext}`** — 2번째 조각이 잠금 여부를 결정하므로 정책과 코드가 이 규칙을 공유한다.

```sql
bucket_id = 'influencer-documents'
AND public.is_approved_user()
AND (split_part(name, '/', 2) <> 'sensitive' OR public.has_vault_unlock())
```

읽기·쓰기 모두 이 조건을 쓰고, 삭제는 관리자만. 파일 내려받기는 항상 **서버 액션이 발급한 60초짜리 서명 URL**로만 한다.

#### 새 테이블: `influencer_document_cleanup_queue`

문서를 지울 때 Storage 파일이 고아로 남는 것을 막는다. `work_timeline_storage_cleanup_queue`(098) 패턴을 따르되, 경로 첫 조각이 `influencer_id` 이므로 CHECK 제약도 그에 맞춘다.

| 컬럼 | 타입 |
|---|---|
| `id` | uuid PK |
| `path` | text NOT NULL UNIQUE |
| `attempts` | integer NOT NULL DEFAULT 0 |
| `last_error` | text |
| `last_attempt_at` | timestamptz |
| `created_at` | timestamptz DEFAULT now() |

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

#### 인플루언서별 실적은 RPC를 두지 않는다

상세 패널이 그 인플루언서의 캠페인 전체를 이미 받아오므로, 실적(시딩 횟수·총 원가·총 조회·평균 조회·1만 조회당 비용)은 화면에서 합산한다. RPC를 두면 왕복만 한 번 늘어난다. 계산은 `SeedingHistoryCard.tsx` 에 있고, 정적 검사가 이 컴포넌트에서 별도 조회를 하지 않는지 확인한다.

#### 인덱스

- `idx_influencer_campaigns_influencer` on `(influencer_id)` — 인플루언서별 이력 조회용. 없으면 추가.
- 성과 집계는 `influencer_campaigns` 전체 SUM이며 이 테이블은 소규모라 전체 스캔이 허용된다. `tasks` 사전 필터 불변조건(§088)과는 무관한 별개 테이블이다.

## 4. 서버 액션 설계

기존 `src/lib/influencer/actions.ts` 는 이미 400줄대이므로 여기에 더하지 않고, 새 액션은 다음 세 파일에 나눠 넣는다.

- `src/lib/influencer/contact-actions.ts` — 연락처·정산·배송·지급
- `src/lib/influencer/document-actions.ts` — 서류 업로드·열람·버전·삭제
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

### 4.5 서류 보관과 잠금 게이트

파일 업로드는 **브라우저에서** 하고 서버 액션은 메타데이터만 받는다. 보관함(`src/lib/vault/storage.ts` + `actions.ts`)이 쓰는 방식 그대로다.

`src/lib/influencer/document-storage.ts` (브라우저)

```
documentFolder(kind: DocumentKind): "sensitive" | "general"
uploadInfluencerDocumentFile(influencerId: string, kind: DocumentKind, file: File): Promise<UploadedFileMeta>
removeInfluencerDocumentFile(path: string): Promise<void>
```

`src/lib/influencer/document-actions.ts` (서버)

```
createInfluencerDocument(input: { influencerId; kind; title; note? }, file: UploadedFileMeta): Promise<string>
addDocumentVersion(documentId: string, file: UploadedFileMeta): Promise<void>
getDocumentDownloadUrl(versionId: string): Promise<string>
deleteInfluencerDocument(documentId: string): Promise<void>
```

`UploadedFileMeta` 는 `@/lib/vault/types` 의 기존 타입(`{ storagePath, fileName, fileSize, mimeType }`)을 재사용한다.

동작 규칙:

1. 업로드 전 `src/lib/utils/upload.ts` 의 `validateFile()` 로 확장자·용량(10MB)을 검증한다. 새 검증 로직을 만들지 않는다. 서버 기록이 실패하면 방금 올린 파일을 지워 고아 파일을 남기지 않는다.
2. `kind` 가 `id_card` 또는 `bankbook` 이면 `is_sensitive` 가 TRUE 로 강제된다(DB 트리거). 액션은 이 값을 클라이언트에서 받지 않는다.
3. **민감 서류(`is_sensitive = TRUE`)를 올리거나 내려받거나 지우려면 잠금이 풀려 있어야 한다.** 잠금 확인은 §4.6 의 공유 함수를 쓴다.
4. `getDocumentDownloadUrl()` 은 유효기간 60초짜리 서명 URL만 반환한다. 경로를 클라이언트에 그대로 주지 않는다.
5. 삭제 시 DB 행을 지우고 `influencer_document_cleanup_queue` 에 `storage_path` 를 넣는다. Storage 삭제 실패가 DB 작업을 막지 않게 한다.

### 4.6 잠금 게이트 공유 (기존 코드 정리)

보관함의 잠금에는 두 가지 문제가 있었다.

1. 확인 함수 `requireUnlock()` 이 `src/lib/vault/actions.ts` 안의 **비공개 함수**라 다른 도메인에서 쓸 수 없다.
2. **서명 쿠키만 검사**하므로, 승인된 사용자가 서버 액션을 거치지 않고 Storage 를 직접 호출하면 잠금이 의미가 없다.

두 가지를 함께 해결한다.

**(1) 함수 분리** — `requireUnlock()` 을 `src/lib/vault/gate.ts` 로 옮겨 `export` 하고, `vault/actions.ts` 와 `influencer/document-actions.ts` 가 함께 import 한다. 본문(쿠키 읽기 → `verifyUnlockToken()` → 실패 시 예외)은 그대로 옮기기만 한다.

**(2) DB 세션으로 서버 강제** — `unlockVault()` 가 `verify_vault_gate` 대신 `vault_unlock` RPC 를 부른다. 이 RPC 는 비밀번호를 검증하고 `vault_unlock_sessions` 에 20분짜리 행을 남긴다. Storage 정책이 `has_vault_unlock()` 으로 그 행을 보므로, **쿠키를 위조해도 민감 파일에는 닿을 수 없다.** `lockVault()` 는 `vault_lock` RPC 로 세션을 지우고 쿠키도 지운다.

- 서명 키는 기존 `ACCOUNT_VAULT_KEY` 를 그대로 쓴다. **새 환경변수가 필요 없다.**
- 서비스 롤 키를 Next 앱에 들이지 않는다. 보안 경계를 RLS 하나로 유지한다(저장소 원칙).
- 잠금 쿠키(`vault_unlock`)와 유지 시간(20분)을 보관함과 공유한다. 보관함을 풀면 인플루언서 민감 서류도 함께 열린다. 자물쇠를 하나만 기억하면 되므로 4명 규모에서는 이 편이 낫다.
- 화면에서 잠금 오류가 나면 2차 비밀번호 입력창(`UnlockPrompt`)을 띄우고, 해제 후 하던 작업을 자동으로 다시 시도한다.

비밀번호 해시 방식(`verify_vault_gate`)은 건드리지 않으므로 기존 2차 비밀번호가 그대로 동작한다.

### 4.7 성과 복사·갱신

```
refreshCampaignResult(campaignId: string): Promise<CampaignResult | null>
```

1. 캠페인의 `post_url` 을 읽는다. 없으면 `null` 반환.
2. `influencer_posts` 에서 같은 인플루언서의 게시물 중 `post_url` 이 일치하는 행을 찾는다.
   - URL 끝 슬래시·쿼리스트링 차이로 어긋나지 않도록 **정규화 함수**를 쓴다. `src/lib/influencer/url.ts` 에 `normalizePostUrl()` 을 추가하고, SQL 비교도 같은 규칙으로 맞춘다.
3. 찾으면 `likes` / `comments` / `view_count` 를 캠페인의 `result_*` 로 복사하고 `result_captured_at = now()` 를 기록한다.
4. 못 찾으면 기존 값을 **지우지 않고** 그대로 둔다. 사용자에게 "최근 게시물 목록에 없어 갱신하지 못했습니다. 먼저 인플루언서를 재동기화해 보세요"라고 안내한다.

`linkPostToCampaign()`(기존 함수)도 확장해, 게시물을 연결하는 순간 위 복사를 함께 수행한다.

### 4.8 정규화 규칙

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
  서류                                      ← InfluencerDocumentSection (신규)
    계약서 (v2)          2026-07-20  [보기] [새 버전]
    신분증 사본 🔒       2026-07-18  [보기]
    통장 사본  🔒        2026-07-18  [보기]
    [+ 서류 올리기]
    · 🔒 표시는 2차 비밀번호를 풀어야 열림
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
| `influencer/documents/InfluencerDocumentSection.tsx` | 서류 목록·업로드·버전 |
| `influencer/documents/DocumentUploadModal.tsx` | 종류 선택 + 파일 선택 + 검증 |
| `influencer/documents/DocumentVersionList.tsx` | 버전 이력, 이전 버전 열람 |
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

1. `111` 이 만드는 새 테이블 5종(`influencer_contacts`, `influencer_documents`, `influencer_document_versions`, `influencer_document_cleanup_queue`, `influencer_campaign_events`) 모두에 `ENABLE ROW LEVEL SECURITY` 가 있는지
2. `influencer_campaign_events` 에 UPDATE 정책이 **없는지**(기록 불변)
3. `expenses.source` CHECK 에 `'seeding'` 이 포함되는지
4. `'인플루언서 시딩'` 카테고리가 `is_sensitive = FALSE` 로 시드되는지
5. SQL에 KST 변환 없는 `CURRENT_DATE` / `NOW()::date` 가 없는지
6. `normalizePostUrl()`(TS)과 `normalize_post_url()`(SQL)이 양쪽에 모두 존재하고 동기 유지 주석이 있는지
7. `markCampaignPaid` 경로가 지출 생성 실패 시 캠페인을 갱신하지 않는지(단일 RPC 사용 여부 정적 확인)

서류 관련:

8. `influencer-documents` 버킷이 `public = FALSE` 로 생성되는지
9. `influencer_documents.kind` CHECK 에 4종(`contract`/`id_card`/`bankbook`/`etc`)이 있는지
10. `is_sensitive` 를 강제하는 트리거가 있는지 (클라이언트가 민감 표시를 낮출 수 없어야 한다)
11. `document-actions.ts` 의 민감 서류 경로 3곳(업로드·다운로드·삭제)이 모두 잠금 확인 함수를 호출하는지
12. `getDocumentDownloadUrl()` 이 `createSignedUrl` 을 쓰고 `getPublicUrl` 을 쓰지 않는지
13. `requireUnlock` 이 `vault/gate.ts` 에서 export 되고, `vault/actions.ts` 에 중복 정의가 남아 있지 않은지
14. 업로드 경로가 `validateFile()` 을 거치는지

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
| 정산 정보(계좌번호 등 텍스트) 보관 | 일반 컬럼, 승인 사용자 전원 조회 | 사용자 결정. 직원 4명 전원이 정산에 관여함. 필요해지면 나중에 권한을 분리할 수 있게 `influencer_contacts` 를 별도 테이블로 두었다 |
| 신분증·통장 **사본 파일** | 비공개 버킷 + 2차 비밀번호 잠금 | 사용자 결정. 주민등록번호가 담긴 사본은 개인정보보호법상 고유식별정보라 접근을 제한해야 한다. 보관함 잠금을 재사용하므로 추가 개발과 새 환경변수가 없다 |
| 계약서 작성 | 이번엔 업로드·보관만 | 사용자 결정. 자동 작성은 다음 단계. `kind='contract'` 를 미리 두어 나중에 생성된 PDF를 같은 표에 넣을 수 있다 |
| 서류 버전 관리 | 넣는다 | 재계약 시 이전 계약서가 사라지면 안 된다. 보관함에 이미 검증된 구조가 있어 비용이 낮다 |
| 서류 파기 관리 | 이번엔 뺀다 | 사용자 결정. §9 에 남는 위험으로 기록 |
| 성과 갱신 시점 | 수동 버튼만 | 사용자 결정. 외부 수집 비용이 발생하지 않고 동작이 예측 가능하다 |
| 지급 → 지출 | 자동 생성(확인 창 1회) | 사용자 결정. 결제수단은 NOT NULL이라 물어봐야 하므로 확인 창에서 지급일과 함께 받는다 |
| 성과 수치 보관 방식 | 캠페인 행에 복사 | 게시물이 최근 목록에서 밀려나면 원본이 사라진다 |
| 광고주 계층 | 만들지 않음 | 자사 제품이므로 대상이 없다 |

## 8. 구현 순서

| 단계 | 내용 | 사용자가 체감하는 것 |
|---|---|---|
| 1 | 마이그 `111` 작성·적용 (연락처·서류·이력·캠페인 컬럼·버킷) | — |
| 2 | 연락처 액션 + `InfluencerContactSection` | 주소를 카톡에서 찾지 않아도 됨 |
| 3 | `vault/gate.ts` 분리 + 서류 업로드·열람·버전 UI | **계약서·신분증 사본이 사이트에 보관됨** |
| 4 | 협의 이력 액션 + `CampaignEventTimeline` + 상태 변경 트리거 | 협의 내용이 남음 |
| 5 | 배송 필드 + 지급 체크 + 지출 자동 생성 | 송장·지급 관리가 사이트 안에서 끝남 |
| 6 | 마이그 `112` + `normalize_post_url` + 성과 복사·갱신 | 성과 숫자가 자동으로 붙음 |
| 7 | KPI 확장 + `SeedingHistoryCard` | 엑셀 정리가 사라지고 재섭외 판단 근거가 생김 |

각 단계는 독립적으로 배포 가능하다. 1~5는 `111` 한 번으로, 6~7은 `112` 한 번으로 커버된다.

3단계를 2단계 바로 뒤에 두는 이유: 정산을 하려면 서류가 먼저 있어야 하고, 5단계(지급)가 서류 없이 먼저 열리면 실무 순서가 뒤집힌다.

배포 전 확인: 운영 환경에 `ACCOUNT_VAULT_KEY` 가 이미 설정되어 있어야 한다(보관함 때문에 설정되어 있음). 없으면 잠금 게이트가 동작하지 않는다.

## 9. 위험과 대응

| 위험 | 대응 |
|---|---|
| 게시물 URL이 어긋나 성과 매칭 실패 | 정규화 함수를 TS·SQL 양쪽에 두고 단위 테스트로 고정. 실패 시 기존 값을 지우지 않고 안내만 함 |
| 지급 체크 후 지출이 중복 생성 | `expense_id` 존재 시 갱신만. 해제 시 삭제 여부를 사용자에게 확인 |
| KPI RPC 변경이 대시보드 속도에 영향 | `test:performance` 로 검증. 반환 필드만 추가하고 왕복 수는 유지 |
| `InfluencerDetailPanel.tsx` 가 더 비대해짐 | 신규 UI를 전부 하위 컴포넌트로 분리. 패널은 배치만 담당 |
| 상태 변경 트리거가 배치·마이그레이션에서 오작동 | `auth.uid()` 가 NULL이면 기록을 건너뜀 |
| **신분증 사본의 보유기간·파기가 관리되지 않음** | 이번 범위에서 제외한 항목이라 **위험이 남아 있다.** 개인정보는 목적이 끝나면 파기해야 하며, 사본이 무기한 쌓인다. 다음 단계 후보로 기록해 둔다: 정산 완료 후 N개월이 지난 민감 서류를 목록으로 보여주고 사람이 확인해 지우는 화면 |
| 잠금 쿠키를 보관함과 공유해, 보관함을 푼 사람이 서류도 볼 수 있음 | 의도된 설계다(§4.6). 4명 전원이 정산에 관여하므로 자물쇠를 나누지 않는다. 나눠야 할 상황이 오면 쿠키를 분리하면 된다 |
| 서류 삭제 시 Storage 파일이 남음 | 정리 큐에 넣고 관리자가 처리. DB 삭제는 Storage 실패에 막히지 않는다 |
