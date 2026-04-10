"use client";

import {
  ChatCircleDots,
  ArrowRight,
  UserSwitch,
  Flag,
  Paperclip,
  CheckSquare,
  PencilSimple,
  Trash,
} from "phosphor-react";
import type { TaskActivity, ActivityType } from "@/lib/tasks/types";
import { deleteActivity } from "@/lib/tasks/actions";
import { useRouter } from "next/navigation";
import UserAvatar from "@/components/shared/UserAvatar";

interface Props {
  activities: TaskActivity[];
  userId: string;
}

const TYPE_ICONS: Record<ActivityType, React.ComponentType<{ size?: number; className?: string }>> = {
  comment: ChatCircleDots,
  status_change: ArrowRight,
  assignee_change: UserSwitch,
  priority_change: Flag,
  attachment: Paperclip,
  checklist: CheckSquare,
  edit: PencilSimple,
};

const TYPE_COLORS: Record<ActivityType, string> = {
  comment: "bg-indigo-100 text-indigo-600",
  status_change: "bg-amber-100 text-amber-600",
  assignee_change: "bg-purple-100 text-purple-600",
  priority_change: "bg-red-100 text-red-600",
  attachment: "bg-blue-100 text-blue-600",
  checklist: "bg-emerald-100 text-emerald-600",
  edit: "bg-slate-100 text-slate-600",
};

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(isoString).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function getActivityDescription(activity: TaskActivity): string {
  const meta = activity.metadata as Record<string, unknown> | null;

  switch (activity.type) {
    case "comment":
      return activity.content ?? "";
    case "status_change":
      return `상태를 "${meta?.from}" → "${meta?.to}"으로 변경`;
    case "assignee_change":
      if (meta?.added) return `담당자를 추가`;
      if (meta?.removed) return `담당자를 제거`;
      return "담당자를 변경";
    case "priority_change":
      return `우선순위를 "${meta?.from}" → "${meta?.to}"으로 변경`;
    case "attachment":
      return `"${meta?.file_name}" 파일을 첨부`;
    case "checklist":
      return `체크리스트: ${meta?.action === "completed" ? "완료" : "변경"} — ${meta?.item}`;
    case "edit":
      return `${meta?.field === "title" ? "제목" : "내용"}을 수정`;
    default:
      return activity.content ?? "";
  }
}

interface AttachmentMeta {
  id: string;
  file_name: string;
  file_size: number;
  content_type: string;
  file_path: string;
}

function CommentAttachments({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata?.attachments) return null;
  const attachments = metadata.attachments as AttachmentMeta[];
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {attachments.map((att) => {
        const isImage = att.content_type?.startsWith("image/");
        return (
          <div
            key={att.id}
            className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 rounded-md text-xs text-slate-500"
          >
            <Paperclip size={11} />
            <span className="max-w-[150px] truncate">{att.file_name}</span>
            {isImage && <span className="text-[10px] text-indigo-400">이미지</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function TaskActivityTimeline({ activities, userId }: Props) {
  const router = useRouter();

  const handleDelete = async (activityId: string) => {
    try {
      await deleteActivity(activityId);
      router.refresh();
    } catch (error) {
      console.error("활동 내역 삭제 실패:", error);
    }
  };

  if (activities.length === 0) {
    return <p className="text-sm text-slate-400">활동 내역이 없습니다</p>;
  }

  return (
    <div className="space-y-4">
      {activities.map((activity) => {
        const Icon = TYPE_ICONS[activity.type];
        const colorClass = TYPE_COLORS[activity.type];
        const isComment = activity.type === "comment";
        const canDelete = isComment && activity.user_id === userId;

        return (
          <div key={activity.id} className="flex gap-3 group">
            <UserAvatar
              name={activity.user_profile.full_name}
              avatarUrl={activity.user_profile.avatar_url}
              size="md"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-700">
                  {activity.user_profile.full_name}
                </span>
                <span className="text-xs text-slate-400">
                  {formatTimeAgo(activity.created_at)}
                </span>
                {canDelete && (
                  <button
                    onClick={() => handleDelete(activity.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all ml-auto"
                  >
                    <Trash size={12} />
                  </button>
                )}
              </div>
              <p className={`text-sm mt-0.5 ${isComment ? "text-slate-600" : "text-slate-500"}`}>
                {getActivityDescription(activity)}
              </p>
              {isComment && (
                <CommentAttachments metadata={activity.metadata as Record<string, unknown> | null} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
