import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { getLeadReport } from "@/lib/lead-scan-data";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Báo cáo quét lead: bài quét FB, khách nhận, khách liên hệ (đủ thông tin) / liên hệ được; khách doanh nghiệp quét báo; khách tự tìm;
 * nhật ký quét. `from`/`to` = YYYY-MM-DD (gồm 2 đầu). Mọi nhân viên đều xem được (cùng quy ước các trang báo cáo).
 */
export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") ?? "";
    const to = searchParams.get("to") ?? "";
    if (!ISO.test(from) || !ISO.test(to) || from > to) return NextResponse.json({ error: "Khoảng ngày không hợp lệ" }, { status: 400 });
    return NextResponse.json(await getLeadReport(from, to));
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("lead-scan report error", err);
    return NextResponse.json({ error: "Không tải được báo cáo quét lead" }, { status: 500 });
  }
}
