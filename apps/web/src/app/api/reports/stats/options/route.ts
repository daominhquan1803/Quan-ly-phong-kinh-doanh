import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { getInvoiceOptions } from "@/lib/stats-data";

export const dynamic = "force-dynamic";

/** Danh sách khách có hoá đơn + các tháng có hoá đơn cho ô chọn của Thống kê hoá đơn (NVKD chỉ thấy của mình). */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const isAdmin = session.user.role === "ADMIN";
    const employeeId = new URL(req.url).searchParams.get("employeeId") || undefined;
    const options = await getInvoiceOptions({ isAdmin, userId: session.user.id, employeeId: isAdmin ? employeeId : undefined });
    return NextResponse.json(options);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("reports/stats/options GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách khách" }, { status: 500 });
  }
}
