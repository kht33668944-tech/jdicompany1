export default function TasksLoading() {
  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="w-32 h-8 bg-slate-200 rounded animate-pulse" />
        <div className="flex items-center gap-2">
          <div className="w-24 h-9 bg-slate-200 rounded animate-pulse" />
          <div className="w-24 h-9 bg-slate-200 rounded animate-pulse" />
        </div>
      </div>

      {/* Task card skeletons */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-white/65 backdrop-blur-sm border border-white/80 rounded-2xl p-6 shadow-sm flex items-center gap-4"
          >
            {/* Checkbox placeholder */}
            <div className="w-5 h-5 bg-slate-200 rounded-full animate-pulse shrink-0" />

            {/* Title + subtitle */}
            <div className="flex-1 space-y-2">
              <div className="w-2/3 h-4 bg-slate-200 rounded animate-pulse" />
              <div className="w-1/3 h-3 bg-slate-200 rounded animate-pulse" />
            </div>

            {/* Avatar + priority badge */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-8 h-8 bg-slate-200 rounded-full animate-pulse" />
              <div className="w-12 h-5 bg-slate-200 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
