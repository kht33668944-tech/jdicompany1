export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: "employee" | "admin";
  department: string;
  hire_date: string;
}

export interface AttendanceRecord {
  id: string;
  user_id: string;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  total_minutes: number | null;
  status: "미출근" | "근무중" | "퇴근";
  note: string | null;
}

export type VacationType = "연차" | "반차-오전" | "반차-오후" | "병가" | "특별휴가";
export type RequestStatus = "대기중" | "승인" | "반려";

export interface VacationBalance {
  id: string;
  user_id: string;
  year: number;
  total_days: number;
  used_days: number;
  remaining_days: number;
}

export interface VacationRequest {
  id: string;
  user_id: string;
  vacation_type: VacationType;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: RequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  profiles?: { full_name: string };
}

export interface CorrectionRequest {
  id: string;
  user_id: string;
  attendance_record_id: string | null;
  target_date: string;
  request_type: "출근시간수정" | "퇴근시간수정" | "기록누락";
  requested_check_in: string | null;
  requested_check_out: string | null;
  reason: string;
  status: RequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles?: { full_name: string };
}

export interface AttendanceWithProfile extends AttendanceRecord {
  profiles: { full_name: string; email: string; department: string };
}
