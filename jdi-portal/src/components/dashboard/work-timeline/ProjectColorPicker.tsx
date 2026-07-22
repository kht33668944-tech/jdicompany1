"use client";

import { PROJECT_COLORS } from "@/lib/projects/constants";

interface ProjectColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** 스와치 크기 클래스 (기본 h-5 w-5) */
  swatchSizeClass?: string;
  className?: string;
}

/** 프로젝트 색상 팔레트 선택 버튼 목록 (작성 모달·관리 모달 공용) */
export default function ProjectColorPicker({
  value,
  onChange,
  ariaLabel,
  disabled = false,
  swatchSizeClass = "h-5 w-5",
  className = "",
}: ProjectColorPickerProps) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`} role="group" aria-label={ariaLabel}>
      {PROJECT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          disabled={disabled}
          onClick={() => onChange(color)}
          aria-label={`색상 ${color}`}
          aria-pressed={value === color}
          className={`${swatchSizeClass} rounded-full border-2 transition-transform ${
            value === color ? "scale-110 border-slate-700" : "border-transparent"
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}
