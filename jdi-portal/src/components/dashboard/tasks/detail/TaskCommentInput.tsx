"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PaperPlaneRight } from "phosphor-react";
import { addComment } from "@/lib/tasks/actions";

interface Props {
  taskId: string;
  userId: string;
}

export default function TaskCommentInput({ taskId, userId }: Props) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSending(true);
    try {
      await addComment(taskId, userId, content.trim());
      setContent("");
      router.refresh();
    } catch {} finally {
      setSending(false);
    }
  };

  return (
    <div className="flex gap-2">
      <input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
        placeholder="댓글을 입력하세요..."
        className="flex-1 glass-input px-4 py-2.5 rounded-xl text-sm outline-none"
        disabled={sending}
      />
      <button
        onClick={handleSubmit}
        disabled={sending || !content.trim()}
        className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-40 transition-all"
      >
        <PaperPlaneRight size={16} weight="bold" />
      </button>
    </div>
  );
}
