"use client";

import { useRef, useState } from "react";
import { Bug, SmileySad, Lightbulb, CloudArrowUp, X, CaretDown } from "phosphor-react";
import { toast } from "sonner";
import { createReport, deleteReport, uploadReportAttachment } from "@/lib/reports/actions";
import type { ReportType, ReportPage } from "@/lib/reports/types";
import { REPORT_PAGES, REPORT_PAGE_CONFIG } from "@/lib/reports/constants";
import { validateFile } from "@/lib/utils/upload";

interface ReportCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  userId: string;
}

const TYPE_OPTIONS: { value: ReportType; label: string; Icon: typeof Bug }[] = [
  { value: "bug", label: "오류", Icon: Bug },
  { value: "inconvenience", label: "불편사항", Icon: SmileySad },
  { value: "improvement", label: "개선요청", Icon: Lightbulb },
];

export default function ReportCreateModal({ open, onClose, onCreated, userId }: ReportCreateModalProps) {
  const [type, setType] = useState<ReportType>("bug");
  const [page, setPage] = useState<ReportPage | "">("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

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
    const dropped = filterValidFiles(Array.from(e.dataTransfer.files));
    setFiles((prev) => [...prev, ...dropped]);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (selected && selected.length > 0) {
      const valid = filterValidFiles(Array.from(selected));
      setFiles((prev) => [...prev, ...valid]);
    }
    // Reset so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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
      const valid = filterValidFiles(pastedFiles);
      setFiles((prev) => [...prev, ...valid]);
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
      const report = await createReport({ type, page: page as ReportPage, title: title.trim(), content: content.trim(), userId });

      // 첨부 업로드 중 실패하면 생성된 report 자체를 정리 (반쪽 저장 방지)
      try {
        for (const f of files) {
          await uploadReportAttachment(report.id, f);
        }
      } catch (uploadErr) {
        await deleteReport(report.id).catch(() => {});
        throw uploadErr;
      }

      toast.success("오류가 접수되었습니다");
      setType("bug");
      setPage("");
      setTitle("");
      setContent("");
      setFiles([]);
      onCreated();
      onClose();
    } catch {
      toast.error("접수 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/20 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] bg-white/70 backdrop-blur-[40px] border border-white/50">
        {/* Header */}
        <div className="px-8 py-6 flex items-center justify-between border-b border-white/40">
          <h2 className="text-2xl font-extrabold text-slate-900">새 접수 작성</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200/50 transition-colors"
          >
            <X size={20} className="text-slate-600" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Type */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700 ml-1 block">문의 유형</label>
            <div className="grid grid-cols-3 gap-3">
              {TYPE_OPTIONS.map(({ value, label, Icon }) => (
                <label key={value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="report-type"
                    value={value}
                    checked={type === value}
                    onChange={() => setType(value)}
                    className="peer hidden"
                  />
                  <div className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-500 peer-checked:bg-[#2563eb] peer-checked:text-white peer-checked:border-[#2563eb] peer-checked:shadow-lg peer-checked:shadow-blue-500/20 transition-all font-bold text-sm">
                    <Icon size={16} />
                    {label}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Page */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700 ml-1 block">발생 페이지</label>
            <div className="relative">
              <select
                value={page}
                onChange={(e) => setPage(e.target.value as ReportPage | "")}
                className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-5 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
              >
                <option value="">페이지를 선택해주세요</option>
                {REPORT_PAGES.map((p) => (
                  <option key={p} value={p}>{REPORT_PAGE_CONFIG[p].label}</option>
                ))}
              </select>
              <CaretDown size={14} className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
            </div>
          </div>

          {/* Title */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700 ml-1 block">제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 버튼 클릭 시 반응이 없습니다."
              className="w-full bg-white border border-slate-200 rounded-xl px-5 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
            />
          </div>

          {/* Content */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700 ml-1 block">상세 내용</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="오류 발생 시점, 재현 방법 등을 자세히 적어주시면 빠른 해결에 도움이 됩니다."
              className="w-full bg-white border border-slate-200 rounded-xl px-5 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none text-sm h-32"
            />
          </div>

          {/* File upload */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-700 ml-1 block">파일 및 스크린샷 (선택)</label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onPaste={handlePaste}
              tabIndex={0}
              className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group ${
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
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm group-hover:scale-110 transition-transform pointer-events-none">
                <CloudArrowUp size={24} className="text-blue-600" />
              </div>
              <p className="text-slate-600 font-medium text-sm pointer-events-none">여기로 파일을 드래그하거나 클릭하여 업로드</p>
              <p className="text-xs text-slate-400 mt-1 pointer-events-none">PNG, JPG, PDF (최대 10MB)</p>
            </div>
            {files.length > 0 && (
              <ul className="space-y-1.5">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 border border-slate-100 text-sm">
                    <span className="truncate text-slate-700">{f.name}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      className="ml-3 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-slate-50/50 flex items-center justify-end gap-3 border-t border-white/40">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-6 py-3.5 rounded-2xl text-slate-600 font-bold hover:bg-slate-200/50 transition-all disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-10 py-3.5 rounded-2xl bg-[#2563eb] text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "접수 중..." : "접수하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
