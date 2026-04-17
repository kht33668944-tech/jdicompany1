"use client";

import { useEffect, useState } from "react";
import type { MemberPreview } from "@/lib/chat/types";

const AVATAR_BG = [
  "bg-blue-400", "bg-rose-400", "bg-amber-400", "bg-teal-400",
  "bg-violet-400", "bg-emerald-400", "bg-indigo-400", "bg-orange-400",
];

function hashColorIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % AVATAR_BG.length;
}

interface AvatarStackProps {
  members: MemberPreview[];
  max?: number;
  size?: number;
  totalCount?: number;
}

export default function AvatarStack({
  members,
  max = 3,
  size = 20,
  totalCount,
}: AvatarStackProps) {
  // 하이드레이션 불일치 방지 — 아바타 URL/리스트는 외부 데이터 의존이라
  // SSR 결과와 클라이언트 첫 렌더가 달라질 수 있어 마운트 이후에만 렌더
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  if (members.length === 0) return null;
  const visible = members.slice(0, max);
  const total = totalCount ?? members.length;
  const extra = total - visible.length;

  return (
    <div className="flex items-center">
      {visible.map((m, i) => (
        <div
          key={m.id}
          style={{ width: size, height: size, marginLeft: i === 0 ? 0 : -6, zIndex: visible.length - i }}
          className="relative rounded-full overflow-hidden ring-2 ring-white flex-shrink-0"
          title={m.full_name}
        >
          {m.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.avatar_url} alt={m.full_name} className="w-full h-full object-cover" />
          ) : (
            <div
              className={`w-full h-full ${AVATAR_BG[hashColorIndex(m.id)]} flex items-center justify-center text-[10px] font-bold text-white`}
            >
              {m.full_name.charAt(0)}
            </div>
          )}
        </div>
      ))}
      {extra > 0 && (
        <div
          style={{ width: size, height: size, marginLeft: -6 }}
          className="relative rounded-full bg-slate-200 ring-2 ring-white flex items-center justify-center text-[9px] font-bold text-slate-600 flex-shrink-0"
        >
          +{extra}
        </div>
      )}
    </div>
  );
}
