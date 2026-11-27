import { NextRequest, NextResponse } from "next/server";
import { requireInternalToken, UnauthorizedError } from "@/lib/rbac";
import { loadProductionLines } from "@/lib/production-lines";
import { buildDigests } from "@/lib/production-match";

export const dynamic = "force-dynamic";

/**
 * Cho worker gọi lúc 8h: số dòng trễ / nguy cơ trễ / xong chưa giao của từng NVKD kèm 5 dòng gấp nhất
 * (apps/worker/src/notifications/productionDigest.ts). Bảo vệ bằng INTERNAL_SYNC_TOKEN.
 */
export async function GET(req: NextRequest) {
  try {
    requireInternalToken(req);
    const { syncedAt, lines } = await loadProductionLines();
    return NextResponse.json({ syncedAt, rows: buildDigests(lines) });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("internal/production-digest GET error", err);
    return NextResponse.json({ error: "Không lấy được tiến độ sản xuất" }, { status: 500 });
  }
}
