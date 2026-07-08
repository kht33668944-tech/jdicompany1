# JDICOMPANY

JDICOMPANY 포털 저장소입니다. 실제 Next.js 앱은 `jdi-portal/`에 있고, 루트는 Railway/Railpack이 Node 프로젝트를 감지하고 하위 앱을 빌드하도록 둔 래퍼입니다.

## 빠른 실행

루트에서:

```bash
npm run dev
npm run build
npm run start
```

앱 디렉터리에서:

```bash
cd jdi-portal
npm run dev
npm run build
npm run lint
```

## 구조

| 경로 | 내용 |
|---|---|
| `package.json` | Railway/Railpack용 루트 래퍼 스크립트 |
| `AGENTS.md` | 저장소 루트 작업 지침 |
| `jdi-portal/` | 실제 Next.js 16 포털 앱 |
| `jdi-portal/AGENTS.md` | 앱 작업 지침 |
| `jdi-portal/README.md` | 앱 실행과 구조 안내 |

## 주의

- 실제 환경 변수와 키는 커밋하지 않습니다.
- 앱 코드 변경 전 `jdi-portal/AGENTS.md`를 확인합니다.
- DB, RLS, Edge Function 작업은 `jdi-portal/supabase/CLAUDE.md`를 확인합니다.
