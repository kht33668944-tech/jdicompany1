import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Step = { label: string; ms: number; ok: boolean; err?: string };

async function timed<T>(
  steps: Step[],
  label: string,
  fn: () => Promise<T>
): Promise<T | undefined> {
  const start = Date.now();
  try {
    const result = await fn();
    steps.push({ label, ms: Date.now() - start, ok: true });
    return result;
  } catch (e) {
    steps.push({
      label,
      ms: Date.now() - start,
      ok: false,
      err: String(e).slice(0, 200),
    });
    return undefined;
  }
}

export async function GET() {
  const totalStart = Date.now();
  const steps: Step[] = [];

  const t0 = Date.now();
  const supabase = await createClient();
  steps.push({ label: "createClient", ms: Date.now() - t0, ok: true });

  await timed(steps, "auth.getUser (network)", async () => {
    await supabase.auth.getUser();
  });

  await timed(steps, "auth.getSession (local)", async () => {
    await supabase.auth.getSession();
  });

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  if (!userId) {
    return NextResponse.json({
      total: Date.now() - totalStart,
      steps,
      note: "no user — login first then revisit",
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  await timed(steps, "getProfile", async () => {
    await supabase.from("profiles").select("*").eq("id", userId).single();
  });

  await timed(steps, "getTodayRecord", async () => {
    await supabase
      .from("attendance_records")
      .select("*")
      .eq("user_id", userId)
      .eq("work_date", today)
      .maybeSingle();
  });

  await timed(steps, "7 queries PARALLEL", async () => {
    await Promise.all([
      supabase.from("attendance_records").select("*").eq("user_id", userId).limit(1),
      supabase.from("vacation_balances").select("*").eq("user_id", userId).limit(1),
      supabase.from("vacation_requests").select("*").eq("user_id", userId).limit(1),
      supabase.from("correction_requests").select("*").eq("user_id", userId).limit(1),
      supabase.from("work_schedules").select("*").eq("user_id", userId).limit(1),
      supabase.from("work_schedule_change_requests").select("*").eq("user_id", userId).limit(1),
      supabase.from("profiles").select("*").eq("id", userId).single(),
    ]);
  });

  await timed(steps, "7 queries SEQUENTIAL", async () => {
    await supabase.from("attendance_records").select("*").eq("user_id", userId).limit(1);
    await supabase.from("vacation_balances").select("*").eq("user_id", userId).limit(1);
    await supabase.from("vacation_requests").select("*").eq("user_id", userId).limit(1);
    await supabase.from("correction_requests").select("*").eq("user_id", userId).limit(1);
    await supabase.from("work_schedules").select("*").eq("user_id", userId).limit(1);
    await supabase.from("work_schedule_change_requests").select("*").eq("user_id", userId).limit(1);
    await supabase.from("profiles").select("*").eq("id", userId).single();
  });

  return NextResponse.json({
    total: Date.now() - totalStart,
    steps,
  });
}
