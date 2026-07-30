# JDICOMPANY

JDICOMPANY 포털 저장소입니다. 실제 Next.js 앱은 `jdi-portal/`에 있고, 루트는 하위 앱을 빌드하도록 둔 래퍼입니다. 운영 배포는 **GCP Cloud Run 서울**입니다(`Dockerfile`, `cloudbuild.yaml`).

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
| `package.json` | 루트 래퍼 스크립트 |
| `Dockerfile` · `cloudbuild.yaml` | Cloud Run 서울 배포용 |
| `CLAUDE.md` | 저장소 구조·아키텍처·성능 불변조건 (작업 전 필독) |
| `AGENTS.md` | 저장소 루트 작업 지침 |
| `jdi-portal/` | 실제 Next.js 16 포털 앱 |
| `jdi-portal/AGENTS.md` | 앱 작업 지침 |
| `jdi-portal/README.md` | 앱 실행과 구조 안내 |
| `jdi-desktop/` | Windows 데스크톱 앱(Electron 껍데기, 별도 npm 프로젝트) |
| `jdi-desktop/README.md` | 데스크톱 앱 사용·배포·자동 업데이트 안내 |

## 주의

- 실제 환경 변수와 키는 커밋하지 않습니다.
- 앱 코드 변경 전 `jdi-portal/AGENTS.md`를 확인합니다.
- DB, RLS, Edge Function 작업은 `jdi-portal/supabase/CLAUDE.md`를 확인합니다.
- 코드를 고쳤으면 `cd jdi-portal && npm run test:performance`로 속도 회귀가 없는지 확인합니다.
- 데스크톱 앱은 웹을 배포하면 자동 반영됩니다. `jdi-desktop/`은 트레이·자동 실행 같은 껍데기 동작을 바꿀 때만 건드립니다.
