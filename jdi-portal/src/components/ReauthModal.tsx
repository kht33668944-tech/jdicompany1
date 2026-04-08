"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ReauthModalProps {
  email: string;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * 민감 작업(비밀번호 변경 등) 진입 전 현재 비밀번호 재확인.
 * 성공 시 sessionStorage 에 타임스탬프 기록 → 5분 유예는 호출 측에서 처리.
 */
export default function ReauthModal({ email, onSuccess, onCancel }: ReauthModalProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError(
          authError.message === "Invalid login credentials"
            ? "비밀번호가 올바르지 않습니다."
            : authError.message
        );
        return;
      }
      try {
        window.sessionStorage.setItem("jdi:reauth-at", String(Date.now()));
      } catch {
        /* 무시 */
      }
      onSuccess();
    } catch {
      setError("본인 확인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-base font-bold text-slate-800 mb-1">본인 확인</h3>
        <p className="text-xs text-slate-500 mb-4">
          보안을 위해 현재 비밀번호를 한 번만 확인할게요.
        </p>
        <form onSubmit={handleConfirm} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            placeholder="현재 비밀번호"
            autoFocus
            className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-indigo-400 text-sm"
          />
          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors disabled:opacity-40"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              className="flex-1 py-2.5 rounded-xl bg-indigo-500 text-white font-bold text-sm hover:bg-indigo-600 transition-colors disabled:opacity-40"
            >
              {loading ? "확인 중..." : "확인"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
