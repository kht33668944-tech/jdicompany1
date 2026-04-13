import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractClientIp } from "@/lib/utils/ip";

export async function POST(request: NextRequest) {
  const clientIp = extractClientIp(request);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("attendance_check_out", {
    p_client_ip: clientIp,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
