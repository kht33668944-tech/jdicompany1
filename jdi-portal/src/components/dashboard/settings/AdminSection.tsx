"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { X, Plus } from "phosphor-react";
import { addDepartment, deleteDepartment, updateUserRole, approveUser, rejectUser } from "@/lib/settings/actions";
import type { Profile } from "@/lib/attendance/types";
import type { Department } from "@/lib/settings/types";

interface AdminSectionProps {
  profiles: Profile[];
  departments: Department[];
}

export default function AdminSection({ profiles, departments }: AdminSectionProps) {
  const router = useRouter();
  const [deptName, setDeptName] = useState("");
  const [showDeptInput, setShowDeptInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleAddDepartment = async () => {
    if (!deptName.trim()) return;
    setLoading(true);
    setFeedback(null);
    try {
      await addDepartment(deptName.trim());
      setDeptName("");
      setShowDeptInput(false);
      router.refresh();
    } catch {
      setFeedback({ type: "error", message: "부서 추가에 실패했습니다." });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDepartment = async (id: string) => {
    if (!confirm("이 부서를 삭제하시겠습니까?")) return;
    setLoading(true);
    try {
      await deleteDepartment(id);
      router.refresh();
    } catch {
      setFeedback({ type: "error", message: "부서 삭제에 실패했습니다." });
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, role: "employee" | "admin" | "developer") => {
    setLoading(true);
    setFeedback(null);
    try {
      await updateUserRole(userId, role);
      setFeedback({ type: "success", message: "권한이 변경되었습니다." });
      router.refresh();
    } catch {
      setFeedback({ type: "error", message: "권한 변경에 실패했습니다." });
    } finally {
      setLoading(false);
    }
  };

  const pendingProfiles = profiles.filter((p) => !p.is_approved);
  const approvedProfiles = profiles.filter((p) => p.is_approved);

  const handleApproveUser = async (userId: string) => {
    setLoading(true);
    setFeedback(null);
    try {
      await approveUser(userId);
      setFeedback({ type: "success", message: "사용자가 승인되었습니다." });
      router.refresh();
    } catch {
      setFeedback({ type: "error", message: "사용자 승인에 실패했습니다." });
    } finally {
      setLoading(false);
    }
  };

  const handleRejectUser = async (userId: string) => {
    if (!confirm("이 사용자의 가입 신청을 거절하시겠습니까? 계정이 삭제됩니다.")) return;
    setLoading(true);
    setFeedback(null);
    try {
      await rejectUser(userId);
      setFeedback({ type: "success", message: "가입 신청이 거절되었습니다." });
      router.refresh();
    } catch {
      setFeedback({ type: "error", message: "가입 거절에 실패했습니다." });
    } finally {
      setLoading(false);
    }
  };

  const avatarColors = ["bg-indigo-100 text-indigo-600", "bg-blue-100 text-blue-600", "bg-purple-100 text-purple-600", "bg-emerald-100 text-emerald-600", "bg-amber-100 text-amber-600"];

  return (
    <section className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-800">관리자 설정</h2>
            <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-500 text-[10px] font-bold uppercase border border-red-100">
              Admin Only
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">부서 및 직원 계정의 권한을 관리합니다.</p>
        </div>
        <button
          onClick={() => setShowDeptInput(true)}
          className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 border border-slate-200 hover:bg-slate-50"
        >
          부서 추가
        </button>
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

      {/* Department Tags */}
      <div className="mb-8">
        <h3 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">부서 목록</h3>
        <div className="flex flex-wrap gap-2">
          {departments.map((dept) => (
            <div
              key={dept.id}
              className="px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 text-xs font-medium text-slate-600 flex items-center gap-2"
            >
              {dept.name}
              <button
                onClick={() => handleDeleteDepartment(dept.id)}
                disabled={loading}
                className="hover:text-red-400 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {showDeptInput && (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddDepartment()}
                placeholder="부서명"
                className="px-3 py-1.5 rounded-full bg-white border border-indigo-200 text-xs outline-none w-28"
                autoFocus
              />
              <button
                onClick={handleAddDepartment}
                disabled={loading || !deptName.trim()}
                className="p-1 rounded-full bg-indigo-500 text-white disabled:opacity-40"
              >
                <Plus size={12} />
              </button>
              <button
                onClick={() => { setShowDeptInput(false); setDeptName(""); }}
                className="p-1 rounded-full bg-slate-200 text-slate-500"
              >
                <X size={12} />
              </button>
            </div>
          )}
          {departments.length === 0 && !showDeptInput && (
            <p className="text-xs text-slate-400">등록된 부서가 없습니다.</p>
          )}
        </div>
      </div>

      {/* Pending Users */}
      {pendingProfiles.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">
            승인 대기 ({pendingProfiles.length})
          </h3>
          <div className="space-y-2">
            {pendingProfiles.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-amber-50/50 border border-amber-100"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${avatarColors[i % avatarColors.length]}`}>
                    {p.full_name.charAt(0)}
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-700">{p.full_name}</span>
                    <p className="text-xs text-slate-400">{p.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApproveUser(p.id)}
                    disabled={loading}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                  >
                    승인
                  </button>
                  <button
                    onClick={() => handleRejectUser(p.id)}
                    disabled={loading}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition-colors"
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Employee Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-50">
              <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-wider px-2">직원명</th>
              <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-wider px-2">이메일</th>
              <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-wider px-2">부서</th>
              <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-wider px-2">권한</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {approvedProfiles.map((p, i) => (
              <tr key={p.id}>
                <td className="py-4 px-2">
                  <div className="flex items-center gap-3">
                    {p.avatar_url ? (
                      <Image src={p.avatar_url} alt="" width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${avatarColors[i % avatarColors.length]}`}>
                        {p.full_name.charAt(0)}
                      </div>
                    )}
                    <span className="text-sm font-bold text-slate-700">{p.full_name}</span>
                  </div>
                </td>
                <td className="py-4 px-2 text-sm text-slate-500">{p.email}</td>
                <td className="py-4 px-2 text-sm text-slate-500">{p.department}</td>
                <td className="py-4 px-2">
                  <select
                    value={p.role}
                    onChange={(e) => handleRoleChange(p.id, e.target.value as "employee" | "admin" | "developer")}
                    disabled={loading}
                    className="text-xs bg-slate-50 border-none rounded-lg px-2 py-1 focus:ring-0 cursor-pointer font-medium"
                  >
                    <option value="admin">관리자</option>
                    <option value="developer">개발자</option>
                    <option value="employee">사용자</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
