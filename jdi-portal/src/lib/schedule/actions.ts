import { createClient } from "@/lib/supabase/client";
import { createNotification } from "@/lib/notifications/actions";

function getSupabase() {
  return createClient();
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
  createdBy: string;
  participantIds?: string[];
}) {
  const supabase = getSupabase();

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
      created_by: params.createdBy,
    })
    .select()
    .single();

  if (error) throw error;

  if (params.participantIds && params.participantIds.length > 0) {
    try {
      await setParticipants(data.id, params.participantIds);

      // 알림: 참여자들에게 (생성자 제외)
      const notifyIds = params.participantIds.filter((id) => id !== params.createdBy);
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
  const supabase = getSupabase();

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
  const supabase = getSupabase();
  const { error } = await supabase.from("schedules").delete().eq("id", scheduleId);
  if (error) throw error;
}

export async function setParticipants(scheduleId: string, userIds: string[]) {
  const supabase = getSupabase();

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
