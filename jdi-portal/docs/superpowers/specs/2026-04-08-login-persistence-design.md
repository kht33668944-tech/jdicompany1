# 로그인 유지 개선 설계 (JDI 포털)

- **작성일**: 2026-04-08
- **대상**: Android 홈화면 PWA (직원 전원)
- **목표**: 한 번 로그인하면 7일간 로그인 창을 보지 않게 하고, 알림 딥링크 UX를 자연스럽게 잇기

---

## 1. 문제 정의

현재 JDI 포털은 Next.js + Supabase Auth(@supabase/ssr) 기반이며, 구조상 이미 access token + refresh token 방식을 사용한다. 그러나 사용자는 다음 현상을 호소한다:

- 앱 재실행 시 로그인 창이 자주 뜸
- 백그라운드 복귀 시에도 로그아웃 체감
- 알림을 눌러도 해당 화면이 아닌 로그인/대시보드로 빠지는 경우 발생

즉 **인증 방식의 문제가 아니라 (1) 쿠키 수명 (2) refresh 갱신 안정성 (3) 딥링크 복귀 UX (4) 재로그인 시 이메일 기억**의 4개 구멍이 합쳐진 결과다.

---

## 2. 사용자 관점 약속

1. **7일 동안 로그인 창 0회**: 앱 재실행, 백그라운드 복귀, 알림 클릭 모두에서 로그인 창이 뜨지 않는다.
2. **7일 후 재로그인은 비밀번호 한 줄**: 이메일은 이미 자동 채움, 포커스는 비밀번호 칸에 위치.
3. **알림은 어떤 경우에도 해당 화면으로 도착**: 세션이 끊겨 있어도 로그인 후 자동으로 원래 링크로 이동.
4. **민감 기능(비번 변경)만 재인증**: 5분 유예 포함.

---

## 3. 전체 흐름

```
[첫 로그인]
  ↓ 쿠키 2개 발급 (7일 유효, maxAge 명시)
[정상 사용]
  ↓ 홈화면 아이콘 → 바로 대시보드
  ↓ 알림 클릭 → 해당 화면 직행
  ↓ access token 1시간마다 자동 갱신 (재시도 포함)
[6일째 — 로그인 창 안 본 상태 유지]
[7일 경과 → 쿠키 만료]
  ↓ 첫 요청 → /login?next=원래경로
  ↓ 이메일 자동 채움, 비밀번호만 입력
  ↓ 로그인 성공 → next 경로로 자동 이동
[비밀번호 변경]
  ↓ 재인증 모달 (5분 유예)
  ↓ 통과 후 변경 폼
```

---

## 4. 구조 설계

### 4.1 쿠키 수명 (1단계)

**수정 위치**: `src/lib/supabase/middleware.ts`, `src/lib/supabase/server.ts`

- `cookies.setAll()`에서 Supabase가 넘기는 옵션을 그대로 받되, Supabase 인증 쿠키(`sb-*`)에 대해 `maxAge = 60 * 60 * 24 * 7` (7일)을 명시.
- 기존 옵션에 `maxAge`가 이미 있으면 존중, 없는 경우에만 주입.
- 이유: 현재 옵션 누락 시 일부 Android Chrome WebView에서 세션 쿠키로 저장되어 앱 종료 시 삭제되는 케이스가 의심된다.

### 4.2 refresh token 갱신 안정화 (1단계)

**수정 위치**: `src/lib/supabase/client.ts` (또는 별도 auth wrapper)

- Supabase의 `onAuthStateChange` 에서 `TOKEN_REFRESHED`/`SIGNED_OUT` 이벤트 모니터링.
- 네트워크 실패로 인한 일시적 refresh 실패와 영구 만료를 분리:
  - 일시적(네트워크 에러, 4xx 아닌 응답) → 1s/2s/4s 백오프 재시도 (최대 3회).
  - 영구(401/invalid_grant) → 세션 정리 후 `/login?next=` 리다이렉트.
- 목표: "그냥 열었다 닫았는데 로그아웃됨" 제거.

### 4.3 Service Worker 정합성 확인 (1단계)

**대상**: `public/sw.js`

- 이미 `/auth/`, `/api/` 는 캐시에서 제외됨. 구조상 수정 불필요.
- 실기기에서 Supabase 외부 origin(`*.supabase.co/auth/v1/token`) 요청이 SW를 bypass하는지 한 번 검증만.

### 4.4 로그인 화면 이메일 기억 (2단계)

**수정 위치**: 로그인 폼 컴포넌트 (추후 파일 확정)

- 로그인 성공 시 `localStorage.setItem("jdi:last-email", email)`.
- 로그인 페이지 마운트 시 `localStorage.getItem("jdi:last-email")` → input 초기값.
- 포커스: 이메일이 있으면 password input으로, 없으면 email input으로.
- 보안 원칙: **비밀번호는 절대 저장하지 않는다.**

### 4.5 로그아웃 동작 분리 (2단계)

- 사용자가 명시적으로 "로그아웃" 버튼을 누른 경우: 쿠키 삭제 + `localStorage["jdi:last-email"]` 제거.
- 쿠키 자동 만료(7일 경과)로 인한 로그아웃: localStorage 유지 → 재로그인 시 이메일 자동 채움.
- 구현: 로그아웃 버튼 핸들러에서 localStorage 정리 후 `signOut()` 호출.

### 4.6 딥링크 복귀 (2단계)

**수정 위치**: `src/lib/supabase/middleware.ts`, 로그인 폼

- 미들웨어가 보호 경로에서 미인증 감지 시 `/login?next=<원래 pathname+search>`로 리다이렉트.
- 로그인 성공 후 `next` 값을 읽어 `router.replace(next)` (없으면 기존 `/dashboard`).
- `next` 값 검증: **동일 origin 내부 경로만 허용** (오픈 리다이렉트 방지). 외부 URL/스키마면 `/dashboard`로 폴백.

### 4.7 Service Worker postMessage 수신 (2단계)

**신규 파일**: `src/components/NavigationListener.tsx` (클라이언트 컴포넌트)

- `src/app/layout.tsx`(또는 dashboard layout)에 마운트.
- `navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'NAVIGATE') router.push(e.data.link); })`
- 이유: `sw.js`의 `client.navigate()`가 일부 Android WebAPK 환경에서 차단될 때 postMessage로 폴백하는데, 현재는 수신자가 없어 링크가 사라진다.
- 경로 검증: `link`가 `/` 로 시작하는지 확인. 외부 URL이면 무시.

### 4.8 알림 발송 유틸 링크 가드 (2단계)

- 알림 발송 쪽에 `link` 누락 시 알림 종류별 기본 경로를 채우는 가드 한 곳 추가.
- 구체적 파일은 구현 플랜 단계에서 확정.

### 4.9 비밀번호 변경 재인증 (3단계)

**수정 위치**: 비밀번호 변경 페이지/폼, 신규 재인증 모달 컴포넌트

- 모달: "본인 확인을 위해 현재 비밀번호를 입력하세요".
- 검증: `supabase.auth.signInWithPassword({ email: currentEmail, password: input })` 성공 시 통과.
- 통과 시 `sessionStorage.setItem("jdi:reauth-at", Date.now())`.
- 비밀번호 변경 진입 시 `reauth-at`이 5분 이내면 모달 생략.
- sessionStorage 이유: 탭 종료 시 자동 소멸, 다른 탭과 격리.

---

## 5. 수정/신규 파일 요약

| 파일 | 종류 | 단계 |
|---|---|---|
| `src/lib/supabase/middleware.ts` | 수정 | 1, 2 |
| `src/lib/supabase/server.ts` | 수정 | 1 |
| `src/lib/supabase/client.ts` (또는 래퍼) | 수정 | 1 |
| 로그인 폼 컴포넌트 | 수정 | 2 |
| 로그아웃 버튼 핸들러 | 수정 | 2 |
| `src/components/NavigationListener.tsx` | 신규 | 2 |
| `src/app/layout.tsx` | 수정 (마운트만) | 2 |
| 알림 발송 유틸 | 수정 | 2 |
| 비밀번호 변경 폼 | 수정 | 3 |
| `src/components/ReauthModal.tsx` | 신규 | 3 |

---

## 6. 배포 전략 (3단계 분리)

| 단계 | 범위 | 효과 | 롤백 기준 |
|---|---|---|---|
| **1** | 쿠키 수명 + refresh 재시도 | "자꾸 로그아웃됨" 체감 해결 (80%) | 2일 내 3명 이상 재로그아웃 호소 |
| **2** | 딥링크 복귀 + 이메일 기억 + SW 수신 | 알림 UX, 재로그인 편의 | 알림 누르면 빈 화면 |
| **3** | 비번 변경 재인증 | 보안 강화 | 비번 변경 자체 불가 |

각 단계는 독립 PR/배포. 1단계 배포 직후 **전 직원 1회 자동 로그아웃** 발생(구 쿠키 재발급 트리거) → 사전 공지 필수.

---

## 7. 테스트 계획

### 1단계
- [ ] 로컬: 로그인 후 DevTools → Application → Cookies → `sb-*`의 Expires 칸이 7일 후 날짜로 표시
- [ ] 실기기(Android): 로그인 후 앱 종료 → 30분 뒤 재실행 → 로그인 유지
- [ ] 실기기: 비행기 모드 on/off 토글 후 열기 → 로그아웃 안 됨 (재시도 동작)
- [ ] 2일차 유지 확인
- [ ] 7일차 경과 후 로그인 창 1회 등장 확인

### 2단계
- [ ] 로그인 상태 + 알림 클릭 → 해당 화면 직행
- [ ] 로그아웃 상태 + 알림 클릭 → 로그인 후 해당 화면
- [ ] 앱 완전 종료 상태에서 알림 → 해당 화면
- [ ] 로그인 페이지 진입 시 이메일 자동 채움
- [ ] 포커스가 password input에 있음
- [ ] `next` 파라미터 외부 URL 주입 시도 → `/dashboard` 폴백 확인

### 3단계
- [ ] 비번 변경 진입 → 재인증 모달 등장
- [ ] 틀린 비번 → 진행 차단
- [ ] 맞는 비번 → 통과 → 5분 내 재진입 시 모달 생략
- [ ] 탭 종료 후 재진입 → 모달 다시 등장

### 환경 주의
- 시크릿 탭 테스트 금지(쿠키 정책 상이)
- 최종 검증은 반드시 Vercel 배포 환경에서 실기기로

---

## 8. 위험 및 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| 쿠키 옵션 실수로 전 직원 로그아웃 지속 | 업무 중단 | 단계 분리, 롤백 기준, 사전 공지 |
| refresh 재시도 루프로 네트워크 낭비 | 배터리/요금 | 최대 3회, 지수 백오프, 영구 실패 시 즉시 중단 |
| NavigationListener 이벤트 수신 없음 | 딥링크 폴백 실패 | 실기기 테스트 필수 |
| `next` 오픈 리다이렉트 | 피싱 위험 | 동일 origin 내부 경로만 허용 |
| localStorage 이메일 노출 | 경미 | 본인 기기 1인 사용 전제, 로그아웃 시 삭제 |

---

## 9. 비-목표 (이번 스코프에서 제외)

- Supabase Auth 교체 또는 자체 JWT 발급 구조 (재발명, 위험 과다)
- 생체 인증(WebAuthn/지문) — PWA 지원 불안정, 후속 개선 과제
- SSO / OAuth 소셜 로그인 추가
- 관리자 작업 일반(권한 변경 등) 재인증 (요청 범위 밖)

---

## 10. 구현 이후 직원 공지 초안

> **JDI 포털 로그인 개선 안내**
>
> - 한 번 로그인하면 **7일 동안 자동 유지**
> - 알림 누르면 **해당 화면으로 바로 이동**
> - 7일 후 재로그인 시 **비밀번호만** 입력 (이메일 자동 채움)
> - 비밀번호 변경 시에만 본인 확인 1회
>
> **첫 배포 후 한 번만 다시 로그인 부탁드립니다.**
