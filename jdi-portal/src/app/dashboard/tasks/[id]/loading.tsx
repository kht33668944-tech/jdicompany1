export default function TaskDetailLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back button + title */}
      <div className="space-y-3">
        <div className="w-20 h-4 bg-slate-200 rounded animate-pulse" />
        <div className="w-2/3 h-8 bg-slate-200 rounded animate-pulse" />
        <div className="flex items-center gap-3">
          <div className="w-16 h-5 bg-slate-200 rounded animate-pulse" />
          <div className="w-16 h-5 bg-slate-200 rounded animate-pulse" />
        </div>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-3xl shadow-sm p-6 space-y-6">
        {/* Description */}
        <div className="space-y-2">
          <div className="w-20 h-4 bg-slate-200 rounded animate-pulse" />
          <div className="w-full h-4 bg-slate-200 rounded animate-pulse" />
          <div className="w-4/5 h-4 bg-slate-200 rounded animate-pulse" />
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="w-16 h-3 bg-slate-200 rounded animate-pulse" />
              <div className="w-24 h-4 bg-slate-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Attachments card */}
      <div className="bg-white rounded-3xl shadow-sm p-6 space-y-3">
        <div className="w-20 h-4 bg-slate-200 rounded animate-pulse" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-5 h-5 bg-slate-200 rounded animate-pulse" />
            <div className="flex-1 h-4 bg-slate-200 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Comments card */}
      <div className="bg-white rounded-3xl shadow-sm p-6 space-y-4">
        <div className="w-20 h-4 bg-slate-200 rounded animate-pulse" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-8 h-8 bg-slate-200 rounded-full animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="w-24 h-3 bg-slate-200 rounded animate-pulse" />
              <div className="w-full h-4 bg-slate-200 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
