export default function WorkTimelineLoading() {
  return (
    <div className="mx-auto max-w-6xl overflow-hidden rounded-lg bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="space-y-2">
          <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
          <div className="h-3 w-52 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="h-9 w-24 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="space-y-4 px-5 py-6">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="grid grid-cols-[48px_20px_minmax(0,1fr)] gap-3">
            <div className="h-3 animate-pulse rounded bg-slate-100" />
            <div className="mx-auto h-3 w-3 animate-pulse rounded-full bg-slate-200" />
            <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
