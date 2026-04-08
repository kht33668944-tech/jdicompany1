"use client";

import { useState, type ReactNode } from "react";

interface LogoutButtonProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

/**
 * 로그아웃 버튼.
 * - 명시적 로그아웃 시에만 사용 (사용자 버튼 클릭)
 * - localStorage 의 "jdi:last-email" 을 지워서 다음 로그인 시 이메일 비어있게 함
 * - 자동 쿠키 만료로 인한 로그아웃은 이 경로를 거치지 않으므로 이메일 유지됨 (의도)
 */
export default function LogoutButton({ children, className, title }: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      window.localStorage.removeItem("jdi:last-email");
    } catch {
      /* 무시 */
    }
    try {
      await fetch("/auth/signout", { method: "POST" });
    } catch {
      /* 무시 */
    }
    // 서버가 /login 으로 redirect 하지만 fetch는 따라가지 않으므로 명시 이동
    window.location.href = "/login";
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={className}
      title={title}
    >
      {children}
    </button>
  );
}
