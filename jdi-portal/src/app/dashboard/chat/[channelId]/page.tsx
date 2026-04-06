import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import ChatPageClient from "@/components/dashboard/chat/ChatPageClient";
import { getChannels, getChannelById, getMessages } from "@/lib/chat/queries";
import type { ChannelWithDetails, Message } from "@/lib/chat/types";

interface Props {
  params: Promise<{ channelId: string }>;
}

export default async function ChatChannelPage({ params }: Props) {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const { channelId } = await params;

  let channels: ChannelWithDetails[] = [];
  let selectedChannel: ChannelWithDetails | null = null;
  let initialMessages: Message[] = [];

  try {
    [channels, selectedChannel, initialMessages] = await Promise.all([
      getChannels(auth.supabase, auth.user.id),
      getChannelById(auth.supabase, channelId),
      getMessages(auth.supabase, channelId),
    ]);
  } catch {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-700 font-semibold">채팅을 불러오는 중 오류가 발생했습니다.</p>
        <p className="text-red-500 text-sm mt-1">잠시 후 다시 시도해주세요.</p>
      </div>
    );
  }

  if (!selectedChannel) redirect("/dashboard/chat");

  return (
    <ChatPageClient
      initialChannels={channels}
      initialChannel={selectedChannel}
      initialMessages={initialMessages}
      userId={auth.user.id}
      userName={auth.profile.full_name}
      userAvatar={auth.profile.avatar_url}
    />
  );
}
