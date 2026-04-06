export default function ChatLoading() {
  return (
    <div className="flex h-[calc(100vh-8rem)] rounded-2xl overflow-hidden bg-white shadow-sm">
      {/* 채널 목록 스켈레톤 */}
      <div className="w-72 border-r border-slate-100 p-4 space-y-4 hidden lg:block">
        <div className="h-8 bg-slate-100 rounded-xl animate-pulse" />
        <div className="h-10 bg-slate-50 rounded-xl animate-pulse" />
        <div className="space-y-3 mt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 rounded-full animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-slate-50 rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* 대화창 스켈레톤 */}
      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b border-slate-100 px-6 flex items-center">
          <div className="h-5 bg-slate-100 rounded animate-pulse w-32" />
        </div>
        <div className="flex-1" />
        <div className="h-16 border-t border-slate-100 px-4">
          <div className="h-10 bg-slate-50 rounded-xl animate-pulse mt-3" />
        </div>
      </div>
    </div>
  );
}
