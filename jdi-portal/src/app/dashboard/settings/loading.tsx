export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      {/* 탭 네비게이션 */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`w-20 h-10 rounded-lg animate-pulse ${i === 0 ? "bg-slate-300" : "bg-slate-200"}`}
          />
        ))}
      </div>

      {/* 폼 카드 */}
      <div className="bg-white/65 backdrop-blur-sm border border-white/80 rounded-2xl p-6 shadow-sm">
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="w-24 h-4 bg-slate-200 rounded animate-pulse" />
              <div className="w-full h-10 bg-slate-200/70 rounded-xl animate-pulse" />
            </div>
          ))}

          {/* 저장 버튼 */}
          <div className="pt-2">
            <div className="w-24 h-10 bg-slate-200 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
