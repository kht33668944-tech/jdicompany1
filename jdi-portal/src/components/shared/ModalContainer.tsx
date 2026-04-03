"use client";

interface ModalContainerProps {
  onClose: () => void;
  maxWidth?: string;
  className?: string;
  children: React.ReactNode;
}

export default function ModalContainer({ onClose, maxWidth = "max-w-lg", className, children }: ModalContainerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className={`relative glass-card rounded-2xl p-6 w-full ${maxWidth} animate-fade-in-up${className ? ` ${className}` : ""}`}>
        {children}
      </div>
    </div>
  );
}
