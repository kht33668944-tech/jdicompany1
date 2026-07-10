import Link from "next/link";

export default function WorkTimelineEntryNotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h2 className="text-lg font-bold text-slate-800">업무 기록을 찾을 수 없습니다</h2>
      <p className="mt-2 text-sm text-slate-500">삭제되었거나 열람할 수 없는 업무입니다.</p>
      <Link
        href="/dashboard/work-timeline"
        className="mt-6 inline-flex rounded-md bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500"
      >
        업무 타임라인으로
      </Link>
    </div>
  );
}
