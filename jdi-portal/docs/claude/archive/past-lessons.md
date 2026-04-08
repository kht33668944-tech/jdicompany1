# 과거 교훈 (아카이브)

같은 실수를 반복하지 않기 위한 기록. **필요할 때만 참고**.
CLAUDE.md나 project-guide.md에서 함정 항목에 걸렸을 때 "왜 그런 규칙이 있는지"가 필요하면 이 문서를 연다.

## 마이그레이션/커밋별 교훈

| 마이그레이션/커밋 | 교훈 |
|---|---|
| `053` | `CURRENT_DATE`는 UTC → KST 사용자가 전날로 기록됨. `(NOW() AT TIME ZONE 'Asia/Seoul')::DATE` 필수 |
| `054/055` | `push_subscriptions` UPDATE 정책 누락 → `upsert` RLS 실패. INSERT/UPDATE 양쪽 정책 필요 |
| Edge Function 초안 | `web-push` npm 사용 → Deno `crypto.ECDH` 미지원 런타임 에러. `jsr:@negrel/webpush` 교체 |
| Vercel 환경변수 초안 | VAPID 공개키 첫 글자 `B` 누락 → 브라우저 `applicationServerKey is not valid` |
| tsconfig 초안 | `supabase/functions` 포함 → Vercel TypeScript 검사가 Deno 파일 뒤져서 빌드 실패. exclude 필수 |
| `048` | schedule_participants RLS 재귀 (SELECT) |
| `052` | schedule_participants RLS 재귀 (DML) |

## 주요 배경 설명

### Next.js 16
- `middleware.ts` 대신 `proxy.ts` 사용.
- 일부 API가 기존과 다를 수 있음 → 불확실하면 `node_modules/next/dist/docs/` 확인.
- TypeScript lib 정의 엄격 → 경우에 따라 `PushManager.subscribe`에 `as any` 캐스트 필요.

### Supabase
- `supabase.upsert()`는 INSERT + UPDATE 둘 다 → RLS에 양쪽 정책 필요.
- Edge Function 배포 시 `--no-verify-jwt` 필요 (webhook이 JWT 없이 호출).

### Web Push (VAPID)
- 공개키 첫 글자 **`B`** 필수 (EC uncompressed point marker). 복붙 시 잘리지 않게 주의.
- 원시 base64url VAPID 키 → JWK 변환 후 `importVapidKeys`.
- `jsr:@negrel/webpush` (Deno 네이티브, Web Crypto API) 사용.

### Service Worker
- 캐시 전략 변경 시 `CACHE_VERSION` 올려 자동 교체 유도.

### Tailwind / 디자인 시스템
- Glass morphism 클래스: `.glass-card`, `.glass-sidebar`, `.glass-header`.
- 모서리: `rounded-2xl`~`3xl`.
- 그림자: `shadow-sm` 기본.
- 모바일 터치 타겟 최소 44px (버튼 padding `py-2.5` 이상).
- 모달/드로어: `ModalContainer` (포커스 트랩, ESC 닫기 내장).
