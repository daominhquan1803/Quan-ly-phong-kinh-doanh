import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { resolveReportPeriods, type ReportType } from "@/lib/report-period";
import { getReportData } from "@/lib/report-metrics";
import { buildReportFile } from "@/lib/report-workbook";

export const dynamic = "force-dynamic";
// Gom nhiều nguồn (PO, giao hàng, công nợ) nên cho phép chạy lâu hơn mặc định.
export const maxDuration = 120;

/** Xuất báo cáo tuần/tháng dạng Excel dashboard. ADMIN: cả phòng + từng nhân viên; NVKD: chỉ chính mình. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const period = searchParams.get("period") ?? "";
    if (type !== "week" && type !== "month") {
      return NextResponse.json({ error: "Loại báo cáo phải là week hoặc month" }, { status: 400 });
    }
    const periods = resolveReportPeriods(type as ReportType, period);
    if (!periods) {
      return NextResponse.json({ error: type === "week" ? "Tuần không hợp lệ (dạng 2026-W41)" : "Tháng không hợp lệ (dạng 2026-10)" }, { status: 400 });
    }

    const data = await getReportData({
      type: type as ReportType,
      periods,
      scopeEmployeeId: session.user.role === "ADMIN" ? undefined : session.user.id,
    });
    const buffer = await buildReportFile(data);
    const fileName = `Bao-cao-${type === "week" ? "tuan" : "thang"}-${period}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("reports export GET error", err);
    return NextResponse.json({ error: "Không xuất được báo cáo" }, { status: 500 });
  }
}
