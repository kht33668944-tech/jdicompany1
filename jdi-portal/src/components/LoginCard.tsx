"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type ValidationState = "" | "error" | "success";

// next 파라미터 안전 검증: 동일 origin 내부 경로만 허용.
// 퍼센트 인코딩 우회(%2F%2F), 제어 문자(\t, \n), 스키마-리스(//)/역슬래시(/\) 차단.
function sanitizeNext(raw: string | null): string {
  if (!raw) return "/dashboard";

  // 제어 문자 / 공백 문자 차단 (탭, 개행, NULL 등)
  if (/[\s\x00-\x1F]/.test(raw)) return "/dashboard";

  // 퍼센트 인코딩 디코드 후 재검사 (decode 실패 시 거부)
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return "/dashboard";
  }

  if (!decoded.startsWith("/")) return "/dashboard";
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) return "/dashboard";
  if (
    decoded.startsWith("/login") ||
    decoded.startsWith("/signup") ||
    decoded.startsWith("/auth")
  ) {
    return "/dashboard";
  }

  // 원본(raw)을 리턴해서 router 가 두 번 디코드하지 않도록
  return raw;
}

export default function LoginCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [usernameState, setUsernameState] = useState<ValidationState>("");
  const [passwordState, setPasswordState] = useState<ValidationState>("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // 마지막 로그인 이메일 자동 채움 (7일 후 재로그인 시 비밀번호만 입력하도록)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const lastEmail = window.localStorage.getItem("jdi:last-email");
      if (lastEmail) {
        setUsername(lastEmail);
        setUsernameState(validateUsername(lastEmail) ? "success" : "");
        // 이메일이 있으면 비밀번호 칸으로 포커스 이동
        setTimeout(() => {
          passwordInputRef.current?.focus();
        }, 50);
      }
    } catch {
      /* localStorage 접근 실패 (프라이빗 모드 등) — 무시 */
    }
  }, []);

  const validateUsername = (value: string) => value.length >= 3 || value.includes("@");
  const validatePassword = (value: string) => value.length >= 8;

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setErrorMessage("");
    if (value.length > 0) {
      setUsernameState(validateUsername(value) ? "success" : "error");
    } else {
      setUsernameState("");
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    setErrorMessage("");
    if (value.length > 0) {
      setPasswordState(validatePassword(value) ? "success" : "error");
    } else {
      setPasswordState("");
    }
  };

  const handleCapsLock = useCallback((e: React.KeyboardEvent) => {
    setCapsLock(e.getModifierState("CapsLock"));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateUsername(username) || !validatePassword(password)) {
      setShaking(true);
      setUsernameState("error");
      setPasswordState("error");
      setTimeout(() => setShaking(false), 500);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: username,
        password,
      });

      if (error) {
        setErrorMessage(
          error.message === "Invalid login credentials"
            ? "아이디 또는 비밀번호가 올바르지 않습니다."
            : error.message
        );
        setShaking(true);
        setTimeout(() => setShaking(false), 500);
      } else {
        // 승인 여부 확인
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_approved")
          .eq("id", data.user.id)
          .single();

        if (profile && !profile.is_approved) {
          await supabase.auth.signOut();
          setErrorMessage("관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다.");
          setShaking(true);
          setTimeout(() => setShaking(false), 500);
        } else {
          // 마지막 로그인 이메일 기억 (비밀번호는 저장하지 않음)
          try {
            window.localStorage.setItem("jdi:last-email", username);
          } catch {
            /* 무시 */
          }

          const nextPath = sanitizeNext(searchParams.get("next"));
          router.replace(nextPath);
        }
      }
    } catch {
      setErrorMessage("로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (state: ValidationState) =>
    `glass-input block w-full pl-12 pr-4 py-4 text-slate-900 text-base rounded-xl outline-none transition-all duration-300 placeholder:text-slate-400 ${
      state === "error" ? "error" : state === "success" ? "success" : ""
    }`;

  return (
    <div
      className="w-full max-w-xl xl:max-w-2xl xl:ml-auto shrink-0 animate-fade-in-up"
      style={{ animationDelay: "0.2s" }}
    >
      <div
        ref={cardRef}
        className={`glass-card rounded-[2rem] p-8 sm:p-10 lg:p-12 relative overflow-hidden group ${
          shaking ? "animate-shake" : ""
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

        {/* Header */}
        <div className="text-center mb-8 relative z-10">
          <div className="flex justify-center mb-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="white" viewBox="0 0 256 256">
                <path d="M223.68,66.15,135.68,15a15.88,15.88,0,0,0-15.36,0l-88,51.12A16,16,0,0,0,24,80v96a16,16,0,0,0,8.32,14l88,51.12a15.88,15.88,0,0,0,15.36,0l88-51.12A16,16,0,0,0,232,176V80A16,16,0,0,0,223.68,66.15ZM128,29.09,207.39,75.1,128,120.91,48.61,75.1ZM40,90l80,45.51V223.56L40,176ZM136,223.56V135.56L216,90v86Z"/>
              </svg>
            </div>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-700 mb-2">
            JDICOMPANY
          </h2>
          <p className="text-base font-medium text-slate-500">내부 시스템 로그인</p>
        </div>

        {/* Form */}
        <form className="space-y-4 relative z-10" onSubmit={handleSubmit}>
          {searchParams.get("error") === "not_approved" && !errorMessage && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm text-center">
              관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다.
            </div>
          )}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm text-center">
              {errorMessage}
            </div>
          )}

          {/* Username */}
          <div className="space-y-1.5">
            <label htmlFor="username" className="block text-base font-semibold text-slate-700 ml-1">
              아이디
            </label>
            <div className={`relative transition-transform ${focusedField === "username" ? "scale-[1.01]" : ""}`}>
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 transition-colors" style={{ color: focusedField === "username" ? "#3b82f6" : undefined }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM74.08,197.5a64,64,0,0,1,107.84,0,87.83,87.83,0,0,1-107.84,0ZM96,120a32,32,0,1,1,32,32A32,32,0,0,1,96,120Zm97.76,66.41a79.66,79.66,0,0,0-36.06-28.75,48,48,0,1,0-59.4,0,79.66,79.66,0,0,0-36.06,28.75,88,88,0,1,1,131.52,0Z"/>
                </svg>
              </div>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                onFocus={() => setFocusedField("username")}
                onBlur={() => setFocusedField(null)}
                className={inputClass(usernameState)}
                placeholder="사번 또는 이메일을 입력하세요"
                required
              />
            </div>
            <p className={`text-xs text-red-500 ml-1 transition-opacity duration-300 h-0 overflow-visible ${usernameState === "error" ? "opacity-100" : "opacity-0"}`}>
              사번 또는 이메일 형식이 올바르지 않습니다.
            </p>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-base font-semibold text-slate-700 ml-1">
              비밀번호
            </label>
            <div className={`relative transition-transform ${focusedField === "password" ? "scale-[1.01]" : ""}`}>
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 transition-colors" style={{ color: focusedField === "password" ? "#3b82f6" : undefined }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Zm-68-56a12,12,0,1,1-12-12A12,12,0,0,1,140,152Z"/>
                </svg>
              </div>
              <input
                ref={passwordInputRef}
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                onKeyDown={handleCapsLock}
                onKeyUp={handleCapsLock}
                onFocus={() => setFocusedField("password")}
                onBlur={() => {
                  setFocusedField(null);
                  setCapsLock(false);
                }}
                className={`${inputClass(passwordState)} !pr-24`}
                placeholder="비밀번호를 입력하세요"
                required
              />

              {/* Caps Lock Warning */}
              {capsLock && (
                <div className="absolute right-12 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[0.65rem] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-300">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 256 256">
                    <path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z"/>
                  </svg>
                  Caps Lock
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                    <path d="M53.92,34.62A8,8,0,1,0,42.08,45.38L61.32,66.55C25,88.84,9.38,123.2,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208a127.11,127.11,0,0,0,52.07-10.83l22,24.21a8,8,0,1,0,11.84-10.76Zm47.33,75.84,41.67,45.85a32,32,0,0,1-41.67-45.85ZM128,192c-30.78,0-57.67-11.19-79.93-33.29A166.16,166.16,0,0,1,24.86,128C30.4,118.09,60.63,80,128,80a112.26,112.26,0,0,1,19.07,1.63L163.6,99.2A48,48,0,0,0,92.62,161.39l20.31,22.34A111.53,111.53,0,0,1,128,192Zm119.31-65.24c-.35-.79-8.82-19.57-27.65-38.4A163.59,163.59,0,0,0,184.6,62.48a8,8,0,1,0-8.23,13.72A146.91,146.91,0,0,1,207.93,95.2a166.16,166.16,0,0,1,23.21,30.8,166.16,166.16,0,0,1-23.21,30.8,8,8,0,0,0,12.45,10.05,189.14,189.14,0,0,0,27.93-37.61,8,8,0,0,0,0-6.5Z"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                    <path d="M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.29A166.16,166.16,0,0,1,24.86,128,166.16,166.16,0,0,1,48.07,97.29C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.29A166.16,166.16,0,0,1,231.14,128C223.76,141.46,192.43,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z"/>
                  </svg>
                )}
              </button>
            </div>
            <p className={`text-xs text-red-500 ml-1 transition-opacity duration-300 h-0 overflow-visible ${passwordState === "error" ? "opacity-100" : "opacity-0"}`}>
              비밀번호는 8자 이상이어야 합니다.
            </p>
          </div>

          {/* Remember + Forgot */}
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600 bg-white/50 cursor-pointer"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-600 cursor-pointer select-none">
                로그인 상태 유지
              </label>
            </div>
            <Link href="/forgot-password" prefetch={false} className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline underline-offset-4 transition-colors">
              비밀번호를 잊으셨나요?
            </Link>
          </div>

          {/* Submit */}
          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-4 px-4 border border-transparent text-base font-bold rounded-xl text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <span className="absolute inset-0 w-full h-full rounded-xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="relative flex items-center gap-2">
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    로그인 중...
                  </>
                ) : (
                  <>
                    로그인
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256" className="transition-transform group-hover:translate-x-1">
                      <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69l-58.35-58.34a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"/>
                    </svg>
                  </>
                )}
              </span>
            </button>
          </div>
        </form>

        {/* Sign up */}
        <div className="mt-6 pt-6 border-t border-slate-200/50 text-center relative z-10">
          <p className="text-sm text-slate-500 mb-3">계정이 없으신가요?</p>
          <Link
            href="/signup"
            prefetch={false}
            className="block w-full py-3.5 px-4 rounded-xl text-base font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 border border-brand-200 transition-all duration-200"
          >
            회원가입
          </Link>
        </div>
      </div>

      <div className="mt-8 text-center lg:hidden">
        <p className="text-xs text-slate-400">&copy; 2024 JDICOMPANY. All rights reserved.</p>
      </div>
    </div>
  );
}
