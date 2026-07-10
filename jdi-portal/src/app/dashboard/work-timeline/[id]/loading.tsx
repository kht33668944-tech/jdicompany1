export default function WorkTimelineDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="h-5 w-24 animate-pulse rounded bg-slate-200" />
      <div className="space-y-5 rounded-lg bg-white p-6 shadow-sm">
        <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-48 animate-pulse rounded bg-slate-100" />
        <div className="h-28 animate-pulse rounded bg-slate-100" />
        <div className="aspect-video animate-pulse rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}
