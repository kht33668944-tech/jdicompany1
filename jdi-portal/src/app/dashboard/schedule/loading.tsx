export default function ScheduleLoading() {
  return (
    <div className="space-y-6">
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-center gap-4">
        <div className="w-8 h-8 bg-slate-200 rounded animate-pulse" />
        <div className="w-32 h-8 bg-slate-200 rounded animate-pulse" />
        <div className="w-8 h-8 bg-slate-200 rounded animate-pulse" />
      </div>

      {/* 캘린더 */}
      <div className="bg-white/65 backdrop-blur-sm border border-white/80 rounded-2xl p-6 shadow-sm">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex justify-center">
              <div className="w-8 h-4 bg-slate-200 rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* 5주 × 7일 */}
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }).map((_, i) => (
            <div
              key={i}
              className="h-24 bg-slate-200/50 rounded p-2 animate-pulse"
            >
              <div className="w-5 h-4 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
