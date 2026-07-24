"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "phosphor-react";
import { toast } from "sonner";
import ModalContainer from "@/components/shared/ModalContainer";
import UserAvatar from "@/components/shared/UserAvatar";
import Select from "@/components/shared/Select";
import type {
  DashboardTaskPerson,
  DashboardTaskSummary,
} from "@/lib/dashboard/dashboard-task-summary";
import type { SentDirective } from "@/lib/directives/types";
import { createDirective, getSentDirectivesFor } from "@/lib/directives/actions";
import { getErrorMessage } from "@/lib/utils/errors";
import { useProjects } from "@/lib/projects/useProjects";
import { toProjectEditOptions } from "@/lib/projects/utils";

interface Props {
  member: DashboardTaskPerson;
  tasks: DashboardTaskSummary[];
  profiles: DashboardTaskPerson[];
  pendingCount: number;
  attendanceLabel: string;
  onClose: () => void;
}

const PRIORITY_OPTIONS = [
  { value: "", label: "정하지 않음" },
  { value: "긴급", label: "긴급" },
  { value: "높음", label: "높음" },
  { value: "보통", label: "보통" },
  { value: "낮음", label: "낮음" },
];

// Select 컴포넌트는 테두리를 스스로 갖지 않는다. 옆의 마감일 입력칸과 같은 모양으로 맞춘다.
const SELECT_BOX_CLASS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-left";

const STATE_BADGE: Record<string, string> = {
  미확인: "bg-amber-50 text-amber-700",
  거절: "bg-slate-100 text-slate-500",
  대기: "bg-slate-100 text-slate-600",
  진행중: "bg-amber-50 text-amber-700",
  완료: "bg-emerald-50 text-emerald-700",
};

function stateLabel(item: SentDirective): string {
  if (item.state === "수락") return item.task_status ?? "수락";
  return item.state;
}

export default function MemberWorkPanel({
  member,
  tasks,
  profiles,
  pendingCount,
  attendanceLabel,
  onClose,
}: Props) {
  const router = useRouter();
  const { projects } = useProjects();
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState<SentDirective[] | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [recipientIds, setRecipientIds] = useState<string[]>([member.id]);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("");
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    let alive = true;
    getSentDirectivesFor(member.id)
      .then((rows) => {
        if (alive) setSent(rows);
      })
      .catch(() => {
        if (alive) setSent([]);
      });
    return () => {
      alive = false;
    };
  }, [member.id]);

  const rows: { key: string; label: string; items: DashboardTaskSummary[]; tone: string }[] = [
    {
      key: "wait",
      label: "대기",
      items: tasks.filter((task) => task.status === "대기"),
      tone: "text-slate-800",
    },
    {
      key: "doing",
      label: "진행중",
      items: tasks.filter((task) => task.status === "진행중"),
      tone: "text-amber-600",
    },
    {
      key: "done",
      label: "완료",
      items: tasks.filter((task) => task.status === "완료"),
      tone: "text-emerald-600",
    },
  ];

  const toggleRecipient = (id: string) => {
    setRecipientIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    startTransition(async () => {
      try {
        await createDirective({
          title,
          body,
          recipientIds,
          priority: priority || null,
          dueDate: dueDate || null,
          projectId: projectId || null,
        });
        toast.success("업무지시를 보냈습니다.");
        onClose();
        router.refresh();
      } catch (error) {
        toast.error(getErrorMessage(error, "업무지시를 보내지 못했습니다."));
      }
    });
  };

  return (
    <ModalContainer onClose={onClose} maxWidth="max-w-xl" className="!p-0 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <UserAvatar name={member.full_name} avatarUrl={member.avatar_url} />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-800">{member.full_name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-700">
              {attendanceLabel}
            </span>
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                지시 {pendingCount} 미확인
              </span>
            )}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="text-slate-400">
          <X size={18} />
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto">
        {/* 오늘 업무 — 한 카드에 세 줄 */}
        <section className="border-b border-slate-100 px-5 py-4">
          <h3 className="mb-2 text-[11px] font-bold tracking-wider text-slate-400">오늘 업무</h3>
          <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
            {rows.map((row) => (
              <div
                key={row.key}
                className="flex items-baseline gap-3 border-t border-slate-100 px-3 py-2 first:border-t-0"
              >
                <span className="flex w-[4.2rem] shrink-0 items-baseline gap-1.5 text-xs font-semibold text-slate-500">
                  {row.label}
                  <b className={`ml-auto text-sm tabular-nums ${row.tone}`}>{row.items.length}</b>
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                  {row.items.length === 0
                    ? "아직 없음"
                    : row.items.map((task) => task.title).join(" · ")}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* 업무 지시하기 */}
        <section className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4">
          <h3 className="text-[11px] font-bold tracking-wider text-slate-400">업무 지시하기</h3>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">제목</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="무엇을 해야 하나요?"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-2 focus:outline-indigo-500"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">내용</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              placeholder="배경과 원하는 결과를 적어 주세요."
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed focus:outline-2 focus:outline-indigo-500"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">받는 사람</span>
            <div className="flex flex-wrap gap-1.5">
              {profiles.map((profile) => {
                const selected = recipientIds.includes(profile.id);
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => toggleRecipient(profile.id)}
                    aria-pressed={selected}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      selected
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    {profile.full_name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600">마감일 (선택)</span>
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600">중요도 (선택)</span>
              <Select
                value={priority}
                onChange={setPriority}
                options={PRIORITY_OPTIONS}
                ariaLabel="중요도"
                className={SELECT_BOX_CLASS}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600">프로젝트 (선택)</span>
              <Select
                value={projectId}
                onChange={setProjectId}
                options={toProjectEditOptions(projects, projectId)}
                ariaLabel="프로젝트"
                className={SELECT_BOX_CLASS}
              />
            </div>
          </div>
        </section>

        {/* 보낸 지시 */}
        <section className="px-5 py-4">
          <h3 className="mb-2 text-[11px] font-bold tracking-wider text-slate-400">
            {member.full_name}님에게 보낸 지시
          </h3>
          {sent === null && <p className="text-xs text-slate-400">불러오는 중…</p>}
          {sent !== null && sent.length === 0 && (
            <p className="text-xs text-slate-400">아직 보낸 지시가 없습니다.</p>
          )}
          <ul className="flex flex-col gap-1.5">
            {(sent ?? []).map((item) => (
              <li
                key={item.recipient_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <span className="truncate text-xs text-slate-600">{item.title}</span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    STATE_BADGE[stateLabel(item)] ?? "bg-slate-100 text-slate-500"
                  }`}
                >
                  {stateLabel(item)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 sm:flex-none"
        >
          닫기
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={handleSubmit}
          className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 sm:flex-none"
        >
          지시 보내기
        </button>
      </div>
    </ModalContainer>
  );
}
