export default function AttendanceLoading() {
  return (
    <div className="space-y-6">
      {/* 상태 카드 3개 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-white/65 backdrop-blur-sm border border-white/80 rounded-2xl p-6 shadow-sm"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-slate-200 rounded-full animate-pulse" />
              <div className="space-y-2">
                <div className="w-20 h-8 bg-slate-200 rounded animate-pulse" />
                <div className="w-24 h-4 bg-slate-200 rounded animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 메인 콘텐츠 */}
      <div className="bg-white/65 backdrop-blur-sm border border-white/80 rounded-2xl p-6 shadow-sm">
        {/* 탭 바 */}
        <div className="flex gap-2 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className={`w-16 h-8 rounded-lg animate-pulse ${i === 0 ? "bg-slate-300" : "bg-slate-200"}`}
            />
          ))}
        </div>

        {/* 테이블 헤더 */}
        <div className="grid grid-cols-5 gap-4 mb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 bg-slate-200 rounded animate-pulse" />
          ))}
        </div>

        {/* 테이블 행 5개 */}
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="h-5 bg-slate-200/70 rounded animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
