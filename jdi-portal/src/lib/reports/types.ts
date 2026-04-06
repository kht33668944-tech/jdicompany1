export type ReportType = "bug" | "inconvenience" | "improvement";
export type ReportStatus = "submitted" | "in_progress" | "completed";
export type ReportPage = "dashboard" | "attendance" | "tasks" | "schedule" | "settings";

export interface Report {
  id: string;
  user_id: string;
  type: ReportType;
  page: ReportPage;
  title: string;
  content: string;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
}

export interface ReportWithProfile extends Report {
  author_profile: { full_name: string; avatar_url: string | null };
  attachment_count: number;
}

export interface ReportAttachment {
  id: string;
  report_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  created_at: string;
}
