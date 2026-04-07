import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import TasksPageClient from "@/components/dashboard/tasks/TasksPageClient";
import { getCachedAllProfiles } from "@/lib/attendance/queries";
import type { Profile } from "@/lib/attendance/types";

// 할일 데이터는 SSR 에서 fetch 하지 않음 — 클라이언트가 IndexedDB 캐시 →
// 백그라운드 fetch 흐름으로 직접 로딩 (페이지 이동 차단 시간 0)
// 프로필은 가볍고 React cache() 로 요청 단위 dedupe 되므로 SSR 유지
export default async function TasksPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  let profiles: Profile[] = [];
  try {
    profiles = await getCachedAllProfiles();
  } catch {
    // 프로필 실패해도 페이지는 렌더 — 클라이언트가 자체 fetch 가능
    profiles = [];
  }

  // refreshSignal: 매 SSR 마다 새 값 — router.refresh() 호출 시 TasksPageClient 가
  // 이 값 변화를 감지해 클라이언트에서 직접 re-fetch (24개 router.refresh 호출 사이트 그대로 호환)
  return (
    <TasksPageClient
      profiles={profiles}
      userId={auth.user.id}
      refreshSignal={Date.now()}
    />
  );
}
