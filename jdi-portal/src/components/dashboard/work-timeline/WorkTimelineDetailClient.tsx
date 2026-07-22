"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarBlank, CaretLeft, CaretRight, DownloadSimple, FileArrowUp, LinkSimple, PencilSimple, TrashSimple, X } from "phosphor-react";
import { toast } from "sonner";
import UserAvatar from "@/components/shared/UserAvatar";
import {
  deleteWorkTimelineAttachment,
  deleteWorkTimelineEntry,
  getWorkTimelineSignedUrls,
  updateWorkTimelineEntry,
} from "@/lib/work-timeline/actions";
import { uploadWorkTimelineFilesDirect } from "@/lib/work-timeline/clientUploads";
import {
  WORK_TIMELINE_MAX_ATTACHMENTS,
  WORK_TIMELINE_MAX_DESCRIPTION_LENGTH,
  WORK_TIMELINE_MAX_TITLE_LENGTH,
} from "@/lib/work-timeline/constants";
import type { WorkTimelineEntryWithProfile } from "@/lib/work-timeline/types";
import { isWorkTimelineImage, validateWorkTimelineFile } from "@/lib/work-timeline/utils";
import { createImageThumbnail, resizeImageIfNeeded } from "@/lib/utils/imageResize";
import { triggerDownload, triggerDownloadAll } from "@/lib/utils/download";
import AttachmentFileCard from "./AttachmentFileCard";

interface WorkTimelineDetailClientProps {
  initialEntry: WorkTimelineEntryWithProfile;
  currentUserId: string;
  currentUserRole: string;
}

function formatCompletedAt(timestamp: string): string {
  return new Date(timestamp).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function toKstDateTimeLocal(timestamp: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function fromKstDateTimeLocal(value: string): string {
  const parsed = new Date(`${value}:00+09:00`);
  if (!value || Number.isNaN(parsed.getTime())) {
    throw new Error("완료 시간을 올바르게 입력해 주세요.");
  }
  return parsed.toISOString();
}

export default function WorkTimelineDetailClient({
  initialEntry,
  currentUserId,
  currentUserRole,
}: WorkTimelineDetailClientProps) {
  const router = useRouter();
  const [entry, setEntry] = useState(initialEntry);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialEntry.title);
  const [description, setDescription] = useState(initialEntry.description ?? "");
  const [completedAt, setCompletedAt] = useState(() => toKstDateTimeLocal(initialEntry.completed_at));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const isOwner = entry.user_id === currentUserId;
  const canDelete = isOwner || currentUserRole === "admin";
  const imageAttachments = entry.attachments.filter(
    (attachment) => isWorkTimelineImage(attachment.mime_type)
      && (attachment.original_url || attachment.thumbnail_url),
  );
  const fileAttachments = entry.attachments.filter(
    (attachment) => !isWorkTimelineImage(attachment.mime_type),
  );
  const viewableAttachments = imageAttachments; // 라이트박스는 이미지에만
  const activeViewerAttachment = viewerIndex === null ? null : viewableAttachments[viewerIndex] ?? null;
  const activeViewerUrl = activeViewerAttachment?.original_url ?? activeViewerAttachment?.thumbnail_url ?? null;

  const handleDownloadAllAttachments = () => {
    const ready = viewableAttachments.flatMap((attachment) => {
      const url = attachment.original_url ?? attachment.thumbnail_url;
      return url ? [{ url, fileName: attachment.file_name }] : [];
    });
    if (ready.length === 0) return;
    void triggerDownloadAll(ready);
  };

  useEffect(() => {
    if (viewerIndex === null) return;
    if (!activeViewerAttachment) {
      setViewerIndex(null);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewerIndex(null);
      if (viewableAttachments.length < 2) return;
      if (event.key === "ArrowLeft") {
        setViewerIndex((current) => current === null
          ? null
          : (current - 1 + viewableAttachments.length) % viewableAttachments.length);
      }
      if (event.key === "ArrowRight") {
        setViewerIndex((current) => current === null
          ? null
          : (current + 1) % viewableAttachments.length);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeViewerAttachment, viewerIndex, viewableAttachments.length]);

  const resetForm = () => {
    setTitle(entry.title);
    setDescription(entry.description ?? "");
    setCompletedAt(toKstDateTimeLocal(entry.completed_at));
    setEditing(false);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("업무 제목을 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateWorkTimelineEntry(entry.id, {
        title,
        description,
        completedAt: fromKstDateTimeLocal(completedAt),
      });
      setEntry((current) => ({ ...current, ...updated }));
      setEditing(false);
      toast.success("업무 기록을 수정했습니다.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "수정하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const result = await deleteWorkTimelineEntry(entry.id);
      if (result.storageCleanupFailed) {
        toast.warning("업무 기록은 삭제했지만 일부 저장소 파일 정리가 필요합니다.");
      } else {
        toast.success("업무 기록과 첨부 파일 삭제를 완료했습니다.");
      }
      router.replace("/dashboard/work-timeline");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "삭제하지 못했습니다.");
      setDeleting(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    setDeletingAttachmentId(attachmentId);
    try {
      const result = await deleteWorkTimelineAttachment(attachmentId, entry.id);
      setEntry((current) => ({
        ...current,
        attachments: current.attachments.filter((attachment) => attachment.id !== attachmentId),
      }));
      if (result.storageCleanupFailed) {
        toast.warning("첨부 기록은 삭제했지만 저장소 파일 정리가 필요합니다.");
      } else {
        toast.success("첨부 파일을 삭제했습니다.");
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "첨부 파일을 삭제하지 못했습니다.");
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const handleAddFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const availableSlots = WORK_TIMELINE_MAX_ATTACHMENTS - entry.attachments.length;
    const selected = Array.from(files).slice(0, availableSlots);
    if (files.length > availableSlots) {
      toast.error(`파일은 최대 ${WORK_TIMELINE_MAX_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
    }
    if (selected.length === 0) return;

    setUploadingImages(true);
    try {
      const processed = await Promise.all(selected.map(async (file) => {
        validateWorkTimelineFile(file);
        if (!isWorkTimelineImage(file.type)) return { file, thumbnail: null };
        const resized = await resizeImageIfNeeded(file, { maxDim: 2560, quality: 0.92 });
        const thumbnail = await createImageThumbnail(resized);
        return { file: resized, thumbnail };
      }));
      const occupied = new Set(entry.attachments.map((attachment) => attachment.position));
      const positions = Array.from({ length: WORK_TIMELINE_MAX_ATTACHMENTS }, (_, index) => index)
        .filter((position) => !occupied.has(position))
        .slice(0, processed.length);
      const attachments = await uploadWorkTimelineFilesDirect({
        entryId: entry.id,
        userId: currentUserId,
        files: processed,
        positions,
      });
      let signedUrls: Record<string, string>;
      try {
        signedUrls = await getWorkTimelineSignedUrls(
          attachments.flatMap((attachment) => [attachment.file_path, attachment.thumbnail_path ?? ""]),
        );
      } catch (error) {
        console.warn("추가된 첨부 파일의 서명 URL을 즉시 발급하지 못했습니다.", error);
        toast.success("첨부 파일을 추가했습니다. 화면을 새로 불러옵니다.");
        router.refresh();
        return;
      }
      const signedAttachments = attachments.map((attachment) => ({
        ...attachment,
        original_url: signedUrls[attachment.file_path] ?? null,
        thumbnail_url: attachment.thumbnail_path
          ? signedUrls[attachment.thumbnail_path] ?? null
          : signedUrls[attachment.file_path] ?? null,
      }));
      setEntry((current) => ({
        ...current,
        attachments: [...current.attachments, ...signedAttachments]
          .sort((a, b) => a.position - b.position),
      }));
      toast.success("첨부 파일을 추가했습니다.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "파일을 추가하지 못했습니다.");
    } finally {
      setUploadingImages(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/work-timeline"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={17} aria-hidden="true" />
          업무 타임라인
        </Link>
        <div className="flex items-center gap-2">
          {isOwner && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              <PencilSimple size={16} aria-hidden="true" />
              수정
            </button>
          )}
          {canDelete && !editing && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
            >
              <TrashSimple size={16} aria-hidden="true" />
              삭제
            </button>
          )}
        </div>
      </div>

      <article className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
          {editing ? (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-500">큰 업무 제목</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={WORK_TIMELINE_MAX_TITLE_LENGTH}
                  className="h-11 w-full rounded-md border border-slate-200 px-3 text-base font-bold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-500">설명</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={WORK_TIMELINE_MAX_DESCRIPTION_LENGTH}
                  rows={8}
                  className="w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label className="block max-w-xs">
                <span className="mb-1.5 block text-xs font-bold text-slate-500">완료 시간</span>
                <input
                  type="datetime-local"
                  value={completedAt}
                  onChange={(event) => setCompletedAt(event.target.value)}
                  className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={imageInputRef}
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(event) => void handleAddFiles(event.target.files)}
                />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploadingImages || entry.attachments.length >= WORK_TIMELINE_MAX_ATTACHMENTS}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileArrowUp size={17} aria-hidden="true" />
                  {uploadingImages ? "파일 추가 중..." : "파일 추가"}
                </button>
                <span className="text-xs font-semibold text-slate-400">
                  {entry.attachments.length}/{WORK_TIMELINE_MAX_ATTACHMENTS}
                </span>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="break-words text-2xl font-bold leading-9 text-slate-900">{entry.title}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
                <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
                  <UserAvatar
                    name={entry.author_profile.full_name}
                    avatarUrl={entry.author_profile.avatar_url}
                    size="sm"
                  />
                  {entry.author_profile.full_name}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarBlank size={16} aria-hidden="true" />
                  {formatCompletedAt(entry.completed_at)}
                </span>
                {entry.task_id && (
                  <Link
                    href={`/dashboard/tasks/${entry.task_id}`}
                    className="inline-flex items-center gap-1.5 font-semibold text-indigo-600 hover:text-indigo-500"
                  >
                    <LinkSimple size={16} aria-hidden="true" />
                    연결된 할일
                  </Link>
                )}
              </div>
            </>
          )}
        </div>

        {!editing && (
          <div className="px-5 py-6 sm:px-7">
            {entry.description ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                {entry.description}
              </p>
            ) : (
              <p className="text-sm text-slate-400">작성된 설명이 없습니다.</p>
            )}
          </div>
        )}

        {entry.attachments.length > 0 && (
          <section className="border-t border-slate-100 px-5 py-6 sm:px-7" aria-labelledby="timeline-images-title">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 id="timeline-images-title" className="text-sm font-bold text-slate-800">
                첨부 파일 {entry.attachments.length}
              </h2>
              {viewableAttachments.length >= 2 && (
                <button
                  type="button"
                  onClick={handleDownloadAllAttachments}
                  title="전체 저장"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  <DownloadSimple size={15} weight="bold" aria-hidden="true" />
                  전체 저장
                </button>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {viewableAttachments.map((attachment, index) => {
                const imageUrl = attachment.original_url ?? attachment.thumbnail_url;
                if (!imageUrl) return null;
                return (
                  <div key={attachment.id} className="relative overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => setViewerIndex(index)}
                      aria-label={`첨부 이미지 ${index + 1} 크게 보기`}
                      className="block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
                    >
                      <Image
                        src={imageUrl}
                        alt={`${entry.title} 첨부 이미지 ${index + 1}`}
                        width={1600}
                        height={1000}
                        unoptimized
                        className="h-auto max-h-[70vh] w-full object-contain"
                      />
                    </button>
                    {isOwner && editing ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(attachment.id)}
                        disabled={deletingAttachmentId === attachment.id}
                        aria-label={`${attachment.file_name} 삭제`}
                        className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/95 text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50"
                      >
                        <X size={17} weight="bold" aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => triggerDownload(imageUrl, attachment.file_name)}
                        aria-label={`${attachment.file_name} 저장`}
                        title="저장"
                        className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-md bg-black/50 text-white shadow-sm hover:bg-black/70"
                      >
                        <DownloadSimple size={17} weight="bold" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {fileAttachments.length > 0 && (
              <ul className="mt-4 space-y-2" aria-label="첨부 문서">
                {fileAttachments.map((attachment) => (
                  <li key={attachment.id}>
                    <AttachmentFileCard
                      fileName={attachment.file_name}
                      fileSize={attachment.file_size}
                      downloadUrl={attachment.original_url}
                      onDelete={isOwner && editing ? () => handleDeleteAttachment(attachment.id) : undefined}
                      deleting={deletingAttachmentId === attachment.id}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </article>

      {confirmDelete && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-bold text-red-800">이 업무 기록을 삭제하시겠습니까?</p>
          <p className="mt-1 text-xs leading-5 text-red-600">
            기록과 첨부 파일이 함께 삭제되며 복구할 수 없습니다.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
            >
              {deleting ? "삭제 중..." : "삭제"}
            </button>
          </div>
        </div>
      )}

      {viewerIndex !== null && activeViewerUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="첨부 이미지 확대 보기"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 sm:p-8"
          onClick={() => setViewerIndex(null)}
        >
          <div
            className="relative flex h-full w-full max-w-7xl items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              src={activeViewerUrl}
              alt={`${entry.title} 확대 이미지 ${viewerIndex + 1}`}
              width={2000}
              height={1400}
              unoptimized
              priority
              className="max-h-full w-auto max-w-full object-contain"
            />
            {activeViewerAttachment && (
              <button
                type="button"
                onClick={() => triggerDownload(activeViewerUrl, activeViewerAttachment.file_name)}
                aria-label={`${activeViewerAttachment.file_name} 저장`}
                title="저장"
                className="absolute right-12 top-0 inline-flex h-10 w-10 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <DownloadSimple size={20} weight="bold" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setViewerIndex(null)}
              aria-label="확대 이미지 닫기"
              className="absolute right-0 top-0 inline-flex h-10 w-10 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X size={22} weight="bold" aria-hidden="true" />
            </button>
            {viewableAttachments.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setViewerIndex((current) => current === null
                    ? null
                    : (current - 1 + viewableAttachments.length) % viewableAttachments.length)}
                  aria-label="이전 이미지"
                  className="absolute left-0 inline-flex h-11 w-11 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <CaretLeft size={25} weight="bold" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewerIndex((current) => current === null
                    ? null
                    : (current + 1) % viewableAttachments.length)}
                  aria-label="다음 이미지"
                  className="absolute right-0 inline-flex h-11 w-11 items-center justify-center rounded-md bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <CaretRight size={25} weight="bold" aria-hidden="true" />
                </button>
              </>
            )}
            <span className="absolute bottom-0 rounded bg-black/60 px-2.5 py-1 text-xs font-bold text-white">
              {viewerIndex + 1} / {viewableAttachments.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
