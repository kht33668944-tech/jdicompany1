/**
 * 잔디 자동 보고 도메인 타입.
 *
 * format.ts 를 순수 함수로 두기 위해, 조회 결과(ReportData)와 전송 페이로드
 * (JandiPayload)를 여기서 완전히 분리해 정의한다. format.ts 는 DB 도 네트워크도
 * 모르고 ReportData 하나만 받는다.
 */

/** 13시 보고(앞으로 할 일) / 18시 보고(오늘 한 일) */
export type ReportSlot = "noon" | "evening";

// ─── 잔디 incoming webhook 페이로드 ───

export interface JandiConnectInfo {
  title: string;
  description: string;
}

export interface JandiPayload {
  body: string;
  connectColor: string;
  connectInfo: JandiConnectInfo[];
}

// ─── 보고용 조회 결과 ───

export type ReportTaskStatus = "대기" | "진행중" | "완료";

export interface ReportTask {
  id: string;
  title: string;
  status: ReportTaskStatus;
  /** YYYY-MM-DD (KST) 또는 null */
  dueDate: string | null;
  /** ISO 문자열 또는 null */
  completedAt: string | null;
  assigneeNames: string[];
}

export interface ReportEntry {
  id: string;
  title: string;
  authorName: string | null;
}

export interface ReportReview {
  id: string;
  entryTitle: string;
  /** 업무보고 작성자 = 보완해야 할 사람 */
  authorName: string | null;
  /** 검토자 = 확인해야 할 사람 */
  reviewerName: string | null;
  /** ISO 문자열 */
  createdAt: string;
}

export interface ReportSchedule {
  id: string;
  title: string;
  /** ISO 문자열 */
  startTime: string;
  isAllDay: boolean;
}

export interface ReportData {
  /** YYYY-MM-DD (KST) */
  today: string;
  /** 보고 생성 시각 ISO */
  now: string;
  schedules: ReportSchedule[];
  tasks: ReportTask[];
  entries: ReportEntry[];
  reviews: ReportReview[];
}
