# JDI 포털 컨테이너 이미지 (Google Cloud Run / 서울 리전용)
#
# 왜 컨테이너인가: 이 앱은 항상 켜져 있는 Node 프로세스를 전제로 한다
# (src/instrumentation.ts 의 pg 풀 warm-up + 2분 주기 keepalive). 서버리스 함수형
# 호스팅에서는 이 장치가 동작하지 않아 성능 불변조건이 깨진다.
# Cloud Run 에 "최소 1대 상시 가동 + CPU 항상 할당" 으로 띄우면 Railway 와 같은
# 실행 모델을 유지하면서 앱을 DB(Supabase 서울) 옆으로 옮길 수 있다.
#
# 빌드 컨텍스트는 저장소 루트다(루트 package.json 은 얇은 래퍼이므로 여기서는 쓰지 않고
# jdi-portal 을 직접 빌드한다).

# ---------- 1) 의존성 ----------
FROM node:22-slim AS deps
WORKDIR /app
# 락파일만 먼저 복사해 의존성 레이어를 캐시한다(소스만 바뀌면 npm ci 를 건너뜀).
COPY jdi-portal/package.json jdi-portal/package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- 2) 빌드 ----------
FROM node:22-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# standalone 출력을 켠다(next.config.ts 의 스위치). 실행 이미지를 작게 유지한다.
ENV NEXT_OUTPUT_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY jdi-portal/ ./

# NEXT_PUBLIC_* 는 클라이언트 번들에 값이 박히므로 빌드 시점에 있어야 한다.
# (세 값 모두 브라우저에 공개되는 값이다 — 서버 전용 키는 여기 두지 않는다.)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

# 빌드 시점에 공개 환경변수가 비어 있으면 로그인 화면이 조용히 고장난 채로 배포된다.
# 배포 후에 발견하기 어려우니 여기서 끊는다.
# (VAPID 키는 일부러 검사하지 않는다 — 없으면 웹 푸시만 꺼질 뿐 앱은 정상 동작한다.)
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" && test -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  || (echo "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY build arg is empty" && exit 1)

RUN npm run build

# ---------- 3) 실행 ----------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run 은 PORT 를 주입한다. HOSTNAME 은 Docker 가 컨테이너 ID 로 덮어쓰므로
# Next 서버가 외부 접속을 받도록 0.0.0.0 으로 고정한다.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

RUN useradd --create-home --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
