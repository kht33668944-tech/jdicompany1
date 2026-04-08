"use client";

import { useState } from "react";
import { AirplaneTilt, CalendarPlus, Timer, Megaphone } from "phosphor-react";
import { updateNotificationSettings } from "@/lib/settings/actions";
import type { NotificationSettings } from "@/lib/settings/types";

interface NotificationsSectionProps {
  userId: string;
  initialSettings: NotificationSettings | null;
}

const TOGGLE_ITEMS = [
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

const DEFAULT_SETTINGS: Omit<NotificationSettings, "user_id"> = {
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
  });

  const handleToggle = async (key: keyof typeof settings) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    try {
      await updateNotificationSettings(userId, updated);
    } catch {
      setSettings(settings);
    }
  };

  return (
    <section className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 p-8">
      <div className="mb-8">
        <h2 className="text-lg font-bold text-slate-800">알림 설정</h2>
        <p className="text-xs text-slate-400 mt-1">업무 관련 알림 수신 여부를 개별적으로 설정할 수 있습니다.</p>
      </div>

      <div className="space-y-4">
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
