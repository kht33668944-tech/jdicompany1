"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ClockClockwise, PaperPlaneRight, Trash } from "phosphor-react";
import { addComment, deleteComment } from "@/lib/tasks/actions";
import { createClient } from "@/lib/supabase/client";
import type { TaskComment } from "@/lib/tasks/types";

interface TaskCommentsProps {
  taskId: string;
  userId: string;
}

export default function TaskComments({ taskId, userId }: TaskCommentsProps) {
  const router = useRouter();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchComments() {
      const supabase = createClient();
      const { data } = await supabase
        .from("task_comments")
        .select("*, profiles(full_name)")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      setComments((data as TaskComment[]) ?? []);
    }
    fetchComments();
  }, [taskId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    try {
      const newComment = await addComment(taskId, userId, content.trim());
      setComments((prev) => [...prev, newComment as TaskComment]);
      setContent("");
    } catch (e) {
      console.error("댓글 추가 실패:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (e) {
      console.error("댓글 삭제 실패:", e);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  return (
    <div className="border-t border-slate-200/50 pt-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <ClockClockwise size={16} className="text-slate-400" />
        <h4 className="text-sm font-semibold text-slate-600">진행 내역 ({comments.length})</h4>
      </div>

      {comments.length > 0 && (
        <ul className="space-y-3 mb-4 max-h-48 overflow-y-auto">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-2 group">
              <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0 mt-0.5">
                {comment.profiles.full_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">{comment.profiles.full_name}</span>
                  <span className="text-[10px] text-slate-400">{formatTime(comment.created_at)}</span>
                  {comment.user_id === userId && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all ml-auto"
                    >
                      <Trash size={12} />
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-0.5">{comment.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="glass-input flex-1 px-3 py-2 rounded-lg text-xs outline-none"
          placeholder="진행 상황을 입력하세요..."
        />
        <button
          type="submit"
          disabled={loading || !content.trim()}
          className="p-2 rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100 transition-colors disabled:opacity-40"
        >
          <PaperPlaneRight size={16} />
        </button>
      </form>
    </div>
  );
}
