import { NextRequest, NextResponse } from "next/server";
import { extractClientIp } from "@/lib/utils/ip";

export async function GET(request: NextRequest) {
  const ip = extractClientIp(request);
  return NextResponse.json({ ip });
}
