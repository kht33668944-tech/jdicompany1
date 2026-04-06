"use client";

import { ChatCircle, Plus } from "phosphor-react";

interface EmptyStateProps {
  type: "no-selection" | "no-channels" | "no-messages";
  onCreateChannel?: () => void;
}

export default function EmptyState({ type, onCreateChannel }: EmptyStateProps) {
  if (type === "no-selection") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
          <ChatCircle size={32} weight="regular" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-slate-500">채널을 선택해주세요</p>
          <p className="text-sm text-slate-400 mt-1">
            왼쪽에서 채널을 선택하거나 새 채널을 만들어보세요
          </p>
        </div>
      </div>
    );
  }

  if (type === "no-channels") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center shadow-sm">
            <ChatCircle size={48} weight="regular" className="text-blue-500" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-md">
            <Plus size={16} weight="bold" className="text-white" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-slate-800">채팅을 시작해보세요!</h2>
          <p className="text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">
            팀원들과 소통할 수 있는 채널이 아직 없습니다.
            <br />
            새로운 채널을 만들어 대화를 시작하세요.
          </p>
        </div>

        {onCreateChannel && (
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={onCreateChannel}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={16} weight="bold" />
              첫 채널 만들기
            </button>
            <p className="text-xs text-slate-400">
              팁: <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-mono text-[11px]">Ctrl</kbd>
              {" + "}
              <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-mono text-[11px]">N</kbd>
              {" 으로 빠르게 채널을 만들 수 있어요"}
            </p>
          </div>
        )}
      </div>
    );
  }

  // no-messages
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
        <ChatCircle size={28} weight="regular" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-slate-500">첫 메시지를 보내보세요!</p>
        <p className="text-sm text-slate-400 mt-1">
          이 채널의 첫 번째 메시지를 작성해 대화를 시작하세요.
        </p>
      </div>
    </div>
  );
}
