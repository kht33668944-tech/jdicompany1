"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EnvelopeSimple, CalendarCheck, Key, Lock, FloppyDisk } from "phosphor-react";
import { updatePassword, updateHireDate } from "@/lib/settings/actions";
import type { Profile } from "@/lib/attendance/types";

interface AccountSectionProps {
  profile: Profile;
}

export default function AccountSection({ profile }: AccountSectionProps) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [hireDateInput, setHireDateInput] = useState(profile.hire_date ?? "");
  const [hireDateSaving, setHireDateSaving] = useState(false);

  const handleHireDateSave = async () => {
    if (!hireDateInput) {
      setFeedback({ type: "error", message: "입사일을 선택해주세요." });
      return;
    }
    setHireDateSaving(true);
    setFeedback(null);
    try {
      await updateHireDate(profile.id, hireDateInput);
      setFeedback({ type: "success", message: "입사일이 저장되었습니다. 연차가 다시 계산됩니다." });
      router.refresh();
    } catch {
      setFeedback({ type: "error", message: "입사일 저장에 실패했습니다." });
    } finally {
      setHireDateSaving(false);
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

  return (
    <section className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 p-8">
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
