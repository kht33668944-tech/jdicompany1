import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import ChatPageClient from "@/components/dashboard/chat/ChatPageClient";
import { getChannels } from "@/lib/chat/queries";
import { getCachedAllProfiles } from "@/lib/attendance/queries.server";
import type { ChannelWithDetails } from "@/lib/chat/types";

export default async function ChatPage() {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  let channels: ChannelWithDetails[] = [];

  try {
    channels = await getChannels(auth.supabase, auth.user.id);
  } catch {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-700 font-semibold">채팅을 불러오는 중 오류가 발생했습니다.</p>
        <p className="text-red-500 text-sm mt-1">잠시 후 다시 시도해주세요.</p>
      </div>
    );
  }

  const allProfiles = await getCachedAllProfiles();

  return (
    <ChatPageClient
      initialChannels={channels}
      userId={auth.user.id}
      userName={auth.profile.full_name}
      userAvatar={auth.profile.avatar_url}
      allProfiles={allProfiles}
    />
  );
}
