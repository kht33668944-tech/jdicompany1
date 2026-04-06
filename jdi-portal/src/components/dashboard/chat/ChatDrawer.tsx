"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Image as ImageIcon,
  File as FileIcon,
  Link as LinkIcon,
  DownloadSimple,
  CheckCircle,
  Circle,
  ArrowLeft,
  ArrowRight,
} from "phosphor-react";
import { toast } from "sonner";
import { getDrawerItems, getChatFileUrl, type DrawerItem } from "@/lib/chat/actions";
import { formatFileSize, parseFileContent } from "@/lib/chat/utils";

type Tab = "images" | "files" | "links";

interface ChatDrawerProps {
  open: boolean;
  channelId: string;
  channelName: string;
  onClose: () => void;
}

/** 월별 그룹핑 */
function groupByMonth(items: DrawerItem[]): { month: string; items: DrawerItem[] }[] {
  const map = new Map<string, DrawerItem[]>();
  for (const item of items) {
    const d = new Date(item.created_at);
    const key = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([month, items]) => ({ month, items }));
}

/** 날짜별 그룹핑 */
function groupByDate(items: DrawerItem[]): { date: string; items: DrawerItem[] }[] {
  const map = new Map<string, DrawerItem[]>();
  for (const item of items) {
    const d = new Date(item.created_at);
    const key = d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
}

// ============================================
// 이미지 뷰어 (전체화면 오버레이)
// ============================================
function ImageViewer({
  images,
  currentIndex,
  onClose,
  onNavigate,
}: {
  images: { url: string; name: string }[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const current = images[currentIndex];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentIndex > 0) onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && currentIndex < images.length - 1) onNavigate(currentIndex + 1);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [currentIndex, images.length, onClose, onNavigate]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center" onClick={onClose}>
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 h-16 flex items-center justify-between px-6 z-10">
        <span className="text-white/70 text-sm">{current.name} ({currentIndex + 1}/{images.length})</span>
        <div className="flex items-center gap-2">
          <a
            href={current.url}
            download={current.name}
            onClick={(e) => e.stopPropagation()}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <DownloadSimple size={20} />
          </a>
          <button onClick={onClose} className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Image */}
      <img
        src={current.url}
        alt={current.name}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg"
      />

      {/* Navigation */}
      {currentIndex > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex - 1); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
      )}
      {currentIndex < images.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex + 1); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
        >
          <ArrowRight size={24} />
        </button>
      )}
    </div>
  );
}

// ============================================
// 서랍 이미지 그리드 아이템
// ============================================
function DrawerImageItem({
  item,
  selecting,
  selected,
  onToggleSelect,
  onView,
  onUrlReady,
}: {
  item: DrawerItem;
  selecting: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onView: () => void;
  onUrlReady: (id: string, url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const fileData = parseFileContent(item.content);

  useEffect(() => {
    if (!fileData) return;
    getChatFileUrl(fileData.path).then((u) => {
      if (u) {
        setUrl(u);
        onUrlReady(item.id, u);
      }
    }).catch(() => {});
  }, [item.id]);

  if (!url) {
    return <div className="aspect-square bg-slate-100 rounded-xl animate-pulse" />;
  }

  return (
    <div className="relative group cursor-pointer" onClick={selecting ? onToggleSelect : onView}>
      <img src={url} alt={fileData?.name ?? ""} className="aspect-square object-cover rounded-xl w-full" />
      {/* Hover overlay */}
      <div className={`absolute inset-0 rounded-xl transition-all ${
        selected ? "bg-blue-600/20 ring-2 ring-blue-500" : "group-hover:bg-black/10"
      }`} />
      {/* Select checkbox */}
      {selecting && (
        <div className="absolute top-2 right-2">
          {selected ? (
            <CheckCircle size={22} weight="fill" className="text-blue-500 bg-white rounded-full" />
          ) : (
            <Circle size={22} className="text-white/80 drop-shadow" />
          )}
        </div>
      )}
    </div>
  );
}

/** URL 추출 */
function extractUrls(text: string): string[] {
  const regex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  return text.match(regex) ?? [];
}

// ============================================
// 탭 설정
// ============================================
const TABS: { key: Tab; label: string; icon: typeof ImageIcon }[] = [
  { key: "images", label: "사진", icon: ImageIcon },
  { key: "files", label: "파일", icon: FileIcon },
  { key: "links", label: "링크", icon: LinkIcon },
];

// ============================================
// 메인 서랍 컴포넌트
// ============================================
export default function ChatDrawer({ open, channelId, channelName, onClose }: ChatDrawerProps) {
  const [tab, setTab] = useState<Tab>("images");
  const [items, setItems] = useState<DrawerItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 선택 모드
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 이미지 뷰어
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [urlMap, setUrlMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelecting(false);
    setSelectedIds(new Set());
    getDrawerItems(channelId, tab)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open, channelId, tab]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  const handleUrlReady = useCallback((id: string, url: string) => {
    setUrlMap((prev) => {
      const next = new Map(prev);
      next.set(id, url);
      return next;
    });
  }, []);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDownloadSelected() {
    let downloaded = 0;
    for (const id of selectedIds) {
      const url = urlMap.get(id);
      if (!url) continue;
      const item = items.find((i) => i.id === id);
      const fileData = item ? parseFileContent(item.content) : null;
      const link = document.createElement("a");
      link.href = url;
      link.download = fileData?.name ?? "download";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      downloaded++;
    }
    if (downloaded > 0) {
      toast.success(`${downloaded}개 파일 다운로드 시작`);
      setSelecting(false);
      setSelectedIds(new Set());
    }
  }

  // 이미지 뷰어용 데이터
  const imageItems = tab === "images" ? items : [];
  const viewerImages = imageItems
    .map((item) => {
      const url = urlMap.get(item.id);
      const fileData = parseFileContent(item.content);
      return url && fileData ? { url, name: fileData.name } : null;
    })
    .filter((x): x is { url: string; name: string } => x !== null);

  const monthGroups = groupByMonth(items);
  const dateGroups = groupByDate(items);

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
        className={`fixed top-0 right-0 h-full z-50 w-full max-w-[420px] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-full bg-white border-l border-slate-100 shadow-[-10px_0_30px_-5px_rgba(0,0,0,0.05)] flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-slate-100 flex-shrink-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-slate-900">채팅방 서랍</h3>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">{channelName}</p>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => { setTab(t.key); setSelecting(false); setSelectedIds(new Set()); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                      active
                        ? "bg-white text-blue-600 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Icon size={14} weight={active ? "fill" : "regular"} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Select mode toolbar */}
          {tab === "images" && items.length > 0 && (
            <div className="px-6 py-2 border-b border-slate-50 flex items-center justify-between flex-shrink-0">
              {selecting ? (
                <>
                  <span className="text-xs text-slate-500">{selectedIds.size}개 선택됨</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDownloadSelected}
                      disabled={selectedIds.size === 0}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 disabled:opacity-40 px-3 py-1.5 bg-blue-50 rounded-lg transition-colors"
                    >
                      <DownloadSimple size={14} className="inline mr-1" />
                      다운로드
                    </button>
                    <button
                      onClick={() => { setSelecting(false); setSelectedIds(new Set()); }}
                      className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1.5"
                    >
                      취소
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-xs text-slate-400">{items.length}개</span>
                  <button
                    onClick={() => setSelecting(true)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1"
                  >
                    선택
                  </button>
                </>
              )}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 bg-slate-50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                {tab === "images" && <ImageIcon size={32} className="mb-2" />}
                {tab === "files" && <FileIcon size={32} className="mb-2" />}
                {tab === "links" && <LinkIcon size={32} className="mb-2" />}
                <p className="text-sm">
                  {tab === "images" && "공유된 사진이 없습니다"}
                  {tab === "files" && "공유된 파일이 없습니다"}
                  {tab === "links" && "공유된 링크가 없습니다"}
                </p>
              </div>
            ) : tab === "images" ? (
              /* 사진 - 월별 그룹 + 3열 그리드 */
              <div className="p-4 space-y-5">
                {monthGroups.map((group) => (
                  <div key={group.month}>
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-xs font-bold text-slate-500">{group.month}</span>
                      <span className="text-[10px] text-slate-400">{group.items.length}장</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {group.items.map((item) => {
                        const globalIndex = items.indexOf(item);
                        return (
                          <DrawerImageItem
                            key={item.id}
                            item={item}
                            selecting={selecting}
                            selected={selectedIds.has(item.id)}
                            onToggleSelect={() => toggleSelect(item.id)}
                            onView={() => setViewerIndex(globalIndex)}
                            onUrlReady={handleUrlReady}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : tab === "files" ? (
              /* 파일 - 날짜별 그룹 */
              <div className="p-4 space-y-4">
                {dateGroups.map((group) => (
                  <div key={group.date}>
                    <p className="text-[11px] font-bold text-slate-400 mb-2 px-1">{group.date}</p>
                    <div className="space-y-1">
                      {group.items.map((item) => {
                        const fileData = parseFileContent(item.content);
                        return (
                          <FileItem key={item.id} item={item} fileData={fileData} />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* 링크 - 날짜별 그룹 */
              <div className="p-4 space-y-4">
                {dateGroups.map((group) => (
                  <div key={group.date}>
                    <p className="text-[11px] font-bold text-slate-400 mb-2 px-1">{group.date}</p>
                    <div className="space-y-1">
                      {group.items.map((item) => {
                        const urls = extractUrls(item.content);
                        return urls.map((url, i) => (
                          <a
                            key={`${item.id}-${i}`}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-xl transition-colors group"
                          >
                            <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                              <LinkIcon size={16} className="text-blue-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-blue-600 group-hover:underline truncate">{url}</p>
                              <span className="text-[10px] text-slate-400">{item.user_name}</span>
                            </div>
                          </a>
                        ));
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image Viewer */}
      {viewerIndex !== null && viewerImages.length > 0 && (
        <ImageViewer
          images={viewerImages}
          currentIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onNavigate={setViewerIndex}
        />
      )}
    </>
  );
}

// ============================================
// 파일 아이템 (서랍용)
// ============================================
function FileItem({ item, fileData }: { item: DrawerItem; fileData: { path: string; name: string; size: number; type: string } | null }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!fileData) return;
    getChatFileUrl(fileData.path).then(setUrl).catch(() => {});
  }, [item.id]);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-xl transition-colors">
      <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
        <FileIcon size={16} className="text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">{fileData?.name ?? "파일"}</p>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <span>{fileData ? formatFileSize(fileData.size) : ""}</span>
          <span>·</span>
          <span>{item.user_name}</span>
        </div>
      </div>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-slate-200 rounded-lg transition-colors flex-shrink-0">
          <DownloadSimple size={16} className="text-slate-500" />
        </a>
      )}
    </div>
  );
}
