export interface Project {
  id: string;
  name: string;
  color: string;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 조인 결과 등 최소 표시용 */
export interface ProjectRef {
  id: string;
  name: string;
  color: string;
}
