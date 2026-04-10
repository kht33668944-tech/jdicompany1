"use client";

import { useState, useEffect } from "react";
import { X, MagnifyingGlass, XCircle } from "phosphor-react";
import { toast } from "sonner";
import ModalContainer from "@/components/shared/ModalContainer";
import { createChannel, getAllProfiles } from "@/lib/chat/actions";
import type { Channel } from "@/lib/chat/types";

interface ChannelCreateModalProps {
  onClose: () => void;
  userId: string;
  onCreated: (channel: Channel) => void;
}

interface Profile {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  department: string | null;
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-rose-400", "bg-amber-400", "bg-teal-400",
  "bg-violet-400", "bg-emerald-500", "bg-indigo-500", "bg-orange-400",
];

function getAvatarColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export default function ChannelCreateModal({ onClose, userId, onCreated }: ChannelCreateModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  useEffect(() => {
    getAllProfiles()
      .then(setProfiles)
      .catch(() => toast.error("멤버 목록을 불러오지 못했습니다."))
      .finally(() => setLoadingProfiles(false));
  }, []);

  const otherProfiles = profiles.filter((p) => p.id !== userId);
  const filteredProfiles = otherProfiles.filter((p) =>
    p.full_name.includes(search) || (p.department && p.department.includes(search))
  );

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("채널 이름을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const channel = await createChannel({
        name: name.trim(),
        description: description.trim(),
        memberIds: Array.from(selectedIds),
        userId,
      });
      toast.success("채널이 생성되었습니다.");
      onCreated(channel);
      onClose();
    } catch (err) {
      console.error("채널 생성 실패:", err);
      toast.error("채널 생성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedProfiles = otherProfiles.filter((p) => selectedIds.has(p.id));

  return (
    <ModalContainer onClose={onClose} maxWidth="max-w-[480px]" className="!p-0 !rounded-[32px] overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">새 채널 만들기</h2>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
          <X size={24} />
        </button>
      </div>

      {/* Content */}
      <div className="px-8 pb-6 space-y-6 overflow-y-auto max-h-[60vh] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Channel Name */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 block">
            채널 이름 <span className="text-blue-600">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 2026 하반기 신규 프로젝트"
            className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm placeholder:text-slate-400"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 block">설명 (선택)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="채널에 대해 짧게 설명해주세요"
            className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm placeholder:text-slate-400"
          />
        </div>

        {/* Member Selection */}
        <div className="space-y-3">
          <label className="text-sm font-semibold text-slate-700 block">멤버 초대</label>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름 또는 직급 검색"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>

          {/* Selected Chips */}
          {selectedProfiles.length > 0 && (
            <div className="flex flex-wrap gap-2 py-1">
              {selectedProfiles.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 pl-1 pr-2 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100"
                >
                  {p.avatar_url ? (
                    <img
                      src={p.avatar_url}
                      alt={p.full_name}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className={`w-6 h-6 ${getAvatarColor(i)} rounded-full flex items-center justify-center text-[10px] text-white font-bold`}>
                      {p.full_name.charAt(0)}
                    </div>
                  )}
                  <span className="text-xs font-medium">{p.full_name}</span>
                  <button onClick={() => toggleMember(p.id)} className="hover:text-blue-900">
                    <XCircle size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Member List */}
          <div className="border border-slate-100 rounded-2xl max-h-[180px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="divide-y divide-slate-50">
              {filteredProfiles.map((p, i) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={() => toggleMember(p.id)}
                    className="w-5 h-5 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  {p.avatar_url ? (
                    <img
                      src={p.avatar_url}
                      alt={p.full_name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className={`w-10 h-10 ${getAvatarColor(i)} rounded-full flex items-center justify-center text-xs text-white font-bold`}>
                      {p.full_name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">{p.full_name}</div>
                    {p.department && (
                      <div className="text-xs text-slate-500">{p.department}</div>
                    )}
                  </div>
                </label>
              ))}
              {loadingProfiles && (
                <div className="px-4 py-6 text-center text-sm text-slate-400">멤버 목록 불러오는 중...</div>
              )}
              {!loadingProfiles && filteredProfiles.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-slate-400">검색 결과가 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-8 py-6 bg-slate-50 flex gap-3 border-t border-slate-100">
        <button
          onClick={onClose}
          disabled={submitting}
          className="flex-1 py-3.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          취소
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
          className="flex-[1.5] py-3.5 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50"
        >
          {submitting ? "생성 중..." : "채널 만들기"}
        </button>
      </div>
    </ModalContainer>
  );
}
