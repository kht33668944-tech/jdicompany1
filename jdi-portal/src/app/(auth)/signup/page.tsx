"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Aurora from "@/components/Aurora";
import DotBackground from "@/components/DotBackground";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (password !== confirmPassword) {
      setErrorMessage("비밀번호가 일치하지 않습니다.");
      return;
    }

    if (!fullName.trim()) {
      setErrorMessage("이름을 입력해주세요.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName.trim() },
        },
      });

      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccess(true);
      }
    } catch {
      setErrorMessage("회원가입 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="relative min-h-screen w-full selection:bg-brand-200 selection:text-brand-900">
        <DotBackground />
        <Aurora />
        <main className="relative z-10 flex min-h-screen w-full items-center justify-center px-6 py-12">
          <div className="glass-card rounded-[2rem] p-8 sm:p-10 max-w-md w-full text-center animate-fade-in-up">
            <div className="flex justify-center mb-4">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="white" viewBox="0 0 256 256">
                  <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/>
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">가입 신청 완료!</h2>
            <p className="text-sm text-slate-500 mb-6">
              관리자 승인 후 로그인할 수 있습니다.<br />
              승인이 완료되면 로그인해주세요.
            </p>
            <a
              href="/login"
              className="block w-full py-3 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 transition-all duration-300"
            >
              로그인 페이지로 이동
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full selection:bg-brand-200 selection:text-brand-900">
      <DotBackground />
      <Aurora />
      <main className="relative z-10 flex min-h-screen w-full items-center justify-center px-6 py-12">
        <div className="w-full max-w-md animate-fade-in-up">
          <div className="glass-card rounded-[2rem] p-8 sm:p-10 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

            <div className="text-center mb-10 relative z-10">
              <div className="flex justify-center mb-4">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="white" viewBox="0 0 256 256">
                    <path d="M223.68,66.15,135.68,15a15.88,15.88,0,0,0-15.36,0l-88,51.12A16,16,0,0,0,24,80v96a16,16,0,0,0,8.32,14l88,51.12a15.88,15.88,0,0,0,15.36,0l88-51.12A16,16,0,0,0,232,176V80A16,16,0,0,0,223.68,66.15ZM128,29.09,207.39,75.1,128,120.91,48.61,75.1ZM40,90l80,45.51V223.56L40,176ZM136,223.56V135.56L216,90v86Z"/>
                  </svg>
                </div>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700 mb-2">
                회원가입
              </h2>
              <p className="text-sm font-medium text-slate-500">JDICOMPANY 내부 시스템 계정 생성</p>
            </div>

            <form className="space-y-6 relative z-10" onSubmit={handleSubmit}>
              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm text-center">
                  {errorMessage}
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="full-name" className="block text-sm font-semibold text-slate-700 ml-1">
                  이름
                </label>
                <input
                  type="text"
                  id="full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="glass-input block w-full px-4 py-3.5 text-slate-900 text-sm rounded-xl outline-none transition-all duration-300 placeholder:text-slate-400"
                  placeholder="실명을 입력하세요"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700 ml-1">
                  이메일
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="glass-input block w-full px-4 py-3.5 text-slate-900 text-sm rounded-xl outline-none transition-all duration-300 placeholder:text-slate-400"
                  placeholder="이메일을 입력하세요"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="signup-password" className="block text-sm font-semibold text-slate-700 ml-1">
                  비밀번호
                </label>
                <input
                  type="password"
                  id="signup-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input block w-full px-4 py-3.5 text-slate-900 text-sm rounded-xl outline-none transition-all duration-300 placeholder:text-slate-400"
                  placeholder="8자 이상 입력하세요"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="confirm-password" className="block text-sm font-semibold text-slate-700 ml-1">
                  비밀번호 확인
                </label>
                <input
                  type="password"
                  id="confirm-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="glass-input block w-full px-4 py-3.5 text-slate-900 text-sm rounded-xl outline-none transition-all duration-300 placeholder:text-slate-400"
                  placeholder="비밀번호를 다시 입력하세요"
                  required
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70"
                >
                  <span className="relative">
                    {loading ? "가입 처리 중..." : "회원가입"}
                  </span>
                </button>
              </div>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-200/50 text-center relative z-10">
              <p className="text-xs text-slate-500 mb-4">이미 계정이 있으신가요?</p>
              <a
                href="/login"
                className="block w-full py-3 px-4 rounded-xl text-sm font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 border border-brand-200 transition-all duration-200"
              >
                로그인
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
