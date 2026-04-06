"use client";

import { useEffect, useState } from "react";
import { X, PencilSimple, TrashSimple, CaretDown, Browser, Calendar, CloudArrowUp, Bug, SmileySad, Lightbulb } from "phosphor-react";
import UserAvatar from "@/components/shared/UserAvatar";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  updateReport,
  updateReportStatus,
  deleteReport,
  uploadReportAttachment,
  deleteReportAttachment,
  getAttachmentUrl,
} from "@/lib/reports/actions";
import { getReportAttachments } from "@/lib/reports/queries";
import type { ReportWithProfile, ReportAttachment, ReportType, ReportPage, ReportStatus } from "@/lib/reports/types";
import {
  REPORT_TYPE_CONFIG,
  REPORT_STATUS_CONFIG,
  REPORT_PAGE_CONFIG,
  REPORT_PAGES,
  REPORT_STATUSES,
} from "@/lib/reports/constants";

interface ReportDetailModalProps {
  report: ReportWithProfile | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: (reportId: string) => void;
  userId: string;
  userRole: string;
}

const TYPE_OPTIONS: { value: ReportType; label: string; Icon: React.ComponentType<any> }[] = [
  { value: "bug", label: "오류", Icon: Bug },
  { value: "inconvenience", label: "불편사항", Icon: SmileySad },
  { value: "improvement", label: "개선요청", Icon: Lightbulb },
];

function formatDate(dateString: string): string {
  const d = new Date(dateString);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function ReportDetailModal({
  report,
  open,
  onClose,
  onUpdated,
  onDeleted,
  userId,
  userRole,
}: ReportDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState<ReportType>("bug");
  const [editPage, setEditPage] = useState<ReportPage>("dashboard");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [attachments, setAttachments] = useState<ReportAttachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [attachmentUrls, setAttachmentUrls] = useState<Map<string, string>>(new Map());

  const isAuthor = report?.user_id === userId;
  const isAdmin = userRole === "admin";

  useEffect(() => {
    if (!open || !report) return;
    setEditing(false);
    setConfirmDelete(false);
    setEditType(report.type);
    setEditPage(report.page);
    setEditTitle(report.title);
    setEditContent(report.content);
    loadAttachments(report.id);
  }, [open, report?.id]);

  async function loadAttachments(reportId: string) {
    setLoadingAttachments(true);
    setAttachmentUrls(new Map());
    try {
      const supabase = createClient();
      const data = await getReportAttachments(supabase, reportId);
      setAttachments(data);

      // Load signed URLs for image previews
      const urlMap = new Map<string, string>();
      await Promise.all(
        data.map(async (att) => {
          if (isImageFile(att.file_name)) {
            try {
              const url = await getAttachmentUrl(att.file_path);
              urlMap.set(att.id, url);
            } catch {
              // ignore
            }
          }
        })
      );
      setAttachmentUrls(urlMap);
    } catch {
      // ignore
    } finally {
      setLoadingAttachments(false);
    }
  }

  function isImageFile(fileName: string): boolean {
    const ext = fileName.toLowerCase().split(".").pop() ?? "";
    return ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
  }

  async function handleSave() {
    if (!report) return;
    if (!editTitle.trim()) { toast.error("제목을 입력해주세요."); return; }
    if (!editContent.trim()) { toast.error("상세 내용을 입력해주세요."); return; }
    setSaving(true);
    try {
      await updateReport(report.id, {
        type: editType,
        page: editPage,
        title: editTitle.trim(),
        content: editContent.trim(),
      });
      toast.success("수정이 완료되었습니다.");
      setEditing(false);
      onUpdated();
    } catch {
      toast.error("수정 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!report) return;
    setDeleting(true);
    try {
      await deleteReport(report.id);
      toast.success("접수가 삭제되었습니다.");
      onDeleted(report.id);
      onClose();
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleStatusChange(status: ReportStatus) {
    if (!report) return;
    setStatusUpdating(true);
    try {
      await updateReportStatus(report.id, status);
      toast.success("상태가 변경되었습니다.");
      onUpdated();
    } catch {
      toast.error("상태 변경 중 오류가 발생했습니다.");
    } finally {
      setStatusUpdating(false);
    }
  }

  async function handleDownload(attachment: ReportAttachment) {
    try {
      const url = await getAttachmentUrl(attachment.file_path);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.file_name;
      a.click();
    } catch {
      toast.error("다운로드 중 오류가 발생했습니다.");
    }
  }

  async function handleDeleteAttachment(attachment: ReportAttachment) {
    try {
      await deleteReportAttachment(attachment.id, attachment.file_path);
      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
      toast.success("첨부파일이 삭제되었습니다.");
    } catch {
      toast.error("첨부파일 삭제 중 오류가 발생했습니다.");
    }
  }

  if (!open || !report) return null;

  const typeConfig = REPORT_TYPE_CONFIG[report.type];
  const statusConfig = REPORT_STATUS_CONFIG[report.status];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/20 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] bg-white/70 backdrop-blur-[40px] border border-white/50">
        {/* Header */}
        <div className="px-8 py-6 flex items-center justify-between border-b border-white/40">
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 ${typeConfig.bg} ${typeConfig.text} text-[11px] font-bold rounded-lg border ${typeConfig.border}`}>
              {typeConfig.label}
            </span>
            <span className={`px-3 py-1.5 ${statusConfig.bg} ${statusConfig.text} text-xs font-bold rounded-full`}>
              {statusConfig.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200/50 transition-colors"
          >
            <X size={20} className="text-slate-600" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {editing ? (
            <>
              {/* Edit: Type */}
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 ml-1 block">문의 유형</label>
                <div className="grid grid-cols-3 gap-3">
                  {TYPE_OPTIONS.map(({ value, label, Icon }) => (
                    <label key={value} className="cursor-pointer">
                      <input
                        type="radio"
                        name="edit-report-type"
                        value={value}
                        checked={editType === value}
                        onChange={() => setEditType(value)}
                        className="peer hidden"
                      />
                      <div className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-500 peer-checked:bg-brand-600 peer-checked:text-white peer-checked:border-brand-600 peer-checked:shadow-lg peer-checked:shadow-blue-500/20 transition-all font-bold text-sm">
                        <Icon size={16} />
                        {label}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Edit: Page */}
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 ml-1 block">발생 페이지</label>
                <div className="relative">
                  <select
                    value={editPage}
                    onChange={(e) => setEditPage(e.target.value as ReportPage)}
                    className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-5 py-3.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all text-sm"
                  >
                    {REPORT_PAGES.map((p) => (
                      <option key={p} value={p}>{REPORT_PAGE_CONFIG[p].label}</option>
                    ))}
                  </select>
                  <CaretDown size={14} className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                </div>
              </div>

              {/* Edit: Title */}
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 ml-1 block">제목</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-5 py-3.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all text-sm"
                />
              </div>

              {/* Edit: Content */}
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 ml-1 block">상세 내용</label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={5}
                  className="w-full bg-white border border-slate-200 rounded-xl px-5 py-3.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all resize-none text-sm"
                />
              </div>
            </>
          ) : (
            <>
              {/* View: meta */}
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Browser size={14} />
                  {REPORT_PAGE_CONFIG[report.page].label}
                </span>
                <span className="text-slate-300">|</span>
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} />
                  {formatDate(report.created_at)}
                </span>
              </div>

              {/* View: title */}
              <h3 className="text-xl font-extrabold text-slate-900">{report.title}</h3>

              {/* View: content */}
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-white/60 rounded-2xl p-5 border border-slate-100">
                {report.content}
              </p>

              {/* View: author */}
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <UserAvatar name={report.author_profile.full_name} avatarUrl={report.author_profile.avatar_url} size="md" />
                <span className="font-medium">{report.author_profile.full_name}</span>
              </div>
            </>
          )}

          {/* Attachments */}
          {!editing && (
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-700">첨부파일</h4>
              {loadingAttachments ? (
                <p className="text-xs text-slate-400">불러오는 중...</p>
              ) : attachments.length === 0 ? (
                <p className="text-xs text-slate-400">첨부파일이 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {attachments.map((att) => {
                    const previewUrl = attachmentUrls.get(att.id);
                    const isImage = isImageFile(att.file_name);

                    return (
                      <div key={att.id} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                        {/* Image preview */}
                        {isImage && previewUrl && (
                          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={previewUrl}
                              alt={att.file_name}
                              className="w-full max-h-64 object-contain bg-slate-50 cursor-pointer hover:opacity-90 transition-opacity"
                            />
                          </a>
                        )}
                        {/* File info row */}
                        <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <CloudArrowUp size={14} className="text-slate-400 flex-shrink-0" />
                            <span className="truncate text-slate-700">{att.file_name}</span>
                            <span className="text-xs text-slate-400 flex-shrink-0">{formatFileSize(att.file_size)}</span>
                          </div>
                          <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                            <button
                              onClick={() => handleDownload(att)}
                              className="text-brand-600 hover:text-brand-700 text-xs font-medium transition-colors"
                            >
                              다운로드
                            </button>
                            {(isAuthor || isAdmin) && (
                              <button
                                onClick={() => handleDeleteAttachment(att)}
                                className="text-slate-400 hover:text-red-500 transition-colors"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Admin: status change */}
          {!editing && isAdmin && (
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-700">처리 상태 변경</h4>
              <div className="relative w-48">
                <select
                  value={report.status}
                  onChange={(e) => handleStatusChange(e.target.value as ReportStatus)}
                  disabled={statusUpdating}
                  className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-5 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all text-sm disabled:opacity-50"
                >
                  {REPORT_STATUSES.map((s) => (
                    <option key={s} value={s}>{REPORT_STATUS_CONFIG[s].label}</option>
                  ))}
                </select>
                <CaretDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
              </div>
            </div>
          )}

          {/* Confirm delete */}
          {confirmDelete && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-5 space-y-3">
              <p className="text-sm font-bold text-red-700">정말 삭제하시겠습니까?</p>
              <p className="text-xs text-red-500">삭제된 접수는 복구할 수 없습니다.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {deleting ? "삭제 중..." : "삭제"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-4 py-2 bg-white text-slate-600 text-sm font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-slate-50/50 flex items-center justify-between gap-3 border-t border-white/40">
          <div className="flex items-center gap-2">
            {isAuthor && report.status === "submitted" && !editing && (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-200/50 transition-all text-sm"
                >
                  <PencilSimple size={16} />
                  수정
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-red-500 font-bold hover:bg-red-50 transition-all text-sm"
                >
                  <TrashSimple size={16} />
                  삭제
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="px-6 py-3.5 rounded-2xl text-slate-600 font-bold hover:bg-slate-200/50 transition-all disabled:opacity-50 text-sm"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-8 py-3.5 rounded-2xl bg-brand-600 text-white font-bold hover:bg-brand-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-50 text-sm"
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="px-6 py-3.5 rounded-2xl text-slate-600 font-bold hover:bg-slate-200/50 transition-all text-sm"
              >
                닫기
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
