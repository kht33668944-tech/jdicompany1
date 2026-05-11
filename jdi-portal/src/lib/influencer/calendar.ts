import type { CampaignStatus, InfluencerCampaignWithInfluencer } from "@/lib/influencer/types";

const MAX_VISIBLE_LANES = 3;

// ─── 보조 함수 ────────────────────────────────────────────────────────────────

export function kstTodayStr(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysStr(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getCampaignDatesInRange(
  campaigns: InfluencerCampaignWithInfluencer[],
  fromStr: string,
  toStr: string
): InfluencerCampaignWithInfluencer[] {
  const seen = new Set<string>();
  const result: { campaign: InfluencerCampaignWithInfluencer; nearestDate: string }[] = [];

  for (const c of campaigns) {
    if (seen.has(c.id)) continue;
    const dates = [c.contact_date, c.ship_date, c.expected_post_date].filter(
      (d): d is string => d !== null && d >= fromStr && d <= toStr
    );
    if (dates.length === 0) continue;
    seen.add(c.id);
    dates.sort();
    result.push({ campaign: c, nearestDate: dates[0] });
  }

  result.sort((a, b) => a.nearestDate.localeCompare(b.nearestDate));
  return result.map((r) => r.campaign);
}

// ─── 날짜 범위 결정 ───────────────────────────────────────────────────────────

export function getCampaignDateRange(
  campaign: InfluencerCampaignWithInfluencer
): { start: string | null; end: string | null } {
  const start = campaign.contact_date ?? campaign.ship_date ?? campaign.expected_post_date;
  const end = campaign.expected_post_date ?? campaign.ship_date ?? campaign.contact_date;

  if (start === null || end === null) return { start: null, end: null };

  if (start > end) return { start: end, end: start };
  return { start, end };
}

// ─── 상태별 색상 ──────────────────────────────────────────────────────────────

const BAR_COLORS: Record<CampaignStatus, { barClass: string; textClass: string; label: string }> = {
  planned:  { barClass: "bg-slate-100",   textClass: "text-slate-700",   label: "협의중" },
  dm_sent:  { barClass: "bg-blue-100",    textClass: "text-blue-700",    label: "DM 발송" },
  replied:  { barClass: "bg-cyan-100",    textClass: "text-cyan-700",    label: "응답 받음" },
  shipped:  { barClass: "bg-amber-100",   textClass: "text-amber-700",   label: "발송완료" },
  posted:   { barClass: "bg-violet-100",  textClass: "text-violet-700",  label: "포스팅 완료" },
  done:     { barClass: "bg-emerald-100", textClass: "text-emerald-700", label: "완료" },
};

export function getCampaignBarColor(
  status: CampaignStatus
): { barClass: string; textClass: string; label: string } {
  return BAR_COLORS[status];
}

// ─── 간트 주별 데이터 ─────────────────────────────────────────────────────────

export interface CampaignBar {
  campaign: InfluencerCampaignWithInfluencer;
  startCol: number;
  endCol: number;
  lane: number;
}

export interface WeekData {
  cells: ({ day: number; dateStr: string; dow: number } | null)[];
  bars: CampaignBar[];
  laneCount: number;
  hiddenBarCounts: number[];
}

export function buildSeedingWeeks(
  campaigns: InfluencerCampaignWithInfluencer[],
  year: number,
  month: number
): WeekData[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const monthStart = `${year}-${pad(month)}-01`;
  const monthEnd = `${year}-${pad(month)}-${pad(daysInMonth)}`;

  // 주 그리드 구성
  const weeks: WeekData[] = [];
  const dateToWeek = new Map<string, WeekData>();
  let row: WeekData["cells"] = Array(7).fill(null);

  for (let d = 1; d <= daysInMonth; d++) {
    const col = (firstDay + d - 1) % 7;
    if (d > 1 && col === 0) {
      const week: WeekData = { cells: row, bars: [], laneCount: 0, hiddenBarCounts: Array(7).fill(0) };
      weeks.push(week);
      for (const cell of row) if (cell) dateToWeek.set(cell.dateStr, week);
      row = Array(7).fill(null);
    }
    const dateStr = `${year}-${pad(month)}-${pad(d)}`;
    row[col] = { day: d, dateStr, dow: col };
  }
  const lastWeek: WeekData = { cells: row, bars: [], laneCount: 0, hiddenBarCounts: Array(7).fill(0) };
  weeks.push(lastWeek);
  for (const cell of row) if (cell) dateToWeek.set(cell.dateStr, lastWeek);

  // 날짜 범위가 있는 캠페인만 추출 후 정렬
  const ranged = campaigns
    .map((c) => ({ campaign: c, ...getCampaignDateRange(c) }))
    .filter((x): x is { campaign: InfluencerCampaignWithInfluencer; start: string; end: string } =>
      x.start !== null && x.end !== null
    );
  ranged.sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));

  // 그리디 lane 할당
  for (const { campaign, start, end } of ranged) {
    const rangeStart = start < monthStart ? monthStart : start;
    const rangeEnd = end > monthEnd ? monthEnd : end;

    for (const week of weeks) {
      let startCol = -1;
      let endCol = -1;
      for (let c = 0; c < 7; c++) {
        const cell = week.cells[c];
        if (cell && cell.dateStr >= rangeStart && cell.dateStr <= rangeEnd) {
          if (startCol === -1) startCol = c;
          endCol = c;
        }
      }
      if (startCol === -1) continue;

      const occupied = new Set<number>();
      for (const bar of week.bars) {
        if (bar.startCol <= endCol && bar.endCol >= startCol) occupied.add(bar.lane);
      }
      let lane = 0;
      while (occupied.has(lane)) lane++;

      week.bars.push({ campaign, startCol, endCol, lane });
      week.laneCount = Math.max(week.laneCount, lane + 1);
    }
  }

  // 열별 hidden bar 수 집계
  for (const week of weeks) {
    for (const bar of week.bars) {
      if (bar.lane >= MAX_VISIBLE_LANES) {
        for (let c = bar.startCol; c <= bar.endCol; c++) {
          week.hiddenBarCounts[c]++;
        }
      }
    }
  }

  return weeks;
}

// ─── 오늘 할 일 분류 ──────────────────────────────────────────────────────────

export function getTodayCampaignTasks(campaigns: InfluencerCampaignWithInfluencer[]): {
  dmList: InfluencerCampaignWithInfluencer[];
  shipList: InfluencerCampaignWithInfluencer[];
  postList: InfluencerCampaignWithInfluencer[];
} {
  const today = kstTodayStr();
  return {
    dmList:   campaigns.filter((c) => c.contact_date === today),
    shipList: campaigns.filter((c) => c.ship_date === today),
    postList: campaigns.filter((c) => c.expected_post_date === today),
  };
}
