"use client";

// 서명 페이지 맨 위에 붙어 다니는 진행 안내.
// 조항이 많은 계약서에서 서명자가 칸을 빠뜨리지 않도록,
// 남은 개수를 보여주고 「다음 칸」으로 그 자리까지 데려간다.

interface Props {
  /** 꼭 입력해야 하는 칸 수 */
  requiredTotal: number;
  /** 그중 아직 안 채운 수 */
  requiredLeft: number;
  /** 남은 칸으로 이동 — 남은 게 없으면 서명 영역으로 */
  onNext: () => void;
}

export default function SignProgressBar({ requiredTotal, requiredLeft: left, onNext }: Props) {
  const done = left === 0;
  const filled = requiredTotal - left;
  const percent = requiredTotal === 0 ? 100 : Math.round((filled / requiredTotal) * 100);

  return (
    <div className="sticky top-0 z-30 -mx-3 mb-3 border-b border-slate-200 bg-white/95 px-3 py-2.5 backdrop-blur sm:-mx-0 sm:mx-0 sm:rounded-xl sm:border sm:shadow-sm">
      <div className="flex items-center gap-2.5">
        <span
          className={`shrink-0 text-[12.5px] font-bold tabular-nums ${
            done ? "text-emerald-600" : "text-slate-700"
          }`}
        >
          {requiredTotal === 0 ? "입력할 칸 없음" : `입력 ${filled}/${requiredTotal}`}
        </span>

        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              done ? "bg-emerald-500" : "bg-[#2563eb]"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>

        <button
          type="button"
          onClick={onNext}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white ${
            done ? "bg-emerald-600 hover:bg-emerald-700" : "bg-[#2563eb] hover:bg-blue-700"
          }`}
        >
          {done ? "서명하러 가기 ↓" : "다음 칸 →"}
        </button>
      </div>

      {!done && (
        <p className="mt-1 text-[11.5px] text-slate-500">
          계약서의 <b className="text-amber-600">노란 칸</b>을 눌러 입력해주세요 · {left}개 남음
        </p>
      )}
    </div>
  );
}
