"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileArrowUp, Plus, SpinnerGap, X } from "phosphor-react";
import { toast } from "sonner";
import ModalContainer from "@/components/shared/ModalContainer";
import Select from "@/components/shared/Select";
import { createProject } from "@/lib/projects/actions";
import { PROJECT_COLORS } from "@/lib/projects/constants";
import { notifyProjectsChanged, useProjects } from "@/lib/projects/useProjects";
import {
  createWorkTimelineEntry,
  deleteWorkTimelineEntry,
} from "@/lib/work-timeline/actions";
import { uploadWorkTimelineFilesDirect } from "@/lib/work-timeline/clientUploads";
import {
  WORK_TIMELINE_MAX_ATTACHMENTS,
  WORK_TIMELINE_MAX_DESCRIPTION_LENGTH,
  WORK_TIMELINE_MAX_TITLE_LENGTH,
} from "@/lib/work-timeline/constants";
import { isWorkTimelineImage, validateWorkTimelineFile } from "@/lib/work-timeline/utils";
import {
  clearWorkTimelineDraft,
  getWorkTimelineDraft,
  saveWorkTimelineDraft,
  type WorkTimelineDraftRecord,
} from "@/lib/work-timeline/draftStore";
import { createImageThumbnail, resizeImageIfNeeded } from "@/lib/utils/imageResize";
import AttachmentFileCard from "./AttachmentFileCard";

interface WorkTimelineCreateModalProps {
  open: boolean;
  currentUserId: string;
  onClose: () => void;
  onCreated: (entryId: string) => void;
  initialTitle?: string;
  initialDescription?: string;
  initialCompletedAt?: string;
  taskId?: string | null;
}

interface SelectedAttachment {
  id: string;
  file: File;
  isImage: boolean;
  previewUrl: string | null; // 이미지에만 존재
}

function toKstDateTimeLocal(value: string | Date = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function getFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export default function WorkTimelineCreateModal({
  open,
  currentUserId,
  onClose,
  onCreated,
  initialTitle = "",
  initialDescription = "",
  initialCompletedAt,
  taskId = null,
}: WorkTimelineCreateModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [initialCompletedAtValue] = useState(() =>
    toKstDateTimeLocal(initialCompletedAt ?? new Date()),
  );
  const [completedAt, setCompletedAt] = useState(initialCompletedAtValue);
  const [images, setImages] = useState<SelectedAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<"loading" | "restored" | "ready">("loading");
  const [restoredDraftUpdatedAt, setRestoredDraftUpdatedAt] = useState<number | null>(null);
  const [autosaveArmed, setAutosaveArmed] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState<string>(PROJECT_COLORS[0]);
  const [creatingProject, setCreatingProject] = useState(false);
  const { activeProjects } = useProjects();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef(new Set<string>());
  const autosaveTimerRef = useRef<number | null>(null);
  const draftOperationRef = useRef<Promise<void>>(Promise.resolve());
  const closingRef = useRef(false);
  const imageDraftFallbackNotifiedRef = useRef(false);
  const draftUnavailableNotifiedRef = useRef(false);
  const draftScope = taskId ?? "new";

  const enqueueDraftOperation = useCallback((operation: () => Promise<void>) => {
    const nextOperation = draftOperationRef.current
      .catch(() => undefined)
      .then(operation);
    draftOperationRef.current = nextOperation;
    return nextOperation;
  }, []);

  const persistCurrentDraft = useCallback(() => enqueueDraftOperation(async () => {
    const hasContent = Boolean(
      title.trim()
      || description.trim()
      || images.length > 0
      || completedAt !== initialCompletedAtValue
      || projectId !== "",
    );
    if (!hasContent) {
      await clearWorkTimelineDraft(currentUserId, draftScope);
      return;
    }

    const result = await saveWorkTimelineDraft(currentUserId, draftScope, {
      title,
      description,
      completedAt,
      taskId,
      images: images.map(({ id, file }) => ({
        id,
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
        blob: file,
      })),
      projectId: projectId || null,
    });
    if (result === "text-only" && !imageDraftFallbackNotifiedRef.current) {
      imageDraftFallbackNotifiedRef.current = true;
      toast.warning("이미지 초안은 저장하지 못해 텍스트 내용만 자동 저장했습니다.");
    } else if (result === "unavailable" && !draftUnavailableNotifiedRef.current) {
      draftUnavailableNotifiedRef.current = true;
      toast.warning("브라우저 저장소를 사용할 수 없어 초안을 자동 저장하지 못했습니다.");
    }
  }), [completedAt, currentUserId, description, draftScope, enqueueDraftOperation, images, initialCompletedAtValue, projectId, taskId, title]);

  const applyDraft = useCallback((draft: WorkTimelineDraftRecord) => {
    const restoredImages: SelectedAttachment[] = [];
    const storedImages = Array.isArray(draft.images) ? draft.images : [];
    for (const storedImage of storedImages.slice(0, WORK_TIMELINE_MAX_ATTACHMENTS)) {
      const file = new File([storedImage.blob], storedImage.name, {
        type: storedImage.type,
        lastModified: storedImage.lastModified,
      });
      try {
        validateWorkTimelineFile(file);
      } catch {
        continue;
      }
      const isImage = isWorkTimelineImage(file.type);
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      if (previewUrl) previewUrlsRef.current.add(previewUrl);
      restoredImages.push({ id: storedImage.id || crypto.randomUUID(), file, isImage, previewUrl });
    }

    setImages((current) => {
      for (const image of current) {
        if (image.previewUrl) {
          URL.revokeObjectURL(image.previewUrl);
          previewUrlsRef.current.delete(image.previewUrl);
        }
      }
      return restoredImages;
    });
    setTitle(draft.title.slice(0, WORK_TIMELINE_MAX_TITLE_LENGTH));
    setDescription(draft.description.slice(0, WORK_TIMELINE_MAX_DESCRIPTION_LENGTH));
    setCompletedAt(draft.completedAt || initialCompletedAtValue);
    setProjectId(draft.projectId ?? "");
    setAutosaveArmed(false);
    setRestoredDraftUpdatedAt(draft.updatedAt);
    setDraftStatus("restored");
  }, [initialCompletedAtValue]);

  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getWorkTimelineDraft(currentUserId, draftScope).then((draft) => {
      if (cancelled) return;
      if (draft) {
        applyDraft(draft);
      } else {
        setDraftStatus("ready");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [applyDraft, currentUserId, draftScope]);

  useEffect(() => {
    if (draftStatus === "loading" || !autosaveArmed) return;
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void persistCurrentDraft();
    }, 500);
    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [autosaveArmed, draftStatus, persistCurrentDraft]);

  const handleClose = useCallback(() => {
    if (submitting || closingRef.current) return;
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (!autosaveArmed || draftStatus === "loading") {
      onClose();
      return;
    }

    closingRef.current = true;
    void persistCurrentDraft().finally(onClose);
  }, [autosaveArmed, draftStatus, onClose, persistCurrentDraft, submitting]);

  if (!open) return null;

  function addFiles(files: File[]) {
    if (files.length === 0) return;

    const existingKeys = new Set(images.map(({ file }) => getFileKey(file)));
    const accepted: SelectedAttachment[] = [];

    for (const file of files) {
      if (images.length + accepted.length >= WORK_TIMELINE_MAX_ATTACHMENTS) {
        toast.error(`파일은 최대 ${WORK_TIMELINE_MAX_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
        break;
      }
      if (existingKeys.has(getFileKey(file))) {
        toast.error(`${file.name} 파일은 이미 첨부되어 있습니다.`);
        continue;
      }
      try {
        validateWorkTimelineFile(file);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `${file.name} 파일을 확인해주세요.`);
        continue;
      }
      const isImage = isWorkTimelineImage(file.type);
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      if (previewUrl) previewUrlsRef.current.add(previewUrl);
      existingKeys.add(getFileKey(file));
      accepted.push({ id: crypto.randomUUID(), file, isImage, previewUrl });
    }

    if (accepted.length > 0) {
      setImages((current) => [...current, ...accepted]);
      setAutosaveArmed(true);
      setErrorMessage(null);
    }
  }

  function removeImage(id: string) {
    setImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrlsRef.current.delete(target.previewUrl);
      }
      return current.filter((image) => image.id !== id);
    });
    setAutosaveArmed(true);
  }

  async function discardDraft() {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    await enqueueDraftOperation(() => clearWorkTimelineDraft(currentUserId, draftScope));
    setImages((current) => {
      for (const image of current) {
        if (image.previewUrl) {
          URL.revokeObjectURL(image.previewUrl);
          previewUrlsRef.current.delete(image.previewUrl);
        }
      }
      return [];
    });
    setTitle(initialTitle);
    setDescription(initialDescription);
    setCompletedAt(initialCompletedAtValue);
    setProjectId("");
    setAutosaveArmed(false);
    setRestoredDraftUpdatedAt(null);
    setDraftStatus("ready");
  }

  async function handleCreateProject() {
    if (!newProjectName.trim() || creatingProject) return;
    setCreatingProject(true);
    try {
      const project = await createProject(newProjectName, newProjectColor);
      notifyProjectsChanged();
      setProjectId(project.id);
      setNewProjectOpen(false);
      setNewProjectName("");
      setNewProjectColor(PROJECT_COLORS[0]);
      setAutosaveArmed(true);
      toast.success(`'${project.name}' 프로젝트를 만들었습니다.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "프로젝트를 만들지 못했습니다.");
    } finally {
      setCreatingProject(false);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const pasted = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (pasted.length === 0) return;
    event.preventDefault();
    addFiles(pasted);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setErrorMessage("업무 제목을 입력해주세요.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    let createdEntryId: string | null = null;
    try {
      const processedFiles = await Promise.all(
        images.map(async ({ file, isImage }) => {
          if (!isImage) return { file, thumbnail: null };
          const resized = await resizeImageIfNeeded(file, { maxDim: 2560, quality: 0.92 });
          const thumbnail = await createImageThumbnail(resized);
          return { file: resized, thumbnail };
        }),
      );
      const result = await createWorkTimelineEntry({
        title: title.trim(),
        description: description.trim() || null,
        completedAt: new Date(`${completedAt}:00+09:00`).toISOString(),
        taskId,
        projectId: projectId || null,
      });
      if (!result.duplicate) {
        createdEntryId = result.entry.id;
        await uploadWorkTimelineFilesDirect({
          entryId: result.entry.id,
          userId: currentUserId,
          files: processedFiles,
          positions: processedFiles.map((_, index) => index),
        });
      }
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      await enqueueDraftOperation(() => clearWorkTimelineDraft(currentUserId, draftScope));

      if (result.duplicate) {
        toast.info("이미 타임라인에 공유된 업무입니다.");
      } else {
        toast.success("완료 업무를 타임라인에 공유했습니다.");
      }
      onCreated(result.entry.id);
      onClose();
    } catch (error) {
      if (createdEntryId) {
        try {
          await deleteWorkTimelineEntry(createdEntryId);
        } catch (rollbackError) {
          console.error("실패한 업무 타임라인 항목을 롤백하지 못했습니다.", {
            entryId: createdEntryId,
            rollbackError,
          });
        }
      }
      const message = error instanceof Error ? error.message : "업무를 공유하지 못했습니다. 잠시 후 다시 시도해주세요.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalContainer onClose={handleClose} maxWidth="max-w-2xl" className="max-h-[90vh] overflow-hidden !rounded-lg !p-0">
      <form onSubmit={handleSubmit} aria-labelledby="work-timeline-create-title">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="work-timeline-create-title" className="text-lg font-bold text-slate-800">
              완료 업무 공유
            </h2>
            <p className="mt-1 text-xs text-slate-400">완료한 업무를 팀 타임라인에 남깁니다.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            aria-label="작성 창 닫기"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div
          className="max-h-[calc(90vh-144px)] space-y-5 overflow-y-auto overscroll-y-auto px-5 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onPaste={handlePaste}
        >
          {draftStatus === "restored" && restoredDraftUpdatedAt && (
            <div role="status" className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-indigo-800">초안 복구됨</p>
                  <p className="mt-1 text-xs text-indigo-500">
                    {new Date(restoredDraftUpdatedAt).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}에 자동 저장됨
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={discardDraft}
                    className="rounded-lg px-3 py-2 text-xs font-bold text-slate-500 transition-colors hover:bg-white"
                  >
                    초안 삭제
                  </button>
                </div>
              </div>
            </div>
          )}
          <div>
            <label htmlFor="timeline-title" className="mb-2 block text-sm font-bold text-slate-700">
              업무 제목 <span className="text-red-500">*</span>
            </label>
            <input
              id="timeline-title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setAutosaveArmed(true);
              }}
              maxLength={WORK_TIMELINE_MAX_TITLE_LENGTH}
              required
              autoComplete="off"
              placeholder="완료한 주요 업무를 입력하세요"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <p className="mt-1 text-right text-[11px] tabular-nums text-slate-400">
              {title.length}/{WORK_TIMELINE_MAX_TITLE_LENGTH}
            </p>
          </div>

          <div>
            <label htmlFor="timeline-description" className="mb-2 block text-sm font-bold text-slate-700">
              설명 <span className="font-normal text-slate-400">(선택)</span>
            </label>
            <textarea
              id="timeline-description"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setAutosaveArmed(true);
              }}
              maxLength={WORK_TIMELINE_MAX_DESCRIPTION_LENGTH}
              rows={5}
              placeholder="결과와 공유할 내용을 간단히 작성하세요"
              className="w-full resize-none rounded-lg border border-slate-200 px-3.5 py-3 text-sm leading-6 text-slate-800 outline-none transition-colors placeholder:text-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <p className="mt-1 text-right text-[11px] tabular-nums text-slate-400">
              {description.length}/{WORK_TIMELINE_MAX_DESCRIPTION_LENGTH.toLocaleString()}
            </p>
          </div>

          <div>
            <label htmlFor="timeline-completed-at" className="mb-2 block text-sm font-bold text-slate-700">
              완료 시간
            </label>
            <input
              id="timeline-completed-at"
              type="datetime-local"
              value={completedAt}
              onChange={(event) => {
                setCompletedAt(event.target.value);
                setAutosaveArmed(true);
              }}
              required
              className="w-full rounded-lg border border-slate-200 px-3.5 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:max-w-xs"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              프로젝트 <span className="font-normal text-slate-400">(선택)</span>
            </label>
            <Select
              value={projectId}
              onChange={(v) => {
                setProjectId(v);
                setAutosaveArmed(true);
              }}
              ariaLabel="프로젝트 선택"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-3 text-sm text-slate-700 sm:max-w-xs"
              options={[
                { value: "", label: "미분류" },
                ...activeProjects.map((project) => ({ value: project.id, label: project.name })),
              ]}
              footerAction={{ label: "새 프로젝트 만들기", onClick: () => setNewProjectOpen(true) }}
            />
            {newProjectOpen && (
              <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <input
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  maxLength={50}
                  placeholder="새 프로젝트 이름 (예: 코스피랩)"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="프로젝트 색상">
                  {PROJECT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewProjectColor(color)}
                      aria-label={`색상 ${color}`}
                      aria-pressed={newProjectColor === color}
                      className={`h-6 w-6 rounded-full border-2 transition-transform ${
                        newProjectColor === color ? "scale-110 border-slate-700" : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setNewProjectOpen(false)}
                    className="rounded-md px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-200"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateProject()}
                    disabled={creatingProject || !newProjectName.trim()}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:bg-slate-300"
                  >
                    {creatingProject ? "만드는 중..." : "만들기"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="text-sm font-bold text-slate-700">
                파일 첨부 <span className="font-normal text-slate-400">(선택)</span>
              </label>
              <span className="text-[11px] font-semibold tabular-nums text-slate-400">
                {images.length}/{WORK_TIMELINE_MAX_ATTACHMENTS}
              </span>
            </div>
            <div
              role="button"
              tabIndex={0}
              aria-label="파일 선택"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-5 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                dragging
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/50"
              }`}
            >
              <FileArrowUp size={25} className="text-indigo-500" aria-hidden="true" />
              <p className="mt-2 text-xs font-bold text-slate-600">클릭, 드래그 또는 붙여넣기로 추가</p>
              <p className="mt-1 text-[11px] text-slate-400">엑셀·PDF·한글·이미지 등 · 파일당 최대 50MB</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileChange}
                className="sr-only"
                tabIndex={-1}
              />
            </div>

            {images.length > 0 && (
              <ul className="mt-3 space-y-2" aria-label="선택한 첨부">
                {images.map((item) => (
                  <li key={item.id}>
                    {item.isImage && item.previewUrl ? (
                      <div className="group relative flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 p-2">
                        <div
                          role="img"
                          aria-label={item.file.name}
                          className="h-12 w-12 shrink-0 rounded-md bg-cover bg-center"
                          style={{ backgroundImage: `url(${JSON.stringify(item.previewUrl)})` }}
                        />
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700" title={item.file.name}>
                          {item.file.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeImage(item.id)}
                          disabled={submitting}
                          aria-label={`${item.file.name} 제거`}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-red-600 disabled:opacity-40"
                        >
                          <X size={16} aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <AttachmentFileCard
                        fileName={item.file.name}
                        fileSize={item.file.size}
                        downloadUrl={null}
                        onDelete={() => removeImage(item.id)}
                        deleting={submitting}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {errorMessage && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="rounded-lg px-4 py-2.5 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim() || !completedAt}
            className="inline-flex min-w-28 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {submitting ? (
              <>
                <SpinnerGap size={16} className="animate-spin" aria-hidden="true" />
                공유 중
              </>
            ) : (
              <>
                <Plus size={16} weight="bold" aria-hidden="true" />
                타임라인에 추가
              </>
            )}
          </button>
        </div>
      </form>
    </ModalContainer>
  );
}
