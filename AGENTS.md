# JDICOMPANY Repository Guide

이 저장소는 `jdi-portal/` 하위에 실제 Next.js 앱이 있는 루트 래퍼 저장소입니다.

## 작업 위치

- 앱 코드, 문서, Supabase 설정은 모두 `jdi-portal/` 아래에서 관리합니다.
- 루트 `package.json`은 Railway/Railpack이 Node 프로젝트를 감지하도록 두는 래퍼입니다.
- 앱 작업 전에는 `jdi-portal/AGENTS.md`를 우선 읽고 그 지침을 따릅니다.

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
```

## 안전 규칙

- `.env.local`과 실제 키 값은 커밋하지 않습니다.
- 사용자가 명시하지 않은 `git push`, 강제 푸시, 히스토리 재작성은 하지 않습니다.
- DB 마이그레이션, RLS, 운영 배포, 데이터 삭제는 실행 전 의도를 명확히 확인합니다.
- 기존 변경 사항이 있으면 사용자의 작업으로 보고 되돌리지 않습니다.
