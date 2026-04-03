"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function TaskDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Task detail error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <div className="bg-white/65 backdrop-blur-sm border border-white/80 rounded-2xl p-8 shadow-sm text-center max-w-md w-full">
        <h2 className="text-lg font-bold text-slate-700 mb-2">
          할일을 불러올 수 없습니다
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          {error.message || "존재하지 않거나 접근 권한이 없는 항목입니다."}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-brand-600 hover:bg-brand-500 transition-all"
          >
            다시 시도
          </button>
          <Link
            href="/dashboard/tasks"
            className="px-5 py-2 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
          >
            목록으로
          </Link>
        </div>
      </div>
    </div>
  );
}
