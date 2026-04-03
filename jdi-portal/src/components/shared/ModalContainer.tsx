"use client";

import { useEffect } from "react";

interface ModalContainerProps {
  onClose: () => void;
  maxWidth?: string;
  className?: string;
  children: React.ReactNode;
}

export default function ModalContainer({ onClose, maxWidth = "max-w-lg", className, children }: ModalContainerProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} aria-label="닫기" />
      <div className={`relative glass-card rounded-2xl p-6 w-full ${maxWidth} animate-fade-in-up${className ? ` ${className}` : ""}`}>
        {children}
      </div>
    </div>
  );
}
