"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import X from "phosphor-react/dist/icons/X.esm.js";
import UploadSimple from "phosphor-react/dist/icons/UploadSimple.esm.js";
import FileCsv from "phosphor-react/dist/icons/FileCsv.esm.js";
import CheckCircle from "phosphor-react/dist/icons/CheckCircle.esm.js";
import XCircle from "phosphor-react/dist/icons/XCircle.esm.js";
import Spinner from "phosphor-react/dist/icons/Spinner.esm.js";
import WarningCircle from "phosphor-react/dist/icons/WarningCircle.esm.js";
import { addInfluencer } from "@/lib/influencer/actions";
import {
  extractUrlsFromText,
  extractUrlsFromCsvText,
  extractUrlsFromXlsx,
  type ParsedUrl,
} from "@/lib/influencer/url";

type Tab = "file" | "paste";

type ItemStatus = "pending" | "running" | "success" | "failed";

interface QueueItem {
  parsed: ParsedUrl;
  status: ItemStatus;
  errorMsg?: string;
  grade?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export default function BulkUploadModal({ open, onClose, onDone }: Props) {
  const [tab, setTab] = useState<Tab>("file");
  const [pasteText, setPasteText] = useState("");
  const [previewItems, setPreviewItems] = useState<ParsedUrl[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProcessing = isRunning;

  function reset() {
    setTab("file");
    setPasteText("");
    setPreviewItems([]);
    setInvalidCount(0);
    setFileName(null);
    setQueue(null);
    setIsRunning(false);
  }

  function handleClose() {
    if (isProcessing) {
      toast.warning("처리 중에는 닫을 수 없습니다. 완료 후 닫아주세요.");
      return;
    }
    reset();
    onClose();
  }

  async function processFile(file: File) {
    setFileName(file.name);
    const isXlsx =
      file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

    let items: ParsedUrl[] = [];
    let rawCount = 0;

    if (isXlsx) {
      const buffer = await file.arrayBuffer();
      items = await extractUrlsFromXlsx(buffer);
      rawCount = items.length + 0; // xlsx 파싱은 유효한 것만
    } else {
      const text = await file.text();
      const allLines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      rawCount = allLines.length - 1; // 헤더 제외 추정
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
    const rawLines = pasteText
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const invalid = rawLines.length - items.length;
    setInvalidCount(Math.max(0, invalid));
    setPreviewItems(items);
  }

  function getValidItems(): ParsedUrl[] {
    return tab === "file" ? previewItems : previewItems;
  }

  async function handleStart() {
    const items = getValidItems();
    if (items.length === 0) {
      toast.error("추가할 URL이 없습니다.");
      return;
    }

    const initial: QueueItem[] = items.map((p) => ({
      parsed: p,
      status: "pending",
    }));
    setQueue(initial);
    setIsRunning(true);

    for (let i = 0; i < items.length; i++) {
      setQueue((prev) =>
        prev
          ? prev.map((it, idx) =>
              idx === i ? { ...it, status: "running" } : it
            )
          : prev
      );

      try {
        const result = await addInfluencer(items[i].url);
        const grade = (result as { grade?: string }).grade ?? "";
        setQueue((prev) =>
          prev
            ? prev.map((it, idx) =>
                idx === i ? { ...it, status: "success", grade } : it
              )
            : prev
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "알 수 없는 오류";
        setQueue((prev) =>
          prev
            ? prev.map((it, idx) =>
                idx === i ? { ...it, status: "failed", errorMsg: msg } : it
              )
            : prev
        );
      }
    }

    setIsRunning(false);
    onDone();
    toast.success("일괄 추가 완료!");
  }

  function downloadFailedCsv() {
    if (!queue) return;
    const failed = queue.filter((it) => it.status === "failed");
    if (failed.length === 0) return;
    const rows = ["url,오류", ...failed.map((it) => `${it.parsed.url},${it.errorMsg ?? ""}`)];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "failed_influencers.csv";
    link.click();
  }

  const validItems = tab === "file" ? previewItems : previewItems;
  const successCount = queue?.filter((it) => it.status === "success").length ?? 0;
  const failedCount = queue?.filter((it) => it.status === "failed").length ?? 0;
  const doneCount = successCount + failedCount;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 배경 */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={handleClose}
      />

      {/* 카드 */}
      <div className="relative z-10 w-full max-w-xl mx-4 bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">
            CSV로 일괄 추가
          </h2>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X size={16} />
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* 큐 처리 중 / 완료 화면 */}
          {queue ? (
            <div className="flex flex-col flex-1 overflow-hidden p-5 gap-4">
              {/* 진행률 */}
              {isRunning && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>처리 중...</span>
                    <span>
                      {doneCount} / {queue.length}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-700 rounded-full transition-all duration-300"
                      style={{
                        width: `${(doneCount / queue.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 완료 요약 */}
              {!isRunning && (
                <div className="flex gap-3 text-sm">
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <CheckCircle size={14} weight="fill" />
                    {successCount}개 성공
                  </span>
                  {failedCount > 0 && (
                    <span className="inline-flex items-center gap-1 text-red-500">
                      <XCircle size={14} weight="fill" />
                      {failedCount}개 실패
                    </span>
                  )}
                </div>
              )}

              {/* 아이템 목록 */}
              <ul className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                {queue.map((it, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg bg-slate-50"
                  >
                    {/* 상태 아이콘 */}
                    <span className="shrink-0">
                      {it.status === "pending" && (
                        <span className="inline-block w-2 h-2 rounded-full bg-slate-300" />
                      )}
                      {it.status === "running" && (
                        <Spinner
                          size={14}
                          className="text-slate-500 animate-spin"
                        />
                      )}
                      {it.status === "success" && (
                        <CheckCircle
                          size={14}
                          weight="fill"
                          className="text-emerald-500"
                        />
                      )}
                      {it.status === "failed" && (
                        <XCircle
                          size={14}
                          weight="fill"
                          className="text-red-400"
                        />
                      )}
                    </span>

                    <span className="flex-1 min-w-0 truncate text-slate-700">
                      @{it.parsed.username}
                    </span>

                    {it.status === "success" && it.grade && (
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                        {it.grade}
                      </span>
                    )}
                    {it.status === "failed" && (
                      <span className="text-xs text-red-400 truncate max-w-[120px]">
                        {it.errorMsg}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {/* 하단 버튼 */}
              {!isRunning && (
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  {failedCount > 0 && (
                    <button
                      onClick={downloadFailedCsv}
                      className="px-3 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      실패 목록 다운로드
                    </button>
                  )}
                  <button
                    onClick={() => {
                      reset();
                      onClose();
                    }}
                    className="px-4 py-2 text-sm rounded-xl bg-slate-800 text-white hover:bg-slate-700 transition-colors"
                  >
                    닫기
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* 탭 */}
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
                {/* 파일 업로드 탭 */}
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
                        <p className="text-sm text-slate-600 font-medium">
                          {fileName}
                        </p>
                        <p className="text-xs text-slate-400">
                          다시 선택하려면 클릭하세요
                        </p>
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

                {/* URL 직접 붙여넣기 탭 */}
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

                {/* 미리보기 */}
                {previewItems.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>
                        총{" "}
                        <span className="font-semibold text-slate-700">
                          {previewItems.length}
                        </span>
                        개 유효
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

              {/* 하단 액션 */}
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100">
                <p className="text-xs text-slate-400">
                  순차 처리 (Apify 요청 제한 고려)
                </p>
                <button
                  onClick={handleStart}
                  disabled={validItems.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  추가 시작 ({validItems.length}개)
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

