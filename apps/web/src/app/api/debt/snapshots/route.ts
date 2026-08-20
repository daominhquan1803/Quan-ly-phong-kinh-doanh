import { NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Công nợ không gắn được theo từng nhân viên (nguồn congno.hienvi.me không có dữ liệu
// phụ trách theo người) nên là thông tin tổng của cả phòng — chỉ ADMIN được xem, đúng
// theo yêu cầu "chỉ Quản trị viên xem được thông tin tổng của cả phòng".
export async function GET() {
  try {
    await requireAdmin();

    const latest = await prisma.debtSnapshot.findFirst({ orderBy: { snapshotDate: "desc" } });
    if (!latest) {
      return NextResponse.json({ snapshotDate: null, rows: [], totalDebt: 0, overdueDebt: 0 });
    }

    const rows = await prisma.debtSnapshot.findMany({
      where: { snapshotDate: latest.snapshotDate },
      orderBy: { totalDebt: "desc" },
    });

    const totalDebt = rows.reduce((sum, r) => sum + Number(r.totalDebt), 0);
    const overdueDebt = rows.reduce((sum, r) => sum + Number(r.overdueDebt), 0);

    const lastSync = await prisma.syncLog.findFirst({
      where: { jobType: "DEBT_SYNC" },
      orderBy: { startedAt: "desc" },
    });

    return NextResponse.json({ snapshotDate: latest.snapshotDate, rows, totalDebt, overdueDebt, lastSync });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("debt/snapshots GET error", err);
    return NextResponse.json({ error: "Không tải được dữ liệu công nợ" }, { status: 500 });
  }
}
