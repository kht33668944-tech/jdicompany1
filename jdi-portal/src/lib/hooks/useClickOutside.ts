import { useEffect, useRef } from "react";

interface UseClickOutsideOptions {
  /** true 면 모바일 탭(touchstart)도 바깥 클릭으로 취급한다. */
  touch?: boolean;
  /** false 면 리스너를 아예 붙이지 않는다 (예: 팝오버가 닫혀 있을 때). */
  enabled?: boolean;
  /**
   * true 면 캡처 단계에서 듣는다. 중간에서 클릭이 멈춰도 확실히 받아야 할 때 쓴다.
   * 어느 단계든 이벤트를 막지 않으므로 같은 클릭은 원래 대상까지 그대로 전달된다.
   */
  capture?: boolean;
  /** 이 선택자에 걸리는 곳을 눌렀으면 닫지 않는다 (그쪽이 스스로 처리할 때). */
  ignoreSelector?: string;
}

export function useClickOutside<T extends HTMLElement>(
  onClose: () => void,
  { touch = false, enabled = true, capture = false, ignoreSelector }: UseClickOutsideOptions = {},
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!enabled) return;
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as HTMLElement;
      if (!ref.current || ref.current.contains(target)) return;
      if (ignoreSelector && target.closest?.(ignoreSelector)) return;
      onClose();
    }
    document.addEventListener("mousedown", handleClickOutside, capture);
    if (touch) document.addEventListener("touchstart", handleClickOutside, capture);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, capture);
      if (touch) document.removeEventListener("touchstart", handleClickOutside, capture);
    };
  }, [onClose, touch, enabled, capture, ignoreSelector]);

  return ref;
}
