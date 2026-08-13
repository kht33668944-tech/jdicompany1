"use client";

// 계약서 양식 라이브러리 — 양식 무제한 등록·편집·복제·삭제(소프트).

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils/errors";
import { formatDate } from "@/lib/utils/date";
import { createEmptyContent } from "@/lib/contracts/constants";
import {
  deleteCompanyTemplate,
  duplicateCompanyTemplate,
  listCompanyTemplates,
} from "@/lib/contracts/actions";
import type { CompanyTemplateRow, ContentV2 } from "@/lib/contracts/types";
import CompanyDocEditor from "./CompanyDocEditor";

interface Props {
  initialTemplates: CompanyTemplateRow[];
}

interface EditorState {
  templateId: string | null;
  title: string;
  content: ContentV2;
}

export default function TemplateLibraryClient({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setTemplates(await listCompanyTemplates());
    } catch (err) {
      toast.error(getErrorMessage(err, "양식 목록을 새로 불러오지 못했습니다."));
    }
  };

  const run = async (id: string, fn: () => Promise<unknown>, successMsg: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await fn();
      toast.success(successMsg);
      await refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "처리에 실패했습니다."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800">계약서 양식</h1>
          <p className="mt-0.5 text-[13px] text-slate-400">
            자주 쓰는 계약서를 양식으로 등록해두면, 새 계약서를 몇 초 만에 만들 수 있어요.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/dashboard/contracts"
            prefetch={false}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            ← 계약서 목록
          </Link>
          <button
            type="button"
            onClick={() =>
              setEditor({ templateId: null, title: "", content: createEmptyContent() })
            }
            className="rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700"
          >
            ＋ 새 양식
          </button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <div className="mb-3 text-3xl">📄</div>
          <p className="text-sm font-semibold text-slate-600">아직 양식이 없어요</p>
          <p className="mt-1.5 text-xs text-slate-400">
            「＋ 새 양식」을 누르고, 기존 계약서를 복사해 「붙여넣기로 채우기」 하면 몇 분 안에 완성돼요.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const staffCount = t.content.fields.filter((f) => f.kind === "staff").length;
            const partyCount = t.content.fields.filter((f) => f.kind === "party").length;
            return (
              <div
                key={t.id}
                className="flex flex-col rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-colors hover:border-slate-200"
              >
                <div className="flex items-start gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-lg">
                    📄
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">{t.title}</p>
                    <p className="mt-0.5 text-[11.5px] text-slate-400">
                      조항 {t.content.clauses.length} · 우리 채움 {staffCount} · 상대방 입력 {partyCount}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[11.5px] text-slate-400">
                  {formatDate(t.updated_at.slice(0, 10))} 수정
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setEditor({ templateId: t.id, title: t.title, content: t.content })
                    }
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-600"
                  >
                    ✏️ 편집
                  </button>
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => run(t.id, () => duplicateCompanyTemplate(t.id), "양식을 복제했어요.")}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
                  >
                    복제
                  </button>
                  <button
                    type="button"
                    disabled={busyId === t.id}
                    onClick={() => run(t.id, () => deleteCompanyTemplate(t.id), "양식을 삭제했어요.")}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-400 hover:border-rose-300 hover:text-rose-500 disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editor && (
        <CompanyDocEditor
          target={{
            mode: "template",
            templateId: editor.templateId,
            title: editor.title,
            content: editor.content,
          }}
          onClose={() => setEditor(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
