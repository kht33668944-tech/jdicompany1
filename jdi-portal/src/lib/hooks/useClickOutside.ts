import { useEffect, useRef } from "react";

interface UseClickOutsideOptions {
  /** true 면 모바일 탭(touchstart)도 바깥 클릭으로 취급한다. */
  touch?: boolean;
  /** false 면 리스너를 아예 붙이지 않는다 (예: 팝오버가 닫혀 있을 때). */
  enabled?: boolean;
}

export function useClickOutside<T extends HTMLElement>(
  onClose: () => void,
  { touch = false, enabled = true }: UseClickOutsideOptions = {},
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!enabled) return;
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    if (touch) document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (touch) document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [onClose, touch, enabled]);

  return ref;
}
