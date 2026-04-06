"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bug, SmileySad, Lightbulb, CloudArrowUp, X } from "phosphor-react";
import { toast } from "sonner";
import { createReport, uploadReportAttachment } from "@/lib/reports/actions";
import type { ReportType, ReportPage } from "@/lib/reports/types";
import { REPORT_PAGES, REPORT_PAGE_CONFIG } from "@/lib/reports/constants";
import { validateFile } from "@/lib/utils/upload";

interface ReportQuickDrawerProps {
  open: boolean;
  onClose: () => void;
  userId: string;
}

const TYPE_OPTIONS: { value: ReportType; label: string; Icon: React.ComponentType<any> }[] = [
  { value: "bug", label: "오류", Icon: Bug },
  { value: "inconvenience", label: "불편사항", Icon: SmileySad },
  { value: "improvement", label: "개선요청", Icon: Lightbulb },
];

export default function ReportQuickDrawer({ open, onClose, userId }: ReportQuickDrawerProps) {
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  const [type, setType] = useState<ReportType>("bug");
  const [page, setPage] = useState<ReportPage | "">("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setType("bug");
    setPage("");
    setTitle("");
    setContent("");
    setFiles([]);
  }

  function filterValidFiles(fileList: File[]): File[] {
    return fileList.filter((f) => {
      const err = validateFile(f);
      if (err) { toast.error(err); return false; }
      return true;
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    setFiles((prev) => [...prev, ...filterValidFiles(Array.from(e.dataTransfer.files))]);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (selected && selected.length > 0) {
      setFiles((prev) => [...prev, ...filterValidFiles(Array.from(selected))]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      setFiles((prev) => [...prev, ...filterValidFiles(pastedFiles)]);
    }
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (!type || !page || !title.trim() || !content.trim()) {
      toast.error("유형, 페이지, 제목, 상세 내용을 모두 입력해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const report = await createReport({
        type,
        page: page as ReportPage,
        title: title.trim(),
        content: content.trim(),
        userId,
      });

      for (const f of files) {
        await uploadReportAttachment(report.id, f);
      }

      toast.success("오류가 접수되었습니다");
      resetForm();
      onClose();
      router.refresh();
    } catch {
      toast.error("접수 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full z-50 w-full max-w-md transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-full bg-white/80 backdrop-blur-xl border-l border-white/50 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="px-6 py-5 flex items-center justify-between border-b border-slate-100">
            <h2 className="text-lg font-extrabold text-slate-900">빠른 오류 접수</h2>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
            >
              <X size={18} className="text-slate-500" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* Type */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 block">문의 유형</label>
              <div className="grid grid-cols-3 gap-2">
                {TYPE_OPTIONS.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setType(value)}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                      type === value
                        ? "bg-[#2563eb] text-white border-[#2563eb] shadow-lg shadow-blue-500/20"
                        : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Page */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 block">발생 페이지</label>
              <select
                value={page}
                onChange={(e) => setPage(e.target.value as ReportPage | "")}
                className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="">페이지를 선택해주세요</option>
                {REPORT_PAGES.map((p) => (
                  <option key={p} value={p}>{REPORT_PAGE_CONFIG[p].label}</option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 block">제목</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 버튼 클릭 시 반응이 없습니다."
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            {/* Content */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 block">상세 내용</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="오류 발생 시점, 재현 방법 등을 자세히 적어주시면 빠른 해결에 도움이 됩니다."
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none h-28"
              />
            </div>

            {/* File upload */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 block">첨부파일 (선택)</label>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onPaste={handlePaste}
                tabIndex={0}
                className={`relative border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  dragging
                    ? "border-blue-400 bg-blue-100/60"
                    : "border-blue-200 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-300"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  onChange={handleFileChange}
                />
                <CloudArrowUp size={20} className="text-blue-600 mb-1.5 pointer-events-none" />
                <p className="text-slate-600 font-medium text-xs pointer-events-none">드래그, 클릭, 또는 Ctrl+V로 업로드</p>
                <p className="text-[10px] text-slate-400 mt-0.5 pointer-events-none">PNG, JPG, PDF (최대 10MB)</p>
              </div>
              {files.length > 0 && (
                <ul className="space-y-1">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-100 text-xs">
                      <span className="truncate text-slate-700">{f.name}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        className="ml-2 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-all text-sm disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-[#2563eb] text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all text-sm disabled:opacity-50"
            >
              {submitting ? "접수 중..." : "접수하기"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
