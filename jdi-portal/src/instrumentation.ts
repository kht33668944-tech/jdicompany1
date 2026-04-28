/**
 * Next.js instrumentation hook — 서버 부팅 시 1회 실행.
 *
 * 측정 근거: pure SSR 작업은 2.6초인데 attendance 페이지 첫 진입은 22초
 * → 19초가 무거운 모듈(recharts/phosphor-react/dnd 등) 콜드 로드에 소비.
 *
 * 1) 부팅 직후 무거운 페이지 모듈을 background로 import → V8 캐시 적재
 * 2) 4분마다 /api/keep-warm 셀프 핑 → Supabase 연결·V8 캐시 유지
 */

const KEEP_WARM_INTERVAL_MS = 4 * 60 * 1000;
const KEEP_WARM_PATH = "/api/keep-warm";

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // HMR/재진입 방지 — register()가 두 번 불려도 setInterval 중복 등록 안 함
  const g = globalThis as { __jdiWarmStarted?: boolean };
  if (g.__jdiWarmStarted) return;
  g.__jdiWarmStarted = true;

  // await 금지 — register()를 블로킹하면 server bootstrap이 멈춰 첫 사용자 30초 대기
  Promise.allSettled([
    import("@/components/dashboard/attendance/AttendancePageClient"),
    import("@/components/dashboard/attendance/WeekSummaryCard"),
    import("@/components/dashboard/tasks/TasksPageClient"),
    import("@/components/dashboard/schedule/SchedulePageClient"),
    import("@/components/dashboard/chat/ChatPageClient"),
    import("@/components/dashboard/reports/ReportsPageClient"),
    import("@/components/dashboard/settings/SettingsPageClient"),
    import("recharts"),
    import("phosphor-react"),
    import("@hello-pangea/dnd"),
  ]).catch(() => {});

  // 셀프 핑은 localhost — DNS + TLS + Cloudflare hop을 매번 거치지 않도록
  const port = process.env.PORT || "3000";
  const selfUrl = `http://127.0.0.1:${port}${KEEP_WARM_PATH}`;
  const timer = setInterval(() => {
    fetch(selfUrl).catch(() => {});
  }, KEEP_WARM_INTERVAL_MS);
  timer.unref();
}
