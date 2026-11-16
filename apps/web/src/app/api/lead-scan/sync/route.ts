import { NextResponse } from "next/server";
import { requireSystemAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { syncLeadSheet } from "@/lib/lead-scan-data";

export const dynamic = "force-dynamic";

/** Nút "Đồng bộ ngay từ Google Sheet" — CHỈ Quản trị hệ thống. Kéo sheet theo link xuất xlsx rồi nhập (cập nhật theo khoá nguồn). */
export async function POST() {
  try {
    await requireSystemAdmin();
    return NextResponse.json(await syncLeadSheet());
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof Error && /^(Không đọc được|Không nhận ra)/.test(err.message)) return NextResponse.json({ error: err.message }, { status: 502 });
    console.error("lead-scan sync error", err);
    return NextResponse.json({ error: "Không đồng bộ được từ Google Sheet" }, { status: 500 });
  }
}
