"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ChatCircleDots,
  ArrowRight,
  UserSwitch,
  Flag,
  Paperclip,
  CheckSquare,
  PencilSimple,
  Trash,
  DownloadSimple,
  X,
} from "phosphor-react";
import type { TaskActivity, ActivityType } from "@/lib/tasks/types";
import { deleteActivity, getAttachmentUrls } from "@/lib/tasks/actions";
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

// 활동 목록에서 모든 첨부 이미지 경로 추출
function extractAttachmentPaths(activities: TaskActivity[]): string[] {
  const paths: string[] = [];
  for (const a of activities) {
    if (a.type !== "comment") continue;
    const meta = a.metadata as Record<string, unknown> | null;
    const atts = meta?.attachments as AttachmentMeta[] | undefined;
    if (!atts) continue;
    for (const att of atts) {
      if (att.file_path) paths.push(att.file_path);
    }
  }
  return paths;
}

async function downloadBlob(url: string, fileName: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

// --- 하위 컴포넌트 ---

function CommentAttachments({
  metadata,
  urlCache,
}: {
  metadata: Record<string, unknown> | null;
  urlCache: Record<string, string>;
}) {
  if (!metadata?.attachments) return null;
  const attachments = metadata.attachments as AttachmentMeta[];
  if (attachments.length === 0) return null;

  const images = attachments.filter((a) => a.content_type?.startsWith("image/"));
  const files = attachments.filter((a) => !a.content_type?.startsWith("image/"));

  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((att) => (
            <ImagePreview key={att.id} attachment={att} url={urlCache[att.file_path] ?? null} />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((att) => (
            <FileChip key={att.id} attachment={att} url={urlCache[att.file_path] ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}

function ImagePreview({ attachment, url }: { attachment: AttachmentMeta; url: string | null }) {
  const [lightbox, setLightbox] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!url || downloading) return;
    setDownloading(true);
    try {
      await downloadBlob(url, attachment.file_name);
    } catch {
      console.error("다운로드 실패");
    } finally {
      setDownloading(false);
    }
  };

  if (!url) {
    return <div className="w-48 h-32 bg-slate-100 rounded-xl animate-pulse" />;
  }

  return (
    <>
      <div className="inline-flex flex-col gap-1">
        <img
          src={url}
          alt={attachment.file_name}
          className="max-w-48 max-h-40 rounded-xl object-cover border border-slate-200 cursor-pointer hover:brightness-95 transition-all"
          onClick={() => setLightbox(true)}
        />
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-500 transition-colors self-start"
        >
          <DownloadSimple size={12} />
          <span>{downloading ? "저장 중..." : attachment.file_name}</span>
        </button>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70"
          onClick={() => setLightbox(false)}
        >
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); handleDownload(e); }}
              className="p-2 bg-white/20 rounded-full hover:bg-white/40 transition-colors"
            >
              <DownloadSimple size={24} className="text-white" />
            </button>
            <button
              onClick={() => setLightbox(false)}
              className="p-2 bg-white/20 rounded-full hover:bg-white/40 transition-colors"
            >
              <X size={24} className="text-white" />
            </button>
          </div>
          <img
            src={url}
            alt={attachment.file_name}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function FileChip({ attachment, url }: { attachment: AttachmentMeta; url: string | null }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!url || downloading) return;
    setDownloading(true);
    try {
      await downloadBlob(url, attachment.file_name);
    } catch {
      console.error("파일 다운로드 실패");
    } finally {
      setDownloading(false);
    }
  };

  const sizeLabel = attachment.file_size < 1024 * 1024
    ? `${Math.round(attachment.file_size / 1024)}KB`
    : `${(attachment.file_size / (1024 * 1024)).toFixed(1)}MB`;

  return (
    <button
      onClick={handleDownload}
      disabled={!url || downloading}
      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs text-slate-600 transition-colors disabled:opacity-50"
    >
      <Paperclip size={12} />
      <span className="max-w-[140px] truncate">{attachment.file_name}</span>
      <span className="text-slate-400">{sizeLabel}</span>
      <DownloadSimple size={12} className="text-slate-400" />
    </button>
  );
}

// --- 메인 컴포넌트 ---

// 모듈 레벨 캐시 — 패널 재오픈/다른 할일 탐색 시에도 서명 URL 재활용
// 서명 URL 은 1시간 유효 → 안전 마진으로 58분 TTL
const URL_TTL_MS = 58 * 60 * 1000;
const attachmentUrlCache = new Map<string, { url: string; expiresAt: number }>();

export default function TaskActivityTimeline({ activities, userId }: Props) {
  const router = useRouter();
  const [version, bumpVersion] = useState(0);

  // 활동 변경 시 누락/만료된 첨부 URL만 배치로 가져오기
  useEffect(() => {
    const now = Date.now();
    const allPaths = extractAttachmentPaths(activities);
    const missing = allPaths.filter((p) => {
      const e = attachmentUrlCache.get(p);
      return !e || e.expiresAt <= now;
    });
    if (missing.length === 0) return;

    getAttachmentUrls(missing).then((newUrls) => {
      const expiresAt = Date.now() + URL_TTL_MS;
      for (const [p, u] of Object.entries(newUrls)) {
        attachmentUrlCache.set(p, { url: u, expiresAt });
      }
      bumpVersion((v) => v + 1);
    }).catch(() => {});
  }, [activities]);

  // 렌더용 URL 맵 — 만료 체크는 useEffect 에서 처리하므로 렌더는 순수하게 노출만
  // 의존성 activities/version 은 외부 Map 변경을 반영하기 위한 의도적 트리거
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const urlCache = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [path, entry] of attachmentUrlCache) {
      out[path] = entry.url;
    }
    return out;
  }, [activities, version]);

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
                <CommentAttachments
                  metadata={activity.metadata as Record<string, unknown> | null}
                  urlCache={urlCache}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
