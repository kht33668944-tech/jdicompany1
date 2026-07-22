"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
  useId,
} from "react";
import { createPortal } from "react-dom";
import CaretDown from "phosphor-react/dist/icons/CaretDown.esm.js";
import Check from "phosphor-react/dist/icons/Check.esm.js";
import Plus from "phosphor-react/dist/icons/Plus.esm.js";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** 좌측 색 점 (예: 분류 색상 Tailwind bg 클래스) */
  dotClass?: string;
  /** 우측 보조 텍스트 (예: 상태·제품) */
  hint?: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 트리거 버튼에 덧붙일 클래스 (기존 select 자리 호환용) */
  className?: string;
  disabled?: boolean;
  /** 시각적 필수 표시 (네이티브 검증 아님 — 서버에서 재검증) */
  required?: boolean;
  ariaLabel?: string;
  /** 목록 하단 액션 버튼 (예: ＋ 결제수단 추가/관리) */
  footerAction?: { label: string; onClick: () => void };
  /** 멀티 추가형: 선택 후 값이 유지되지 않고 항상 placeholder 로 되돌아감 */
  resetOnSelect?: boolean;
  variant?: "light" | "dark";
  /** 열림 패널 최소 너비(px). 미지정 시 트리거 너비에 맞춤 */
  menuMinWidth?: number;
  id?: string;
  name?: string;
}

const MENU_MAX_HEIGHT = 288; // max-h-72

export default function Select({
  options,
  value,
  onChange,
  placeholder = "선택",
  className = "",
  disabled = false,
  required = false,
  ariaLabel,
  footerAction,
  resetOnSelect = false,
  variant = "light",
  menuMinWidth,
  id,
  name,
}: SelectProps) {
  const reactId = useId();
  const listboxId = id ?? `select-${reactId}`;
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [placeUp, setPlaceUp] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const typeahead = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  const selected = resetOnSelect ? undefined : options.find((o) => o.value === value);
  const dark = variant === "dark";

  const computePosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < MENU_MAX_HEIGHT + 16 && r.top > spaceBelow;
    setPlaceUp(up);
    setRect({ top: up ? r.top : r.bottom, left: r.left, width: r.width });
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    computePosition();
    setOpen(true);
    const idx = options.findIndex((o) => o.value === value && !o.disabled);
    setActiveIndex(idx);
  }, [disabled, computePosition, options, value]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setEntered(false);
    setActiveIndex(-1);
    buttonRef.current?.focus();
  }, []);

  // 등장 애니메이션 트리거
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // 스크롤/리사이즈 시 위치 추적 (초기 위치는 openMenu 에서 이미 계산됨)
  useLayoutEffect(() => {
    if (!open) return;
    const onScrollResize = () => computePosition();
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    return () => {
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
    };
  }, [open, computePosition]);

  // 활성 옵션으로 스크롤
  useEffect(() => {
    if (open && activeIndex >= 0) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeIndex]);

  const commit = useCallback(
    (next: string) => {
      onChange(next);
      closeMenu();
    },
    [onChange, closeMenu]
  );

  const moveActive = useCallback(
    (dir: 1 | -1) => {
      setActiveIndex((prev) => {
        const n = options.length;
        if (n === 0) return -1;
        let i = prev;
        for (let step = 0; step < n; step++) {
          i = (i + dir + n) % n;
          if (!options[i]?.disabled) return i;
        }
        return prev;
      });
    },
    [options]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        closeMenu();
        break;
      case "ArrowDown":
        e.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(options.findIndex((o) => !o.disabled));
        break;
      case "End":
        e.preventDefault();
        for (let i = options.length - 1; i >= 0; i--) {
          if (!options[i].disabled) {
            setActiveIndex(i);
            break;
          }
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (activeIndex >= 0 && !options[activeIndex]?.disabled) {
          commit(options[activeIndex].value);
        }
        break;
      case "Tab":
        closeMenu();
        break;
      default:
        // 타입어헤드 (글자 입력으로 항목 점프) — timestamp 대신 이벤트 순서로만 그룹핑
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const t = typeahead.current;
          t.text = (t.at++ > 0 && t.text.length <= 1 ? t.text : "") + e.key.toLowerCase();
          // 간단화: 최근 입력 문자열로 시작하는 첫 항목
          const match = options.findIndex(
            (o) => !o.disabled && o.label.toLowerCase().startsWith(t.text)
          );
          if (match >= 0) setActiveIndex(match);
        }
        break;
    }
  };

  const triggerText = selected?.label ?? placeholder;
  const isPlaceholder = !selected;

  const menuMin = menuMinWidth ?? rect?.width ?? 0;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        id={listboxId}
        name={name}
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-required={required || undefined}
        className={[
          "group inline-flex items-center justify-between gap-2 text-left transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
          className,
        ].join(" ")}
      >
        <span
          className={[
            "truncate",
            isPlaceholder ? (dark ? "text-slate-400" : "text-slate-400") : dark ? "text-white" : "text-slate-800",
          ].join(" ")}
        >
          {selected?.dotClass && (
            <span className={`inline-block w-2 h-2 rounded-full mr-1.5 align-middle ${selected.dotClass}`} />
          )}
          {triggerText}
        </span>
        <CaretDown
          size={15}
          weight="bold"
          className={[
            "shrink-0 transition-transform duration-200",
            open ? "rotate-180" : "",
            dark ? "text-slate-400" : "text-slate-400",
          ].join(" ")}
        />
      </button>

      {open &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[70]" onMouseDown={closeMenu} />
            <div
              ref={panelRef}
              role="listbox"
              aria-activedescendant={
                activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
              }
              style={{
                position: "fixed",
                left: rect.left,
                top: placeUp ? undefined : rect.top + 6,
                bottom: placeUp ? window.innerHeight - rect.top + 6 : undefined,
                minWidth: menuMin,
                maxWidth: Math.max(menuMin, Math.min(window.innerWidth - 16, 420)),
                transformOrigin: placeUp ? "bottom" : "top",
              }}
              className={[
                "z-[71] p-1.5 rounded-2xl border shadow-xl overflow-hidden",
                "transition-[opacity,transform] duration-150 ease-out",
                entered ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-[0.97] " + (placeUp ? "translate-y-1" : "-translate-y-1"),
                dark
                  ? "bg-slate-900/95 backdrop-blur-xl border-white/10 shadow-black/40"
                  : "bg-white/95 backdrop-blur-xl border-slate-100 shadow-slate-900/10",
              ].join(" ")}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="max-h-72 overflow-y-auto overscroll-contain -mr-0.5 pr-0.5">
                {options.length === 0 && (
                  <div className={`px-3 py-2.5 text-sm ${dark ? "text-slate-400" : "text-slate-400"}`}>
                    항목이 없습니다.
                  </div>
                )}
                {options.map((opt, i) => {
                  const isSelected = !resetOnSelect && opt.value === value;
                  const isActive = i === activeIndex;
                  return (
                    <button
                      key={opt.value}
                      id={`${listboxId}-opt-${i}`}
                      ref={(el) => {
                        optionRefs.current[i] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={opt.disabled}
                      onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                      onClick={() => !opt.disabled && commit(opt.value)}
                      className={[
                        "w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm text-left transition-colors",
                        opt.disabled
                          ? "opacity-40 cursor-not-allowed"
                          : "cursor-pointer",
                        isSelected
                          ? dark
                            ? "bg-blue-500/20 text-white font-semibold"
                            : "bg-blue-50 text-blue-700 font-semibold"
                          : isActive && !opt.disabled
                            ? dark
                              ? "bg-white/10 text-white"
                              : "bg-slate-100 text-slate-800"
                            : dark
                              ? "text-slate-200"
                              : "text-slate-700",
                      ].join(" ")}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {opt.dotClass && (
                          <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${opt.dotClass}`} />
                        )}
                        <span className="truncate">{opt.label}</span>
                        {opt.hint && (
                          <span className={`truncate text-xs ${dark ? "text-slate-400" : "text-slate-400"}`}>
                            {opt.hint}
                          </span>
                        )}
                      </span>
                      {isSelected && <Check size={16} weight="bold" className="shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {footerAction && (
                <>
                  <div className={`my-1 h-px ${dark ? "bg-white/10" : "bg-slate-100"}`} />
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu();
                      footerAction.onClick();
                    }}
                    className={[
                      "w-full flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                      dark
                        ? "text-blue-300 hover:bg-blue-500/15"
                        : "text-blue-600 hover:bg-blue-50",
                    ].join(" ")}
                  >
                    <Plus size={15} weight="bold" />
                    {footerAction.label}
                  </button>
                </>
              )}
            </div>
          </>,
          document.body
        )}
    </>
  );
}
