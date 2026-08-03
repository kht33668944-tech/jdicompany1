"use client";

import { getErrorMessage } from "@/lib/utils/errors";
import { useEffect, useState } from "react";
import { AirplaneTilt, CalendarPlus, Timer, Megaphone, ChatCircle, BellRinging, Receipt } from "phosphor-react";
import { updateNotificationSettings } from "@/lib/settings/actions";
import { subscribeToPush, unsubscribeFromPush, checkPushSupport, getCurrentSubscription } from "@/lib/push/subscribe";
import { useIsDesktopApp } from "@/lib/hooks/useIsDesktopApp";
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
  {
    key: "expense_notify" as const,
    label: "지출 결제 예정",
    description: "결제일이 임박한 지출 항목에 대해 안내 알림을 받습니다.",
    icon: Receipt,
    iconBg: "bg-teal-50",
    iconColor: "text-teal-500",
  },
];

const DEFAULT_SETTINGS = {
  vacation_notify: true,
  schedule_remind: true,
  task_deadline: false,
  system_announce: true,
  push_enabled: false,
  chat_message_notify: true,
  expense_notify: true,
};

export default function NotificationsSection({ userId, initialSettings }: NotificationsSectionProps) {
  const [settings, setSettings] = useState({
    vacation_notify: initialSettings?.vacation_notify ?? DEFAULT_SETTINGS.vacation_notify,
    schedule_remind: initialSettings?.schedule_remind ?? DEFAULT_SETTINGS.schedule_remind,
    task_deadline: initialSettings?.task_deadline ?? DEFAULT_SETTINGS.task_deadline,
    system_announce: initialSettings?.system_announce ?? DEFAULT_SETTINGS.system_announce,
    push_enabled: initialSettings?.push_enabled ?? DEFAULT_SETTINGS.push_enabled,
    chat_message_notify: initialSettings?.chat_message_notify ?? DEFAULT_SETTINGS.chat_message_notify,
    expense_notify: initialSettings?.expense_notify ?? DEFAULT_SETTINGS.expense_notify,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supportMsg, setSupportMsg] = useState<string | null>(null);

  // 데스크톱 앱(Electron)은 브라우저 푸시 서비스를 쓰지 않는다.
  // 앱이 트레이에 떠 있는 동안 실시간으로 알림을 받아 Windows 알림으로 표시하므로
  // 이 화면에서는 푸시 구독을 시도하지 않고 안내만 보여준다.
  const isDesktopApp = useIsDesktopApp();

  // 초기 마운트 시 환경 지원 여부 + 실제 브라우저 subscription 상태 동기화
  useEffect(() => {
    if (isDesktopApp) return;
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
  }, [isDesktopApp]);

  const handlePushMaster = async () => {
    if (busy || isDesktopApp) return;
    setBusy(true);
    setError(null);
    try {
      if (settings.push_enabled) {
        // OFF 전환 — **이 기기의 구독만** 해제한다.
        // DB의 push_enabled 는 전체 기기 공용이라 여기서 false 로 쓰면
        // PC에서 껐을 때 휴대폰 푸시까지 같이 죽는다(실제로 그 증상이 있었음).
        // 기기별 수신 여부는 push_subscriptions 행의 존재 여부가 결정하므로
        // 로컬 구독만 지우면 이 기기로만 푸시가 끊긴다.
        await unsubscribeFromPush(userId);
        setSettings((s) => ({ ...s, push_enabled: false }));
      } else {
        // ON 전환
        await subscribeToPush(userId);
        const next = { ...settings, push_enabled: true };
        setSettings(next);
        await updateNotificationSettings({ push_enabled: true });
      }
    } catch (e) {
      setError(getErrorMessage(e, "푸시 설정 변경에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (key: keyof typeof settings) => {
    if (key === "push_enabled") return handlePushMaster();
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    try {
      await updateNotificationSettings({ [key]: updated[key] });
    } catch {
      setSettings(settings);
    }
  };

  // 데스크톱 앱에서는 마스터 푸시를 켤 수 없으므로(브라우저 푸시 미지원) 개별 항목까지 잠그지 않는다.
  // 여기서 바꾼 값은 폰/브라우저 푸시에 그대로 적용된다.
  const childDisabled = isDesktopApp ? false : !settings.push_enabled;

  return (
    <section className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 p-5 sm:p-8">
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
            <h4 className="font-bold text-sm text-slate-700">이 기기에서 푸시 알림 받기</h4>
            {isDesktopApp ? (
              <p className="text-xs text-slate-500 mt-0.5">
                데스크톱 앱은 켜져 있는 동안 알림을 바로 받습니다. 따로 켜실 것이 없습니다.
                <br />
                <span className="text-slate-400">
                  ※ 폰으로도 받으시려면 휴대폰 브라우저에서 포털에 접속해 이 설정을 켜주세요.
                </span>
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-0.5">
                브라우저/PWA가 닫혀 있어도 알림을 받습니다.
                <br />
                <span className="text-slate-400">
                  ※ 이 스위치는 <b>지금 쓰는 기기에만</b> 적용됩니다. PC에서 꺼도 휴대폰 알림은 계속 옵니다.
                </span>
                <br />
                <span className="text-slate-400">※ iPhone은 홈 화면에 앱 설치 후 사용 가능합니다.</span>
              </p>
            )}
            {!isDesktopApp && error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            {!isDesktopApp && supportMsg && <p className="text-xs text-amber-600 mt-1">{supportMsg}</p>}
          </div>
        </div>
        <button
          onClick={handlePushMaster}
          disabled={busy || !!supportMsg || isDesktopApp}
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
