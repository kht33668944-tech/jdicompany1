import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/supabase/auth";
import ChatPageClient from "@/components/dashboard/chat/ChatPageClient";
import { getChannels, getMessages, getMessageFileUrls } from "@/lib/chat/queries";
import type { ChannelWithDetails, Message } from "@/lib/chat/types";

interface Props {
  params: Promise<{ channelId: string }>;
}

export default async function ChatChannelPage({ params }: Props) {
  const auth = await getAuthUser();
  if (!auth) redirect("/login");

  const { channelId } = await params;

  let channels: ChannelWithDetails[] = [];
  let initialMessages: Message[] = [];
  let initialFileUrls: Record<string, string> = {};

  try {
    // SSR critical path 최소화:
    // - 선택 채널 정보는 getChannels 결과에서 find — 별도 getChannelById 라운드트립 제거
    // - 멤버 목록은 ChannelSettingsDrawer가 열릴 때 lazy-load 함
    [channels, initialMessages] = await Promise.all([
      getChannels(auth.supabase, auth.user.id),
      getMessages(auth.supabase, channelId),
    ]);

    // 첨부 서명 URL 을 여기서 함께 실어 보낸다. 메시지에 의존하므로 순차이지만,
    // 첨부가 없으면 호출 자체를 건너뛰고(왕복 0), 있으면 브라우저가 렌더 후 다시
    // 서버로 왕복하던 1회를 없앤다 → 사진이 화면과 같이 뜬다.
    initialFileUrls = await getMessageFileUrls(auth.supabase, initialMessages);
  } catch {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-700 font-semibold">채팅을 불러오는 중 오류가 발생했습니다.</p>
        <p className="text-red-500 text-sm mt-1">잠시 후 다시 시도해주세요.</p>
      </div>
    );
  }

  const selectedChannel = channels.find((ch) => ch.id === channelId) ?? null;
  if (!selectedChannel) redirect("/dashboard/chat");

  return (
    <ChatPageClient
      initialChannels={channels}
      initialChannel={selectedChannel}
      initialMessages={initialMessages}
      initialFileUrls={initialFileUrls}
      userId={auth.user.id}
      userName={auth.profile.full_name}
      userAvatar={auth.profile.avatar_url}
    />
  );
}
