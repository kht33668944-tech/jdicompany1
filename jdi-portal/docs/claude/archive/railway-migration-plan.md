# Railway 이사 실행 가이드

> 이 문서만 보고 바로 실행할 수 있도록 작성됨.
> 작성일: 2026-04-22
> 예상 소요: 1~2시간 (이사 작업) + 1~2주 (Vercel 안전 유지 기간)

---

## 🎯 왜 이사하는가

### 증상
- **"몇 분 안 쓰다 돌아오면 탭 이동이 4~5초 걸림"**
- 계속 쓰고 있을 때는 빠름

### 원인 (확정)
**Vercel 서버리스의 콜드 스타트** — 사용 안 하면 Lambda가 꺼지고, 복귀 시 재부팅에 시간 걸림. Next.js 페이지마다 별도 Lambda라 `keep-warm` 한 개 endpoint만 깨워봐야 **소용없음**.

### 선택한 해결책
**Railway로 이사** — 전통적 "상시 켜져있는 서버" 방식. 콜드 스타트 자체가 존재하지 않음.

### Vercel Pro($20/월)가 아닌 이유
Vercel Pro는 **콜드 스타트 빈도만 감소**. 장시간 쉬면 결국 꺼짐. Railway는 **구조적으로 항상 켜짐** → 근본 해결.

---

## 📋 현재 상태 스냅샷

| 항목 | 값 |
|---|---|
| 현재 주소 | `https://jdi-portal.vercel.app` (Vercel 기본) |
| 커스텀 도메인 | **없음** ← 중요 |
| GitHub 저장소 | `kht33668944-tech/jdicompany1` |
| Supabase Project | `jdicompany` (ref: `eskljpvuasdpoenbomry`) |
| Supabase 리전 | 서울 (ap-northeast-2) |
| Vercel 리전 | 서울 (icn1) |

---

## 🔍 코드 전수 검사 결과 (이미 완료)

### ✅ 변경 필요 없음 (코드 수정 0건)
- Vercel 특화 패키지 없음
- `VERCEL_URL`/`VERCEL_ENV` 사용 없음
- Vercel Cron 설정 없음
- 하드코딩된 `.vercel.app` URL 없음
- PWA 매니페스트(`src/app/manifest.ts`) 전부 상대경로
- Service Worker(`public/sw.js`) 모든 도메인 호환
- `window.location.origin` 6곳 모두 동적 → 새 도메인 자동 적응
- 미들웨어(`src/proxy.ts`) 표준 구조
- `next/image` Sharp로 자동 동작

### ⚠️ 배포 후 설정 필요 (코드 아님, 대시보드 클릭)
1. Supabase Auth Redirect URL에 Railway 주소 추가
2. cron-job.org URL 교체 또는 제거
3. `.env.local`의 값 3개를 Railway 환경변수에 입력

### 🔴 사용자 영향 (도메인 변경 때문)
- **Web Push 구독 무효화** — 도메인 바뀌면 Push 구독 끊김. 사용자 전원 "알림 재허용" 필요
- **북마크/홈 화면 아이콘 깨짐** — 새 주소로 다시 저장 필요
- **PWA 재설치 필요** — 이전 설치본은 옛 Vercel 주소에 묶임

### 💡 완화 방안 (선택)
**커스텀 도메인 구입**하면 위 사용자 영향 **전부 회피** 가능:
- 예: `portal.jdicompany.com` 또는 `jdiportal.com` (연 1~2만원)
- DNS만 Railway로 포인팅 → 사용자는 이사 사실도 모름
- **향후 어느 호스팅으로 옮기든 사용자 영향 0**

---

## 🚀 실행 순서 (체크리스트)

### [ ] Step 1: Railway 가입 + 프로젝트 생성 (5분)

1. `https://railway.app` 접속
2. 우측 상단 **"Login"** → **"Login with GitHub"** 클릭
3. GitHub 계정으로 로그인, Railway에 권한 허용
4. 대시보드에서 좌측 상단 **"+ New Project"** 클릭
5. **"Deploy from GitHub repo"** 선택
6. `jdicompany1` 저장소 선택
   - 처음이면 **"Configure GitHub App"** 버튼으로 Railway에 저장소 접근 권한 부여
7. Railway가 자동으로 Next.js 감지 → **빌드 시작됨**
   - ⚠️ 환경변수 없어서 첫 배포는 실패함. **정상**. 2단계에서 해결.

---

### [ ] Step 2: Railway 환경변수 입력 (10분)

1. Railway 프로젝트 화면에서 배포 실패한 서비스 카드 클릭
2. 상단 탭 **"Variables"** 클릭
3. **"+ New Variable"** 버튼 눌러서 아래 3개 추가:

```
NEXT_PUBLIC_SUPABASE_URL = https://eskljpvuasdpoenbomry.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = (아래 참조)
NEXT_PUBLIC_VAPID_PUBLIC_KEY = (아래 참조)
```

**값 가져오는 법**:
- 프로젝트 루트의 `.env.local` 파일을 메모장/VSCode로 열기
  - 경로: `C:\Users\jdico\Desktop\개발\jdicompany\jdi-portal\.env.local`
- `=` 뒷부분 값만 복사 (앞뒤 공백 X, 따옴표 X)

4. 저장 후 Railway 자동 재배포 (5~10분 기다림)
5. **"Deployments"** 탭에서 초록불(Active) 뜨면 성공

**빌드 실패 시**:
- 로그에서 "Missing environment variable" 에러면 → 오타/공백 확인
- 그 외 에러는 스크린샷 찍어두기 (AI 에이전트에게 전달)

---

### [ ] Step 3: Railway 도메인 생성 + 접속 테스트 (5분)

1. 프로젝트 화면 → **"Settings"** 탭 → **"Networking"** 또는 **"Domains"** 섹션
2. **"Generate Domain"** 클릭 → `jdicompany1-production-xxxx.up.railway.app` 형식 주소 생성
3. **생성된 주소를 메모**해둠 (이후 단계에서 사용)
4. 그 주소 브라우저에 입력 → 포털 화면 뜨는지 확인
   - ⚠️ 로그인 시도하면 에러 → **정상**. Step 4 해야 함.

**이 시점 체크포인트**:
- [ ] Railway 주소로 접속 시 로그인 화면이 보임
- [ ] 빌드 로그에 에러 없음
- [ ] Vercel은 여전히 정상 동작 (안전망)

---

### [ ] Step 4: Supabase Auth Redirect URL 추가 (5분)

1. `https://supabase.com/dashboard` 접속
2. 프로젝트 **"jdicompany"** 선택
3. 좌측 메뉴 **"Authentication"** → 하위 **"URL Configuration"** 클릭
4. **"Redirect URLs"** 섹션에서 **"Add URL"** 버튼 클릭
5. Step 3에서 받은 Railway 주소를 **끝에 `/**` 붙여서** 입력:
   ```
   https://jdicompany1-production-xxxx.up.railway.app/**
   ```
   (실제 Railway 주소로 교체. `/**`는 "모든 하위 경로 허용" 의미)
6. **"Save"** 클릭

---

### [ ] Step 5: 실제 테스트 (10분)

1. Railway 주소로 접속 → 로그인 시도
2. 로그인 성공 → 대시보드 들어감
3. 이것저것 페이지 이동 (할일, 근태, 채팅, 일정)
4. **콜드 스타트 테스트**:
   - 다른 탭 열어서 15~30분 다른 일 하기
   - 다시 Railway 포털 탭으로 돌아와서 페이지 이동
   - **1초 이내 반응이면 성공** 🎉
5. 브라우저 F12 → Console → 에러 없는지 확인

**문제 발생 시 체크**:
- [ ] 로그인 리다이렉트 에러 → Step 4 URL 형식 확인 (`/**` 누락?)
- [ ] CSS 깨짐 → 하드 새로고침(Ctrl+Shift+R)
- [ ] Push 알림 안 옴 → 정상 (도메인 바뀌어서 구독 새로 해야 함)

---

### [ ] Step 6: cron-job.org 정리 (5분)

현재 Vercel `/api/keep-warm`을 5분마다 호출 중. Railway는 콜드 스타트 없어서 **필요 없음**.

1. `https://cron-job.org` 로그인
2. 현재 `jdi-portal.vercel.app/api/keep-warm` 호출하는 잡 찾기
3. **선택**:
   - **옵션 A (권장)**: **삭제** — Railway에선 의미 없음
   - **옵션 B**: Railway URL로 교체 (유지해도 손해는 없음)

---

### [ ] Step 7: 사용자에게 새 주소 공지

Vercel 기본 도메인 사용 중이라 **주소가 바뀜**. 사용자들에게 알려야 함.

**공지 템플릿**:
```
📢 JDI 포털 주소 변경 안내

포털 접속 속도 개선을 위해 호스팅을 이사했습니다.

새 주소: https://jdicompany1-production-xxxx.up.railway.app
(Railway 실제 주소로 교체)

다음 작업 부탁드려요:
1. 기존 북마크 삭제 후 새 주소로 다시 저장
2. 핸드폰 홈 화면 아이콘은 "삭제 후 재설치"
   - 새 주소 접속 → 브라우저 메뉴 → "홈 화면에 추가"
3. 알림 받던 분은 새 주소에서 한 번 더 "알림 허용" 눌러주세요

기존 주소(jdi-portal.vercel.app)는 2주 동안 유지됩니다.
문제 있으면 알려주세요.
```

---

### [ ] Step 8: (권장) 커스텀 도메인 구입 + 연결

**강력 권장** — 이 기회에 커스텀 도메인 사도록.

이유:
- 앞으로 호스팅을 또 옮길 때(절대 없길 바라지만 대비) 사용자 영향 0
- Web Push 구독이 도메인에 묶여서 **다시는 끊길 일 없음**
- 전문적인 느낌

**순서**:
1. 가비아/후이즈에서 도메인 구입 (연 1~2만원, 예: `jdiportal.com`)
2. Railway 프로젝트 → Settings → Domains → "Custom Domain" 추가
3. 도메인 DNS 관리 페이지에서 Railway가 알려주는 CNAME 레코드 입력
4. 10분~1시간 후 도메인 연결됨
5. Supabase Auth Redirect URL에 새 커스텀 도메인도 추가
6. 사용자들에게 **재공지** (이번이 마지막 주소 변경)

---

### [ ] Step 9: Vercel 안전 유지 기간 (1~2주)

**중요**: 이사 직후에 Vercel 바로 끄지 말 것.

**이유**: 문제 생기면 DNS 되돌리기로 즉시 원복 가능한 안전망.

**유지 기간**:
- 커스텀 도메인 샀으면: 1주
- Vercel 기본 주소 쓰는 경우: 2주 (사용자들이 새 주소로 갈아타는 시간)

**모니터링할 것**:
- Railway 로그에 에러 폭증 없는지
- 사용자 불만/이상 현상 보고
- "갑자기 느려짐" 현상 재발 여부

---

### [ ] Step 10: Vercel 종료

1~2주 안정 운영 후:

1. Vercel 대시보드 → 프로젝트 설정 → "Delete Project"
   - **또는** "Pause Deployments"만 해도 됨 (완전 삭제 전 단계)
2. `vercel.json` 파일은 그대로 둬도 됨 (Railway가 무시함)

---

## 🆘 롤백 방법 (Railway에서 Vercel로 되돌리기)

문제가 심각하면:

### 커스텀 도메인이 있는 경우
1. 도메인 DNS 관리 페이지에서 CNAME 레코드를 Vercel 값으로 되돌림
2. 10분~1시간 후 Vercel로 복귀
3. 무중단 복구

### Vercel 기본 주소 쓰는 경우
1. 그냥 사용자들에게 **"Vercel 주소로 다시 돌아가주세요"** 공지
2. Vercel은 처음부터 안 껐으면 즉시 사용 가능
3. Railway 프로젝트 삭제

---

## 💰 비용 요약

| 항목 | 비용 |
|---|---|
| Railway Hobby 플랜 | $5/월 (필수 구독) |
| 실제 사용량 | 약 $1~2/월 (Hobby 플랜 $5에 포함됨) |
| 커스텀 도메인 (선택) | 연 1~2만원 |
| **총계** | **월 $5 (약 7천원)** + 도메인 옵션 연 1만원 |

비교: Vercel Pro는 $20/월 (약 2만 7천원)

---

## 📊 예상 개선 효과

| 시나리오 | Vercel Free | Railway |
|---|---|---|
| 연속 사용 중 | 0.3초 | 0.3초 |
| 5분 쉬다 복귀 | 4~5초 | **0.3초** ✨ |
| 30분 쉬다 복귀 | 4~5초 | **0.3초** ✨ |
| 새벽/주말 접속 | 5초+ | **0.3초** ✨ |

---

## 🔗 참고

- 관련 코드 분석 결과: 이 문서 작성 시 전수 조사 완료 (2026-04-22)
- 환경변수 목록: `.env.local.example` 파일
- Vercel URL 참조: `src/app/api/keep-warm/route.ts:4-6` 주석에 cron-job.org 언급
- Supabase Auth 설정 문서: https://supabase.com/docs/guides/auth/redirect-urls

---

## ✍️ 실행 후 기록란 (이사 완료 시 채움)

```
실행 날짜: ____________
Railway 최종 URL: _______________________________
커스텀 도메인 (구입 시): ________________________
Vercel 종료 날짜: ____________
특이사항: _____________________________________
```
