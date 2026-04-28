export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: "employee" | "admin" | "developer";
  department: string;
  hire_date: string;
  avatar_url?: string | null;
  phone?: string | null;
  bio?: string | null;
  is_approved: boolean;
  hire_date_locked: boolean;
  work_start_time: string | null;  // "HH:MM:SS" format or null
  work_end_time: string | null;    // "HH:MM:SS" format or null
  allowed_ip: string | null;
  allowed_ip_locked: boolean;
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
export type RequestStatus = "대기중" | "승인" | "반려" | "취소요청" | "취소";

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

export interface WorkSchedule {
  id: string;
  user_id: string;
  work_start_time: string;       // "HH:MM:SS"
  work_end_time: string;         // "HH:MM:SS"
  effective_from: string;        // "YYYY-MM-DD"
  is_initial_seed: boolean;
  created_by: string | null;
  created_at: string;
}

export interface WorkScheduleChangeRequest {
  id: string;
  user_id: string;
  requested_start_time: string;
  requested_end_time: string;
  effective_from: string;
  reason: string | null;
  status: "대기중" | "승인" | "반려";
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  profiles?: { full_name: string };
}

export interface IpChangeRequest {
  id: string;
  user_id: string;
  requested_ip: string;
  reason: string | null;
  status: "대기중" | "승인" | "반려";
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  profiles?: { full_name: string; allowed_ip: string | null };
}

export interface HireDateChangeRequest {
  id: string;
  user_id: string;
  requested_hire_date: string;
  reason: string | null;
  status: "대기중" | "승인" | "반려";
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  profiles?: { full_name: string; hire_date: string | null };
}

// 근태관리 페이지(/dashboard/attendance) 의 SSR 초기 데이터.
// page.tsx에서 한 번에 fetch해서 AttendancePageClient에 props로 넘김.
export interface AttendancePageData {
  // 모든 사용자
  todayRecord: AttendanceRecord | null;
  weekRecords: AttendanceRecord[];
  weekStart: string;
  vacationBalance: VacationBalance | null;
  vacationRequests: VacationRequest[];
  correctionRequests: CorrectionRequest[];
  workSchedules: WorkSchedule[];
  myWorkScheduleChangeRequests: WorkScheduleChangeRequest[];
  // admin 전용 (일반 사용자 = null)
  allTodayAttendance: AttendanceWithProfile[] | null;
  allProfiles: Profile[] | null;
  pendingVacationRequests: VacationRequest[] | null;
  cancelVacationRequests: VacationRequest[] | null;
  pendingCorrectionRequests: CorrectionRequest[] | null;
  pendingWorkScheduleChangeRequests: WorkScheduleChangeRequest[] | null;
  pendingHireDateChangeRequests: HireDateChangeRequest[] | null;
  pendingIpChangeRequests: IpChangeRequest[] | null;
}
