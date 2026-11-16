import { NextRequest, NextResponse } from "next/server";
import { requireInternalToken, UnauthorizedError } from "@/lib/rbac";
import { syncLeadSheet } from "@/lib/lead-scan-data";

export const dynamic = "force-dynamic";

/** Cho worker gọi theo lịch: kéo Google Sheet "Theo dõi khách tiềm năng" và nhập. Bảo vệ bằng INTERNAL_SYNC_TOKEN, không qua NextAuth. */
export async function POST(req: NextRequest) {
  try {
    requireInternalToken(req);
    return NextResponse.json(await syncLeadSheet());
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    const message = err instanceof Error ? err.message : "Không đồng bộ được từ Google Sheet";
    console.error("internal lead-sheet-sync error", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
