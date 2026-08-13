import { NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession();

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
    console.error("debt/snapshots GET error", err);
    return NextResponse.json({ error: "Không tải được dữ liệu công nợ" }, { status: 500 });
  }
}
