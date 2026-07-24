"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Corporation, VaultDocument, VaultDocumentVersion } from "@/lib/vault/types";
import {
  createCorporation,
  renameCorporation,
  deleteCorporation,
  deleteDocument,
  revertVersion,
  listDocumentVersions,
} from "@/lib/vault/actions";
import { getVaultSignedUrl, getVaultSignedUrls } from "@/lib/vault/storage";
import { CORP_COLORS } from "@/lib/vault/constants";
import { triggerDownload, triggerDownloadAll } from "@/lib/utils/download";
import { formatFileSize } from "@/lib/chat/utils";
import Select from "@/components/shared/Select";
import DocumentFormModal from "./DocumentFormModal";
import ReplaceFileModal from "./ReplaceFileModal";
import FilePreviewModal from "./FilePreviewModal";

type SortKey = "updated" | "title" | "category";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return iso.slice(0, 10);
  }
}

interface Props {
  corporations: Corporation[];
  documents: VaultDocument[];
  isAdmin: boolean;
  onChanged: () => void;
}

export default function DocumentsTab({ corporations, documents, isAdmin, onChanged }: Props) {
  const [corpId, setCorpId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<VaultDocument | null>(null);
  const [replaceDoc, setReplaceDoc] = useState<VaultDocument | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [versions, setVersions] = useState<VaultDocumentVersion[]>([]);
  const [previewDoc, setPreviewDoc] = useState<VaultDocument | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // 서류에 실제로 쓰인 종류 목록 (필터 선택지)
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const d of documents) if (d.category) set.add(d.category);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [documents]);

  const countByCorp = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of documents) m.set(d.corporation_id, (m.get(d.corporation_id) ?? 0) + 1);
    return m;
  }, [documents]);

  // 법인별 색상·이름 (순서대로 팔레트 배정 — 법인마다 다른 색)
  const corpMeta = useMemo(() => {
    const m = new Map<string, { color: string; name: string }>();
    corporations.forEach((c, i) => m.set(c.id, { color: CORP_COLORS[i % CORP_COLORS.length], name: c.name }));
    return m;
  }, [corporations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = documents.filter((d) => {
      if (corpId !== "all" && d.corporation_id !== corpId) return false;
      if (categoryFilter !== "all" && (d.category ?? "") !== categoryFilter) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        (d.category ?? "").toLowerCase().includes(q) ||
        (d.file_name ?? "").toLowerCase().includes(q) ||
        (d.note ?? "").toLowerCase().includes(q)
      );
    });
    return list.sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title, "ko");
      if (sortBy === "category") return (a.category ?? "").localeCompare(b.category ?? "", "ko");
      return b.updated_at.localeCompare(a.updated_at); // 최신화순(최신 먼저)
    });
  }, [documents, corpId, search, categoryFilter, sortBy]);

  const toggleSel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddCorp = async () => {
    const name = window.prompt("법인 이름을 입력하세요 (예: 제이디컴퍼니(주))");
    if (!name?.trim()) return;
    try {
      await createCorporation(name.trim());
      toast.success("법인이 추가되었습니다.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "법인 추가 실패");
    }
  };

  const handleRenameCorp = async () => {
    const corp = corporations.find((c) => c.id === corpId);
    if (!corp) return;
    const name = window.prompt("법인 이름 변경", corp.name);
    if (!name?.trim() || name.trim() === corp.name) return;
    try {
      await renameCorporation(corp.id, name.trim());
      toast.success("이름이 변경되었습니다.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "이름 변경 실패");
    }
  };

  const handleDeleteCorp = async () => {
    const corp = corporations.find((c) => c.id === corpId);
    if (!corp) return;
    if (!window.confirm(`법인 '${corp.name}' 을(를) 삭제할까요?`)) return;
    try {
      await deleteCorporation(corp.id);
      toast.success("법인이 삭제되었습니다.");
      setCorpId("all");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "법인 삭제 실패");
    }
  };

  const handleDownload = async (doc: VaultDocument) => {
    if (!doc.current_storage_path) {
      toast.error("다운로드할 파일이 없습니다.");
      return;
    }
    try {
      const url = await getVaultSignedUrl(doc.current_storage_path);
      if (url) triggerDownload(url, doc.file_name ?? undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "다운로드 실패");
    }
  };

  const handleBulkDownload = async () => {
    const docs = filtered.filter((d) => selected.has(d.id) && d.current_storage_path);
    if (docs.length === 0) {
      toast.error("다운로드할 서류를 선택하세요.");
      return;
    }
    setBusy(true);
    try {
      const nameByPath = new Map(docs.map((d) => [d.current_storage_path as string, d.file_name ?? undefined]));
      const urls = await getVaultSignedUrls(docs.map((d) => d.current_storage_path as string));
      await triggerDownloadAll(urls.map((u) => ({ url: u.url, fileName: nameByPath.get(u.path) })));
      toast.success(`${docs.length}개 다운로드를 시작했습니다.`);
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "다운로드 실패");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDoc = async (doc: VaultDocument) => {
    if (!window.confirm(`'${doc.title}' 서류를 삭제할까요? 모든 버전이 사라집니다.`)) return;
    try {
      await deleteDocument(doc.id);
      toast.success("서류가 삭제되었습니다.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    }
  };

  const toggleHistory = async (doc: VaultDocument) => {
    if (expanded === doc.id) {
      setExpanded(null);
      return;
    }
    setExpanded(doc.id);
    setVersions([]);
    try {
      const list = await listDocumentVersions(doc.id);
      setVersions(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "이력 불러오기 실패");
    }
  };

  const handleRevert = async (doc: VaultDocument, versionId: string) => {
    if (!window.confirm("이 버전으로 되돌릴까요?")) return;
    try {
      await revertVersion(doc.id, versionId);
      toast.success("되돌렸습니다.");
      setExpanded(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "되돌리기 실패");
    }
  };

  const handleVersionDownload = async (v: VaultDocumentVersion) => {
    try {
      const url = await getVaultSignedUrl(v.storage_path);
      if (url) triggerDownload(url, v.file_name ?? undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "다운로드 실패");
    }
  };

  const pillCls = (active: boolean) =>
    `flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold border transition-colors ${
      active ? "bg-brand-50 border-brand-500 text-brand-600" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
    }`;

  return (
    <div className="space-y-4">
      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5">
          <span className="text-slate-400">🔎</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="서류 검색 — 제목·종류·파일명"
            className="w-full text-sm bg-transparent outline-none text-slate-800"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setEditDoc(null);
            setFormOpen(true);
          }}
          className="px-4 py-2.5 rounded-xl bg-[#2563eb] text-white text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
        >
          ＋ 서류 올리기
        </button>
      </div>

      {/* 법인 폴더 pill */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setCorpId("all")} className={pillCls(corpId === "all")}>
          전체 <span className="text-xs text-slate-400">{documents.length}</span>
        </button>
        {corporations.map((c) => (
          <button key={c.id} type="button" onClick={() => setCorpId(c.id)} className={pillCls(corpId === c.id)}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: corpMeta.get(c.id)?.color }} />
            {c.name} <span className="text-xs text-slate-400">{countByCorp.get(c.id) ?? 0}</span>
          </button>
        ))}
        <button type="button" onClick={handleAddCorp} className="rounded-xl px-3.5 py-2 text-sm font-semibold border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50">
          ＋ 법인 추가
        </button>
        {corpId !== "all" && (
          <>
            <button type="button" onClick={handleRenameCorp} className="text-xs text-slate-500 hover:text-brand-600 px-2 py-1">
              ✎ 이름변경
            </button>
            {isAdmin && (
              <button type="button" onClick={handleDeleteCorp} className="text-xs text-slate-500 hover:text-red-600 px-2 py-1">
                🗑 법인삭제
              </button>
            )}
          </>
        )}
      </div>

      {/* 정렬 · 종류 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-400">정렬·필터</span>
        <Select
          options={[{ value: "all", label: "모든 종류" }, ...categories.map((c) => ({ value: c, label: c }))]}
          value={categoryFilter}
          onChange={setCategoryFilter}
          ariaLabel="종류 필터"
          className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm min-w-[140px]"
        />
        <Select
          options={[
            { value: "updated", label: "최신화순" },
            { value: "title", label: "이름순" },
            { value: "category", label: "종류순" },
          ]}
          value={sortBy}
          onChange={(v) => setSortBy(v as SortKey)}
          ariaLabel="정렬 기준"
          className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm min-w-[120px]"
        />
      </div>

      {/* 서류 리스트 */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">서류가 없습니다. ‘＋ 서류 올리기’로 추가하세요.</div>
        ) : (
          filtered.map((d) => (
            <div key={d.id} className="border-t border-slate-100 first:border-t-0">
              <div
                className="flex items-center gap-3 pl-3 pr-4 py-3.5 hover:bg-slate-50/60 border-l-4"
                style={{ borderLeftColor: corpMeta.get(d.corporation_id)?.color ?? "#94a3b8" }}
              >
                <button
                  type="button"
                  onClick={() => toggleSel(d.id)}
                  className={`w-5 h-5 shrink-0 rounded-md border grid place-items-center text-[11px] font-black ${
                    selected.has(d.id) ? "bg-brand-600 border-brand-600 text-white" : "border-slate-300 text-transparent"
                  }`}
                  aria-label="선택"
                >
                  ✓
                </button>
                <div className="w-9 h-10 shrink-0 rounded-md bg-slate-100 border border-slate-200 grid place-items-center text-[9px] font-extrabold text-slate-400">
                  {(d.file_name?.split(".").pop() ?? "FILE").toUpperCase().slice(0, 4)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-slate-800 truncate">{d.title}</span>
                    {d.category && (
                      <span className="text-[11px] font-bold text-brand-600 bg-brand-50 rounded px-2 py-0.5">{d.category}</span>
                    )}
                    {d.current_version_no != null && (
                      <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 rounded px-2 py-0.5">
                        최신 v{d.current_version_no}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-400 flex gap-3 flex-wrap">
                    <span className="font-bold" style={{ color: corpMeta.get(d.corporation_id)?.color }}>
                      {corpMeta.get(d.corporation_id)?.name ?? "미분류"}
                    </span>
                    {d.file_name && <span className="truncate max-w-[220px]">{d.file_name}</span>}
                    {d.file_size ? <span>{formatFileSize(d.file_size)}</span> : null}
                    <span>최신화 {formatDate(d.updated_at)}</span>
                    {d.updated_by_name && <span>올린이 {d.updated_by_name}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={() => setPreviewDoc(d)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-brand-400 hover:text-brand-600">
                    👁 미리보기
                  </button>
                  <button type="button" onClick={() => handleDownload(d)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-brand-400 hover:text-brand-600">
                    ⤓ 다운로드
                  </button>
                  <button type="button" onClick={() => setReplaceDoc(d)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-brand-400 hover:text-brand-600">
                    🔄 최신화
                  </button>
                  <button type="button" onClick={() => toggleHistory(d)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-brand-600">
                    🕘 지난 버전{d.version_count > 1 ? ` ${d.version_count}` : ""}
                  </button>
                  <button type="button" onClick={() => { setEditDoc(d); setFormOpen(true); }} className="text-xs font-semibold px-2 py-1.5 rounded-lg text-slate-500 hover:text-brand-600" title="정보 수정">
                    ✎
                  </button>
                  {isAdmin && (
                    <button type="button" onClick={() => handleDeleteDoc(d)} className="text-xs font-semibold px-2 py-1.5 rounded-lg text-slate-400 hover:text-red-600" title="삭제">
                      🗑
                    </button>
                  )}
                </div>
              </div>

              {expanded === d.id && (
                <div className="mx-4 mb-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 p-3">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">지난 버전 이력</div>
                  {versions.length === 0 ? (
                    <div className="text-xs text-slate-400 py-2">불러오는 중…</div>
                  ) : (
                    versions.map((v) => (
                      <div key={v.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-t border-slate-200 first:border-t-0">
                        <span className="text-slate-600 truncate">
                          v{v.version_no} · {v.file_name ?? "파일"} {v.is_current && <span className="text-emerald-600 font-bold">(현재)</span>}
                        </span>
                        <span className="flex items-center gap-3 shrink-0 text-slate-400">
                          <span>{formatDate(v.uploaded_at)}{v.uploaded_by_name ? ` · ${v.uploaded_by_name}` : ""}</span>
                          <button type="button" onClick={() => handleVersionDownload(v)} className="text-brand-600 font-semibold hover:underline">다운로드</button>
                          {!v.is_current && (
                            <button type="button" onClick={() => handleRevert(d, v.id)} className="text-brand-600 font-semibold hover:underline">되돌리기</button>
                          )}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 선택 다운로드 바 */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-900 text-white px-4 py-3 shadow-xl">
          <span className="text-sm">
            <b className="text-brand-300">{selected.size}</b>개 선택됨 — 체크한 서류를 한 번에 받을 수 있어요
          </span>
          <button type="button" disabled={busy} onClick={handleBulkDownload} className="px-4 py-2 rounded-xl bg-white text-slate-900 text-sm font-bold hover:bg-slate-100 disabled:opacity-50">
            ⤓ 한 번에 다운로드
          </button>
        </div>
      )}

      {formOpen && (
        <DocumentFormModal
          corporations={corporations}
          defaultCorpId={corpId !== "all" ? corpId : corporations[0]?.id ?? ""}
          editDoc={editDoc}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            onChanged();
          }}
        />
      )}
      {replaceDoc && (
        <ReplaceFileModal
          doc={replaceDoc}
          onClose={() => setReplaceDoc(null)}
          onSaved={() => {
            setReplaceDoc(null);
            onChanged();
          }}
        />
      )}
      {previewDoc && <FilePreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </div>
  );
}
