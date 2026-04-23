"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Camera, CheckCircle } from "phosphor-react";
import { updateProfile, uploadAvatar } from "@/lib/settings/actions";
import { resizeImageIfNeeded } from "@/lib/utils/imageResize";
import type { Profile } from "@/lib/attendance/types";

interface ProfileSectionProps {
  profile: Profile;
  onUpdated: () => void;
}

export default function ProfileSection({ profile, onUpdated }: ProfileSectionProps) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [department, setDepartment] = useState(profile.department);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url ?? null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setFeedback(null);
    try {
      const processed = await resizeImageIfNeeded(file, { maxDim: 512, quality: 0.85 });
      const fd = new FormData();
      fd.append("file", processed);
      const url = await uploadAvatar(fd);
      setAvatarPreview(url);
      setFeedback({ type: "success", message: "프로필 사진이 업데이트되었습니다." });
      onUpdated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "사진 업로드에 실패했습니다.";
      setFeedback({ type: "error", message: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;

    setLoading(true);
    setFeedback(null);
    try {
      await updateProfile({
        fullName: fullName.trim(),
        department: department.trim(),
        phone: phone.trim(),
        bio: bio.trim(),
      });
      setFeedback({ type: "success", message: "프로필이 저장되었습니다." });
      onUpdated();
    } catch {
      setFeedback({ type: "error", message: "프로필 저장에 실패했습니다." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-50 p-8">
      <div className="mb-8">
        <h2 className="text-lg font-bold text-slate-800">프로필 설정</h2>
        <p className="text-xs text-slate-400 mt-1">회사 내에서 표시될 개인 정보를 관리합니다.</p>
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

      <form onSubmit={handleSubmit}>
        <div className="flex flex-col md:flex-row gap-12">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              {avatarPreview ? (
                <Image
                  src={avatarPreview}
                  alt="프로필 사진"
                  width={128}
                  height={128}
                  className="w-32 h-32 rounded-full object-cover shadow-inner"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-brand-500 to-indigo-500 flex items-center justify-center text-white text-4xl font-bold shadow-inner">
                  {fullName.charAt(0).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="absolute bottom-0 right-0 w-10 h-10 bg-white rounded-full border border-slate-100 shadow-md flex items-center justify-center text-slate-500 hover:text-brand-600 transition-colors disabled:opacity-40"
              >
                <Camera size={20} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
            <p className="text-xs text-slate-400 text-center">
              권장 사이즈: 200x200<br />JPG, PNG, WebP 파일
            </p>
          </div>

          {/* Form Fields */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 ml-1">이름</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none focus:border-indigo-400 transition-colors text-sm"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 ml-1">부서</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none focus:border-indigo-400 transition-colors text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 ml-1">연락처</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-1234-5678"
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none focus:border-indigo-400 transition-colors text-sm"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-slate-500 ml-1">자기소개</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="자신을 한 줄로 소개해주세요."
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none focus:border-indigo-400 transition-colors text-sm h-24 resize-none"
              />
            </div>
            <div className="md:col-span-2 flex justify-end mt-2">
              <button
                type="submit"
                disabled={loading || !fullName.trim()}
                className="px-8 py-3 rounded-xl text-white text-sm font-bold bg-gradient-to-r from-indigo-400 to-indigo-500 shadow-lg shadow-indigo-100 flex items-center gap-2 hover:from-indigo-500 hover:to-indigo-600 transition-all disabled:opacity-40"
              >
                <CheckCircle size={18} />
                변경사항 저장
              </button>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}
