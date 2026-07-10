"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function WorkTimelineDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Work timeline detail error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h2 className="text-lg font-bold text-slate-800">업무 상세를 불러오지 못했습니다</h2>
      <p className="mt-2 text-sm text-slate-500">잠시 후 다시 시도해 주세요.</p>
      <div className="mt-6 flex justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500"
        >
          다시 시도
        </button>
        <Link
          href="/dashboard/work-timeline"
          className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
        >
          목록으로
        </Link>
      </div>
    </div>
  );
}
