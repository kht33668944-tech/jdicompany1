"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CircleDashed,
  Circle,
  CheckCircle,
  ArrowBendDownRight,
  ChatCircleDots,
  Trash,
  Check,
  CheckSquare,
  Square,
  Plus,
  CaretDown,
  CaretUp,
} from "phosphor-react";
import type { TaskWithDetails, TaskStatus, TaskPriority, TaskChecklistItem } from "@/lib/tasks/types";
import type { Profile } from "@/lib/attendance/types";
import { PRIORITY_CONFIG, TASK_PRIORITIES, CATEGORIES } from "@/lib/tasks/constants";
import { formatDueDate, calculateProgress } from "@/lib/tasks/utils";
import { updateTask, deleteTask, addAssignee, removeAssignee, addChecklistItem, updateChecklistItem, deleteChecklistItem } from "@/lib/tasks/actions";
import { getChecklistItems } from "@/lib/tasks/queries";
import { createClient } from "@/lib/supabase/client";
import UserAvatar from "@/components/shared/UserAvatar";

interface Props {
  task: TaskWithDetails;
  subtasks?: TaskWithDetails[];
  onTaskClick: (taskId: string) => void;
  isSubtask: boolean;
  profiles: Profile[];
  userId: string;
  onRefresh?: () => void;
}

const STATUS_ICONS: Record<TaskStatus, React.ComponentType<{ size?: number; className?: string }>> = {
  "대기": Circle,
  "진행중": CircleDashed,
  "완료": CheckCircle,
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  "대기": "text-slate-300",
  "진행중": "text-orange-500",
  "완료": "text-emerald-500",
};

type EditingField = "priority" | "category" | "assignee" | "period" | null;

function formatPeriod(startDate: string | null | undefined, dueDate: string | null | undefined): string {
  const fmt = (d: string) => {
    const [, m, day] = d.split("-");
    return `${m}.${day}`;
  };
  if (startDate && dueDate) return `${fmt(startDate)} ~ ${fmt(dueDate)}`;
  if (startDate) return `${fmt(startDate)} ~`;
  if (dueDate) return `~ ${fmt(dueDate)}`;
  return "—";
}

export default function ListRow({ task, subtasks, onTaskClick, isSubtask, profiles, userId, onRefresh }: Props) {
  const router = useRouter();
  const refresh = () => { if (onRefresh) onRefresh(); else router.refresh(); };
  const [editingField, setEditingField] = useState<EditingField>(null);
  // 체크리스트 인라인 펼침
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistItems, setChecklistItems] = useState<TaskChecklistItem[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  // 서버 상태에서 파생된 담당자 ID — task.assignees 가 바뀌면 자동 갱신 (effect 불필요)
  const serverAssigneeIds = useMemo(
    () => new Set(task.assignees.map((a) => a.user_id)),
    [task.assignees]
  );
  // optimistic override (서버 응답 도착 전 임시 표시용)
  const [optimisticOverride, setOptimisticOverride] = useState<Set<string> | null>(null);
  const localAssigneeIds = optimisticOverride ?? serverAssigneeIds;
  const dropdownRef = useRef<HTMLDivElement>(null);

  const StatusIcon = STATUS_ICONS[task.status];
  const priorityConfig = PRIORITY_CONFIG[task.priority];
  const dueInfo = formatDueDate(task.due_date, task.status);
  const progress = calculateProgress(task.checklist_total, task.checklist_completed);
  const progressBarColor =
    progress === 100 ? "bg-emerald-500" : task.status === "진행중" ? "bg-indigo-500" : "bg-indigo-300";

  // Close dropdown on outside click
  useEffect(() => {
    if (!editingField) return;
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setEditingField(null);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [editingField]);

  const fetchChecklist = async () => {
    setChecklistLoading(true);
    try {
      const supabase = createClient();
      const items = await getChecklistItems(supabase, task.id);
      setChecklistItems(items);
    } catch (error) {
      console.error("체크리스트 로드 실패:", error);
    } finally {
      setChecklistLoading(false);
    }
  };

  const handleToggleChecklist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!checklistOpen) {
      setChecklistOpen(true);
      fetchChecklist();
    } else {
      setChecklistOpen(false);
    }
  };

  const handleChecklistToggleItem = async (item: TaskChecklistItem) => {
    // optimistic update
    setChecklistItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_completed: !i.is_completed } : i))
    );
    try {
      await updateChecklistItem(item.id, { is_completed: !item.is_completed });
      refresh();
    } catch (error) {
      console.error("체크리스트 토글 실패:", error);
      // revert
      setChecklistItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_completed: item.is_completed } : i))
      );
    }
  };

  const handleChecklistDeleteItem = async (itemId: string) => {
    setChecklistItems((prev) => prev.filter((i) => i.id !== itemId));
    try {
      await deleteChecklistItem(itemId);
      refresh();
    } catch (error) {
      console.error("체크리스트 삭제 실패:", error);
      fetchChecklist();
    }
  };

  const handleChecklistAddItem = async () => {
    if (!newChecklistItem.trim()) return;
    try {
      const added = await addChecklistItem(task.id, newChecklistItem.trim());
      setChecklistItems((prev) => [...prev, added]);
      setNewChecklistItem("");
      refresh();
    } catch (error) {
      console.error("체크리스트 추가 실패:", error);
    }
  };

  const handlePriorityChange = async (priority: TaskPriority) => {
    setEditingField(null);
    try {
      await updateTask(task.id, { priority });
      refresh();
    } catch (error) {
      console.error("우선순위 변경 실패:", error);
    }
  };

  const handleCategoryChange = async (category: string | null) => {
    setEditingField(null);
    try {
      await updateTask(task.id, { category });
      refresh();
    } catch (error) {
      console.error("카테고리 변경 실패:", error);
    }
  };

  // 기간 수정용 로컬 상태 (controlled input + onChange 즉시 저장)
  const [localStartDate, setLocalStartDate] = useState(task.start_date ?? "");
  const [localDueDate, setLocalDueDate] = useState(task.due_date ?? "");
  useEffect(() => {
    setLocalStartDate(task.start_date ?? "");
    setLocalDueDate(task.due_date ?? "");
  }, [task.start_date, task.due_date]);

  const handleDueDateChange = async (value: string) => {
    setLocalDueDate(value);
    try {
      await updateTask(task.id, { dueDate: value || null });
      refresh();
    } catch (err) {
      console.error("마감일 변경 실패:", err);
      setLocalDueDate(task.due_date ?? "");
    }
  };

  const handleStartDateChange = async (value: string) => {
    setLocalStartDate(value);
    try {
      await updateTask(task.id, { startDate: value || null });
      refresh();
    } catch (err) {
      console.error("시작일 변경 실패:", err);
      setLocalStartDate(task.start_date ?? "");
    }
  };

  const handleToggleAssignee = async (assigneeId: string) => {
    const isAssigned = localAssigneeIds.has(assigneeId);
    // Optimistic override
    const next = new Set(localAssigneeIds);
    if (isAssigned) next.delete(assigneeId);
    else next.add(assigneeId);
    setOptimisticOverride(next);
    try {
      if (isAssigned) {
        await removeAssignee(task.id, assigneeId);
      } else {
        await addAssignee(task.id, assigneeId);
      }
      refresh();
      // 서버 응답 반영 후 override 해제 → serverAssigneeIds 자동 사용
      setOptimisticOverride(null);
    } catch (error) {
      console.error("담당자 변경 실패:", error);
      // Revert
      setOptimisticOverride(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteTask(task.id);
      refresh();
    } catch (error) {
      console.error("삭제 실패:", error);
    }
  };

  const openField = (field: EditingField) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingField(editingField === field ? null : field);
  };

  return (
    <>
      <tr
        onClick={() => onTaskClick(task.id)}
        className="hover:bg-slate-50 transition-all cursor-pointer group"
      >
        {/* 할일명 */}
        <td className={`px-4 py-3 ${isSubtask ? "pl-10" : ""}`}>
          <div className="flex items-center gap-3">
            {isSubtask && <ArrowBendDownRight size={16} className="text-slate-300" />}
            <button
              onClick={handleToggleChecklist}
              className={`relative flex-shrink-0 rounded-md p-0.5 transition-all ${
                checklistOpen ? "bg-indigo-50 ring-2 ring-indigo-200" : "hover:bg-slate-100"
              }`}
              title={task.checklist_total > 0 ? "체크리스트 펼치기" : "체크리스트"}
            >
              <StatusIcon size={18} className={STATUS_COLORS[task.status]} />
              {task.checklist_total > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 text-white text-[7px] font-bold rounded-full flex items-center justify-center">
                  {task.checklist_total}
                </span>
              )}
            </button>
            <span
              className={`font-semibold ${
                isSubtask ? "text-slate-500 font-medium" : "text-slate-700"
              } ${task.status === "완료" ? "line-through text-slate-400" : ""}`}
            >
              {task.title}
            </span>
            {task.comment_count > 0 && (
              <div className="flex items-center gap-1 text-slate-300 ml-2">
                <ChatCircleDots size={14} />
                <span className="text-xs">{task.comment_count}</span>
              </div>
            )}
          </div>
        </td>

        {/* 우선순위 — 인라인 수정 */}
        <td className="px-4 py-3 relative">
          <div onClick={openField("priority")} title="클릭하여 수정">
            <span
              className={`px-2 py-1 ${priorityConfig.bg} ${priorityConfig.text} text-[11px] font-bold rounded-md border ${priorityConfig.border} uppercase cursor-pointer hover:ring-2 hover:ring-indigo-200 transition-all`}
            >
              {task.priority}
            </span>
          </div>
          {editingField === "priority" && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-2 mt-1 z-30 bg-white rounded-xl shadow-lg border border-slate-100 py-1 min-w-[120px]"
            >
              {TASK_PRIORITIES.map((p) => {
                const pc = PRIORITY_CONFIG[p];
                return (
                  <button
                    key={p}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePriorityChange(p);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 ${
                      task.priority === p ? "bg-slate-50" : ""
                    }`}
                  >
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${pc.bg} ${pc.text}`}>
                      {p}
                    </span>
                    {task.priority === p && <Check size={14} className="text-indigo-600 ml-auto" />}
                  </button>
                );
              })}
            </div>
          )}
        </td>

        {/* 카테고리 — 인라인 수정 */}
        <td className="px-4 py-3 relative">
          <div onClick={openField("category")} title="클릭하여 수정">
            {task.category ? (
              <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[11px] font-bold rounded-md uppercase cursor-pointer hover:ring-2 hover:ring-indigo-200 transition-all">
                {task.category}
              </span>
            ) : (
              <span className="text-xs text-slate-300 cursor-pointer hover:text-slate-400 transition-colors">
                —
              </span>
            )}
          </div>
          {editingField === "category" && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-2 mt-1 z-30 bg-white rounded-xl shadow-lg border border-slate-100 py-1 min-w-[120px]"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCategoryChange(null);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 text-slate-400 ${
                  !task.category ? "bg-slate-50" : ""
                }`}
              >
                없음
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCategoryChange(c);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center ${
                    task.category === c ? "bg-slate-50" : ""
                  }`}
                >
                  <span>{c}</span>
                  {task.category === c && <Check size={14} className="text-indigo-600 ml-auto" />}
                </button>
              ))}
            </div>
          )}
        </td>

        {/* 담당자 — 인라인 수정 */}
        <td className="px-4 py-3 relative">
          <div
            className="flex -space-x-2 cursor-pointer"
            onClick={openField("assignee")}
            title="클릭하여 수정"
          >
            {task.assignees.length > 0 ? (
              <>
                {task.assignees.slice(0, 3).map((assignee) => (
                  <UserAvatar
                    key={assignee.user_id}
                    name={assignee.full_name}
                    avatarUrl={assignee.avatar_url}
                    size="sm"
                    className="border-2 border-white hover:ring-2 hover:ring-indigo-200 transition-all"
                  />
                ))}
                {task.assignees.length > 3 && (
                  <div className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-400">
                    +{task.assignees.length - 3}
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-slate-300 hover:text-slate-400 transition-colors">—</span>
            )}
          </div>
          {editingField === "assignee" && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-2 mt-1 z-30 bg-white rounded-xl shadow-lg border border-slate-100 py-1 min-w-[200px] max-h-[240px] overflow-y-auto"
            >
              {profiles.map((p) => {
                const isAssigned = localAssigneeIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleAssignee(p.id);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 ${
                      isAssigned ? "bg-indigo-50/50" : ""
                    }`}
                  >
                    <UserAvatar name={p.full_name} avatarUrl={p.avatar_url} size="xs" />
                    <span className="flex-1 text-left text-slate-600">{p.full_name}</span>
                    {isAssigned && <Check size={14} className="text-indigo-600" />}
                  </button>
                );
              })}
            </div>
          )}
        </td>

        {/* 기간 — 인라인 수정 */}
        <td className="px-4 py-3 relative">
          <span
            onClick={openField("period")}
            className={`text-sm ${dueInfo.className} cursor-pointer hover:underline transition-colors`}
            title="클릭하여 수정"
          >
            {formatPeriod(localStartDate || null, localDueDate || null)}
          </span>
          {editingField === "period" && (
            <div
              ref={dropdownRef}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-full right-0 mt-1 z-30 bg-white rounded-xl shadow-lg border border-slate-100 p-3 min-w-[220px]"
            >
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">시작일</label>
                  <input
                    type="date"
                    value={localStartDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    className="glass-input px-2 py-1 rounded-lg text-sm outline-none w-full"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">마감일</label>
                  <input
                    type="date"
                    value={localDueDate}
                    onChange={(e) => handleDueDateChange(e.target.value)}
                    className="glass-input px-2 py-1 rounded-lg text-sm outline-none w-full"
                  />
                </div>
              </div>
            </div>
          )}
        </td>

        {/* 진행률 + 삭제 */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              {task.checklist_total > 0 ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`${progressBarColor} h-full rounded-full transition-all`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-400">
                    {task.checklist_completed}/{task.checklist_total}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-slate-300">-</span>
              )}
            </div>
            <button
              onClick={handleDelete}
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all shrink-0"
              title="삭제"
            >
              <Trash size={14} />
            </button>
          </div>
        </td>
      </tr>

      {/* 체크리스트 펼침 행 */}
      {checklistOpen && (
        <tr>
          <td colSpan={6} className="px-0 py-0">
            <div className={`${isSubtask ? "ml-14" : "ml-10"} mr-4 mb-3 mt-1 bg-slate-50 rounded-2xl p-4 border border-slate-100`}>
              {checklistLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                  불러오는 중...
                </div>
              ) : (
                <>
                  {/* 진행률 바 */}
                  {checklistItems.length > 0 && (
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            checklistItems.every((i) => i.is_completed) ? "bg-emerald-500" : "bg-indigo-500"
                          }`}
                          style={{
                            width: `${checklistItems.length > 0 ? Math.round((checklistItems.filter((i) => i.is_completed).length / checklistItems.length) * 100) : 0}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-400">
                        {checklistItems.filter((i) => i.is_completed).length}/{checklistItems.length}
                      </span>
                    </div>
                  )}

                  {/* 체크리스트 항목 */}
                  <div className="space-y-1">
                    {checklistItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 group/item py-1 px-1 rounded-lg hover:bg-white transition-colors">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleChecklistToggleItem(item);
                          }}
                          className="flex-shrink-0"
                        >
                          {item.is_completed ? (
                            <CheckSquare size={16} weight="fill" className="text-emerald-500" />
                          ) : (
                            <Square size={16} className="text-slate-300 hover:text-indigo-500 transition-colors" />
                          )}
                        </button>
                        <span
                          className={`flex-1 text-sm ${
                            item.is_completed ? "line-through text-slate-400" : "text-slate-600"
                          }`}
                        >
                          {item.content}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleChecklistDeleteItem(item.id);
                          }}
                          className="opacity-0 group-hover/item:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                        >
                          <Trash size={12} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* 항목이 없을 때 */}
                  {checklistItems.length === 0 && (
                    <p className="text-xs text-slate-400 mb-2">체크리스트가 비어있습니다.</p>
                  )}

                  {/* 새 항목 추가 */}
                  <div className="flex gap-2 mt-2">
                    <input
                      value={newChecklistItem}
                      onChange={(e) => setNewChecklistItem(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          handleChecklistAddItem();
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="항목 추가..."
                      className="flex-1 px-3 py-1.5 bg-white rounded-lg text-sm outline-none border border-slate-200 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 transition-all"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleChecklistAddItem();
                      }}
                      disabled={!newChecklistItem.trim()}
                      className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-500 disabled:opacity-40 transition-all"
                    >
                      <Plus size={14} weight="bold" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </td>
        </tr>
      )}

      {subtasks?.map((child) => (
        <ListRow
          key={child.id}
          task={child}
          onTaskClick={onTaskClick}
          isSubtask={true}
          profiles={profiles}
          userId={userId}
          onRefresh={onRefresh}
        />
      ))}
    </>
  );
}
