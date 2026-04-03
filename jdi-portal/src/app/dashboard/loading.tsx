export default function DashboardLoading() {
  const cardClass =
    'bg-white/65 backdrop-blur-sm border border-white/80 rounded-2xl p-6 shadow-sm';

  return (
    <div className="space-y-8">
      {/* Greeting section */}
      <div className="space-y-2">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
      </div>

      {/* QuickStatsWidget - 4 stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={cardClass}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
              <div className="space-y-2">
                <div className="h-6 w-16 animate-pulse rounded bg-slate-200" />
                <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 2-column grid: MyTasksWidget + TodayScheduleWidget */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* MyTasksWidget */}
        <div className={cardClass}>
          <div className="mb-4 h-6 w-32 animate-pulse rounded bg-slate-200" />
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-5 w-5 shrink-0 animate-pulse rounded-full bg-slate-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TodayScheduleWidget */}
        <div className={cardClass}>
          <div className="mb-4 h-6 w-32 animate-pulse rounded bg-slate-200" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-3 w-3 mt-1 shrink-0 animate-pulse rounded-full bg-slate-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RecentActivityWidget */}
      <div className={cardClass}>
        <div className="mb-4 h-6 w-36 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="space-y-2 rounded-xl border border-slate-100 p-4"
            >
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
