"use client";

import { useRef, useState, useEffect } from "react";
import { PaperPlaneRight, Paperclip, X, Image as ImageIcon } from "phosphor-react";
import { toast } from "sonner";
import type { Message } from "@/lib/chat/types";
import { validateFile } from "@/lib/utils/upload";

interface MessageInputProps {
  onSend: (content: string) => Promise<void>;
  onFileUpload?: (file: File) => Promise<void>;
  editingMessage?: Message | null;
  onCancelEdit?: () => void;
  replyingTo?: Message | null;
  onCancelReply?: () => void;
  externalFiles?: File[];
  onExternalFilesConsumed?: () => void;
  onTyping?: () => void;
}

export default function MessageInput({
  onSend,
  onFileUpload,
  editingMessage,
  onCancelEdit,
  replyingTo,
  onCancelReply,
  externalFiles,
  onExternalFilesConsumed,
  onTyping,
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Map<string, string>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Prefill when entering edit mode
  useEffect(() => {
    if (editingMessage) {
      setContent(editingMessage.content);
      textareaRef.current?.focus();
    } else {
      setContent("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
  }, [editingMessage]);

  // Handle externally dropped files
  useEffect(() => {
    if (externalFiles && externalFiles.length > 0) {
      addFiles(externalFiles);
      onExternalFilesConsumed?.();
    }
  }, [externalFiles]);

  // Generate preview URLs
  useEffect(() => {
    const urls = new Map<string, string>();
    const toRevoke: string[] = [];

    for (const file of pendingFiles) {
      if (file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        urls.set(file.name + file.size, url);
        toRevoke.push(url);
      }
    }
    setPreviewUrls(urls);
    return () => toRevoke.forEach(URL.revokeObjectURL);
  }, [pendingFiles]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
    onTyping?.();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleSend() {
    const trimmed = content.trim();
    const hasFiles = pendingFiles.length > 0 && onFileUpload;
    if (!hasFiles && !trimmed) return;
    if (sending) return;

    setSending(true);
    try {
      // 파일 업로드
      if (hasFiles) {
        for (const file of pendingFiles) {
          await onFileUpload(file);
        }
        setPendingFiles([]);
      }
      // 텍스트 전송 (파일과 함께 또는 단독)
      if (trimmed) {
        await onSend(trimmed);
      }
      setContent("");
      const el = textareaRef.current;
      if (el) el.style.height = "auto";
    } catch {
      toast.error(hasFiles ? "파일 업로드에 실패했습니다." : "메시지 전송에 실패했습니다.");
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function addFiles(files: File[]) {
    const valid: File[] = [];
    for (const file of files) {
      const error = validateFile(file);
      if (error) {
        toast.error(error);
        continue;
      }
      valid.push(file);
    }
    if (valid.length > 0) {
      setPendingFiles((prev) => [...prev, ...valid]);
    }
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = "";
    addFiles(Array.from(files));
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;
        const ext = file.type.split("/")[1] ?? "png";
        imageFiles.push(new File([file], `clipboard_${Date.now()}_${imageFiles.length}.${ext}`, { type: file.type }));
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addFiles(imageFiles);
    }
  }

  const canSend = !sending && (pendingFiles.length > 0 || content.trim().length > 0);

  return (
    <footer className="px-3 sm:px-6 py-2 sm:py-3 bg-white border-t border-slate-100 flex-shrink-0">
      {editingMessage && (
        <div className="flex items-center justify-between px-3 py-2 mb-2 bg-blue-50 rounded-xl text-sm">
          <span className="text-blue-600 font-medium">메시지 수정 중</span>
          <button onClick={onCancelEdit} className="text-slate-400 hover:text-slate-600 transition-colors" aria-label="수정 취소">
            <X size={16} />
          </button>
        </div>
      )}
      {replyingTo && (
        <div className="flex items-center justify-between px-3 py-2 mb-2 bg-slate-50 border-l-2 border-blue-500 rounded-xl text-sm">
          <div className="flex-1 min-w-0">
            <span className="text-blue-600 font-medium text-xs">{replyingTo.user_profile?.full_name}에게 답장</span>
            <p className="text-slate-500 text-xs truncate">{replyingTo.type === "image" ? "사진" : replyingTo.content}</p>
          </div>
          <button onClick={onCancelReply} className="text-slate-400 hover:text-slate-600 ml-2" aria-label="답장 취소">
            <X size={16} />
          </button>
        </div>
      )}

      {/* 다중 파일 미리보기 */}
      {pendingFiles.length > 0 && (
        <div className="mb-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map((file, i) => {
              const key = file.name + file.size;
              const preview = previewUrls.get(key);
              return (
                <div key={key + i} className="relative group">
                  {preview ? (
                    <img src={preview} alt={file.name} className="w-20 h-20 rounded-xl object-cover" />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-slate-100 flex flex-col items-center justify-center p-1">
                      <ImageIcon size={18} className="text-slate-400 mb-1" />
                      <span className="text-[9px] text-slate-500 truncate w-full text-center">{file.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => removePendingFile(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-slate-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="제거"
                  >
                    <X size={10} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-slate-400">{pendingFiles.length}개 파일</span>
            {sending && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <ImageIcon size={12} className="animate-pulse" /> 업로드 중...
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-1.5">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt"
          multiple
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          className="p-2 text-slate-400 hover:text-blue-600 rounded-xl transition-colors disabled:opacity-40"
          aria-label="파일 첨부"
        >
          <Paperclip size={20} />
        </button>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={pendingFiles.length > 0 ? "메시지를 함께 입력할 수 있습니다" : "메시지를 입력하세요..."}
          rows={1}
          className="flex-1 bg-transparent border-none text-sm py-2 resize-none max-h-32 outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="w-9 h-9 flex items-center justify-center bg-blue-600 text-white rounded-xl disabled:opacity-40 hover:bg-blue-700 transition-colors"
          aria-label="전송"
        >
          <PaperPlaneRight size={18} weight="fill" />
        </button>
      </div>
      <p className="text-[10px] text-slate-300 mt-1.5 px-2">
        Enter로 전송 / Shift + Enter로 줄바꿈 / 이미지 붙여넣기·드래그 가능
      </p>
    </footer>
  );
}
