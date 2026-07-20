import type { InfluencerGrade } from "@/lib/influencer/types";

type Props = {
  grade: InfluencerGrade;
  size?: "sm" | "md";
};

const GRADE_CONFIG: Record<InfluencerGrade, { label: string; classes: string }> = {
  S: {
    label: "S",
    classes: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
  },
  A: {
    label: "A",
    classes: "bg-blue-100 text-blue-700 ring-1 ring-blue-200",
  },
  B: {
    label: "B",
    classes: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  },
  C: {
    label: "C",
    classes: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  },
  UNRATED: {
    label: "—",
    classes: "bg-slate-50 text-slate-400 ring-1 ring-slate-100",
  },
};

export default function GradeBadge({ grade, size = "md" }: Props) {
  const { label, classes } = GRADE_CONFIG[grade];

  const sizeClasses =
    size === "sm"
      ? "h-4 w-4 text-[10px] rounded"
      : "h-6 w-6 text-xs rounded-md";

  return (
    <span
      className={`inline-flex items-center justify-center font-bold leading-none shrink-0 ${sizeClasses} ${classes}`}
      aria-label={`등급 ${grade}`}
    >
      {label}
    </span>
  );
}
