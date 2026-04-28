/**
 * Next.js instrumentation hook — 서버 부팅 시 1회 실행.
 *
 * 목적:
 * 1. Railway 컨테이너 부팅 직후 무거운 페이지 모듈을 미리 import해서
 *    첫 사용자 요청부터 빠르게 응답 (cold module load 비용을 부팅 시점으로 이동)
 * 2. setInterval로 4분마다 /api/keep-warm 셀프 핑 → V8 모듈 캐시 + Supabase
 *    HTTP keep-alive 연결 유지로 idle eviction 방지
 *
 * 측정: pure SSR 작업은 2.6초인데 attendance 페이지 첫 진입은 22초
 * → 19초가 모듈 로드(recharts/phosphor-react/dnd 등)에 소비됨을 진단으로 확인.
 */

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // 1) 무거운 페이지 모듈 미리 로드 — fire-and-forget (await 금지!)
  //    await하면 register()가 server bootstrap을 블로킹 → 첫 사용자 30초 대기.
  //    백그라운드로 띄우면 server는 즉시 요청 받기 시작, 모듈은 곧 도착.
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
  ]).catch(() => {
    /* warmup 실패는 silent — 첫 요청에서 자연스럽게 로드됨 */
  });

  // 2) 4분마다 셀프 핑 — Supabase HTTP keep-alive + V8 모듈 캐시 유지
  // Railway는 idle 시 컨테이너를 evict 하지 않지만 Node.js 내부 캐시는 GC됨
  const PORT = process.env.PORT || "3000";
  const SELF_URL = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api/keep-warm`
    : `http://127.0.0.1:${PORT}/api/keep-warm`;

  setInterval(() => {
    fetch(SELF_URL).catch(() => {
      /* 실패는 silent — 다음 핑에서 재시도 */
    });
  }, 4 * 60 * 1000); // 4분
}
