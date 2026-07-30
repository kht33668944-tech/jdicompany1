# JDICOMPANY Repository Guide

이 저장소는 `jdi-portal/` 하위에 실제 Next.js 앱이 있는 루트 래퍼 저장소입니다.

## 작업 위치

- 앱 코드, 문서, Supabase 설정은 모두 `jdi-portal/` 아래에서 관리합니다.
- 루트 `package.json`은 하위 앱 빌드를 위한 래퍼입니다. 운영 배포는 **GCP Cloud Run 서울** — `jdi-portal/docs/operations/cloud-run-seoul.md`.
- 앱 작업 전에는 루트 `CLAUDE.md`(구조·성능 불변조건)와 `jdi-portal/AGENTS.md`를 우선 읽고 그 지침을 따릅니다.
- `jdi-desktop/`은 포털 웹을 감싸는 Electron 껍데기입니다. 웹을 배포하면 자동 반영되므로, 트레이/자동 실행/자동 업데이트 같은 껍데기 동작을 바꿀 때만 작업합니다(`jdi-desktop/README.md`).

## 기본 명령

루트에서 실행할 수 있는 명령:

```bash
npm run dev
npm run build
npm run start
```

앱 디렉터리에서 실행할 수 있는 명령:

```bash
cd jdi-portal
npm run dev
npm run build
npm run lint
npm run test:performance   # 코드 수정 후 속도 회귀 확인
```

## 안전 규칙

- `.env.local`과 실제 키 값은 커밋하지 않습니다.
- 사용자가 명시하지 않은 `git push`, 강제 푸시, 히스토리 재작성은 하지 않습니다.
- DB 마이그레이션, RLS, 운영 배포, 데이터 삭제는 실행 전 의도를 명확히 확인합니다.
- 기존 변경 사항이 있으면 사용자의 작업으로 보고 되돌리지 않습니다.
- 새 마이그레이션 번호는 파일 목록이 아니라 `npx supabase migration list --linked`의 Remote 열을 보고 정합니다. 여러 브랜치가 같은 운영 DB를 공유해 번호가 겹치면 `db push`가 조용히 건너뜁니다.
- 루트 `CLAUDE.md`의 성능 불변조건(인증 캐시, keepalive, 빠른 경로+폴백)은 지우거나 우회하지 않습니다.
