"use client";

import { useState } from "react";
import { X } from "phosphor-react";
import { toast } from "sonner";
import ModalContainer from "@/components/shared/ModalContainer";
import { createProject, deleteProject, updateProject } from "@/lib/projects/actions";
import { PROJECT_COLORS, PROJECT_NAME_MAX_LENGTH } from "@/lib/projects/constants";
import { notifyProjectsChanged, useProjects } from "@/lib/projects/useProjects";
import type { Project } from "@/lib/projects/types";

interface ProjectManageModalProps {
  currentUserRole: string;
  onClose: () => void;
}

function ProjectRow({ project, isAdmin }: { project: Project; isAdmin: boolean }) {
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(operation: () => Promise<unknown>, successMessage: string) {
    if (busy) return;
    setBusy(true);
    try {
      await operation();
      notifyProjectsChanged();
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`rounded-lg border border-slate-100 p-3 ${project.is_archived ? "bg-slate-50" : "bg-white"}`}>
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: project.color }}
          aria-hidden="true"
        />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={PROJECT_NAME_MAX_LENGTH}
          disabled={busy}
          aria-label={`${project.name} 이름 수정`}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-bold text-slate-700 outline-none focus:border-indigo-300 focus:bg-white"
        />
        {name.trim() !== project.name && (
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void run(() => updateProject(project.id, { name }), "이름을 변경했습니다.")}
            className="shrink-0 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-indigo-500 disabled:bg-slate-300"
          >
            저장
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${project.name} 색상`}>
          {PROJECT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              disabled={busy}
              onClick={() => void run(() => updateProject(project.id, { color }), "색상을 변경했습니다.")}
              aria-label={`색상 ${color}`}
              aria-pressed={project.color === color}
              className={`h-5 w-5 rounded-full border-2 transition-transform ${
                project.color === color ? "scale-110 border-slate-700" : "border-transparent"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(
              () => updateProject(project.id, { isArchived: !project.is_archived }),
              project.is_archived ? "보관을 해제했습니다." : "보관 처리했습니다. 사이드바에서 숨겨집니다.",
            )}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-50"
          >
            {project.is_archived ? "보관 해제" : "보관"}
          </button>
          {isAdmin && !confirmDelete && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
              className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-50"
            >
              삭제
            </button>
          )}
        </div>
      </div>
      {confirmDelete && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          <p className="text-xs font-bold text-red-700">
            삭제해도 글은 남고 &lsquo;미분류&rsquo;로 바뀝니다. 삭제할까요?
          </p>
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-md px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-white"
            >
              취소
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => deleteProject(project.id), "프로젝트를 삭제했습니다.")}
              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-500 disabled:bg-slate-300"
            >
              삭제
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function ProjectManageModal({ currentUserRole, onClose }: ProjectManageModalProps) {
  const { projects, loaded } = useProjects();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(PROJECT_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const isAdmin = currentUserRole === "admin";
  const activeList = projects.filter((project) => !project.is_archived);
  const archivedList = projects.filter((project) => project.is_archived);

  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const project = await createProject(newName, newColor);
      notifyProjectsChanged();
      setNewName("");
      setNewColor(PROJECT_COLORS[0]);
      toast.success(`'${project.name}' 프로젝트를 만들었습니다.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "프로젝트를 만들지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <ModalContainer onClose={onClose} maxWidth="max-w-lg" className="max-h-[85vh] overflow-hidden !rounded-lg !p-0">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">프로젝트 관리</h2>
          <p className="mt-1 text-xs text-slate-400">이름·색상 수정, 보관, {isAdmin ? "삭제(관리자)" : "삭제는 관리자만"} 가능합니다.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="프로젝트 관리 닫기"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="max-h-[calc(85vh-72px)] space-y-4 overflow-y-auto px-5 py-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-bold text-slate-600">새 프로젝트</p>
          <div className="mt-2 flex gap-2">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={PROJECT_NAME_MAX_LENGTH}
              placeholder="프로젝트 이름"
              className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !newName.trim()}
              className="shrink-0 rounded-md bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:bg-slate-300"
            >
              {creating ? "만드는 중..." : "만들기"}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="새 프로젝트 색상">
            {PROJECT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNewColor(color)}
                aria-label={`색상 ${color}`}
                aria-pressed={newColor === color}
                className={`h-5 w-5 rounded-full border-2 transition-transform ${
                  newColor === color ? "scale-110 border-slate-700" : "border-transparent"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {!loaded ? (
          <p className="py-6 text-center text-sm font-semibold text-slate-400">불러오는 중...</p>
        ) : activeList.length === 0 && archivedList.length === 0 ? (
          <p className="py-6 text-center text-sm font-semibold text-slate-400">아직 프로젝트가 없습니다.</p>
        ) : (
          <>
            <ul className="space-y-2" aria-label="프로젝트 목록">
              {activeList.map((project) => (
                <ProjectRow key={project.id} project={project} isAdmin={isAdmin} />
              ))}
            </ul>
            {archivedList.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold text-slate-400">보관된 프로젝트</p>
                <ul className="space-y-2" aria-label="보관된 프로젝트 목록">
                  {archivedList.map((project) => (
                    <ProjectRow key={project.id} project={project} isAdmin={isAdmin} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </ModalContainer>
  );
}
