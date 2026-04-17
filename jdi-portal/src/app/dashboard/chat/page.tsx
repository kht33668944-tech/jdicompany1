import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import ChatPageClient from "@/components/dashboard/chat/ChatPageClient";
import { getChannels } from "@/lib/chat/queries";
import type { ChannelWithDetails, ApprovedProfile } from "@/lib/chat/types";

export default async function ChatPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  let channels: ChannelWithDetails[] = [];
  let people: ApprovedProfile[] = [];

  try {
    // 채널과 직원 목록을 병렬 fetch — SSR 단계에서 둘 다 준비해 사이드바 늦게 뜨는 문제 방지
    const [channelsResult, profilesResult] = await Promise.all([
      getChannels(auth.supabase, auth.user.id),
      auth.supabase
        .from("profiles")
        .select("id, full_name, avatar_url, department")
        .eq("is_approved", true)
        .order("full_name"),
    ]);
    channels = channelsResult;
    people = ((profilesResult.data ?? []) as ApprovedProfile[]).filter(
      (p) => p.id !== auth.user.id
    );
  } catch {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-700 font-semibold">채팅을 불러오는 중 오류가 발생했습니다.</p>
        <p className="text-red-500 text-sm mt-1">잠시 후 다시 시도해주세요.</p>
      </div>
    );
  }

  return (
    <ChatPageClient
      initialChannels={channels}
      initialPeople={people}
      userId={auth.user.id}
      userName={auth.profile.full_name}
      userAvatar={auth.profile.avatar_url}
    />
  );
}
