"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash, CheckSquare, Square } from "phosphor-react";
import {
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
} from "@/lib/tasks/actions";
import type { TaskChecklistItem } from "@/lib/tasks/types";

interface Props {
  taskId: string;
  items: TaskChecklistItem[];
  canEdit: boolean;
}

export default function TaskChecklist({ taskId, items, canEdit }: Props) {
  const router = useRouter();
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);

  const completed = items.filter((i) => i.is_completed).length;
  const total = items.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleAdd = async () => {
    if (!newItem.trim()) return;
    setAdding(true);
    try {
      await addChecklistItem(taskId, newItem.trim());
      setNewItem("");
      router.refresh();
    } catch (error) {
      console.error("체크리스트 항목 추가 실패:", error);
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (item: TaskChecklistItem) => {
    try {
      await updateChecklistItem(item.id, { is_completed: !item.is_completed });
      router.refresh();
    } catch (error) {
      console.error("체크리스트 항목 토글 실패:", error);
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      await deleteChecklistItem(itemId);
      router.refresh();
    } catch (error) {
      console.error("체크리스트 항목 삭제 실패:", error);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-700">체크리스트</h3>
        {total > 0 && (
          <span className="text-xs font-bold text-slate-400">
            {completed}/{total}
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
          <div
            className={`h-full rounded-full transition-all ${progress === 100 ? "bg-emerald-500" : "bg-indigo-500"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 group py-1"
          >
            {canEdit ? (
              <button onClick={() => handleToggle(item)} className="flex-shrink-0">
                {item.is_completed ? (
                  <CheckSquare size={18} weight="fill" className="text-emerald-500" />
                ) : (
                  <Square size={18} className="text-slate-300 hover:text-indigo-500 transition-colors" />
                )}
              </button>
            ) : item.is_completed ? (
              <CheckSquare size={18} weight="fill" className="text-emerald-500" />
            ) : (
              <Square size={18} className="text-slate-300" />
            )}
            <span
              className={`flex-1 text-sm ${
                item.is_completed ? "line-through text-slate-400" : "text-slate-600"
              }`}
            >
              {item.content}
            </span>
            {canEdit && (
              <button
                onClick={() => handleDelete(item.id)}
                className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
              >
                <Trash size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="flex gap-2 mt-3">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="항목 추가..."
            className="flex-1 glass-input px-3 py-2 rounded-lg text-sm outline-none"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newItem.trim()}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-500 disabled:opacity-40 transition-all"
          >
            <Plus size={14} weight="bold" />
          </button>
        </div>
      )}
    </div>
  );
}
