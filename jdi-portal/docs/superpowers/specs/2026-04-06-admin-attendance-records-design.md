# 근태관리 기록 탭 확장 — 관리자용 + 개인 근무시간 설정

## 개요

기존 근태관리 "기록" 탭을 확장하여 관리자는 전체 직원의 근태 기록을 조회·분석할 수 있고, 일반 직원은 동일한 UI에서 본인 기록만 확인할 수 있도록 구현한다. 이를 위해 개인별 고정 근무시간 설정 기능을 선행 구현한다.

## 작업 순서

- **1단계:** 출퇴근 탭에 개인 근무시간 설정 기능 추가 (DB + UI)
- **2단계:** 기록 탭 관리자/직원 공용 UI 구현 (목업 기준)

---

## 1단계: 개인 근무시간 설정

### DB 변경

`profiles` 테이블에 2개 컬럼 추가:

| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `work_start_time` | `TIME` | `NULL` | 고정 출근 시간 (예: 09:00) |
| `work_end_time` | `TIME` | `NULL` | 고정 퇴근 시간 (예: 18:00) |

- `NULL`인 경우 기본값 09:00 / 18:00으로 간주
- Supabase migration 파일로 추가

### UI 위치

출퇴근 탭 → "오늘 근무" 카드(`CheckInOutCard`) 하단에 "내 근무시간" 영역 추가.

### UI 동작

- 출근 시간 / 퇴근 시간 시간 선택기 표시
- 현재 설정값을 보여주고, 변경 시 즉시 저장
- 미설정 상태에서는 "09:00 / 18:00 (기본)" 표시
- 관리자도 본인 근무시간을 동일하게 설정

### 지각 판단 로직

- `check_in` 시간 > `work_start_time` → 지각
- 지각 시간 = `check_in` - `work_start_time` (분 단위)
- `work_start_time`이 NULL이면 09:00 기준

---

## 2단계: 기록 탭 UI

### 권한 분리

| 역할 | 왼쪽 직원 목록 | 오른쪽 상세 기록 |
|------|---------------|-----------------|
| 관리자 (`admin`) | 전체 직원 표시 | 선택한 직원의 기록 |
| 일반 직원 (`employee`) | 본인 1명만 표시 | 본인 기록만 |

- RLS로 DB 수준에서 권한 보장
- 직원끼리 서로의 기록 조회 불가

### 기존 기록 탭과의 관계

현재 `RecordsTab` 컴포넌트 내부에서 역할에 따라 분기:
- `role === "admin"` → 관리자용 UI (새 `AdminRecordsView` 컴포넌트)
- `role === "employee"` → 동일한 UI이지만 본인 데이터만 표시

### 상단 필터 영역

- **조회 기간:** 날짜 범위 선택기 + 빠른 선택 버튼 (이번달, 지난달)
- **부서 필터:** 전체 부서 / 부서별 선택 (관리자만 의미 있음)
- **직원 검색:** 이름 또는 직책 검색 (관리자만 의미 있음)
- **조회하기 버튼:** 필터 적용

### 왼쪽 패널 — 직원 요약

각 직원 카드에 표시할 정보:
- 프로필 아바타 (이름 첫 글자), 이름, 부서·직급
- 정상/지각/조퇴 횟수 배지
- 평균 출근 시간, 평균 퇴근 시간
- 클릭 시 오른쪽 상세 패널 업데이트
- 선택된 직원 카드는 테두리 하이라이트

### 오른쪽 패널 — 선택된 직원 상세

#### 요약 카드 (4개)

| 카드 | 내용 | 계산 방식 |
|------|------|----------|
| 총 근무일수 | `20일` | 조회 기간 내 출근 기록 수 |
| 평균 근무시간 | `8h 42m` | 총 근무 분 / 근무일수 |
| 정상 출근률 | `90%` | 정상 출근 횟수 / 총 근무일수 × 100 |
| 평균 지각시간 | `12분` | 지각 시 초과 분의 평균 (지각 없으면 0) |

- 전월 대비 변화량 표시 (예: "전월 대비 2건 증가", "전월 대비 5% 감소")

#### 상세 기록 테이블

| 날짜 | 출근 시간 | 퇴근 시간 | 근무 시간 | 상태 | 비고 |
|------|----------|----------|----------|------|------|

- 최근 날짜가 위에 표시 (내림차순)
- 최대 높이 제한 + 스크롤 가능 (30일치도 UI가 길어지지 않음)
- 상태: 정상(파란), 지각(빨간), 조퇴(주황) 등 색상 배지
- 비고: 사유가 있는 경우 표시 (예: "외부 미팅 후 출근")

#### 엑셀 다운로드

- 상세 기록 테이블 우측 상단에 "엑셀 다운로드" 버튼
- 선택된 직원의 조회 기간 기록을 `.xlsx`로 다운로드
- 라이브러리: `xlsx` (SheetJS)

#### 차트 영역 (2개)

1. **요일별 평균 출근 시간** — 바 차트 (월~금)
2. **주간 근무시간 추이** — 라인 차트 (주차별)

- 차트 라이브러리: `recharts` (React 호환, 가벼움)
- 조회 기간의 데이터 기반으로 계산

### 모바일 대응

- **데스크톱:** 좌(직원 목록) / 우(상세 기록) 2단 레이아웃
- **모바일:** 세로 배치 (직원 목록 → 상세 기록 순서)
  - 직원 카드 클릭 시 상세 영역으로 자동 스크롤
  - 요약 카드 4개 → 2×2 그리드
  - 상세 테이블 가로 스크롤 대응
  - 차트 2개 세로 배치

### 제외 항목

- 인사 고과 분석 리포트 (UI + 기능 모두 제외)

---

## 데이터 흐름

### 서버 (page.tsx)

관리자일 때 추가 데이터 fetch:
- 전체 직원 프로필 목록 (기존 `getAllProfiles` 활용)
- 선택된 직원의 기간별 근태 기록 (새 쿼리 필요)

### 클라이언트

- 직원 선택, 기간 변경 시 클라이언트에서 Supabase 직접 쿼리 (기존 패턴 유지)
- 통계 계산 (평균, 비율 등)은 클라이언트에서 수행

### 새로 필요한 쿼리/액션

| 함수 | 파일 | 설명 |
|------|------|------|
| `getEmployeeRecords(userId, startDate, endDate)` | `queries.ts` | 특정 직원의 기간별 기록 조회 |
| `updateWorkSchedule(workStart, workEnd)` | `actions.ts` | 본인 근무시간 설정 저장 |
| `getWorkSchedule(userId)` | `queries.ts` | 근무시간 설정 조회 |

---

## 새로 추가/수정되는 파일

### 새 파일
- `src/components/dashboard/attendance/tabs/records/AdminRecordsView.tsx` — 관리자/직원 공용 기록 UI
- `src/components/dashboard/attendance/tabs/records/EmployeeCard.tsx` — 직원 요약 카드
- `src/components/dashboard/attendance/tabs/records/RecordsSummaryCards.tsx` — 요약 카드 4개
- `src/components/dashboard/attendance/tabs/records/RecordsDetailTable.tsx` — 상세 기록 테이블
- `src/components/dashboard/attendance/tabs/records/AttendanceCharts.tsx` — 차트 2개
- `src/components/dashboard/attendance/tabs/records/RecordsFilter.tsx` — 상단 필터 영역
- `src/components/dashboard/attendance/WorkScheduleCard.tsx` — 근무시간 설정 카드
- `supabase/migrations/026_work_schedule.sql` — profiles 테이블 컬럼 추가

### 수정 파일
- `src/components/dashboard/attendance/tabs/RecordsTab.tsx` — 역할 분기 추가
- `src/components/dashboard/attendance/CheckInOutCard.tsx` — 근무시간 설정 카드 연결
- `src/app/dashboard/attendance/page.tsx` — 추가 데이터 fetch
- `src/lib/attendance/queries.ts` — 새 쿼리 추가
- `src/lib/attendance/actions.ts` — 근무시간 설정 액션 추가
- `src/lib/attendance/types.ts` — Profile 타입에 work_start_time, work_end_time 추가

### 새 의존성
- `xlsx` (SheetJS) — 엑셀 다운로드
- `recharts` — 차트 렌더링
