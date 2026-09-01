#!/usr/bin/env node
/**
 * 잔디 AI 보고용 원본 데이터 덤프.
 *
 * 이 스크립트는 "사실"만 뽑는다. 해석·요약은 하지 않는다.
 * 루틴에서 Claude 가 이 출력을 읽고 분석 문장을 쓴다.
 *
 * 사실 조회와 해석을 나눈 이유: 조회까지 AI 에게 맡기면 숫자를 잘못 옮기거나
 * 항목을 빠뜨려도 아무도 모른다. 여기서 뽑은 것만이 보고서의 근거다.
 *
 * 날짜 규칙: 날짜는 전부 SQL 에서 문자열(text)로 받는다. pg 가 DATE 를 JS Date 로
 * 주면 toISOString() 이 UTC 로 되돌려 KST 기준 하루가 밀린다(2026-09-01 → 08-31).
 * 그래서 이 파일에는 날짜를 만드는 JS 코드가 없다.
 *
 * 사용:
 *   node --env-file=.env.local scripts/jandi-report-data.mjs
 *   node --env-file=.env.local scripts/jandi-report-data.mjs --date 2026-08-26
 */

import pg from "pg";

const args = process.argv.slice(2);
const dateArgIndex = args.indexOf("--date");
const overrideDate = dateArgIndex >= 0 ? args[dateArgIndex + 1] : null;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL 환경변수가 없습니다. --env-file=.env.local 을 붙였는지 확인하세요.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows: paramRows } = await client.query(
  `select
     coalesce($1::date, (now() at time zone 'Asia/Seoul')::date)::text as today,
     to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') as now_kst,
     to_char(coalesce($1::date, (now() at time zone 'Asia/Seoul')::date), 'MM월 DD일') as today_ko`,
  [overrideDate],
);
const today = paramRows[0].today;
const nowKst = paramRows[0].now_kst;

const out = [];
out.push(`# JDI 포털 오늘 데이터 (기준일 ${today}, 뽑은 시각 ${nowKst} KST)`);

// ── 오늘 업무보고 (본문 전체) ─────────────────────────────
const todayEntries = await client.query(
  `select p.full_name as author, e.title, e.description,
          to_char(e.created_at at time zone 'Asia/Seoul', 'HH24:MI') as at
   from public.work_timeline_entries e
   left join public.profiles p on p.id = e.user_id
   where (e.created_at at time zone 'Asia/Seoul')::date = $1::date
   order by e.created_at asc`,
  [today],
);
out.push(`\n## 오늘 올라온 업무보고 (${todayEntries.rowCount}건) — 본문 전체`);
if (todayEntries.rowCount === 0) {
  out.push("(없음)");
} else {
  for (const r of todayEntries.rows) {
    out.push(`\n### ${r.at} ${r.author ?? "작성자미상"} — ${r.title}`);
    out.push(r.description?.trim() ? r.description.trim() : "(본문 없음)");
  }
}

// ── 최근 업무보고 제목 (맥락용) ────────────────────────────
const recentEntries = await client.query(
  `select p.full_name as author, e.title,
          to_char(e.created_at at time zone 'Asia/Seoul', 'MM-DD') as d
   from public.work_timeline_entries e
   left join public.profiles p on p.id = e.user_id
   where (e.created_at at time zone 'Asia/Seoul')::date between $1::date - 4 and $1::date - 1
   order by e.created_at desc`,
  [today],
);
out.push(`\n## 최근 4일 업무보고 제목 (맥락 참고용 — 오늘 한 일로 쓰면 안 됨)`);
out.push(
  recentEntries.rowCount === 0
    ? "(없음)"
    : recentEntries.rows.map((r) => `- ${r.d} ${r.author ?? "?"} — ${r.title}`).join("\n"),
);

// ── 할일 ──────────────────────────────────────────────────
const tasks = await client.query(
  `select t.title, t.status, t.priority,
          t.due_date::text as due_date,
          ((t.completed_at at time zone 'Asia/Seoul')::date)::text as completed_kst,
          ($1::date)::text as today_text,
          coalesce((
            select string_agg(p.full_name, ', ' order by p.full_name)
            from public.task_assignees ta
            join public.profiles p on p.id = ta.user_id and p.is_approved = true
            where ta.task_id = t.id
          ), '담당자 미지정') as assignees
   from public.tasks t
   where t.status = '진행중'
      or (t.completed_at at time zone 'Asia/Seoul')::date = $1::date
      or (t.due_date is not null and t.due_date < $1::date and t.status <> '완료')
   order by t.due_date asc nulls last, t.title asc`,
  [today],
);

const doneToday = tasks.rows.filter((r) => r.completed_kst === today);
const inProgress = tasks.rows.filter((r) => r.status === "진행중");
const overdue = tasks.rows.filter(
  (r) => r.status !== "완료" && r.due_date && r.due_date < today,
);

function taskLine(r) {
  const due = r.due_date ? ` / 기한 ${r.due_date}` : "";
  return `- ${r.title} — ${r.assignees} (${r.status}, ${r.priority}${due})`;
}

out.push(`\n## 오늘 완료된 할일 (${doneToday.length}건)`);
out.push(doneToday.length ? doneToday.map(taskLine).join("\n") : "(없음)");

out.push(`\n## 진행 중인 할일 (${inProgress.length}건)`);
out.push(inProgress.length ? inProgress.map(taskLine).join("\n") : "(없음)");

out.push(`\n## 기한이 지난 할일 (${overdue.length}건) — 보고서에 나열하지 말 것`);
out.push(overdue.length ? overdue.map(taskLine).join("\n") : "(없음)");

// ── 검토 대기 ─────────────────────────────────────────────
const reviews = await client.query(
  `select e.title as entry_title, r.comment, r.state,
          ap.full_name as author, rp.full_name as reviewer,
          ((r.created_at at time zone 'Asia/Seoul')::date)::text as created_kst
   from public.work_timeline_reviews r
   join public.work_timeline_entries e on e.id = r.entry_id
   left join public.profiles ap on ap.id = r.author_id
   left join public.profiles rp on rp.id = r.reviewer_id
   where r.state in ('open', 'submitted')
   order by r.created_at asc`,
);
out.push(`\n## 검토 대기 (${reviews.rowCount}건)`);
out.push(
  reviews.rowCount === 0
    ? "(없음)"
    : reviews.rows
        .map(
          (r) =>
            `- ${r.author ?? "?"} → ${r.reviewer ?? "?"} : ${r.entry_title} (${r.created_kst} 요청) — "${(
              r.comment ?? ""
            ).slice(0, 120)}"`,
        )
        .join("\n"),
);

// ── 오늘 일정 ─────────────────────────────────────────────
const schedules = await client.query(
  `select s.title, s.category, s.is_all_day,
          to_char(s.start_time at time zone 'Asia/Seoul', 'HH24:MI') as start_kst
   from public.schedules s
   where s.start_time <= (($1::date + 1)::text || 'T00:00:00+09:00')::timestamptz
     and s.end_time >= ($1::date::text || 'T00:00:00+09:00')::timestamptz
   order by s.start_time asc`,
  [today],
);
out.push(`\n## 오늘 일정 (${schedules.rowCount}건)`);
out.push(
  schedules.rowCount === 0
    ? "(없음)"
    : schedules.rows
        .map((r) => `- ${r.is_all_day ? "종일" : r.start_kst} ${r.title} [${r.category}]`)
        .join("\n"),
);

// ── 한 줄 숫자 요약 (보고서 맨 아래에 그대로 쓰라고 주는 값) ──
out.push(
  `\n## 숫자 한 줄 (그대로 사용)\n완료 ${doneToday.length} · 진행 ${inProgress.length} · 검토대기 ${reviews.rowCount} · 업무보고 ${todayEntries.rowCount}건`,
);

await client.end();
console.log(out.join("\n"));
