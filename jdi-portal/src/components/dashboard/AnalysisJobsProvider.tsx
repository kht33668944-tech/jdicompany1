"use client";

// 인플루언서 분석 작업을 전역 큐로 관리.
// 어느 페이지에 있든 백그라운드에서 1명씩 순차 처리되며 (Apify rate limit),
// 우하단 떠다니는 위젯(AnalysisJobsWidget)에서 진행상황을 볼 수 있다.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addInfluencer } from "@/lib/influencer/actions";

export type AnalysisJobStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface AnalysisJob {
  id: string;
  url: string;
  username: string;
  status: AnalysisJobStatus;
  errorMsg?: string;
  grade?: string;
}

interface AnalysisJobsContextValue {
  jobs: AnalysisJob[];
  isRunning: boolean;
  enqueue: (items: { url: string; username: string }[]) => void;
  clearCompleted: () => void;
  dismissAll: () => void;
}

const AnalysisJobsContext = createContext<AnalysisJobsContextValue | null>(null);

export function useAnalysisJobs(): AnalysisJobsContextValue {
  const ctx = useContext(AnalysisJobsContext);
  if (!ctx) throw new Error("useAnalysisJobs must be used inside AnalysisJobsProvider");
  return ctx;
}

export default function AnalysisJobsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const processingRef = useRef(false);
  const summaryShownRef = useRef(false);
  const jobsRef = useRef<AnalysisJob[]>([]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  // jobs 변화 감지 → pending이 있으면 다음 거 1개 처리.
  // 처리 끝나면 setJobs가 다시 트리거되어 자연스럽게 다음 pending으로 넘어감.
  useEffect(() => {
    if (processingRef.current) return;

    const next = jobs.find((j) => j.status === "pending");

    if (!next) {
      // 처리 중이었는데 더 이상 pending 없음 → 완료
      if (isRunning) {
        setIsRunning(false);
        if (!summaryShownRef.current && jobs.length > 0) {
          summaryShownRef.current = true;
          const success = jobs.filter((j) => j.status === "success").length;
          const failed = jobs.filter((j) => j.status === "failed").length;
          const skipped = jobs.filter((j) => j.status === "skipped").length;
          if (success + failed + skipped > 0) {
            const parts: string[] = [];
            if (success > 0) parts.push(`${success}명 신규`);
            if (skipped > 0) parts.push(`${skipped}명 기존`);
            if (failed > 0) parts.push(`${failed}명 실패`);
            const msg = parts.join(" · ");
            if (failed === 0 && success === 0) toast.info(msg);
            else if (failed === 0) toast.success(msg);
            else if (success === 0 && skipped === 0) toast.error(msg);
            else toast.warning(msg);
            if (success > 0) router.refresh();
          }
        }
      }
      return;
    }

    summaryShownRef.current = false;
    setIsRunning(true);
    processingRef.current = true;

    (async () => {
      setJobs((prev) =>
        prev.map((j) => (j.id === next.id ? { ...j, status: "running" } : j)),
      );
      try {
        const result = await addInfluencer(next.url);
        if (result.alreadyExisted) {
          setJobs((prev) =>
            prev.map((j) => (j.id === next.id ? { ...j, status: "skipped" } : j)),
          );
        } else {
          const grade = (result as { grade?: string }).grade ?? "";
          setJobs((prev) =>
            prev.map((j) => (j.id === next.id ? { ...j, status: "success", grade } : j)),
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "알 수 없는 오류";
        setJobs((prev) =>
          prev.map((j) => (j.id === next.id ? { ...j, status: "failed", errorMsg: msg } : j)),
        );
      } finally {
        processingRef.current = false;
      }
    })();
  }, [jobs, isRunning, router]);

  const enqueue = useCallback((items: { url: string; username: string }[]) => {
    if (items.length === 0) return;

    // 큐에 이미 대기/처리 중인 username (대소문자 무시)
    const activeUsernames = new Set(
      jobsRef.current
        .filter((j) => j.status === "pending" || j.status === "running")
        .map((j) => j.username.toLowerCase()),
    );

    const seenInBatch = new Set<string>();
    const filtered: { url: string; username: string }[] = [];
    let skippedCount = 0;
    for (const it of items) {
      const u = it.username.toLowerCase();
      if (activeUsernames.has(u) || seenInBatch.has(u)) {
        skippedCount++;
        continue;
      }
      seenInBatch.add(u);
      filtered.push(it);
    }

    if (skippedCount > 0) {
      toast.info(`이미 대기열에 있는 ${skippedCount}명 건너뜀`);
    }
    if (filtered.length === 0) return;

    summaryShownRef.current = false;
    const newJobs: AnalysisJob[] = filtered.map((it) => ({
      id: crypto.randomUUID(),
      url: it.url,
      username: it.username,
      status: "pending",
    }));
    setJobs((prev) => [...prev, ...newJobs]);
  }, []);

  const clearCompleted = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.status === "pending" || j.status === "running"));
  }, []);

  const dismissAll = useCallback(() => {
    if (processingRef.current) return;
    setJobs([]);
    summaryShownRef.current = false;
  }, []);

  return (
    <AnalysisJobsContext.Provider value={{ jobs, isRunning, enqueue, clearCompleted, dismissAll }}>
      {children}
    </AnalysisJobsContext.Provider>
  );
}
