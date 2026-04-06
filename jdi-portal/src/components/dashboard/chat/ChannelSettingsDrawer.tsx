"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  PencilSimple,
  UserPlus,
  SignOut,
  Trash,
  DotsThreeOutlineVertical,
  BellSlash,
  Star,
} from "phosphor-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  updateChannel,
  deleteChannel,
  addMembers,
  removeMember,
  leaveChannel,
  getAllProfiles,
  toggleMute,
  toggleFavorite,
} from "@/lib/chat/actions";
import { getChannelById } from "@/lib/chat/queries";
import type { ChannelWithDetails, ChannelMember } from "@/lib/chat/types";

interface ChannelSettingsDrawerProps {
  open: boolean;
  channel: ChannelWithDetails;
  userId: string;
  userName: string;
  onClose: () => void;
  onChannelUpdated: (channel: ChannelWithDetails) => void;
  onChannelDeleted: () => void;
  onLeft: () => void;
  onMuteToggled?: (channelId: string, muted: boolean) => void;
  onFavoriteToggled?: (channelId: string, favorite: boolean) => void;
  onlineUsers?: Set<string>;
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-600",
  "bg-orange-100 text-orange-600",
  "bg-emerald-100 text-emerald-600",
  "bg-slate-100 text-slate-500",
  "bg-violet-100 text-violet-600",
  "bg-amber-100 text-amber-600",
  "bg-rose-100 text-rose-600",
  "bg-teal-100 text-teal-600",
];

function getMemberColor(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export default function ChannelSettingsDrawer({
  open,
  channel,
  userId,
  userName,
  onClose,
  onChannelUpdated,
  onChannelDeleted,
  onLeft,
  onMuteToggled,
  onFavoriteToggled,
  onlineUsers = new Set(),
}: ChannelSettingsDrawerProps) {
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description);
  const [showInvite, setShowInvite] = useState(false);
  const [menuMemberId, setMenuMemberId] = useState<string | null>(null);
  const [allProfiles, setAllProfiles] = useState<{ id: string; full_name: string; avatar_url: string | null; department: string | null }[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  const isOwner = channel.created_by === userId;
  const isTwoPersonChannel = channel.member_count === 2;
  const isMemo = channel.type === "memo";

  useEffect(() => {
    setName(channel.name);
    setDescription(channel.description);
    setShowInvite(false);
    setMenuMemberId(null);
  }, [channel]);

  // 음소거 상태 로드
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      try {
        const { data } = await supabase
          .from("channel_members")
          .select("is_muted, is_favorite")
          .eq("channel_id", channel.id)
          .eq("user_id", userId)
          .single();
        setIsMuted(data?.is_muted ?? false);
        setIsFavorite(data?.is_favorite ?? false);
      } catch { /* ignore */ }
    })();
  }, [channel.id, userId]);

  async function handleToggleMute() {
    try {
      const newMuted = await toggleMute(channel.id);
      setIsMuted(newMuted);
      onMuteToggled?.(channel.id, newMuted);
      toast.success(newMuted ? "알림이 음소거되었습니다." : "알림 음소거가 해제되었습니다.");
    } catch {
      toast.error("음소거 설정에 실패했습니다.");
    }
  }

  async function handleToggleFavorite() {
    try {
      const newFav = await toggleFavorite(channel.id);
      setIsFavorite(newFav);
      onFavoriteToggled?.(channel.id, newFav);
      toast.success(newFav ? "즐겨찾기에 추가되었습니다." : "즐겨찾기에서 제거되었습니다.");
    } catch {
      toast.error("즐겨찾기 설정에 실패했습니다.");
    }
  }

  // 드로어 열릴 때 멤버 목록 로드
  useEffect(() => {
    if (!open) return;
    if (channel.members.length > 0) return; // 이미 멤버가 있으면 스킵
    const supabase = createClient();
    getChannelById(supabase, channel.id).then((full) => {
      if (full && full.members.length > 0) {
        onChannelUpdated({ ...channel, members: full.members, member_count: full.member_count });
      }
    }).catch(() => {});
  }, [open, channel.id]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  const savingNameRef = useRef(false);
  async function handleSaveName() {
    if (savingNameRef.current) return;
    if (!name.trim() || name === channel.name) {
      setEditingName(false);
      return;
    }
    savingNameRef.current = true;
    try {
      await updateChannel(channel.id, { name: name.trim() });
      onChannelUpdated({ ...channel, name: name.trim() });
      setEditingName(false);
      toast.success("채널 이름이 변경되었습니다.");
    } catch {
      toast.error("변경에 실패했습니다.");
    } finally {
      savingNameRef.current = false;
    }
  }

  async function handleSaveDesc() {
    if (description === channel.description) {
      setEditingDesc(false);
      return;
    }
    try {
      await updateChannel(channel.id, { description: description.trim() });
      onChannelUpdated({ ...channel, description: description.trim() });
      setEditingDesc(false);
      toast.success("채널 설명이 변경되었습니다.");
    } catch {
      toast.error("변경에 실패했습니다.");
    }
  }

  async function handleRemoveMember(member: ChannelMember) {
    const memberName = member.profile?.full_name ?? "멤버";
    if (!confirm(`${memberName}님을 내보내시겠습니까?`)) return;
    try {
      await removeMember(channel.id, member.user_id, memberName, userName);
      onChannelUpdated({
        ...channel,
        members: channel.members.filter((m) => m.user_id !== member.user_id),
        member_count: channel.member_count - 1,
      });
      toast.success(`${memberName}님을 내보냈습니다.`);
      setMenuMemberId(null);
    } catch {
      toast.error("내보내기에 실패했습니다.");
    }
  }

  async function handleLeave() {
    if (!confirm("채널을 나가시겠습니까?")) return;
    try {
      await leaveChannel(channel.id, userId, userName);
      toast.success("채널을 나갔습니다.");
      onLeft();
    } catch {
      toast.error("나가기에 실패했습니다.");
    }
  }

  async function handleDelete() {
    if (!confirm("채널을 삭제하시겠습니까?\n모든 메시지와 파일이 영구적으로 제거됩니다.")) return;
    try {
      await deleteChannel(channel.id);
      toast.success("채널이 삭제되었습니다.");
      onChannelDeleted();
    } catch {
      toast.error("삭제에 실패했습니다.");
    }
  }

  async function handleInvite() {
    try {
      if (allProfiles.length === 0) {
        const data = await getAllProfiles();
        setAllProfiles(data);
      }
      setShowInvite(true);
    } catch {
      toast.error("멤버 목록을 불러오지 못했습니다.");
    }
  }

  // 멤버 메뉴 외부 클릭 닫기
  useEffect(() => {
    if (!menuMemberId) return;
    const handler = () => setMenuMemberId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [menuMemberId]);

  async function handleAddMember(profileId: string, profileName: string) {
    try {
      await addMembers(channel.id, [profileId], userName);
      const addedProfile = allProfiles.find((p) => p.id === profileId);
      const newMember: import("@/lib/chat/types").ChannelMember = {
        id: profileId,
        channel_id: channel.id,
        user_id: profileId,
        role: "member",
        last_read_at: new Date().toISOString(),
        joined_at: new Date().toISOString(),
        profile: addedProfile
          ? { full_name: addedProfile.full_name, avatar_url: addedProfile.avatar_url }
          : undefined,
      };
      onChannelUpdated({
        ...channel,
        members: [...channel.members, newMember],
        member_count: channel.member_count + 1,
      });
      toast.success(`${profileName}님을 초대했습니다.`);
      setShowInvite(false);
    } catch {
      toast.error("초대에 실패했습니다.");
    }
  }

  const existingMemberIds = new Set(channel.members.map((m) => m.user_id));
  const invitableProfiles = allProfiles.filter((p) => !existingMemberIds.has(p.id));

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/10 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full z-50 w-full max-w-[360px] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-full bg-white border-l border-slate-100 shadow-[-10px_0_30px_-5px_rgba(0,0,0,0.05)] flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              {editingName ? (
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                  autoFocus
                  className="text-lg font-bold text-slate-900 border-b-2 border-blue-500 outline-none bg-transparent"
                />
              ) : (
                <button onClick={() => setEditingName(true)} className="flex items-center gap-2 group cursor-pointer">
                  <h3 className="text-lg font-bold text-slate-900">{channel.name}</h3>
                  <PencilSimple size={16} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* Description */}
            <div className="p-6">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">채널 설명</label>
              {editingDesc ? (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={handleSaveDesc}
                  autoFocus
                  rows={3}
                  className="w-full text-sm text-slate-600 leading-relaxed border border-blue-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                />
              ) : (
                <div className="group relative">
                  <p className="text-sm text-slate-600 leading-relaxed pr-8">
                    {channel.description || "설명이 없습니다."}
                  </p>
                  <button
                    onClick={() => setEditingDesc(true)}
                    className="absolute top-0 right-0 p-1 text-slate-300 hover:text-blue-500 transition-colors"
                  >
                    <PencilSimple size={14} />
                  </button>
                </div>
              )}
            </div>

            <div className="mx-6 h-px bg-slate-100" />

            {/* Memo info — 멤버 섹션 대체 */}
            {isMemo && (
              <div className="p-6">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">사용 안내</label>
                <p className="text-sm text-slate-600 leading-relaxed">
                  나만의 메모는 본인만 사용할 수 있는 개인 공간입니다. 다른 사용자를 초대하거나 나갈 수 없습니다.
                </p>
              </div>
            )}

            {/* Members */}
            {!isMemo && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">멤버</span>
                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded">
                    {channel.members.length}
                  </span>
                </div>
                <button
                  onClick={handleInvite}
                  className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-xl transition-all"
                >
                  <UserPlus size={14} /> 초대하기
                </button>
              </div>

              {/* Invite Panel */}
              {showInvite && (
                <div className="mb-4 border border-blue-100 rounded-2xl p-3 bg-blue-50/30">
                  <div className="text-xs font-bold text-blue-600 mb-2">멤버 초대</div>
                  {invitableProfiles.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">초대할 수 있는 멤버가 없습니다.</p>
                  ) : (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {invitableProfiles.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleAddMember(p.id, p.full_name)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-blue-50 rounded-lg text-left transition-colors"
                        >
                          {p.avatar_url ? (
                            <img
                              src={p.avatar_url}
                              alt={p.full_name}
                              className="w-7 h-7 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xs font-bold">
                              {p.full_name.charAt(0)}
                            </div>
                          )}
                          <span className="text-xs font-medium text-slate-700">{p.full_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setShowInvite(false)}
                    className="mt-2 text-[10px] text-slate-400 hover:text-slate-600"
                  >
                    닫기
                  </button>
                </div>
              )}

              {/* Member List */}
              <div className="space-y-4">
                {channel.members.map((member, i) => {
                  const isMe = member.user_id === userId;
                  const isOnline = onlineUsers.has(member.user_id);
                  return (
                    <div key={member.id} className="flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {member.profile?.avatar_url ? (
                            <img
                              src={member.profile.avatar_url}
                              alt={member.profile.full_name ?? ""}
                              className="w-10 h-10 rounded-2xl object-cover"
                            />
                          ) : (
                            <div className={`w-10 h-10 rounded-2xl ${getMemberColor(i)} flex items-center justify-center font-bold`}>
                              {member.profile?.full_name?.charAt(0) ?? "?"}
                            </div>
                          )}
                          {isOnline && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-800">
                              {member.profile?.full_name ?? "알 수 없음"}
                            </span>
                            {isMe && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-500 rounded font-bold">나</span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {member.role === "owner" ? "소유자" : "멤버"}
                          </span>
                        </div>
                      </div>

                      {/* Actions - 2명 채널이면 내보내기 불가 */}
                      {!isMe && !isTwoPersonChannel && (
                        <div className="relative">
                          <button
                            onClick={(e) => { e.stopPropagation(); setMenuMemberId(menuMemberId === member.user_id ? null : member.user_id); }}
                            className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-all"
                          >
                            <DotsThreeOutlineVertical size={16} weight="fill" />
                          </button>
                          {menuMemberId === member.user_id && (
                            <div className="absolute right-0 top-10 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-10 w-28">
                              <button
                                onClick={() => handleRemoveMember(member)}
                                className="w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 font-medium"
                              >
                                내보내기
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            )}

            <div className="mx-6 h-px bg-slate-100" />

            {/* 즐겨찾기 / 알림 설정 */}
            <div className="p-6 space-y-3">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 block">채널 설정</label>
              <button
                onClick={handleToggleFavorite}
                className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all border border-slate-100"
              >
                <div className="flex items-center gap-3">
                  <Star size={20} weight={isFavorite ? "fill" : "regular"} className={isFavorite ? "text-amber-400" : "text-slate-400"} />
                  <span className="text-sm font-semibold text-slate-700">즐겨찾기</span>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors ${isFavorite ? "bg-amber-400" : "bg-slate-300"}`}>
                  <div className={`w-5 h-5 bg-white rounded-full mt-0.5 transition-transform ${isFavorite ? "translate-x-4.5 ml-0.5" : "translate-x-0.5"}`} />
                </div>
              </button>
              <button
                onClick={handleToggleMute}
                className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-all border border-slate-100"
              >
                <div className="flex items-center gap-3">
                  <BellSlash size={20} className="text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700">알림 음소거</span>
                </div>
                <div className={`w-10 h-6 rounded-full transition-colors ${isMuted ? "bg-blue-600" : "bg-slate-300"}`}>
                  <div className={`w-5 h-5 bg-white rounded-full mt-0.5 transition-transform ${isMuted ? "translate-x-4.5 ml-0.5" : "translate-x-0.5"}`} />
                </div>
              </button>
            </div>

            {!isMemo && <div className="mx-6 h-px bg-slate-100" />}

            {/* Danger Zone — memo 채널은 표시하지 않음 */}
            {!isMemo && (
            <div className="p-6 space-y-4">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">위험 영역</label>

              {/* Leave - 2명 채널이면 비활성화 */}
              {!isTwoPersonChannel && (
                <button
                  onClick={handleLeave}
                  className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-red-50 group rounded-2xl transition-all border border-slate-100 hover:border-red-100"
                >
                  <div className="flex items-center gap-3">
                    <SignOut size={20} className="text-slate-400 group-hover:text-red-500" />
                    <span className="text-sm font-semibold text-slate-700 group-hover:text-red-600">채널 나가기</span>
                  </div>
                </button>
              )}

              {/* Delete - 생성자만 */}
              {isOwner && (
                <>
                  <button
                    onClick={handleDelete}
                    className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-red-100 flex items-center justify-center gap-2 transition-all"
                  >
                    <Trash size={18} /> 채널 삭제하기
                  </button>
                  <p className="text-[11px] text-slate-400 text-center px-4 leading-normal">
                    채널을 삭제하면 모든 메시지와 파일이 영구적으로 제거되며 복구할 수 없습니다.
                  </p>
                </>
              )}
            </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
