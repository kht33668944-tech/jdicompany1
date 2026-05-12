"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import X from "phosphor-react/dist/icons/X.esm.js";
import UploadSimple from "phosphor-react/dist/icons/UploadSimple.esm.js";
import FileCsv from "phosphor-react/dist/icons/FileCsv.esm.js";
import CheckCircle from "phosphor-react/dist/icons/CheckCircle.esm.js";
import WarningCircle from "phosphor-react/dist/icons/WarningCircle.esm.js";
import { useAnalysisJobs } from "@/components/dashboard/AnalysisJobsProvider";
import {
  extractUrlsFromText,
  extractUrlsFromCsvText,
  extractUrlsFromXlsx,
  type ParsedUrl,
} from "@/lib/influencer/url";

type Tab = "file" | "paste";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function BulkUploadModal({ open, onClose }: Props) {
  const { enqueue } = useAnalysisJobs();
  const [tab, setTab] = useState<Tab>("file");
  const [pasteText, setPasteText] = useState("");
  const [previewItems, setPreviewItems] = useState<ParsedUrl[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setTab("file");
    setPasteText("");
    setPreviewItems([]);
    setInvalidCount(0);
    setFileName(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function processFile(file: File) {
    setFileName(file.name);
    const isXlsx = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

    let items: ParsedUrl[] = [];
    let rawCount = 0;

    if (isXlsx) {
      const buffer = await file.arrayBuffer();
      items = await extractUrlsFromXlsx(buffer);
      rawCount = items.length;
    } else {
      const text = await file.text();
      const allLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      rawCount = allLines.length - 1;
      items = extractUrlsFromCsvText(text);
    }

    const invalid = Math.max(0, rawCount - items.length);
    setInvalidCount(invalid);
    setPreviewItems(items);
  }

  function handleFileInput(file: File) {
    if (
      !file.name.endsWith(".csv") &&
      !file.name.endsWith(".xlsx") &&
      !file.name.endsWith(".xls")
    ) {
      toast.error(".csv 또는 .xlsx 파일만 업로드 가능합니다.");
      return;
    }
    processFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileInput(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileInput(file);
    e.target.value = "";
  }

  function buildPreviewFromPaste() {
    const items = extractUrlsFromText(pasteText);
    const rawLines = pasteText.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean);
    const invalid = rawLines.length - items.length;
    setInvalidCount(Math.max(0, invalid));
    setPreviewItems(items);
  }

  function handleStart() {
    if (previewItems.length === 0) {
      toast.error("추가할 URL이 없습니다.");
      return;
    }
    enqueue(previewItems.map((p) => ({ url: p.url, username: p.username })));
    toast.info(`${previewItems.length}명 분석 대기열에 추가됨. 좌하단 위젯에서 진행상황 확인.`);
    handleClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />

      <div className="relative z-10 w-full max-w-xl mx-4 bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">CSV로 일괄 추가</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex border-b border-slate-100 px-5">
            <button
              onClick={() => {
                setTab("file");
                setPreviewItems([]);
                setInvalidCount(0);
              }}
              className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "file"
                  ? "border-slate-800 text-slate-800"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              파일 업로드
            </button>
            <button
              onClick={() => {
                setTab("paste");
                setPreviewItems([]);
                setInvalidCount(0);
              }}
              className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "paste"
                  ? "border-slate-800 text-slate-800"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              URL 직접 붙여넣기
            </button>
          </div>

          <div className="flex flex-col flex-1 overflow-y-auto p-5 gap-4">
            {tab === "file" && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-10 cursor-pointer transition-colors ${
                  dragOver
                    ? "border-slate-400 bg-slate-50"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={onFileChange}
                />
                {fileName ? (
                  <>
                    <FileCsv size={32} className="text-slate-400" />
                    <p className="text-sm text-slate-600 font-medium">{fileName}</p>
                    <p className="text-xs text-slate-400">다시 선택하려면 클릭하세요</p>
                  </>
                ) : (
                  <>
                    <UploadSimple size={32} className="text-slate-300" />
                    <div className="text-center">
                      <p className="text-sm text-slate-600 font-medium">
                        파일을 여기에 드래그하거나 클릭하세요
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        .csv, .xlsx 지원 · URL 컬럼 자동 감지
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === "paste" && (
              <div className="flex flex-col gap-2">
                <textarea
                  value={pasteText}
                  onChange={(e) => {
                    setPasteText(e.target.value);
                    setPreviewItems([]);
                    setInvalidCount(0);
                  }}
                  placeholder={`https://www.instagram.com/example1\nhttps://www.instagram.com/example2`}
                  rows={6}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:border-slate-400 resize-none"
                />
                <button
                  onClick={buildPreviewFromPaste}
                  disabled={!pasteText.trim()}
                  className="self-end px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  미리보기
                </button>
              </div>
            )}

            {previewItems.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>
                    총{" "}
                    <span className="font-semibold text-slate-700">{previewItems.length}</span>개 유효
                  </span>
                  {invalidCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-500">
                      <WarningCircle size={12} />
                      {invalidCount}개 무시됨
                    </span>
                  )}
                </div>
                <ul className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-40 overflow-y-auto">
                  {previewItems.slice(0, 5).map((it, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600 bg-white"
                    >
                      <CheckCircle
                        size={12}
                        weight="fill"
                        className="text-emerald-400 shrink-0"
                      />
                      <span className="truncate">{it.url}</span>
                    </li>
                  ))}
                  {previewItems.length > 5 && (
                    <li className="px-3 py-2 text-xs text-slate-400 bg-slate-50">
                      +{previewItems.length - 5}개 더...
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              백그라운드에서 1명씩 순차 처리 (다른 페이지로 이동해도 계속됨)
            </p>
            <button
              onClick={handleStart}
              disabled={previewItems.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              대기열에 추가 ({previewItems.length}개)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
