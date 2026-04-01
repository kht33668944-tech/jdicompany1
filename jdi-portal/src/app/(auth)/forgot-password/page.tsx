"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Aurora from "@/components/Aurora";
import DotBackground from "@/components/DotBackground";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!email.includes("@")) {
      setErrorMessage("올바른 이메일 형식을 입력해주세요.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });

      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccess(true);
      }
    } catch {
      setErrorMessage("비밀번호 재설정 요청 중 오류가 발생했습니다.");
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
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="white" viewBox="0 0 256 256">
                  <path d="M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48ZM98.71,128,40,181.81V74.19Zm11.84,10.85,12,11.05a8,8,0,0,0,10.82,0l12-11.05,58,53.15H52.57ZM157.29,128,216,74.18V181.82Z"/>
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">이메일 발송 완료</h2>
            <p className="text-sm text-slate-500 mb-2">
              <span className="font-semibold text-slate-700">{email}</span>
            </p>
            <p className="text-sm text-slate-500 mb-6">
              위 주소로 비밀번호 재설정 링크를 발송했습니다.<br />
              이메일을 확인해주세요.
            </p>
            <a
              href="/login"
              className="block w-full py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 transition-all duration-300"
            >
              로그인 페이지로 돌아가기
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

            <div className="text-center mb-8 relative z-10">
              <div className="flex justify-center mb-4">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="white" viewBox="0 0 256 256">
                    <path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Zm-68-56a12,12,0,1,1-12-12A12,12,0,0,1,140,152Z"/>
                  </svg>
                </div>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700 mb-2">
                비밀번호 재설정
              </h2>
              <p className="text-sm font-medium text-slate-500">
                가입하신 이메일을 입력하시면<br />
                비밀번호 재설정 링크를 보내드립니다.
              </p>
            </div>

            <form className="space-y-6 relative z-10" onSubmit={handleSubmit}>
              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm text-center">
                  {errorMessage}
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700 ml-1">
                  이메일
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48ZM98.71,128,40,181.81V74.19Zm11.84,10.85,12,11.05a8,8,0,0,0,10.82,0l12-11.05,58,53.15H52.57ZM157.29,128,216,74.18V181.82Z"/>
                    </svg>
                  </div>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setErrorMessage("");
                    }}
                    className="glass-input block w-full pl-12 pr-4 py-4 text-slate-900 text-base rounded-xl outline-none transition-all duration-300 placeholder:text-slate-400"
                    placeholder="가입한 이메일을 입력하세요"
                    required
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full flex justify-center py-4 px-4 border border-transparent text-base font-bold rounded-xl text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <span className="absolute inset-0 w-full h-full rounded-xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="relative">
                    {loading ? "발송 중..." : "재설정 링크 보내기"}
                  </span>
                </button>
              </div>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-200/50 text-center relative z-10">
              <a
                href="/login"
                className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline underline-offset-4 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M224,128a8,8,0,0,1-8,8H59.31l58.35,58.34a8,8,0,0,1-11.32,11.32l-72-72a8,8,0,0,1,0-11.32l72-72a8,8,0,0,1,11.32,11.32L59.31,120H216A8,8,0,0,1,224,128Z"/>
                </svg>
                로그인으로 돌아가기
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
