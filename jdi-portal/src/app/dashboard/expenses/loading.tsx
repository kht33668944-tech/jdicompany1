export default function ExpensesLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-white/65 backdrop-blur-sm border border-white/80" />
        ))}
      </div>
      <div className="h-14 rounded-2xl bg-white/65 backdrop-blur-sm border border-white/80" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-16 rounded-2xl bg-slate-200/60" />
      ))}
    </div>
  );
}
