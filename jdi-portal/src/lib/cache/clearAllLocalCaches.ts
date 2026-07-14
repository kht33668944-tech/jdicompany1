/**
 * 로그아웃 시 브라우저에 저장된 모든 로컬 표시용 캐시를 한 번에 정리한다.
 *
 * 각 도메인 캐시(업무 타임라인·일정·할 일·채팅)는 사용자별로 분리되고
 * 열람 권한은 항상 서버 RLS 가 다시 확인하지만, 명시적 로그아웃 시에는
 * 기기에 남은 표시용 데이터를 도메인에 상관없이 일관되게 비운다.
 *
 * 새 도메인 캐시를 추가하면 이 목록에 clear 함수를 등록한다.
 * 모든 개별 clear 함수는 실패 시 graceful no-op 이므로 Promise.all 로 함께 실행한다.
 */

import { clearAllMessageCache } from "@/lib/chat/messageCache";
import { clearScheduleCache } from "@/lib/schedule/scheduleCache";
import { clearTasksCache } from "@/lib/tasks/tasksCache";
import { clearWorkTimelineCache } from "@/lib/work-timeline/timelineCache";

export async function clearAllLocalCaches(): Promise<void> {
  await Promise.all([
    clearWorkTimelineCache(),
    clearScheduleCache(),
    clearTasksCache(),
    clearAllMessageCache(),
  ]);
}
