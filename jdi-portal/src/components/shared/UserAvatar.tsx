import Image from "next/image";

const AVATAR_COLORS = [
  { bg: "bg-indigo-100", text: "text-indigo-600" },
  { bg: "bg-purple-100", text: "text-purple-600" },
  { bg: "bg-pink-100", text: "text-pink-600" },
  { bg: "bg-amber-100", text: "text-amber-600" },
  { bg: "bg-emerald-100", text: "text-emerald-600" },
  { bg: "bg-slate-100", text: "text-slate-500" },
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const SIZE_MAP = {
  xs: { container: "w-5 h-5", text: "text-[8px]", px: 20 },
  sm: { container: "w-7 h-7", text: "text-[10px]", px: 28 },
  md: { container: "w-8 h-8", text: "text-xs", px: 32 },
} as const;

type AvatarSize = keyof typeof SIZE_MAP;

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: AvatarSize;
  className?: string;
}

export default function UserAvatar({ name, avatarUrl, size = "md", className = "" }: UserAvatarProps) {
  const s = SIZE_MAP[size];
  const color = getAvatarColor(name);
  const initial = name.charAt(0).toUpperCase();

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={s.px}
        height={s.px}
        className={`${s.container} rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${s.container} rounded-full ${color.bg} flex items-center justify-center ${s.text} font-bold ${color.text} shrink-0 ${className}`}
    >
      {initial}
    </div>
  );
}
