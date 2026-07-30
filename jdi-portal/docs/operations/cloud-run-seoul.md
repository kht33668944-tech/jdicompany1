# 서울 리전 배포 (Google Cloud Run)

앱을 **서울**에서 돌리기 위한 배포 구성 문서입니다. 왜 옮겼는지, 어떻게 배포하는지,
문제가 생기면 어떻게 되돌리는지를 담습니다.

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
동작하지 않습니다. 그래서 컨테이너를 **최소 1대 상시 가동 + CPU 항상 할당**으로
띄워 Railway 와 같은 실행 모델을 유지합니다.

`--min-instances=1`, `--no-cpu-throttling` 을 빼면 keepalive 가 멈춰 유휴 후 첫 요청이
다시 수 초로 느려집니다. **줄이지 마세요.**

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

관련 파일: 저장소 루트의 `Dockerfile`, `cloudbuild.yaml`, `.dockerignore`, `.gcloudignore`.

`next.config.ts` 의 `output: "standalone"` 은 `NEXT_OUTPUT_STANDALONE=1` 일 때만 켜집니다.
컨테이너 빌드에서만 켜고, Railway(`next start`)는 영향을 받지 않게 한 장치입니다.

## 배포

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
2. **Railway 로 완전 복귀**: Railway 서비스와 `railway.toml` 을 그대로 남겨 뒀습니다.
   Workers 라우트 방식이라 **DNS 는 여전히 Railway(`51v7n8wk.up.railway.app`)를 가리키고
   있으므로**, Cloudflare 에서 Workers Routes 의 `jdiportal.com/*` 항목만 지우면 즉시
   Railway 로 돌아갑니다. 이전이 안정화될 때까지 Railway 를 끄지 마세요.

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
