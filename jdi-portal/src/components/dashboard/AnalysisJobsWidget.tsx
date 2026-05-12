"use client";

import { useState } from "react";
import Spinner from "phosphor-react/dist/icons/Spinner.esm.js";
import CheckCircle from "phosphor-react/dist/icons/CheckCircle.esm.js";
import XCircle from "phosphor-react/dist/icons/XCircle.esm.js";
import MinusCircle from "phosphor-react/dist/icons/MinusCircle.esm.js";
import CaretDown from "phosphor-react/dist/icons/CaretDown.esm.js";
import CaretUp from "phosphor-react/dist/icons/CaretUp.esm.js";
import X from "phosphor-react/dist/icons/X.esm.js";
import { useAnalysisJobs } from "./AnalysisJobsProvider";

export default function AnalysisJobsWidget() {
  const { jobs, isRunning, dismissAll } = useAnalysisJobs();
  const [expanded, setExpanded] = useState(false);

  if (jobs.length === 0) return null;

  const success = jobs.filter((j) => j.status === "success").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  const skipped = jobs.filter((j) => j.status === "skipped").length;
  const done = success + failed + skipped;
  const total = jobs.length;
  const pct = total === 0 ? 0 : (done / total) * 100;

  const summaryParts: string[] = [];
  if (success > 0) summaryParts.push(`${success}신규`);
  if (skipped > 0) summaryParts.push(`${skipped}기존`);
  if (failed > 0) summaryParts.push(`${failed}실패`);
  const summary = summaryParts.join(" · ");

  return (
    <div className="fixed bottom-4 left-4 z-50 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      {/* 헤더 */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
      >
        <span className="shrink-0">
          {isRunning ? (
            <Spinner size={16} className="text-blue-500 animate-spin" />
          ) : failed === 0 ? (
            <CheckCircle size={16} weight="fill" className="text-emerald-500" />
          ) : (
            <XCircle size={16} weight="fill" className="text-amber-500" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800">
            {isRunning ? `인플루언서 분석 중 (${done}/${total})` : `분석 완료${summary ? ` · ${summary}` : ""}`}
          </p>
          {isRunning && (
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden mt-1.5">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
        <span className="shrink-0 text-slate-400">
          {expanded ? <CaretDown size={14} /> : <CaretUp size={14} />}
        </span>
        {!isRunning && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dismissAll();
            }}
            className="shrink-0 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="닫기"
          >
            <X size={14} />
          </button>
        )}
      </button>

      {/* 펼친 영역: 항목별 상태 */}
      {expanded && (
        <ul className="border-t border-slate-100 max-h-60 overflow-y-auto divide-y divide-slate-50">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-2 px-4 py-2 text-xs">
              <span className="shrink-0">
                {j.status === "pending" && (
                  <span className="inline-block w-2 h-2 rounded-full bg-slate-300" />
                )}
                {j.status === "running" && (
                  <Spinner size={12} className="text-blue-500 animate-spin" />
                )}
                {j.status === "success" && (
                  <CheckCircle size={12} weight="fill" className="text-emerald-500" />
                )}
                {j.status === "skipped" && (
                  <MinusCircle size={12} weight="fill" className="text-slate-400" />
                )}
                {j.status === "failed" && (
                  <XCircle size={12} weight="fill" className="text-red-400" />
                )}
              </span>
              <span className="flex-1 min-w-0 truncate text-slate-700">@{j.username}</span>
              {j.status === "success" && j.grade && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                  {j.grade}
                </span>
              )}
              {j.status === "skipped" && (
                <span className="text-[10px] text-slate-400">이미 등록됨</span>
              )}
              {j.status === "failed" && (
                <span className="text-[10px] text-red-400 truncate max-w-[120px]" title={j.errorMsg}>
                  {j.errorMsg}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
