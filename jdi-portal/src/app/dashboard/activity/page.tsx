import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import { ACTIVITY_RETENTION_DAYS, getActivitiesByDateRange } from "@/lib/activity/queries";
import { addDays, toDateString } from "@/lib/utils/date";
import ActivityPageClient from "@/components/dashboard/activity/ActivityPageClient";

export const metadata = { title: "최근 활동" };

export default async function ActivityPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  // toDateString() 은 인자 없이 쓰면 현재 시각을 KST 로 변환한다.
  // kstNow() 를 넣으면 KST 로 두 번 변환돼 자정 근처에서 날짜가 틀어진다(서버는 싱가포르).
  const today = toDateString();
  const earliest = addDays(today, -(ACTIVITY_RETENTION_DAYS - 1));

  // 처음엔 오늘 것만 실어 보낸다. 나머지 날짜는 화면이 뜬 뒤
  // /api/activity 로 뒤에서 받아둔다(날짜를 바꿔도 기다림이 없도록).
  const todayActivities = await getActivitiesByDateRange(auth.supabase, today, addDays(today, 1));

  return (
    <ActivityPageClient
      today={today}
      earliest={earliest}
      initialActivities={todayActivities}
    />
  );
}
