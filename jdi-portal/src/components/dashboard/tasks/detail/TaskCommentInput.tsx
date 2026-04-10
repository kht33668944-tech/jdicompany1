"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { PaperPlaneRight, Paperclip, X } from "phosphor-react";
import { addComment, uploadAttachment } from "@/lib/tasks/actions";

interface Props {
  taskId: string;
  userId: string;
  mode?: "page" | "panel";
  onRefresh?: () => void;
}

export default function TaskCommentInput({ taskId, userId, mode = "page", onRefresh }: Props) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    setFiles((prev) => [...prev, ...arr]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const file = items[i].getAsFile();
      if (file) pastedFiles.push(file);
    }
    if (pastedFiles.length > 0) {
      addFiles(pastedFiles);
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() && files.length === 0) return;
    setSending(true);
    try {
      let metadata: Record<string, unknown> | undefined;
      if (files.length > 0) {
        const uploaded = await Promise.all(
          files.map((f) => uploadAttachment(taskId, userId, f))
        );
        metadata = {
          attachments: uploaded.map((a) => ({
            id: a.id,
            file_name: a.file_name,
            file_size: a.file_size,
            content_type: a.content_type,
            file_path: a.file_path,
          })),
        };
      }
      await addComment(taskId, userId, content.trim() || "파일을 첨부했습니다.", metadata);
      setContent("");
      setFiles([]);
      if (mode === "panel" && onRefresh) {
        onRefresh();
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error("댓글 추가 실패:", error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* 파일 미리보기 */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 rounded-lg text-xs text-slate-600">
              <Paperclip size={12} />
              <span className="max-w-[120px] truncate">{file.name}</span>
              <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 입력 영역 */}
      <div
        className={`flex gap-2 rounded-xl border-2 transition-colors ${
          dragOver ? "border-indigo-300 bg-indigo-50/50" : "border-transparent"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
          onPaste={handlePaste}
          placeholder={dragOver ? "파일을 놓으세요..." : "댓글을 입력하세요... (파일 붙여넣기/드래그 가능)"}
          className="flex-1 glass-input px-4 py-2.5 rounded-xl text-sm outline-none"
          disabled={sending}
        />
        <button
          onClick={handleSubmit}
          disabled={sending || (!content.trim() && files.length === 0)}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-40 transition-all"
        >
          <PaperPlaneRight size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
