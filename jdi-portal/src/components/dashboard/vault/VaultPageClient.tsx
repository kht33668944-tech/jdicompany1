"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Corporation, VaultDocument } from "@/lib/vault/types";
import DocumentsTab from "./DocumentsTab";
import AccountsTab from "./AccountsTab";

interface VaultPageClientProps {
  initialCorporations: Corporation[];
  initialDocuments: VaultDocument[];
  gateConfigured: boolean;
  initialUnlocked: boolean;
  isAdmin: boolean;
}

type Tab = "docs" | "acct";

export default function VaultPageClient({
  initialCorporations,
  initialDocuments,
  gateConfigured,
  initialUnlocked,
  isAdmin,
}: VaultPageClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("docs");
  const refresh = () => router.refresh();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">보관함</h1>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab("docs")}
          className={`relative px-4 py-2.5 text-sm font-bold rounded-t-lg transition-colors ${
            tab === "docs" ? "text-brand-600" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          📁 서류 보관함
          {tab === "docs" && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-brand-600 rounded-full" />}
        </button>
        <button
          type="button"
          onClick={() => setTab("acct")}
          className={`relative px-4 py-2.5 text-sm font-bold rounded-t-lg transition-colors ${
            tab === "acct" ? "text-brand-600" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          🔑 계정 보관함
          {tab === "acct" && <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-brand-600 rounded-full" />}
        </button>
      </div>

      {tab === "docs" ? (
        <DocumentsTab
          corporations={initialCorporations}
          documents={initialDocuments}
          isAdmin={isAdmin}
          onChanged={refresh}
        />
      ) : (
        <AccountsTab
          gateConfigured={gateConfigured}
          initialUnlocked={initialUnlocked}
          isAdmin={isAdmin}
          onGateChanged={refresh}
        />
      )}
    </div>
  );
}
