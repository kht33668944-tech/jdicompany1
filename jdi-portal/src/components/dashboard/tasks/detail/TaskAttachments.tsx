"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Trash, DownloadSimple, Image, File } from "phosphor-react";
import { uploadAttachment, deleteAttachment, getAttachmentUrl } from "@/lib/tasks/actions";
import type { TaskAttachment } from "@/lib/tasks/types";

interface Props {
  taskId: string;
  attachments: TaskAttachment[];
  userId: string;
  canEdit: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export default function TaskAttachments({ taskId, attachments, userId, canEdit }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadAttachment(taskId, userId, file);
      }
      router.refresh();
    } catch {} finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (attachment: TaskAttachment) => {
    if (!confirm(`"${attachment.file_name}" 파일을 삭제하시겠습니까?`)) return;
    try {
      await deleteAttachment(attachment.id, attachment.file_path);
      router.refresh();
    } catch {}
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-700">첨부파일</h3>
        {canEdit && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 text-sm text-indigo-600 font-bold hover:text-indigo-500 transition-colors disabled:opacity-40"
          >
            <Paperclip size={14} />
            {uploading ? "업로드 중..." : "파일 추가"}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleUpload}
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt"
      />

      {attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((attachment) => {
            const url = getAttachmentUrl(attachment.file_path);
            return (
              <div
                key={attachment.id}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 group transition-all"
              >
                {isImage(attachment.mime_type) ? (
                  <Image size={18} className="text-indigo-500 flex-shrink-0" />
                ) : (
                  <File size={18} className="text-slate-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {attachment.file_name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatFileSize(attachment.file_size)} · {attachment.uploader_profile.full_name}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    <DownloadSimple size={14} />
                  </a>
                  {(canEdit || attachment.user_id === userId) && (
                    <button
                      onClick={() => handleDelete(attachment)}
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-400">첨부파일이 없습니다</p>
      )}
    </div>
  );
}
