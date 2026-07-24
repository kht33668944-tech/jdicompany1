"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { VaultAccount, AccountSecretHistoryItem } from "@/lib/vault/types";
import {
  listAccounts,
  unlockVault,
  lockVault,
  deleteAccount,
  getAccountHistory,
} from "@/lib/vault/actions";
import AccountFormModal from "./AccountFormModal";
import GatePasswordModal from "./GatePasswordModal";

interface Props {
  gateConfigured: boolean;
  initialUnlocked: boolean;
  isAdmin: boolean;
  onGateChanged: () => void;
}

function fieldLabel(f: "password" | "secondary") {
  return f === "password" ? "비밀번호" : "2차 비밀번호";
}

export default function AccountsTab({ gateConfigured, initialUnlocked, isAdmin, onGateChanged }: Props) {
  const [unlocked, setUnlocked] = useState(initialUnlocked);
  const [accounts, setAccounts] = useState<VaultAccount[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<VaultAccount | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<AccountSecretHistoryItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listAccounts();
      setAccounts(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "계정을 불러오지 못했습니다.");
      setUnlocked(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked && accounts === null) load();
  }, [unlocked, accounts, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!accounts) return [];
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.service_name.toLowerCase().includes(q) ||
        (a.username ?? "").toLowerCase().includes(q) ||
        (a.note ?? "").toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [accounts, search]);

  const handleUnlock = async () => {
    if (!password.trim()) return;
    setLoading(true);
    try {
      const res = await unlockVault(password);
      if (res.ok) {
        setPassword("");
        setUnlocked(true);
        toast.success("잠금이 해제되었습니다. (20분 유지)");
      } else {
        toast.error("2차 비밀번호가 올바르지 않습니다.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "잠금 해제 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleLock = async () => {
    await lockVault().catch(() => {});
    setUnlocked(false);
    setAccounts(null);
    setRevealed(new Set());
    setHistoryFor(null);
    toast.success("다시 잠갔습니다.");
  };

  const copy = async (label: string, value: string) => {
    if (!value) {
      toast.error(`${label}가 비어 있습니다.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} 복사됨`);
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  };

  const toggleReveal = (key: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleHistory = async (accountId: string) => {
    if (historyFor === accountId) {
      setHistoryFor(null);
      return;
    }
    setHistoryFor(accountId);
    setHistory([]);
    try {
      setHistory(await getAccountHistory(accountId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "이력 불러오기 실패");
    }
  };

  const handleDelete = async (a: VaultAccount) => {
    if (!window.confirm(`'${a.service_name}' 계정을 삭제할까요?`)) return;
    try {
      await deleteAccount(a.id);
      toast.success("삭제되었습니다.");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    }
  };

  // 1) 게이트 미설정
  if (!gateConfigured) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <div className="text-3xl mb-3">🔒</div>
        <h3 className="font-extrabold text-slate-800">계정 보관함 2차 비밀번호가 아직 없습니다</h3>
        <p className="text-sm text-slate-500 mt-2">
          {isAdmin ? "관리자(대표님)가 먼저 공용 2차 비밀번호를 설정해야 직원들이 사용할 수 있어요." : "관리자(대표님)가 2차 비밀번호를 설정하면 사용할 수 있어요."}
        </p>
        {isAdmin && (
          <button type="button" onClick={() => setGateOpen(true)} className="mt-4 px-5 py-2.5 rounded-xl bg-[#2563eb] text-white text-sm font-bold hover:bg-blue-700">
            2차 비밀번호 설정
          </button>
        )}
        {gateOpen && (
          <GatePasswordModal isInitial onClose={() => setGateOpen(false)} onSaved={() => { setGateOpen(false); onGateChanged(); }} />
        )}
      </div>
    );
  }

  // 2) 잠금 상태
  if (!unlocked) {
    return (
      <div className="max-w-md mx-auto rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 grid place-items-center text-2xl mx-auto mb-3">🔒</div>
        <h3 className="font-extrabold text-slate-800">계정 보관함 · 2차 비밀번호</h3>
        <p className="text-sm text-slate-500 mt-2 mb-5">직원끼리만 공유하는 2차 비밀번호를 입력하세요.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
          placeholder="2차 비밀번호"
          className="w-full text-center tracking-widest bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
          autoFocus
        />
        <button type="button" onClick={handleUnlock} disabled={loading} className="w-full px-5 py-3 rounded-xl bg-[#2563eb] text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
          🔓 잠금 해제
        </button>
        <p className="text-xs text-slate-400 mt-4">20분 지나면 자동으로 다시 잠깁니다.</p>
      </div>
    );
  }

  // 3) 해제 상태
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[220px] flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5">
          <span className="text-slate-400">🔎</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="계정 검색 — 서비스명·아이디·태그·메모" className="w-full text-sm bg-transparent outline-none text-slate-800" />
        </div>
        <button type="button" onClick={() => { setEditAccount(null); setFormOpen(true); }} className="px-4 py-2.5 rounded-xl bg-[#2563eb] text-white text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all">
          ＋ 계정 추가
        </button>
        {isAdmin && (
          <button type="button" onClick={() => setGateOpen(true)} className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">
            2차 비밀번호 변경
          </button>
        )}
        <button type="button" onClick={handleLock} className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">
          🔒 다시 잠그기
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {loading && accounts === null ? (
          <div className="p-10 text-center text-sm text-slate-400">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">계정이 없습니다. ‘＋ 계정 추가’로 등록하세요.</div>
        ) : (
          filtered.map((a) => {
            const pk = `${a.id}:password`;
            const sk = `${a.id}:secondary`;
            return (
              <div key={a.id} className="border-t border-slate-100 first:border-t-0">
                <div className="flex flex-col md:flex-row md:items-center gap-3 px-4 py-3.5 hover:bg-slate-50/60">
                  <div className="min-w-0 md:w-56">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-800 truncate">{a.service_name}</span>
                      {a.tags.map((t) => (
                        <span key={t} className="text-[11px] font-bold text-slate-500 bg-slate-100 rounded px-2 py-0.5">{t}</span>
                      ))}
                    </div>
                    {a.url && (
                      <a href={a.url.startsWith("http") ? a.url : `https://${a.url}`} target="_blank" rel="noreferrer" className="text-[11px] text-brand-600 hover:underline">{a.url} ↗</a>
                    )}
                    {a.note && <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[220px]">📝 {a.note}</div>}
                  </div>

                  <div className="flex flex-wrap gap-2 flex-1 min-w-0">
                    <CredChip label="아이디" value={a.username ?? ""} onCopy={() => copy("아이디", a.username ?? "")} />
                    <CredChip label="비번" value={a.password} secret shown={revealed.has(pk)} onReveal={() => toggleReveal(pk)} onCopy={() => copy("비밀번호", a.password)} />
                    {a.secondary && (
                      <CredChip label="2차" value={a.secondary} secret shown={revealed.has(sk)} onReveal={() => toggleReveal(sk)} onCopy={() => copy("2차 비밀번호", a.secondary)} />
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {a.history_count > 0 && (
                      <button type="button" onClick={() => toggleHistory(a.id)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-brand-600">🔄 이력 {a.history_count}</button>
                    )}
                    <button type="button" onClick={() => { setEditAccount(a); setFormOpen(true); }} className="text-xs font-semibold px-2 py-1.5 rounded-lg text-slate-500 hover:text-brand-600" title="수정">✎</button>
                    <button type="button" onClick={() => handleDelete(a)} className="text-xs font-semibold px-2 py-1.5 rounded-lg text-slate-400 hover:text-red-600" title="삭제">🗑</button>
                  </div>
                </div>

                {historyFor === a.id && (
                  <div className="mx-4 mb-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 p-3">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">비밀번호 변경 이력</div>
                    {history.length === 0 ? (
                      <div className="text-xs text-slate-400 py-1">불러오는 중…</div>
                    ) : (
                      history.map((h) => (
                        <div key={h.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-t border-slate-200 first:border-t-0">
                          <span className="text-slate-600 font-mono truncate">
                            <span className="text-slate-400 font-sans">[{fieldLabel(h.field)}]</span> {h.value}
                          </span>
                          <span className="flex items-center gap-2 shrink-0 text-slate-400">
                            <span>{new Date(h.changed_at).toLocaleDateString("ko-KR")}{h.changed_by_name ? ` · ${h.changed_by_name}` : ""}</span>
                            <button type="button" onClick={() => copy("지난 비밀번호", h.value)} className="text-brand-600 font-semibold hover:underline">복사</button>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {formOpen && (
        <AccountFormModal
          editAccount={editAccount}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); load(); }}
        />
      )}
      {gateOpen && (
        <GatePasswordModal isInitial={false} onClose={() => setGateOpen(false)} onSaved={() => { setGateOpen(false); onGateChanged(); }} />
      )}
    </div>
  );
}

function CredChip({
  label,
  value,
  secret,
  shown,
  onReveal,
  onCopy,
}: {
  label: string;
  value: string;
  secret?: boolean;
  shown?: boolean;
  onReveal?: () => void;
  onCopy: () => void;
}) {
  const display = !value ? "—" : secret && !shown ? "••••••••" : value;
  return (
    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
      <span className="text-[10px] font-bold text-slate-400">{label}</span>
      <span className={`text-xs font-mono text-slate-700 max-w-[160px] truncate ${secret && !shown ? "tracking-widest" : ""}`}>{display}</span>
      {secret && value && (
        <button type="button" onClick={onReveal} className="w-6 h-6 grid place-items-center rounded-md text-slate-400 hover:text-brand-600" title={shown ? "가리기" : "보기"}>
          {shown ? "🙈" : "👁"}
        </button>
      )}
      {value && (
        <button type="button" onClick={onCopy} className="w-6 h-6 grid place-items-center rounded-md text-slate-400 hover:text-brand-600" title="복사">⧉</button>
      )}
    </div>
  );
}
