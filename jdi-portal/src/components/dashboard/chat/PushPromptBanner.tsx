"use client";

import { useEffect, useState } from "react";
import { BellRinging, X } from "phosphor-react";
import { subscribeToPush, checkPushSupport } from "@/lib/push/subscribe";
import { updateNotificationSettings } from "@/lib/settings/actions";
import { CHAT_PUSH_PROMPT_KEY } from "@/lib/push/constants";

interface PushPromptBannerProps {
  userId: string;
}

export default function PushPromptBanner({ userId }: PushPromptBannerProps) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (checkPushSupport() !== "ok") return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem(CHAT_PUSH_PROMPT_KEY)) return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(CHAT_PUSH_PROMPT_KEY, "1");
    setVisible(false);
  };

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await subscribeToPush(userId);
      await updateNotificationSettings(userId, { push_enabled: true, chat_message_notify: true });
      dismiss();
    } catch {
      // 거부됐거나 실패해도 배너는 닫음 — 설정에서 다시 켤 수 있음
      dismiss();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-4 mt-3 p-3 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-white text-indigo-500 flex items-center justify-center shrink-0">
          <BellRinging size={18} weight="fill" />
        </div>
        <p className="text-xs text-slate-700 truncate">
          알림을 켜면 채팅을 놓치지 않아요. 앱이 꺼져 있어도 폰으로 받을 수 있어요.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={enable}
          disabled={busy}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50"
        >
          {busy ? "처리 중..." : "켜기"}
        </button>
        <button
          onClick={dismiss}
          aria-label="닫기"
          className="w-7 h-7 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white flex items-center justify-center"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
