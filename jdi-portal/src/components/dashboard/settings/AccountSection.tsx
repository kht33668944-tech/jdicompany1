"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EnvelopeSimple, CalendarCheck, Key, Lock, FloppyDisk, PaperPlaneTilt, X, WifiHigh } from "phosphor-react";
import {
  updatePassword,
  setInitialHireDate,
  submitHireDateChangeRequest,
  cancelMyHireDateChangeRequest,
  adminSetHireDate,
  setInitialAllowedIp,
  submitIpChangeRequest,
  cancelMyIpChangeRequest,
} from "@/lib/settings/actions";
import type { Profile, HireDateChangeRequest, IpChangeRequest } from "@/lib/attendance/types";
import ReauthModal from "@/components/ReauthModal";

const REAUTH_WINDOW_MS = 5 * 60 * 1000; // 5분

interface AccountSectionProps {
  profile: Profile;
  isAdmin: boolean;
  myHireDateChangeRequests: HireDateChangeRequest[];
  myIpChangeRequests: IpChangeRequest[];
}

export default function AccountSection({ profile, isAdmin, myHireDateChangeRequests, myIpChangeRequests }: AccountSectionProps) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [hireDateInput, setHireDateInput] = useState(profile.hire_date ?? "");
  const [hireDateSaving, setHireDateSaving] = useState(false);

  // 변경 요청 폼 상태
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestDate, setRequestDate] = useState(profile.hire_date ?? "");
  const [requestReason, setRequestReason] = useState("");
  const [requestSaving, setRequestSaving] = useState(false);

  // IP 설정 상태
  const [allowedIp, setAllowedIp] = useState(profile.allowed_ip ?? "");
  const [currentIp, setCurrentIp] = useState<string | null>(null);
  const [ipSaving, setIpSaving] = useState(false);
  const [showIpRequestForm, setShowIpRequestForm] = useState(false);
  const [ipRequestIp, setIpRequestIp] = useState("");
  const [ipRequestReason, setIpRequestReason] = useState("");
  const [ipRequestSaving, setIpRequestSaving] = useState(false);

  const pendingIpRequest = myIpChangeRequests.find((r) => r.status === "대기중");
  const isIpLocked = profile.allowed_ip_locked && !isAdmin;

  // 현재 접속 IP 가져오기
  useEffect(() => {
    fetch("/api/ip")
      .then((r) => r.json())
      .then((d) => setCurrentIp(d.ip))
      .catch(() => setCurrentIp(null));
  }, []);

  const handleIpSave = async () => {
    if (!allowedIp.trim()) {
      setFeedback({ type: "error", message: "IP를 입력해주세요." });
      return;
    }
    setIpSaving(true);
    setFeedback(null);
    try {
      await setInitialAllowedIp(allowedIp.trim());
      setFeedback({ type: "success", message: "출퇴근 허용 IP가 저장되었습니다." });
      router.refresh();
    } catch {
      setFeedback({ type: "error", message: "IP 저장에 실패했습니다." });
    } finally {
      setIpSaving(false);
    }
  };

  const handleSubmitIpRequest = async () => {
    if (!ipRequestIp.trim()) {
      setFeedback({ type: "error", message: "변경할 IP를 입력해주세요." });
      return;
    }
    setIpRequestSaving(true);
    setFeedback(null);
    try {
      await submitIpChangeRequest({ ip: ipRequestIp.trim(), reason: ipRequestReason });
      setFeedback({ type: "success", message: "IP 변경 요청이 제출되었습니다. 관리자 승인을 기다려주세요." });
      setShowIpRequestForm(false);
      setIpRequestReason("");
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "변경 요청 제출에 실패했습니다.";
      setFeedback({ type: "error", message: msg });
    } finally {
      setIpRequestSaving(false);
    }
  };

  const handleCancelIpRequest = async (requestId: string) => {
    setFeedback(null);
    try {
      await cancelMyIpChangeRequest(requestId);
      router.refresh();
    } catch {
      setFeedback({ type: "error", message: "요청 취소에 실패했습니다." });
    }
  };

  const handleUseCurrentIp = (setter: (v: string) => void) => {
    if (currentIp) setter(currentIp);
  };

  const pendingRequest = myHireDateChangeRequests.find((r) => r.status === "대기중");

  // 모드 결정
  // isAdmin → 항상 직접 저장
  // !isAdmin && !hire_date_locked → 첫 설정 (직접 저장, setInitialHireDate)
  // !isAdmin && hire_date_locked → 변경 요청 모드
  const isLocked = profile.hire_date_locked && !isAdmin;

  const handleHireDateSave = async () => {
    if (!hireDateInput) {
      setFeedback({ type: "error", message: "입사일을 선택해주세요." });
      return;
    }
    setHireDateSaving(true);
    setFeedback(null);
    try {
      if (isAdmin) {
        await adminSetHireDate({ userId: profile.id, hireDate: hireDateInput });
        setFeedback({ type: "success", message: "입사일이 저장되었습니다. 연차가 다시 계산됩니다." });
      } else {
        await setInitialHireDate(hireDateInput);
        setFeedback({ type: "success", message: "입사일이 저장되었습니다. 연차가 다시 계산됩니다." });
      }
      router.refresh();
    } catch {
      setFeedback({ type: "error", message: "입사일 저장에 실패했습니다." });
    } finally {
      setHireDateSaving(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!requestDate) {
      setFeedback({ type: "error", message: "요청할 입사일을 선택해주세요." });
      return;
    }
    setRequestSaving(true);
    setFeedback(null);
    try {
      await submitHireDateChangeRequest({ hireDate: requestDate, reason: requestReason });
      setFeedback({ type: "success", message: "변경 요청이 제출되었습니다. 관리자 승인을 기다려주세요." });
      setShowRequestForm(false);
      setRequestReason("");
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "변경 요청 제출에 실패했습니다.";
      setFeedback({ type: "error", message: msg });
    } finally {
      setRequestSaving(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    setFeedback(null);
    try {
      await cancelMyHireDateChangeRequest(requestId);
      router.refresh();
    } catch {
      setFeedback({ type: "error", message: "요청 취소에 실패했습니다." });
    }
  };

  const needsReauth = (): boolean => {
    if (typeof window === "undefined") return true;
    try {
      const raw = window.sessionStorage.getItem("jdi:reauth-at");
      if (!raw) return true;
      const at = Number(raw);
      if (!Number.isFinite(at)) return true;
      return Date.now() - at > REAUTH_WINDOW_MS;
    } catch {
      return true;
    }
  };

  const actuallyChangePassword = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      await updatePassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setFeedback({ type: "success", message: "비밀번호가 변경되었습니다." });
    } catch {
      setFeedback({ type: "error", message: "비밀번호 변경에 실패했습니다." });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setFeedback({ type: "error", message: "비밀번호는 8자 이상이어야 합니다." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({ type: "error", message: "새 비밀번호가 일치하지 않습니다." });
      return;
    }

    if (needsReauth()) {
      setReauthOpen(true);
      return;
    }
    await actuallyChangePassword();
  };

  return (
    <section className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 p-8">
      {reauthOpen && (
        <ReauthModal
          email={profile.email}
          onSuccess={async () => {
            setReauthOpen(false);
            await actuallyChangePassword();
          }}
          onCancel={() => setReauthOpen(false)}
        />
      )}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-slate-800">계정 및 보안</h2>
        <p className="text-xs text-slate-400 mt-1">계정 보안 정보 및 로그인을 위한 설정을 관리합니다.</p>
      </div>

      {feedback && (
        <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
          feedback.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-red-200 bg-red-50 text-red-700"
        }`}>
          {feedback.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Info Cards */}
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-400">
                <EnvelopeSimple size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">이메일 계정</p>
                <p className="text-sm font-bold text-slate-700">{profile.email}</p>
              </div>
            </div>
            <Lock size={16} className="text-slate-300" />
          </div>

          {/* 입사일 카드 */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-400">
                <CalendarCheck size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">입사일</p>
                <p className="text-[11px] text-slate-500">연차 계산의 기준이 됩니다</p>
              </div>
            </div>

            {/* Mode 1 & 3: 직접 입력 (미잠금 직원 or 관리자) */}
            {!isLocked && (
              <div className="flex gap-2">
                <input
                  type="date"
                  value={hireDateInput}
                  onChange={(e) => setHireDateInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-100 focus:outline-none focus:border-indigo-400 text-sm text-slate-700"
                />
                <button
                  type="button"
                  onClick={handleHireDateSave}
                  disabled={hireDateSaving || !hireDateInput || hireDateInput === profile.hire_date}
                  className="px-3 py-2 rounded-xl border border-indigo-400 text-indigo-500 font-bold text-xs hover:bg-indigo-50 transition-colors disabled:opacity-40 flex items-center gap-1"
                >
                  <FloppyDisk size={14} />
                  저장
                </button>
              </div>
            )}

            {/* Mode 2: 잠금 (직원 본인, hire_date_locked = true) */}
            {isLocked && (
              <div className="space-y-3">
                {/* 현재 입사일 읽기 전용 */}
                <div className="px-3 py-2 rounded-xl bg-white border border-slate-100 text-sm text-slate-700">
                  {profile.hire_date ?? "미설정"}
                </div>

                {/* 대기중 요청이 있을 때 */}
                {pendingRequest ? (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-amber-700">승인 대기 중</p>
                        <p className="text-xs text-amber-600 mt-0.5">요청 입사일: {pendingRequest.requested_hire_date}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCancelRequest(pendingRequest.id)}
                        className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium"
                      >
                        <X size={12} />
                        요청 취소
                      </button>
                    </div>
                  </div>
                ) : showRequestForm ? (
                  /* 변경 요청 폼 */
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={requestDate}
                      onChange={(e) => setRequestDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-100 focus:outline-none focus:border-indigo-400 text-sm text-slate-700"
                    />
                    <textarea
                      value={requestReason}
                      onChange={(e) => setRequestReason(e.target.value)}
                      placeholder="변경 사유 (선택)"
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-100 focus:outline-none focus:border-indigo-400 text-sm text-slate-700 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSubmitRequest}
                        disabled={requestSaving || !requestDate}
                        className="flex-1 py-2 rounded-xl bg-indigo-500 text-white font-bold text-xs hover:bg-indigo-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
                      >
                        <PaperPlaneTilt size={13} />
                        제출
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowRequestForm(false); setRequestReason(""); }}
                        className="px-3 py-2 rounded-xl bg-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-300 transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 변경 요청 버튼 */
                  <button
                    type="button"
                    onClick={() => setShowRequestForm(true)}
                    className="w-full py-2 rounded-xl border border-indigo-400 text-indigo-500 font-bold text-xs hover:bg-indigo-50 transition-colors"
                  >
                    변경 요청
                  </button>
                )}
              </div>
            )}
          </div>
          {/* 출퇴근 허용 IP 카드 */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-400">
                <WifiHigh size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">출퇴근 허용 IP</p>
                <p className="text-[11px] text-slate-500">등록된 IP에서만 출퇴근이 가능합니다</p>
              </div>
            </div>

            {currentIp && (
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs text-slate-400">현재 접속 IP:</span>
                <span className="text-xs font-mono font-bold text-slate-600">{currentIp}</span>
              </div>
            )}

            {/* 모드 1: 첫 등록 (미잠금) */}
            {!isIpLocked && (
              <div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={allowedIp}
                    onChange={(e) => setAllowedIp(e.target.value)}
                    placeholder="예: 220.117.30.202"
                    className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-100 focus:outline-none focus:border-indigo-400 text-sm text-slate-700 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleIpSave}
                    disabled={ipSaving || !allowedIp.trim()}
                    className="px-3 py-2 rounded-xl border border-indigo-400 text-indigo-500 font-bold text-xs hover:bg-indigo-50 transition-colors disabled:opacity-40 flex items-center gap-1"
                  >
                    <FloppyDisk size={14} />
                    저장
                  </button>
                </div>
                {currentIp && (
                  <button
                    type="button"
                    onClick={() => handleUseCurrentIp(setAllowedIp)}
                    className="mt-1.5 text-[11px] text-indigo-500 hover:text-indigo-700 font-bold underline underline-offset-2"
                  >
                    현재 IP를 사용하기
                  </button>
                )}
                {!allowedIp.trim() && profile.allowed_ip === null && (
                  <p className="mt-2 text-[11px] text-amber-500">IP가 설정되지 않으면 어디서든 출퇴근이 가능합니다.</p>
                )}
              </div>
            )}

            {/* 모드 2: 잠금 (변경 요청 필요) */}
            {isIpLocked && (
              <div className="space-y-3">
                <div className="px-3 py-2 rounded-xl bg-white border border-slate-100 text-sm text-slate-700 font-mono">
                  {profile.allowed_ip ?? "미설정"}
                </div>

                {pendingIpRequest ? (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-amber-700">승인 대기 중</p>
                        <p className="text-xs text-amber-600 mt-0.5 font-mono">요청 IP: {pendingIpRequest.requested_ip}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCancelIpRequest(pendingIpRequest.id)}
                        className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium"
                      >
                        <X size={12} />
                        요청 취소
                      </button>
                    </div>
                  </div>
                ) : showIpRequestForm ? (
                  <div className="space-y-2">
                    <div>
                      <input
                        type="text"
                        value={ipRequestIp}
                        onChange={(e) => setIpRequestIp(e.target.value)}
                        placeholder="새 IP 주소"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-100 focus:outline-none focus:border-indigo-400 text-sm text-slate-700 font-mono"
                      />
                      {currentIp && (
                        <button
                          type="button"
                          onClick={() => handleUseCurrentIp(setIpRequestIp)}
                          className="mt-1 text-[11px] text-indigo-500 hover:text-indigo-700 font-bold underline underline-offset-2"
                        >
                          현재 IP를 사용하기
                        </button>
                      )}
                    </div>
                    <textarea
                      value={ipRequestReason}
                      onChange={(e) => setIpRequestReason(e.target.value)}
                      placeholder="변경 사유 (선택)"
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-100 focus:outline-none focus:border-indigo-400 text-sm text-slate-700 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSubmitIpRequest}
                        disabled={ipRequestSaving || !ipRequestIp.trim()}
                        className="flex-1 py-2 rounded-xl bg-indigo-500 text-white font-bold text-xs hover:bg-indigo-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
                      >
                        <PaperPlaneTilt size={13} />
                        제출
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowIpRequestForm(false); setIpRequestReason(""); setIpRequestIp(""); }}
                        className="px-3 py-2 rounded-xl bg-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-300 transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowIpRequestForm(true)}
                    className="w-full py-2 rounded-xl border border-indigo-400 text-indigo-500 font-bold text-xs hover:bg-indigo-50 transition-colors"
                  >
                    변경 요청
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Password Change */}
        <form onSubmit={handlePasswordChange} className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100 space-y-4">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Key size={18} className="text-indigo-400" />
            비밀번호 변경
          </h3>
          <div className="space-y-3">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="새 비밀번호 (8자 이상)"
              className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-100 focus:outline-none focus:border-indigo-400 text-sm"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="새 비밀번호 확인"
              className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-100 focus:outline-none focus:border-indigo-400 text-sm"
            />
            <button
              type="submit"
              disabled={loading || !newPassword || !confirmPassword}
              className="w-full py-2.5 rounded-xl border border-indigo-400 text-indigo-500 font-bold text-sm hover:bg-indigo-50 transition-colors mt-2 disabled:opacity-40"
            >
              비밀번호 업데이트
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
