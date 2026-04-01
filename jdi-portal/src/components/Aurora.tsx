"use client";

import { useEffect, useRef, useCallback } from "react";

interface BlobConfig {
  el: HTMLDivElement;
  x: number;
  y: number;
  driftX: number;
  driftY: number;
  driftSpeedX: number;
  driftSpeedY: number;
  ease: number;
  rangeX: number;
  rangeY: number;
  direction: number;
}

export default function Aurora() {
  const containerRef = useRef<HTMLDivElement>(null);
  const blobRefs = useRef<HTMLDivElement[]>([]);
  const targetRef = useRef({ x: 0, y: 0 });
  const isMouseActiveRef = useRef(false);
  const idleTimeRef = useRef(0);

  const setBlobRef = useCallback((el: HTMLDivElement | null, index: number) => {
    if (el) blobRefs.current[index] = el;
  }, []);

  useEffect(() => {
    const blobs = blobRefs.current.filter(Boolean);
    if (blobs.length === 0) return;

    const blobConfigs: BlobConfig[] = blobs.map((el, index) => ({
      el,
      x: 0,
      y: 0,
      driftX: Math.random() * 100,
      driftY: Math.random() * 100,
      driftSpeedX: Math.random() * 0.002 + 0.001,
      driftSpeedY: Math.random() * 0.002 + 0.001,
      ease: 0.015 + index * 0.005,
      rangeX: 120 + index * 60,
      rangeY: 120 + index * 60,
      direction: index % 2 === 0 ? 1 : -0.7,
    }));

    const handleMouseMove = (e: MouseEvent) => {
      isMouseActiveRef.current = true;
      idleTimeRef.current = 0;
      targetRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      targetRef.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        isMouseActiveRef.current = true;
        idleTimeRef.current = 0;
        targetRef.current.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
        targetRef.current.y = (e.touches[0].clientY / window.innerHeight) * 2 - 1;
      }
    };

    const handleMouseOut = () => {
      isMouseActiveRef.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("mouseout", handleMouseOut);

    let animationId: number;

    function animate() {
      if (!isMouseActiveRef.current) {
        idleTimeRef.current++;
        if (idleTimeRef.current > 60) {
          targetRef.current.x += (0 - targetRef.current.x) * 0.01;
          targetRef.current.y += (0 - targetRef.current.y) * 0.01;
        }
      }

      blobConfigs.forEach((config) => {
        config.driftX += config.driftSpeedX;
        config.driftY += config.driftSpeedY;

        const idleOffsetX = Math.sin(config.driftX) * 40;
        const idleOffsetY = Math.cos(config.driftY) * 40;

        const destX = targetRef.current.x * config.rangeX * config.direction + idleOffsetX;
        const destY = targetRef.current.y * config.rangeY * config.direction + idleOffsetY;

        config.x += (destX - config.x) * config.ease;
        config.y += (destY - config.y) * config.ease;

        config.el.style.transform = `translate3d(${config.x}px, ${config.y}px, 0)`;
      });

      animationId = requestAnimationFrame(animate);
    }

    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("mouseout", handleMouseOut);
    };
  }, []);

  const blobs = [
    "bg-blue-300 w-[50vw] h-[50vw] top-[10%] left-[10%]",
    "bg-indigo-300 w-[45vw] h-[45vw] top-[30%] right-[15%] opacity-60",
    "bg-cyan-200 w-[60vw] h-[60vw] bottom-[10%] left-[25%] opacity-40",
    "bg-purple-200 w-[40vw] h-[40vw] top-[10%] left-[40%] opacity-40",
  ];

  return (
    <div
      ref={containerRef}
      className="fixed z-0 pointer-events-none overflow-hidden animate-fade-in"
      style={{ inset: "-20%" }}
    >
      {blobs.map((classes, i) => (
        <div
          key={i}
          ref={(el) => setBlobRef(el, i)}
          className={`aurora-blob ${classes}`}
        />
      ))}
    </div>
  );
}
