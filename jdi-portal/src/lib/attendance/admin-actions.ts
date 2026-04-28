"use server";

import { getAuthUser } from "@/lib/supabase/auth";
import {
  getAllTodayAttendance,
  getAllProfiles,
  getPendingVacationRequests,
  getCancelVacationRequests,
  getPendingCorrectionRequests,
  getPendingWorkScheduleChangeRequests,
  getPendingHireDateChangeRequests,
  getPendingIpChangeRequests,
} from "./queries";
import type {
  AttendanceWithProfile,
  Profile,
  VacationRequest,
  CorrectionRequest,
  WorkScheduleChangeRequest,
  HireDateChangeRequest,
  IpChangeRequest,
} from "./types";

export interface AdminAttendanceData {
  allTodayAttendance: AttendanceWithProfile[];
  allProfiles: Profile[];
  pendingVacationRequests: VacationRequest[];
  cancelVacationRequests: VacationRequest[];
  pendingCorrectionRequests: CorrectionRequest[];
  pendingWorkScheduleChangeRequests: WorkScheduleChangeRequest[];
  pendingHireDateChangeRequests: HireDateChangeRequest[];
  pendingIpChangeRequests: IpChangeRequest[];
}

const EMPTY: AdminAttendanceData = {
  allTodayAttendance: [],
  allProfiles: [],
  pendingVacationRequests: [],
  cancelVacationRequests: [],
  pendingCorrectionRequests: [],
  pendingWorkScheduleChangeRequests: [],
  pendingHireDateChangeRequests: [],
  pendingIpChangeRequests: [],
};

/**
 * 관리 탭 클릭 시점에만 호출되는 admin 전용 8개 쿼리 일괄 조회.
 * SSR 단계에서는 서버 부담을 줄이기 위해 호출하지 않음.
 */
export async function getAdminAttendanceData(): Promise<AdminAttendanceData> {
  const auth = await getAuthUser();
  if (!auth || auth.profile.role !== "admin") return EMPTY;

  const { supabase } = auth;
  try {
    const [
      allTodayAttendance,
      allProfiles,
      pendingVacationRequests,
      cancelVacationRequests,
      pendingCorrectionRequests,
      pendingWorkScheduleChangeRequests,
      pendingHireDateChangeRequests,
      pendingIpChangeRequests,
    ] = await Promise.all([
      getAllTodayAttendance(supabase),
      getAllProfiles(supabase),
      getPendingVacationRequests(supabase),
      getCancelVacationRequests(supabase),
      getPendingCorrectionRequests(supabase),
      getPendingWorkScheduleChangeRequests(supabase),
      getPendingHireDateChangeRequests(supabase),
      getPendingIpChangeRequests(supabase),
    ]);

    return {
      allTodayAttendance,
      allProfiles,
      pendingVacationRequests,
      cancelVacationRequests,
      pendingCorrectionRequests,
      pendingWorkScheduleChangeRequests,
      pendingHireDateChangeRequests,
      pendingIpChangeRequests,
    };
  } catch (err) {
    console.error("[admin-actions] getAdminAttendanceData failed:", err);
    return EMPTY;
  }
}
