"use client";

import { useRef } from "react";

/**
 * 모달/시트 오버레이(배경) 클릭 닫기 가드 핸들러.
 * 배경에서 눌러 시작해 배경에서 뗀 클릭만 닫는다 —
 * 입력칸에서 텍스트를 드래그하다 배경에서 떼면 실수로 닫히던 문제 방지.
 * 사용: <div {...useOverlayDismiss(onClose)}> (오버레이 요소에 스프레드)
 */
export function useOverlayDismiss(onDismiss: () => void) {
  const downOnOverlay = useRef(false);
  return {
    onMouseDown: (e: React.MouseEvent) => {
      downOnOverlay.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && downOnOverlay.current) onDismiss();
      downOnOverlay.current = false;
    },
  };
}
