# 서울 리전 배포 (Google Cloud Run)

앱을 **서울**에서 돌리기 위한 배포 구성 문서입니다. 왜 옮겼는지, 어떻게 배포하는지,
문제가 생기면 어떻게 되돌리는지를 담습니다.

## 현재 서버 상태 (2026-07-30 기준)

| | |
|---|---|
| 운영 서버 | **GCP Cloud Run 서울** `asia-northeast3` / 프로젝트 `jdi-portal-seoul` / 서비스 `jdi-portal` |
| 스펙 | CPU 2, 메모리 2GiB, 최소 1대 상시, 최대 6대, 동시 20, CPU 요청기반 과금 |
| 도메인 | `jdiportal.com` → Cloudflare Worker `jdi-portal-seoul-proxy` → Cloud Run |
| DNS | 아직 Railway(`51v7n8wk.up.railway.app`)를 가리킴 — Worker 가 가로채므로 무관 |
| 데우기 | Cloud Scheduler `jdi-portal-keepalive` (1분마다 `/api/keepalive`) |
| DB | Supabase 서울 (변경 없음) |
| 비용 | 월 약 $38 |
| 배포 방식 | **수동** `gcloud builds submit --config cloudbuild.yaml` (자동 트리거 없음) |
| Railway | **중지됨 + 새 배포는 실패함** (아래 "Railway 는 이제 되살리기 어렵다") |
| 데스크톱 앱 | `jdi-desktop` 은 `https://jdiportal.com` 을 띄우므로 자동 반영, 수정 불필요 |

## 왜 옮겼나

DB(Supabase)는 서울에 있는데 앱은 Railway **싱가포르**에 있었습니다. DNS 가 Cloudflare
프록시를 지나므로 실제 요청 경로가 이렇게 됩니다.

```
[이전] 사용자(한국) → Cloudflare(서울) → 앱(싱가포르) → Supabase(서울) → 앱(싱가포르) → 사용자
[이후] 사용자(한국) → Cloudflare(서울) → 앱(서울)   → Supabase(서울) → 앱(서울)   → 사용자
```

화면 하나를 그릴 때마다 싱가포르를 왕복(편도 약 35~50ms, 왕복 70~100ms)했고, 서버
렌더 한 번에 이 왕복이 여러 번 겹쳐 무거운 화면이 0.6~1.4초가 됐습니다. Railway 는
아시아에 싱가포르 리전만 제공하므로(문서 확인) 리전 변경으로는 해결할 수 없어
호스팅을 옮겼습니다.

## 왜 Cloud Run 인가 (서버리스 함수형은 안 되는 이유)

이 앱은 **항상 켜져 있는 Node 프로세스**를 전제로 성능을 맞춰 뒀습니다
(`src/instrumentation.ts` 의 pg 풀 warm-up + 2분 주기 keepalive → 저장소 루트
`CLAUDE.md` 의 성능 불변조건 2). 요청마다 새로 뜨는 함수형 호스팅에서는 이 장치가
동작하지 않습니다. 그래서 컨테이너를 **최소 1대 상시 가동**(`--min-instances=1`)으로
띄워 Railway 와 같은 실행 모델을 유지합니다. 이 값은 **줄이지 마세요.**

## CPU 는 요청기반 과금 + 1분 heartbeat (비용 3분의 1)

CPU 를 상시 할당(`--no-cpu-throttling`)하면 서울 기준 **월 약 $124**, 요청을 처리할
때만 할당(`--cpu-throttling`)하면 **월 약 $38** 입니다. 실측에서 두 방식의 응답
속도가 사실상 같았으므로 **요청기반**을 씁니다(단가는 아래 "비용" 절).

대신 요청 사이에는 CPU 가 멈춰서 `instrumentation.ts` 의 keepalive 타이머가 스스로
돌지 못합니다. **타이머가 `fetch` 를 시작만 하고 끝내지 못하는 것**이 핵심입니다 —
실측(2026-07-30)에서 11분 유휴 뒤 첫 요청의 `middleware.getUser` 가 **720ms** 로
부풀었습니다(pg 는 멀쩡했고 Supabase HTTPS 연결만 식었습니다).

그래서 **Cloud Scheduler 가 1분마다 `/api/keepalive` 를 부릅니다.** 이 경로는 같은
데우기를 **요청 안에서 `await` 로 끝까지 완료**하므로 CPU 가 중간에 끊기지 않습니다.

```bash
gcloud scheduler jobs list --location=asia-northeast3 --project jdi-portal-seoul
# jdi-portal-keepalive : "* * * * *" → GET https://<run.app>/api/keepalive
```

> **이 스케줄러 작업을 지우거나 멈추면** 유휴 후 첫 요청이 다시 1초 이상으로
> 느려집니다. 대상은 Cloudflare 를 거치지 않는 `*.run.app` 주소로 두었습니다 —
> Worker 무료 한도를 쓰지 않기 위함입니다.

관련 파일: `src/lib/warmup.ts`(데우기 로직, `instrumentation.ts` 와 공용),
`src/app/api/keepalive/route.ts`(경로 + 연타 방지),
`src/lib/supabase/middleware.ts`(인증 우회).
`/api/health` 는 **순수한 생존 확인**으로 남겨 둡니다 — 외부 헬스체크가 DB 상태에
끌려가면 안 되고, 회귀 테스트도 그렇게 고정합니다.

안전망은 이중입니다. 스케줄러가 데우기를 완료시키고, 그와 별개로 pg 풀의
`keepAlive: true`(`src/lib/db/postgres.ts`)가 **OS 수준 TCP keepalive** 이므로
CPU 가 멈춰 있어도 커널이 DB 연결을 유지합니다.

## CPU 는 2개 이상 (실측 근거)

처음 `--cpu=1` 로 띄웠더니 동시 요청이 몰릴 때 이벤트 루프가 밀려
`[stage] middleware.getUser` 가 **2.6~3.7초**로 부풀고 업무 타임라인이 2.9초까지
갔습니다. Supabase 가 같은 서울에 있으므로 네트워크 문제가 아니라 **CPU 부족**입니다
(Railway Pro 는 CPU 여유가 훨씬 컸습니다). `--cpu=2 --memory=2Gi --concurrency=20` 으로
올리자 같은 부하에서 225~414ms 로 정상화됐습니다.

> 이 값은 `cloudbuild.yaml` 의 deploy 단계에도 적어 두었습니다. 거기서 낮추면
> **다음 배포 때 조용히 되돌아갑니다.**

## 구성

| 항목 | 값 |
|---|---|
| GCP 프로젝트 | `jdi-portal-seoul` |
| 리전 | `asia-northeast3` (서울) |
| Cloud Run 서비스 | `jdi-portal` |
| 이미지 저장소 | Artifact Registry `asia-northeast3-docker.pkg.dev/jdi-portal-seoul/jdi` |
| 런타임 서비스 계정 | `jdi-run@jdi-portal-seoul.iam.gserviceaccount.com` |
| 빌드 서비스 계정 | `jdi-build@jdi-portal-seoul.iam.gserviceaccount.com` |
| 환경변수 | 전부 Secret Manager (`--set-secrets`) |
| 데우기 | Cloud Scheduler 작업 `jdi-portal-keepalive` (1분마다 `/api/keepalive`) |

관련 파일: 저장소 루트의 `Dockerfile`, `cloudbuild.yaml`, `.dockerignore`, `.gcloudignore`.

## 비용

단가는 추측하지 말고 **GCP 공식 가격 API** 에서 확인합니다(Cloud Run 서비스 ID
`152E-C115-5142`).

```bash
curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://cloudbilling.googleapis.com/v1/services/152E-C115-5142/skus?pageSize=200" \
  | grep -i asia-northeast3
```

2026-07-30 확인한 서울(asia-northeast3) 단가와 현재 구성(2 vCPU / 2 GiB / 상시 1대)
기준 월 요금입니다.

| 방식 | CPU 단가 | 메모리 단가 | 월 요금(24시간) |
|---|---|---|---|
| CPU 상시 할당 (`--no-cpu-throttling`) | $0.0000216 / vCPU·s | $0.0000024 / GiB·s | 약 **$124** |
| CPU 요청기반 (`--cpu-throttling`, 대기 중 단가) | $0.0000035 / vCPU·s | $0.0000035 / GiB·s | 약 **$38** |

요청기반은 위의 "대기 중" 요금에 실제 요청 처리 시간(활성 단가 CPU $0.0000336,
메모리 $0.0000035)이 더해지는데, 사내 사용량(하루 수천 건 × 0.2초)에서는 월 $1~2
수준입니다.

`next.config.ts` 의 `output: "standalone"` 은 `NEXT_OUTPUT_STANDALONE=1` 일 때만 켜집니다.
컨테이너 빌드에서만 켜고, Railway(`next start`)는 영향을 받지 않게 한 장치입니다.

## 배포

> ### ⚠️ 반드시 `master` 를 배포하세요
>
> `gcloud builds submit` 은 **지금 이 폴더의 파일을 그대로** 올려 빌드합니다. git 브랜치를
> 보지 않습니다. 그래서 작업 브랜치에서 그냥 실행하면 **다른 브랜치가 master 에 이미
> 병합해 둔 수정이 빠진 채로 배포되어, 남의 작업이 조용히 되돌아갑니다.**
>
> 2026-07-30 실제로 이 일이 있었습니다 — 서울 전환을 작업 브랜치에서 배포하는 바람에
> 인플루언서 수정 2건이 빠졌습니다(다행히 비용 관련 핵심은 Edge Function 쪽이라
> 영향은 화면 표시에 그쳤습니다).
>
> 배포 전에 확인하세요.
>
> ```bash
> git fetch origin master
> git log --oneline HEAD..origin/master   # 결과가 비어 있어야 한다
> ```
>
> 비어 있지 않으면 먼저 `git merge origin/master` 로 합친 뒤 배포합니다.

```bash
# 저장소 루트에서
gcloud builds submit --config cloudbuild.yaml \
  --project jdi-portal-seoul --region=asia-northeast3 \
  --service-account="projects/jdi-portal-seoul/serviceAccounts/jdi-build@jdi-portal-seoul.iam.gserviceaccount.com" \
  .
```

빌드 → 이미지 푸시 → Cloud Run 배포까지 한 번에 진행됩니다. 서비스 주소 확인:

```bash
gcloud run services describe jdi-portal --region=asia-northeast3 \
  --project jdi-portal-seoul --format="value(status.url)"
```

### 환경변수를 바꿀 때

값은 저장소가 아니라 Secret Manager 에 둡니다. 새 값을 넣으면 새 버전이 생기고,
`:latest` 를 쓰므로 **다음 배포(또는 재배포)** 부터 반영됩니다.

```bash
printf '%s' '새-값' | gcloud secrets versions add DATABASE_URL --data-file=- --project jdi-portal-seoul
```

`NEXT_PUBLIC_*` 는 클라이언트 번들에 값이 박히므로 바꾼 뒤 **반드시 다시 빌드**해야
합니다(재배포만으로는 브라우저 쪽 값이 바뀌지 않습니다).

## 도메인 연결 (Cloudflare)

`jdiportal.com` 은 Cloudflare 프록시를 지나 오리진으로 전달됩니다. Cloud Run 은
**자기 주소(`*.run.app`)로 온 요청만 받고, 다른 도메인 이름으로 온 요청은 404** 로
거부합니다(실측 확인). 그래서 Cloudflare 가 오리진으로 보낼 때 Host 를 Cloud Run
주소로 맞춰 줘야 하는데, 막힌 길이 두 개 있습니다.

- Cloud Run 커스텀 도메인 매핑: 서울 리전은 **생성이 금지**
  (`501 Creating domain mappings is not allowed in asia-northeast3`).
- Cloudflare Origin Rules 의 Host Header Override: **무료 플랜 미포함**
  (`not entitled to use the HostHeader override`).

남는 방법이 **Cloudflare Workers**(무료 플랜 포함)입니다. Worker 가 요청을 받아
Cloud Run 주소로 그대로 전달합니다. 이 방식의 장점은 **DNS 를 건드리지 않는다**는
점입니다 — 라우트만 지우면 즉시 기존 오리진으로 되돌아갑니다.

1. Worker 스크립트 `jdi-portal-seoul-proxy`: 요청 URL 의 host 를 Cloud Run 주소로 바꿔
   `fetch` 합니다. **`redirect: "manual"` 필수** — 없으면 Worker 가 앱의 307 리다이렉트를
   대신 따라가 버려서 주소창과 로그인 흐름이 어긋납니다.
2. Workers Routes 에 `jdiportal.com/*`, `www.jdiportal.com/*` 등록.

> Workers 는 **계정 이메일 인증**이 되어 있어야 씁니다(안 되어 있으면
> `10034 You need to verify your email address to use Workers`).

Host 가 바뀌므로 두 가지를 코드에서 미리 맞춰 두었습니다. **되돌리지 마세요.**

- `next.config.ts` 의 `experimental.serverActions.allowedOrigins` — 이게 없으면 Server
  Action 의 CSRF 검사가 Origin(브라우저의 `jdiportal.com`)과 Host(오리진 주소) 불일치로
  **모든 쓰기 동작(출근 체크·할일 저장·지출 등록 등)을 거부**합니다.
- `src/app/auth/callback/route.ts` 의 상대 경로 리다이렉트 — 절대 주소로 되돌리면
  내부 주소(`0.0.0.0:8080`)로 튕깁니다.

전환 직후 확인할 것:

- 로그인 → 대시보드 진입
- **출근 체크** (쓰기 동작 + 사무실 IP 판정이 함께 걸리는 대표 경로).
  IP 는 `/api/ip` 로도 확인할 수 있고, 사무실에서 접속했을 때 실제 공인 IP 가 나와야 합니다.
- 파일 업로드 1건 (업무 타임라인 또는 채팅)

## 되돌리기 (롤백)

1. **직전 버전으로**: Cloud Run 은 배포마다 리비전을 남기므로 트래픽만 되돌리면 됩니다.
   ```bash
   gcloud run revisions list --service jdi-portal --region=asia-northeast3 --project jdi-portal-seoul
   gcloud run services update-traffic jdi-portal --to-revisions=<리비전이름>=100 \
     --region=asia-northeast3 --project jdi-portal-seoul
   ```
2. **Railway 로 복귀**: → 아래를 읽으세요. **더 이상 실용적인 복구 경로가 아닙니다.**
   실무적으로는 **1번(리비전 되돌리기)이 유일하게 빠르고 안전한 복구 경로**입니다.

## Railway 는 이제 되살리기 어렵다 (2026-07-30)

이전이 안정화된 뒤 **Railway 배포를 중지했습니다**(Deployments → 활성 배포 → Remove).
그런데 그 뒤 두 가지가 겹쳐서, Railway 는 "누르면 살아나는 예비 서버" 가 아닙니다.

1. **Railway 는 GitHub `master` 에 자동 배포가 켜져 있습니다.** (Cloud Build 에는
   트리거가 없지만 Railway 에는 있습니다 — 헷갈리기 쉬우니 주의.)
2. **저장소 루트에 `Dockerfile` 이 생기면서 Railway 의 빌드 방식이 바뀝니다.**
   `railway.toml` 의 시작 명령 `cd jdi-portal && node ...` 이 그 안에서 실행되지 않아
   `The executable "cd" could not be found` 로 **배포가 실패**합니다.
   (PR #10 병합 때 실제로 이렇게 실패했습니다.)

즉 **`master` 에 커밋을 올릴 때마다 Railway 에서 실패한 배포가 하나씩 쌓입니다.**
사이트에는 영향이 없지만(트래픽은 Cloudflare Worker 가 전부 Cloud Run 으로 보냄)
알림이 오고 보기에 지저분합니다.

**정말로 Railway 로 돌아가야 한다면**, Deployments 이력에서 **`Dockerfile` 이 생기기
전의 배포**(= PR #9 병합분)를 찾아 **Redeploy** 해야 합니다. 최신 배포를 Redeploy 하면
같은 이유로 또 실패합니다. 그리고 Workers 라우트는 **Railway 가 살아난 것을 확인한
뒤에** 지워야 합니다 — 순서를 바꾸면 그동안 사이트가 404 를 냅니다.

**정리할 때**: Railway 플랜을 해지하거나, 그 전까지 실패 알림이 거슬리면 Railway
서비스 Settings 에서 GitHub 자동 배포 연결을 끄면 됩니다.

## 더 빠르게 (후속 최적화)

Cloudflare 는 이 회선에서 서울(ICN) 거점을 쓰지 않습니다 — 실측상 `CF-RAY` 가 홍콩
8/10, 도쿄 2/10 입니다. 그래서 Cloudflare 를 지나면 서울 서버를 써도 약 70ms 를
그냥 잃습니다(연결 재사용 기준 `/api/health`: 서울 직접 13~17ms vs Cloudflare 경유 예상 85ms).

프록시를 걷어내려면 `jdiportal.com` 인증서를 서울에서 직접 서비스해야 합니다.

- **Firebase Hosting** — 무료. `asia-northeast3` Cloud Run rewrite 를 지원합니다.
  GCP 프로젝트에 Firebase 를 추가할 때 **Firebase 약관 동의(사람이 직접)** 가 필요합니다.
- **GCP 외부 Application Load Balancer** — 월 $18~25. 자동화는 가능하지만 비용이 듭니다.

## 주의

- Cloud Run 은 컨테이너를 **재시작할 수 있습니다**. 프로세스 메모리에만 있는 상태
  (미들웨어 인증 캐시 등)는 재시작 시 비워지며, 설계상 그래도 정상 동작합니다.
- 인스턴스가 2대 이상으로 늘면 메모리 캐시는 인스턴스별로 따로 채워집니다
  (정확성 문제는 없고, 캐시 적중률만 낮아집니다).
- 로그: `gcloud run services logs read jdi-portal --region=asia-northeast3 --project jdi-portal-seoul`
