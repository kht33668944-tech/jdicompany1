"use server";

import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications/actions";

async function getSessionUserId() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Not authenticated");
  return { supabase, userId: session.user.id };
}

export async function createSchedule(params: {
  title: string;
  description?: string;
  category: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  location?: string;
  visibility?: string;
  participantIds?: string[];
}) {
  const { supabase, userId } = await getSessionUserId();

  const { data, error } = await supabase
    .from("schedules")
    .insert({
      title: params.title,
      description: params.description || null,
      category: params.category,
      start_time: params.startTime,
      end_time: params.endTime,
      is_all_day: params.isAllDay,
      location: params.location || null,
      visibility: params.visibility || "company",
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;

  if (params.participantIds && params.participantIds.length > 0) {
    try {
      await setParticipants(data.id, params.participantIds);

      // 알림: 참여자들에게 (생성자 제외)
      const notifyIds = params.participantIds.filter((id) => id !== userId);
      for (const pid of notifyIds) {
        await createNotification({
          userId: pid,
          type: "schedule_invite",
          title: "새 일정에 참여자로 추가되었습니다",
          body: params.title,
          link: "/dashboard/schedule",
          metadata: { schedule_id: data.id },
        });
      }
    } catch (participantError) {
      // 롤백: 참여자 설정 실패 시 생성된 일정 삭제
      await supabase.from("schedules").delete().eq("id", data.id);
      throw participantError;
    }
  }

  return data;
}

export async function updateSchedule(
  scheduleId: string,
  params: {
    title?: string;
    description?: string | null;
    category?: string;
    startTime?: string;
    endTime?: string;
    isAllDay?: boolean;
    location?: string | null;
    visibility?: string;
  }
) {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.title !== undefined) updateData.title = params.title;
  if (params.description !== undefined) updateData.description = params.description;
  if (params.category !== undefined) updateData.category = params.category;
  if (params.startTime !== undefined) updateData.start_time = params.startTime;
  if (params.endTime !== undefined) updateData.end_time = params.endTime;
  if (params.isAllDay !== undefined) updateData.is_all_day = params.isAllDay;
  if (params.location !== undefined) updateData.location = params.location;
  if (params.visibility !== undefined) updateData.visibility = params.visibility;

  if (Object.keys(updateData).length === 1) return;

  const { data, error } = await supabase
    .from("schedules")
    .update(updateData)
    .eq("id", scheduleId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSchedule(scheduleId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("schedules").delete().eq("id", scheduleId);
  if (error) throw error;
}

export async function setParticipants(scheduleId: string, userIds: string[]) {
  const supabase = await createClient();

  // 기존 참여자 삭제
  const { error: deleteError } = await supabase
    .from("schedule_participants")
    .delete()
    .eq("schedule_id", scheduleId);
  if (deleteError) throw deleteError;

  // 새 참여자 추가
  if (userIds.length > 0) {
    const rows = userIds.map((userId) => ({
      schedule_id: scheduleId,
      user_id: userId,
    }));
    const { error: insertError } = await supabase
      .from("schedule_participants")
      .insert(rows);
    if (insertError) throw insertError;
  }
}

/**
 * 일정 본문 + 참가자 동시 업데이트 (RPC 한 트랜잭션)
 * - 참가자는 diff 기반으로 갱신 (전체 삭제 후 재삽입 X)
 * - 도중 실패해도 부분 반영이 남지 않음
 */
export async function updateScheduleWithParticipants(
  scheduleId: string,
  params: {
    title?: string;
    description?: string | null;
    category?: string;
    startTime?: string;
    endTime?: string;
    isAllDay?: boolean;
    location?: string | null;
    visibility?: string;
  },
  participantIds: string[] | null
) {
  const supabase = await createClient();

  // 변경된 필드만 JSONB 로 보냄 (DB 함수가 transmitted key 만 반영)
  const updates: Record<string, unknown> = {};
  if (params.title !== undefined) updates.title = params.title;
  if (params.description !== undefined) updates.description = params.description;
  if (params.category !== undefined) updates.category = params.category;
  if (params.startTime !== undefined) updates.start_time = params.startTime;
  if (params.endTime !== undefined) updates.end_time = params.endTime;
  if (params.isAllDay !== undefined) updates.is_all_day = params.isAllDay;
  if (params.location !== undefined) updates.location = params.location;
  if (params.visibility !== undefined) updates.visibility = params.visibility;

  const { error } = await supabase.rpc("update_schedule_with_participants", {
    p_schedule_id: scheduleId,
    p_updates: updates,
    p_participant_ids: participantIds,
  });
  if (error) throw error;
}
