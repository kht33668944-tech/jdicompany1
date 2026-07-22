"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, FileArrowDown, MagnifyingGlass, Plus, X } from "phosphor-react";
import UserAvatar from "@/components/shared/UserAvatar";
import Select from "@/components/shared/Select";
import { useProjects } from "@/lib/projects/useProjects";
import { createClient } from "@/lib/supabase/client";
import { addDays, toDateString, toDateStringFromTimestamp } from "@/lib/utils/date";
import { WORK_TIMELINE_PAGE_SIZE } from "@/lib/work-timeline/constants";
import { retryPendingWorkTimelineStorageCleanup } from "@/lib/work-timeline/actions";
import { getWorkTimelineEntries } from "@/lib/work-timeline/queries";
import { getKstDayRange, isWorkTimelineImage } from "@/lib/work-timeline/utils";
import type {
  WorkTimelineEntryWithProfile,
  WorkTimelineProfile,
} from "@/lib/work-timeline/types";
import WorkTimelineCreateModal from "./WorkTimelineCreateModal";
import ProjectManageModal from "./ProjectManageModal";

interface WorkTimelineSectionProps {
  initialEntries: WorkTimelineEntryWithProfile[];
  profiles: WorkTimelineProfile[];
  currentUserId: string;
  currentUserRole: string;
  compact?: boolean;
  initialQuery?: string;
  initialEmployeeId?: string;
  initialDate?: string;
  initialProjectId?: string;
}

interface DateGroup {
  date: string;
  entries: WorkTimelineEntryWithProfile[];
}

function groupEntriesByKstDate(entries: WorkTimelineEntryWithProfile[]): DateGroup[] {
  const groups = new Map<string, WorkTimelineEntryWithProfile[]>();

  for (const entry of entries) {
    const date = toDateStringFromTimestamp(entry.completed_at);
    const current = groups.get(date) ?? [];
    current.push(entry);
    groups.set(date, current);
  }

  return [...groups.entries()].map(([date, groupedEntries]) => ({
    date,
    entries: groupedEntries,
  }));
}

function mergeUniqueEntries(
  current: WorkTimelineEntryWithProfile[],
  incoming: WorkTimelineEntryWithProfile[],
): WorkTimelineEntryWithProfile[] {
  const seen = new Set(current.map((entry) => entry.id));
  return [...current, ...incoming.filter((entry) => !seen.has(entry.id))];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeDateFilter(value: string | null): string {
  if (!value) return "";
  try {
    getKstDayRange(value);
    return value;
  } catch {
    return "";
  }
}

function formatGroupDate(date: string): string {
  const label = new Date(`${date}T12:00:00+09:00`).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  return date === toDateString() ? `오늘 · ${label}` : label;
}

function formatCompletedTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function AttachmentPreview({ entry }: { entry: WorkTimelineEntryWithProfile }) {
  const images = entry.attachments
    .filter((attachment) => isWorkTimelineImage(attachment.mime_type)
      && (attachment.thumbnail_url || attachment.original_url));
  const fileCount = entry.attachments.filter(
    (attachment) => !isWorkTimelineImage(attachment.mime_type),
  ).length;

  if (images.length > 0) {
    const image = images[0];
    const url = image.thumbnail_url ?? image.original_url;
    return (
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-slate-100 sm:w-24">
        <div
          role="img"
          aria-label={`${entry.title} 첨부 이미지 미리보기`}
          className="h-full w-full bg-slate-200 bg-cover bg-center"
          style={url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined}
        />
        {(images.length + fileCount) > 1 && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-white">
            +{images.length + fileCount - 1}
          </span>
        )}
      </div>
    );
  }

  if (fileCount > 0) {
    return (
      <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-md bg-slate-100 text-slate-500 sm:w-24">
        <FileArrowDown size={24} weight="fill" aria-hidden="true" />
        <span className="text-[11px] font-bold">파일 {fileCount}</span>
      </div>
    );
  }

  return null;
}

export default function WorkTimelineSection({
  initialEntries,
  profiles,
  currentUserId,
  currentUserRole,
  compact = false,
  initialQuery = "",
  initialEmployeeId = "",
  initialDate = "",
  initialProjectId = "",
}: WorkTimelineSectionProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { projects } = useProjects({ enabled: !compact });
  const [entries, setEntries] = useState(initialEntries);
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState(initialEmployeeId);
  const [date, setDate] = useState(initialDate);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery.trim());
  const [hasMore, setHasMore] = useState(
    !compact && initialEntries.length === WORK_TIMELINE_PAGE_SIZE,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const requestVersionRef = useRef(0);
  const didMountRef = useRef(false);
  const urlSyncMountedRef = useRef(false);
  const groups = groupEntriesByKstDate(entries);
  const today = toDateString();
  const yesterday = addDays(today, -1);
  const trimmedSearchInput = searchInput.trim();
  const searchPending = !compact && trimmedSearchInput !== query;
  const searchTooShort = !compact && query.length === 1;
  const timelineSubtitle = compact
    ? "오늘 완료한 업무입니다."
    : profiles.length > 0
      ? `${profiles.length}명의 최근 완료 업무를 공유합니다.`
      : "최근 완료한 업무를 공유합니다.";

  // compact(대시보드) 모드는 부모(DashboardTimelineClient)가 첨부까지 하이드레이션한
  // entries 를 그대로 내려주므로 여기서는 표시만 한다.
  useEffect(() => {
    if (!compact) return;
    setEntries(initialEntries);
    // 미리보기(오늘만)는 과거를 더 불러오지 않는다. 전체 이력은 "전체 보기"에서 확인.
    setHasMore(false);
  }, [compact, initialEntries]);

  useEffect(() => {
    void retryPendingWorkTimelineStorageCleanup().catch((error) => {
      console.warn("업무 타임라인 Storage 정리 재시도에 실패했습니다.", error);
    });
  }, []);

  const loadEntries = useCallback(async (
    reset: boolean,
    employeeFilter = employeeId,
    dateFilter = date,
    queryFilter = query,
    projectFilter = projectId,
  ) => {
    if (!reset && loadingRef.current) return;
    const requestVersion = reset
      ? ++requestVersionRef.current
      : requestVersionRef.current;
    loadingRef.current = true;
    setIsLoading(true);
    setErrorMessage(null);
    if (reset) {
      setEntries([]);
      setHasMore(false);
    }

    try {
      const lastEntry = reset ? null : entries.at(-1) ?? null;
      const pageSize = WORK_TIMELINE_PAGE_SIZE;
      const nextEntries = await getWorkTimelineEntries(createClient(), {
        limit: pageSize,
        employeeId: employeeFilter || null,
        date: dateFilter || null,
        query: queryFilter.length >= 2 ? queryFilter : null,
        projectId: projectFilter || null,
        cursor: lastEntry
          ? { completedAt: lastEntry.completed_at, id: lastEntry.id }
          : null,
      });
      if (requestVersion !== requestVersionRef.current) return;
      setEntries((current) => reset ? nextEntries : mergeUniqueEntries(current, nextEntries));
      setHasMore(nextEntries.length === pageSize);
      if (reset) scrollRootRef.current?.scrollTo({ top: 0 });
    } catch (error) {
      console.error("[work-timeline] feed load failed:", error);
      if (requestVersion === requestVersionRef.current) {
        setErrorMessage("업무 타임라인을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      if (requestVersion === requestVersionRef.current) {
        loadingRef.current = false;
        setIsLoading(false);
      }
    }
  }, [date, employeeId, entries, projectId, query]);

  useEffect(() => {
    if (compact || trimmedSearchInput === query) return;

    requestVersionRef.current += 1;
    loadingRef.current = false;
    setIsLoading(false);
    setEntries([]);
    setHasMore(false);
    setErrorMessage(null);
    const timer = window.setTimeout(() => setQuery(trimmedSearchInput), 300);
    return () => window.clearTimeout(timer);
  }, [compact, query, trimmedSearchInput]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (searchPending || query.length === 1) {
      requestVersionRef.current += 1;
      loadingRef.current = false;
      setIsLoading(false);
      setEntries([]);
      setHasMore(false);
      setErrorMessage(null);
      return;
    }
    void loadEntries(true, employeeId, date, query, projectId);
  }, [date, employeeId, query, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (compact) return;
    const url = new URL(window.location.href);
    const updateParam = (name: string, value: string) => {
      if (value) url.searchParams.set(name, value);
      else url.searchParams.delete(name);
    };
    updateParam("q", query);
    updateParam("employee", employeeId);
    updateParam("date", date);
    updateParam("project", projectId);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const isInitialSync = !urlSyncMountedRef.current;
    urlSyncMountedRef.current = true;
    if (nextUrl === currentUrl) return;
    if (isInitialSync) window.history.replaceState(window.history.state, "", nextUrl);
    else window.history.pushState(window.history.state, "", nextUrl);
  }, [compact, date, employeeId, projectId, query]);

  useEffect(() => {
    if (compact) return;
    const restoreFilters = () => {
      const params = new URLSearchParams(window.location.search);
      const nextQuery = params.get("q")?.trim() ?? "";
      const nextEmployee = params.get("employee") ?? "";
      setSearchInput(nextQuery);
      setQuery(nextQuery);
      setEmployeeId(UUID_PATTERN.test(nextEmployee) ? nextEmployee : "");
      setDate(normalizeDateFilter(params.get("date")));
      const nextProject = params.get("project") ?? "";
      setProjectId(nextProject === "none" || UUID_PATTERN.test(nextProject) ? nextProject : "");
    };
    window.addEventListener("popstate", restoreFilters);
    return () => window.removeEventListener("popstate", restoreFilters);
  }, [compact]);

  // 사이드바 하위 메뉴(라우터 내비게이션)로 project 파라미터가 바뀌면 필터에 반영한다.
  useEffect(() => {
    if (compact) return;
    const next = searchParams.get("project") ?? "";
    const valid = next === "none" || UUID_PATTERN.test(next) ? next : "";
    setProjectId((current) => (current === valid ? current : valid));
  }, [compact, searchParams]);

  useEffect(() => {
    if (compact) return;
    const sentinel = sentinelRef.current;
    const root = scrollRootRef.current;
    if (!sentinel || !root || !hasMore || searchPending || searchTooShort) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingRef.current) {
          void loadEntries(false, employeeId, date, query, projectId);
        }
      },
      { root, rootMargin: "120px 0px", threshold: 0.01 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [compact, date, employeeId, hasMore, loadEntries, projectId, query, searchPending, searchTooShort]);

  const handleCreated = () => {
    setCreateOpen(false);
    void loadEntries(true, employeeId, date, query, projectId);
    router.refresh();
  };

  return (
    <section
      className="overflow-hidden rounded-lg bg-white shadow-sm"
      data-viewer-role={currentUserRole}
    >
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-start justify-between gap-4 sm:items-center">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-800">업무 타임라인</h2>
            <p className="mt-1 hidden text-xs text-slate-400 sm:block">
              {timelineSubtitle}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {compact && (
              <Link
                href="/dashboard/work-timeline"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 sm:gap-1.5 sm:px-3 sm:py-2 sm:text-xs"
              >
                전체 보기
                <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" weight="bold" aria-hidden="true" />
              </Link>
            )}
            {!compact && (
              <button
                type="button"
                onClick={() => setManageOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50 sm:gap-1.5 sm:px-3 sm:py-2 sm:text-xs"
              >
                프로젝트 관리
              </button>
            )}
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 sm:gap-1.5 sm:px-3 sm:py-2 sm:text-xs"
            >
              <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" weight="bold" aria-hidden="true" />
              업무 추가
            </button>
          </div>
        </div>
        <p className="mt-2 truncate text-xs text-slate-400 sm:hidden">
          {timelineSubtitle}
        </p>
      </div>

      {!compact && (
        <div className="border-b border-slate-100 px-5 py-3">
          <label className="relative block">
            <span className="sr-only">업무 타임라인 검색</span>
            <MagnifyingGlass
              size={17}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="제목과 설명 검색"
              className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-10 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                aria-label="검색어 지우기"
                className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={15} weight="bold" aria-hidden="true" />
              </button>
            )}
          </label>
          <div className="mt-1.5 min-h-4 text-xs font-semibold text-slate-400" aria-live="polite">
            {trimmedSearchInput.length === 1
              ? "검색어를 2자 이상 입력해 주세요."
              : searchPending
                ? "검색 조건을 적용하는 중..."
                : ""}
          </div>
        </div>
      )}

      {!compact && <div className="grid gap-2 border-b border-slate-100 px-5 py-3 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,1.2fr)]">
        <div className="min-w-0">
          <Select
            options={[
              { value: "", label: "전체 직원" },
              ...profiles.map((profile) => ({ value: profile.id, label: profile.full_name })),
            ]}
            value={employeeId}
            onChange={(v) => setEmployeeId(v)}
            ariaLabel="직원 선택"
            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors"
          />
        </div>
        <div className="min-w-0">
          <Select
            options={[
              { value: "", label: "전체 프로젝트" },
              ...projects
                .filter((project) => !project.is_archived || project.id === projectId)
                .map((project) => ({ value: project.id, label: project.name })),
              { value: "none", label: "미분류" },
            ]}
            value={projectId}
            onChange={(v) => setProjectId(v)}
            ariaLabel="프로젝트 선택"
            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors"
          />
        </div>
        <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label="완료 날짜 필터">
          {[
            { label: "전체", value: "" },
            { label: "오늘", value: today },
            { label: "어제", value: yesterday },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={date === option.value}
              onClick={() => setDate(option.value)}
              className={`h-9 rounded-md border px-2.5 text-xs font-bold transition-colors ${
                date === option.value
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {option.label}
            </button>
          ))}
          <label className="min-w-36 flex-1">
            <span className="sr-only">직접 날짜 선택</span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </label>
        </div>
      </div>}

      <div
        ref={scrollRootRef}
        tabIndex={0}
        role="region"
        aria-label="최신순 업무 타임라인"
        className={`${compact ? "max-h-[428px]" : "max-h-[min(65vh,560px)] sm:max-h-[720px]"} overflow-y-auto overscroll-y-auto px-4 py-2 [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 [&::-webkit-scrollbar]:hidden sm:px-5`}
      >
        {searchPending ? (
          <div className="flex min-h-48 items-center justify-center px-4 text-center">
            <p className="text-sm font-semibold text-slate-400">검색 조건을 적용하는 중...</p>
          </div>
        ) : searchTooShort ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
            <p className="text-sm font-semibold text-slate-600">검색어를 2자 이상 입력해 주세요</p>
            <p className="mt-1 text-xs text-slate-400">조금 더 구체적으로 입력해 주세요.</p>
          </div>
        ) : isLoading && groups.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center px-4 text-center">
            <p className="text-sm font-semibold text-slate-400">업무를 불러오는 중...</p>
          </div>
        ) : errorMessage && groups.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
            <p className="text-sm font-semibold text-red-600">업무 타임라인을 불러오지 못했습니다</p>
            <button
              type="button"
              onClick={() => void loadEntries(true, employeeId, date, query)}
              className="mt-3 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
            >
              다시 시도
            </button>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
            <p className="text-sm font-semibold text-slate-600">
              {compact
                ? "오늘 공유된 완료 업무가 없습니다"
                : query.length >= 2 || employeeId || date || projectId
                  ? "조건에 맞는 업무가 없습니다"
                  : "아직 공유된 완료 업무가 없습니다"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {compact
                ? "오늘 완료한 업무가 여기에 표시됩니다."
                : query.length >= 2 || employeeId || date || projectId
                  ? "검색어나 필터 조건을 조정해 보세요."
                  : "첫 완료 업무를 등록해 팀에 공유해보세요."}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {groups.map((group) => (
              <section key={group.date} aria-labelledby={`timeline-date-${group.date}`}>
                <div className="py-3">
                  <h3
                    id={`timeline-date-${group.date}`}
                    className="text-xs font-bold text-slate-500"
                  >
                    {formatGroupDate(group.date)}
                  </h3>
                </div>

                <div>
                  {group.entries.map((entry, index) => {
                    const isMine = entry.user_id === currentUserId;
                    const isLast = index === group.entries.length - 1;

                    return (
                      <article
                        key={entry.id}
                        className="sm:grid sm:grid-cols-[48px_20px_minmax(0,1fr)] sm:gap-3"
                      >
                        <div className="mb-1.5 flex items-center gap-2 sm:contents">
                          <time
                            dateTime={entry.completed_at}
                            className="text-xs font-semibold tabular-nums text-slate-500 sm:pt-1 sm:text-right sm:text-slate-400"
                          >
                            {formatCompletedTime(entry.completed_at)}
                          </time>
                          <div className="flex items-center sm:min-h-full sm:flex-col sm:items-center">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-600 ring-4 ring-indigo-50 sm:mt-1.5" />
                            {!isLast && <span className="mt-1 hidden w-px flex-1 bg-slate-200 sm:block" />}
                          </div>
                        </div>
                        <Link
                          href={`/dashboard/work-timeline/${entry.id}`}
                          className="mb-4 grid h-[108px] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-lg border border-slate-100 bg-white p-3 transition-colors hover:border-indigo-100 hover:bg-indigo-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                          <div className="min-w-0 self-stretch py-0.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <UserAvatar
                                name={entry.author_profile.full_name}
                                avatarUrl={entry.author_profile.avatar_url}
                                size="sm"
                              />
                              <p className="min-w-0 truncate text-xs font-bold text-slate-600">
                                {entry.author_profile.full_name}
                                {isMine && <span className="ml-1 text-indigo-600">나</span>}
                              </p>
                            </div>
                            <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                              {entry.project && (
                                <span className="inline-flex max-w-28 shrink-0 items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                  <span
                                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: entry.project.color }}
                                    aria-hidden="true"
                                  />
                                  <span className="truncate">{entry.project.name}</span>
                                </span>
                              )}
                              <h4 className="min-w-0 truncate text-sm font-bold leading-5 text-slate-800">
                                {entry.title}
                              </h4>
                            </div>
                            {entry.description && (
                              <p className="mt-0.5 truncate text-xs leading-4 text-slate-500">
                                {entry.description}
                              </p>
                            )}
                          </div>
                          <AttachmentPreview entry={entry} />
                        </Link>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
        {errorMessage && groups.length > 0 && (
          <p role="alert" className="px-4 py-3 text-center text-xs font-semibold text-red-500">
            {errorMessage}
          </p>
        )}
        <div ref={sentinelRef} aria-hidden="true" className="h-px" />
        {isLoading && groups.length > 0 && (
          <p className="px-4 py-3 text-center text-xs font-semibold text-slate-400">
            불러오는 중...
          </p>
        )}
      </div>
      {createOpen && (
        <WorkTimelineCreateModal
          open
          currentUserId={currentUserId}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      )}
      {manageOpen && (
        <ProjectManageModal
          currentUserRole={currentUserRole}
          onClose={() => setManageOpen(false)}
        />
      )}
    </section>
  );
}
