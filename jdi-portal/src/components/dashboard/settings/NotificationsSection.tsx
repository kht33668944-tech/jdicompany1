"use client";

import { useEffect, useState } from "react";
import { AirplaneTilt, CalendarPlus, Timer, Megaphone, ChatCircle, BellRinging } from "phosphor-react";
import { updateNotificationSettings } from "@/lib/settings/actions";
import { subscribeToPush, unsubscribeFromPush, checkPushSupport, getCurrentSubscription } from "@/lib/push/subscribe";
import type { NotificationSettings } from "@/lib/settings/types";

interface NotificationsSectionProps {
  userId: string;
  initialSettings: NotificationSettings | null;
}

const TOGGLE_ITEMS = [
  {
    key: "chat_message_notify" as const,
    label: "채팅 메시지",
    description: "새 채팅 메시지가 오면 푸시 알림으로 받습니다.",
    icon: ChatCircle,
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-500",
  },
  {
    key: "vacation_notify" as const,
    label: "휴가 승인/반려 알림",
    description: "상신한 휴가 신청의 처리 결과에 대해 실시간 알림을 받습니다.",
    icon: AirplaneTilt,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-500",
  },
  {
    key: "schedule_remind" as const,
    label: "일정 리마인더",
    description: "등록된 회의 및 스케줄 시작 10분 전에 알림을 받습니다.",
    icon: CalendarPlus,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-500",
  },
  {
    key: "task_deadline" as const,
    label: "할일 마감 알림",
    description: "마감 기한이 임박한 할일 목록에 대해 안내 알림을 받습니다.",
    icon: Timer,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-500",
  },
  {
    key: "system_announce" as const,
    label: "시스템 공지사항",
    description: "서비스 정기 점검 및 주요 정책 변경 사항을 안내받습니다.",
    icon: Megaphone,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-500",
  },
];

const DEFAULT_SETTINGS = {
  vacation_notify: true,
  schedule_remind: true,
  task_deadline: false,
  system_announce: true,
  push_enabled: false,
  chat_message_notify: true,
};

export default function NotificationsSection({ userId, initialSettings }: NotificationsSectionProps) {
  const [settings, setSettings] = useState({
    vacation_notify: initialSettings?.vacation_notify ?? DEFAULT_SETTINGS.vacation_notify,
    schedule_remind: initialSettings?.schedule_remind ?? DEFAULT_SETTINGS.schedule_remind,
    task_deadline: initialSettings?.task_deadline ?? DEFAULT_SETTINGS.task_deadline,
    system_announce: initialSettings?.system_announce ?? DEFAULT_SETTINGS.system_announce,
    push_enabled: initialSettings?.push_enabled ?? DEFAULT_SETTINGS.push_enabled,
    chat_message_notify: initialSettings?.chat_message_notify ?? DEFAULT_SETTINGS.chat_message_notify,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supportMsg, setSupportMsg] = useState<string | null>(null);

  // 초기 마운트 시 환경 지원 여부 + 실제 브라우저 subscription 상태 동기화
  useEffect(() => {
    const support = checkPushSupport();
    if (support !== "ok") {
      const messages: Record<string, string> = {
        "no-sw": "이 브라우저는 Service Worker를 지원하지 않습니다.",
        "no-push": "이 브라우저는 Web Push를 지원하지 않습니다.",
        "no-notification": "이 브라우저는 알림 API를 지원하지 않습니다.",
        "no-vapid": "푸시 키가 설정되지 않았습니다. 관리자에게 문의하세요.",
      };
      setSupportMsg(messages[support]);
      return;
    }
    // 실제 브라우저에 sub 없는데 DB는 push_enabled = true 라면 OFF로 보정
    void (async () => {
      const sub = await getCurrentSubscription();
      if (!sub && settings.push_enabled) {
        setSettings((s) => ({ ...s, push_enabled: false }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePushMaster = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (settings.push_enabled) {
        // OFF 전환
        await unsubscribeFromPush(userId);
        const next = { ...settings, push_enabled: false };
        setSettings(next);
        await updateNotificationSettings(userId, { push_enabled: false });
      } else {
        // ON 전환
        await subscribeToPush(userId);
        const next = { ...settings, push_enabled: true };
        setSettings(next);
        await updateNotificationSettings(userId, { push_enabled: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "푸시 설정 변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (key: keyof typeof settings) => {
    if (key === "push_enabled") return handlePushMaster();
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    try {
      await updateNotificationSettings(userId, { [key]: updated[key] });
    } catch {
      setSettings(settings);
    }
  };

  const childDisabled = !settings.push_enabled;

  return (
    <section className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 p-8">
      <div className="mb-8">
        <h2 className="text-lg font-bold text-slate-800">알림 설정</h2>
        <p className="text-xs text-slate-400 mt-1">업무 관련 알림 수신 여부를 개별적으로 설정할 수 있습니다.</p>
      </div>

      {/* 마스터 토글 */}
      <div className="mb-6 p-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white text-indigo-500 flex items-center justify-center shadow-sm">
            <BellRinging size={24} weight="fill" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-700">푸시 알림 받기</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              브라우저/PWA가 닫혀 있어도 폰에서 알림을 받습니다.
              <br />
              <span className="text-slate-400">※ iPhone은 홈 화면에 앱 설치 후 사용 가능합니다.</span>
            </p>
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            {supportMsg && <p className="text-xs text-amber-600 mt-1">{supportMsg}</p>}
          </div>
        </div>
        <button
          onClick={handlePushMaster}
          disabled={busy || !!supportMsg}
          className={`relative w-12 h-6 rounded-full transition-colors disabled:opacity-50 ${
            settings.push_enabled ? "bg-indigo-500" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white border-2 transition-all ${
              settings.push_enabled ? "right-0.5 border-indigo-500" : "left-0.5 border-slate-300"
            }`}
          />
        </button>
      </div>

      {/* 종류별 토글 */}
      <div className={`space-y-4 ${childDisabled ? "opacity-50 pointer-events-none" : ""}`}>
        {TOGGLE_ITEMS.map((item) => {
          const Icon = item.icon;
          const checked = settings[item.key];
          return (
            <div
              key={item.key}
              className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100"
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl ${item.iconBg} ${item.iconColor} flex items-center justify-center`}>
                  <Icon size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-700">{item.label}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle(item.key)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  checked ? "bg-indigo-400" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white border-2 transition-all ${
                    checked ? "right-0.5 border-indigo-400" : "left-0.5 border-slate-300"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
