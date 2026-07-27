"use client";

import { useRef, useState } from "react";
import { Check, X } from "phosphor-react";
import { updateTask } from "@/lib/tasks/actions";
import { getErrorMessage } from "@/lib/utils/errors";

interface Props {
  taskId: string;
  initialTitle: string;
  /** 저장 성공 시 새 제목, 취소/변경 없음이면 null */
  onDone: (nextTitle: string | null) => void;
  inputClassName?: string;
}

/**
 * 목록에서 제목만 즉시 고치는 인라인 편집 폼.
 * Enter 저장 / Esc 취소. 부모가 행 클릭 핸들러를 가지므로 이벤트 전파를 막는다.
 */
export default function TaskTitleEditForm({
  taskId,
  initialTitle,
  onDone,
  inputClassName = "",
}: Props) {
  const [value, setValue] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const handleSave = async () => {
    const nextTitle = value.trim();
    if (!nextTitle || savingRef.current) return;
    if (nextTitle === initialTitle.trim()) {
      onDone(null);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateTask(taskId, { title: nextTitle });
      // RLS 로 막히면 update 가 0행이라 에러 없이 통과할 수 있어 결과 제목을 직접 확인
      if (!updated || (updated as { title?: string }).title !== nextTitle) {
        throw new Error("제목을 수정할 권한이 없습니다.");
      }
      onDone(nextTitle);
    } catch (err) {
      setError(getErrorMessage(err, "제목을 저장하지 못했습니다."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div
      className="min-w-0 flex-1"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              handleSave();
            } else if (event.key === "Escape") {
              event.preventDefault();
              onDone(null);
            }
          }}
          onFocus={(event) => event.currentTarget.select()}
          disabled={saving}
          aria-label="할일 제목 수정"
          placeholder="할일 제목"
          className={`min-w-0 flex-1 rounded-lg border border-indigo-300 bg-white px-2 py-1 text-sm font-semibold text-slate-700 outline-none transition-all focus:ring-2 focus:ring-indigo-200 disabled:opacity-60 ${inputClassName}`}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !value.trim()}
          title="저장 (Enter)"
          aria-label="제목 저장"
          className="shrink-0 rounded-lg bg-indigo-600 p-1.5 text-white transition-all hover:bg-indigo-500 disabled:opacity-40"
        >
          <Check size={14} weight="bold" />
        </button>
        <button
          type="button"
          onClick={() => onDone(null)}
          disabled={saving}
          title="취소 (Esc)"
          aria-label="제목 수정 취소"
          className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
        >
          <X size={14} weight="bold" />
        </button>
      </div>
      {error && <p className="mt-1 text-[11px] font-semibold text-red-500">{error}</p>}
    </div>
  );
}
