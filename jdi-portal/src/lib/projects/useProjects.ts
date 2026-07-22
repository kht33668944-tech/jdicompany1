"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getProjects } from "./queries";
import type { Project } from "./types";

const PROJECTS_CHANGED_EVENT = "jdi:projects-changed";

let cachedProjects: Project[] | null = null;
let inflight: Promise<Project[]> | null = null;

async function fetchProjects(): Promise<Project[]> {
  if (!inflight) {
    inflight = getProjects(createClient(), { includeArchived: true })
      .then((projects) => {
        cachedProjects = projects;
        return projects;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** 생성/수정/삭제 후 호출 — 캐시를 비우고 모든 구독 컴포넌트를 갱신한다. */
export function notifyProjectsChanged(): void {
  cachedProjects = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT));
  }
}

/**
 * 프로젝트 목록 클라이언트 훅.
 * - 모듈 레벨 캐시로 대시보드 내 중복 조회를 막는다 (표시용, 권한은 RLS가 담당)
 * - `projects` = 보관 포함 전체, `activeProjects` = 보관 제외
 * - `enabled: false` 는 조회를 건너뜀 (compact 미리보기용).
 */
export function useProjects(options: { enabled?: boolean } = {}): {
  projects: Project[];
  activeProjects: Project[];
  loaded: boolean;
} {
  const enabled = options.enabled !== false;
  const [projects, setProjects] = useState<Project[]>(cachedProjects ?? []);
  const [loaded, setLoaded] = useState(cachedProjects !== null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = () => {
      void fetchProjects()
        .then((next) => {
          if (!active) return;
          setProjects(next);
          setLoaded(true);
        })
        .catch((error) => {
          console.warn("[projects] 목록 조회 실패:", error);
          if (active) setLoaded(true);
        });
    };
    if (cachedProjects === null) load();
    window.addEventListener(PROJECTS_CHANGED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(PROJECTS_CHANGED_EVENT, load);
    };
  }, [enabled]);

  return {
    projects,
    activeProjects: projects.filter((project) => !project.is_archived),
    loaded,
  };
}
