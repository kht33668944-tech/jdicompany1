<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Code Review Guide

이 프로젝트의 코드리뷰 가이드입니다. "코드리뷰 해줘"라고 요청받으면 아래 기준을 모두 적용하세요.

## 프로젝트 정보

- **Framework**: Next.js 16 (App Router) + TypeScript 5 (strict)
- **React**: 19, **Styling**: Tailwind CSS 4
- **Auth/DB**: Supabase (RLS 활성화)
- **서버 컴포넌트**: `@/lib/supabase/server`, **클라이언트 컴포넌트**: `@/lib/supabase/client`
- **한국어 UI** (lang="ko")

## 리뷰 방법

특별한 지시가 없으면 `git diff HEAD~1` 기준으로 최근 커밋을 리뷰합니다.

## 리뷰 체크리스트

모든 항목을 빠짐없이 검사하고, 문제가 있으면 파일명:라인번호와 함께 보고하세요.

### 1. 버그 및 로직 오류

- 조건문 누락, off-by-one 에러, null/undefined 미처리
- 비동기 처리 누락 (await 빠짐, Promise 미처리)
- 타입 에러, 잘못된 타입 캐스팅
- 무한 루프, 무한 리렌더링 가능성
- 이벤트 핸들러 누수 (useEffect cleanup 누락)
- 상태 업데이트 경쟁 조건 (race condition)

### 2. 보안 취약점

- XSS: 사용자 입력을 dangerouslySetInnerHTML로 렌더링
- SQL Injection: Supabase 쿼리에 사용자 입력 직접 삽입
- RLS 우회: SECURITY DEFINER 함수에서 auth.uid() 검증 누락
- 민감 정보 노출: API 키, 비밀번호, 토큰이 클라이언트 코드에 노출
- CSRF/인증: 인증 없이 접근 가능한 API 엔드포인트
- .env.local 파일이 커밋에 포함되지 않았는지 확인

### 3. 성능 문제

- 불필요한 리렌더링 (useCallback, useMemo 필요한 곳)
- N+1 쿼리: 루프 안에서 Supabase 쿼리 호출
- 큰 데이터 전체 로드 (pagination 없이 전체 select)
- 이미지/리소스 최적화 누락
- 서버 컴포넌트로 충분한데 클라이언트 컴포넌트 사용
- useEffect 의존성 배열 오류

### 4. 에러 처리

- try-catch 누락된 비동기 호출
- 에러 발생 시 사용자에게 피드백 없음
- Supabase 쿼리 에러 무시 (data만 확인하고 error 미확인)
- 네트워크 실패 시 복구 방법 없음

### 5. TypeScript 타입 안전성

- `any` 타입 사용
- 타입 단언 (`as`) 남용
- optional chaining 필요한 곳에서 미사용
- 제네릭 타입 누락

### 6. Next.js / React 패턴

- "use client" 불필요하게 선언
- 서버 컴포넌트에서 useState/useEffect 사용 시도
- 클라이언트 컴포넌트에서 서버 전용 API (cookies, headers) 사용
- metadata export가 클라이언트 컴포넌트에 있는지
- Image 컴포넌트 대신 img 태그 사용
- Link 컴포넌트 대신 a 태그 사용

### 7. Supabase 관련

- RLS 정책과 코드 로직 불일치
- 서버에서 써야 할 클라이언트를 클라이언트에서 사용 또는 그 반대
- 인증 상태 확인 누락 (getUser 호출 없이 데이터 접근)
- onConflict 설정 오류
- TIMESTAMPTZ vs DATE 혼용 문제

### 8. 코드 품질

- 중복 코드 (3줄 이상 동일 패턴 반복)
- 매직 넘버/문자열 (상수로 분리해야 할 값)
- 함수가 너무 큼 (50줄 이상이면 분리 검토)
- 네이밍이 불명확한 변수/함수

## 보고 형식

리뷰 결과를 다음 형식으로 정리하세요:

```
## 코드리뷰 결과

### 🔴 심각 (즉시 수정 필요)
- [파일명:라인] 설명 + 수정 제안

### 🟡 주의 (수정 권장)
- [파일명:라인] 설명 + 수정 제안

### 🟢 개선 (선택적)
- [파일명:라인] 설명 + 수정 제안

### ✅ 잘된 점
- 잘 작성된 부분 언급
```
