"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <div className="bg-white/65 backdrop-blur-sm border border-white/80 rounded-2xl p-8 shadow-sm text-center max-w-md w-full">
        <h2 className="text-lg font-bold text-slate-700 mb-2">
          오류가 발생했습니다
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          {error.message || "알 수 없는 오류가 발생했습니다."}
        </p>
        <button
          onClick={reset}
          className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-brand-600 hover:bg-brand-500 transition-all"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
