"use client";

// 손서명 캔버스 — 휴대폰 손가락/PC 마우스 공용(Pointer Events).
// 외부 라이브러리 없이 구현. onChange 로 "그렸는지 여부"만 알리고,
// 이미지는 제출 시점에 toDataUrl() 로 뽑는다.

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";

export interface SignatureCanvasHandle {
  /** 서명 PNG dataURL. 비어 있으면 null. */
  toDataUrl: () => string | null;
  clear: () => void;
}

interface Props {
  onDrawnChange?: (drawn: boolean) => void;
}

const SignatureCanvas = forwardRef<SignatureCanvasHandle, Props>(function SignatureCanvas(
  { onDrawnChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [drawn, setDrawn] = useState(false);

  // 화면 크기에 맞춰 실제 픽셀 해상도를 잡는다(레티나 대응)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0f172a";
    }
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!drawn) {
      setDrawn(true);
      onDrawnChange?.(true);
    }
  };

  const end = () => {
    drawingRef.current = false;
  };

  useImperativeHandle(ref, () => ({
    toDataUrl: () => {
      const canvas = canvasRef.current;
      if (!canvas || !drawn) return null;
      // 흰 배경을 깔아 PDF/미리보기에서 투명 배경 문제가 없게 한다
      const out = document.createElement("canvas");
      out.width = canvas.width;
      out.height = canvas.height;
      const ctx = out.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(canvas, 0, 0);
      return out.toDataURL("image/png");
    },
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      setDrawn(false);
      onDrawnChange?.(false);
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className="h-40 w-full cursor-crosshair rounded-xl border-2 border-dashed border-slate-300 bg-white touch-none"
      aria-label="서명 입력 영역"
    />
  );
});

export default SignatureCanvas;
